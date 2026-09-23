import hashlib
import os
import sqlite3
import threading
import time
import requests
from bs4 import BeautifulSoup
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="WebChangeAlert API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "")

DB_FILE = "web_alerts.db"

def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=20)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            notify_email TEXT NOT NULL,
            last_hash TEXT,
            last_checked TEXT,
            has_changed INTEGER DEFAULT 0,
            changed_at TEXT DEFAULT ''
        )
    ''')
    conn.commit()
    conn.close()

init_db()

class PageRequest(BaseModel):
    name: str
    url: str
    notify_email: str

def send_email_alert(recipient_email: str, page_name: str, page_url: str):
    """Envía el correo mediante Brevo HTTP API (funciona con cualquier destinatario)."""
    def _worker():
        if not BREVO_API_KEY or not SENDER_EMAIL:
            print("[AVISO] Faltan variables BREVO_API_KEY o SENDER_EMAIL en el entorno.")
            return

        payload = {
            "sender": {"name": "WebChangeAlert", "email": SENDER_EMAIL},
            "to": [{"email": recipient_email.strip()}],
            "subject": f"🔔 ¡Cambio detectado en {page_name}!",
            "htmlContent": f"""
                <div style="font-family: Arial, sans-serif; padding: 24px; color: #1f2937; max-width: 600px; border: 1px solid #e5e7eb; border-radius: 8px;">
                    <h2 style="color: #dc2626; margin-top: 0;">¡Novedad detectada!</h2>
                    <p>Se ha identificado una actualización en la página que estás monitorizando:</p>
                    <div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; margin: 16px 0; border: 1px solid #f3f4f6;">
                        <p style="margin: 0 0 8px 0;"><b>Nombre:</b> {page_name}</p>
                        <p style="margin: 0;"><b>Enlace:</b> <a href="{page_url}">{page_url}</a></p>
                    </div>
                    <div style="margin: 24px 0;">
                        <a href="{page_url}" target="_blank" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                            🔗 Ver novedades en la web
                        </a>
                    </div>
                    <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">Fecha de comprobación: {time.strftime('%d/%m/%Y a las %H:%M')}</p>
                </div>
            """
        }

        try:
            res = requests.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={
                    "api-key": BREVO_API_KEY,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                json=payload,
                timeout=10
            )
            if res.status_code in [200, 201, 202]:
                print(f"[OK EMAIL] Alerta enviada a {recipient_email}")
            else:
                print(f"[ERROR BREVO] {res.status_code}: {res.text}")
        except Exception as e:
            print(f"[ERROR EMAIL]: {e}")

    threading.Thread(target=_worker, daemon=True).start()

def fetch_content(url: str) -> str:
    """Descarga el contenido forzando la anulación de caché tanto local como de servidores intermedios."""
    separator = "&" if "?" in url else "?"
    nocache_url = f"{url}{separator}_t={int(time.time())}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    }

    # 1. Petición directa anti-caché
    try:
        r = requests.get(nocache_url, headers=headers, timeout=8, allow_redirects=True)
        if r.status_code == 200 and r.text.strip():
            return r.text
    except Exception as e:
        print(f"[DIRECTO FALLÓ] {url}: {e}")

    # 2. Proxy renderizador para webs protegidas por Cloudflare o con caché persistente
    try:
        proxy_url = f"https://r.jina.ai/{url}"
        r_proxy = requests.get(proxy_url, headers={"User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache"}, timeout=12)
        if r_proxy.status_code == 200 and r_proxy.text.strip():
            return r_proxy.text
    except Exception as e:
        print(f"[PROXY FALLÓ] {url}: {e}")

    raise Exception("No se pudo obtener el contenido")

def calculate_hash(url: str) -> str:
    raw = fetch_content(url)
    if "<html" in raw.lower():
        soup = BeautifulSoup(raw, "html.parser")
        for tag in soup(["script", "style", "noscript", "svg", "iframe"]):
            tag.decompose()
        text = soup.get_text(separator=" ", strip=True)
    else:
        text = raw.strip()

    if not text:
        raise Exception("Contenido vacío")

    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def execute_check_logic():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, name, url, notify_email, last_hash FROM pages")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    detected_changes = []
    current_time_str = time.strftime("%H:%M")

    for row in rows:
        page_id = row["id"]
        name = row["name"]
        url = row["url"]
        notify_email = row["notify_email"]
        last_hash = row["last_hash"]

        conn = get_db()
        c = conn.cursor()
        try:
            current_hash = calculate_hash(url)
            print(f"[CHECK] {name} -> Hash actual: {current_hash[:8]}... (previo: {str(last_hash)[:8]}...)")
            
            if last_hash and current_hash != last_hash:
                print(f"[CAMBIO DETECTADO] {name}")
                send_email_alert(notify_email, name, url)
                detected_changes.append(name)
                c.execute(
                    "UPDATE pages SET last_hash = ?, last_checked = ?, has_changed = 1, changed_at = ? WHERE id = ?",
                    (current_hash, f"Hoy · {current_time_str}", f"Hoy · {current_time_str}", page_id)
                )
            else:
                c.execute(
                    "UPDATE pages SET last_hash = ?, last_checked = ? WHERE id = ?",
                    (current_hash, f"Hoy · {current_time_str}", page_id)
                )
            conn.commit()
        except Exception as e:
            print(f"[ERROR CHECK] {name}: {e}")
            c.execute("UPDATE pages SET last_checked = ? WHERE id = ?", ("Error de lectura", page_id))
            conn.commit()
        finally:
            conn.close()

    return detected_changes

def background_loop_15_minutes():
    """Ejecuta la comprobación cada 15 minutos (900 segundos)."""
    while True:
        try:
            execute_check_logic()
        except Exception as e:
            print(f"[ERROR BKG]: {e}")
        time.sleep(900)

threading.Thread(target=background_loop_15_minutes, daemon=True).start()

# --- RUTAS DE LA API ---

@app.get("/")
def health():
    return {"status": "online"}

@app.get("/api/pages")
def list_pages():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, name, url, notify_email, last_checked, has_changed, changed_at FROM pages ORDER BY id DESC")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "url": r["url"],
            "notify_email": r["notify_email"],
            "last_checked": r["last_checked"] or "Pendiente",
            "has_changed": bool(r["has_changed"]),
            "changed_at": r["changed_at"] or "Hoy"
        }
        for r in rows
    ]

@app.post("/api/pages")
def add_page(page: PageRequest):
    try:
        initial_hash = calculate_hash(page.url)
        status = "Recién añadida"
    except Exception:
        initial_hash = hashlib.sha256(f"{page.url}_{time.time()}".encode("utf-8")).hexdigest()
        status = "Pendiente de 1ª lectura"

    try:
        conn = get_db()
        c = conn.cursor()
        c.execute(
            "INSERT INTO pages (name, url, notify_email, last_hash, last_checked, has_changed, changed_at) VALUES (?, ?, ?, ?, ?, 0, '')",
            (page.name, page.url, page.notify_email, initial_hash, status)
        )
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/check")
@app.post("/api/check")
def trigger_manual_check():
    changes = execute_check_logic()
    return {"status": "ok", "changes_detected": changes, "total": len(changes)}

@app.post("/api/pages/{page_id}/dismiss")
def dismiss_change_alert(page_id: int):
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE pages SET has_changed = 0 WHERE id = ?", (page_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.delete("/api/pages/{page_id}")
def delete_page(page_id: int):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM pages WHERE id = ?", (page_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}