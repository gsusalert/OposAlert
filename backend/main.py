import hashlib
import os
import sqlite3
import threading
import time
import requests
from bs4 import BeautifulSoup
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="WebChangeAlert Device-Isolated API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "gsusalert@gmail.com")

# USAR RUTA ABSOLUTA PARA EVITAR QUE SE CREE EN DIRECTORIOS DISTINTOS
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "web_alerts.db")

def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=20, isolation_level=None) # autocommit explícito
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            notify_email TEXT NOT NULL,
            last_hash TEXT,
            last_checked TEXT,
            has_changed INTEGER DEFAULT 0,
            changed_at TEXT DEFAULT ''
        )
    ''')
    try:
        c.execute("ALTER TABLE pages ADD COLUMN device_id TEXT NOT NULL DEFAULT ''")
    except Exception:
        pass
    conn.close()

init_db()

class PageRequest(BaseModel):
    device_id: str
    name: str
    url: str
    notify_email: str

def send_email_alert(recipient_email: str, page_name: str, page_url: str):
    def _worker():
        if not BREVO_API_KEY:
            print("[AVISO] Falta BREVO_API_KEY en el entorno.")
            return

        payload = {
            "sender": {
                "name": "OposAlert",
                "email": SENDER_EMAIL
            },
            "replyTo": {
                "name": "OposAlert Soporte",
                "email": SENDER_EMAIL
            },
            "to": [{"email": recipient_email.strip()}],
            "subject": f"🔔 ¡Novedad detectada en: {page_name}!",
            "htmlContent": f"""
                <div style="font-family: Arial, sans-serif; padding: 24px; color: #1f2937; max-width: 600px; border: 1px solid #e5e7eb; border-radius: 8px;">
                    <h2 style="color: #dc2626; margin-top: 0;">¡Novedad detectada en OposAlert!</h2>
                    <p>Se ha identificado una actualización en la página que estás monitorizando:</p>
                    <div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; margin: 16px 0; border: 1px solid #f3f4f6;">
                        <p style="margin: 0 0 8px 0;"><b>Página:</b> {page_name}</p>
                        <p style="margin: 0;"><b>Enlace:</b> <a href="{page_url}">{page_url}</a></p>
                    </div>
                    <div style="margin: 24px 0;">
                        <a href="{page_url}" target="_blank" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                            👉 Pulsar aquí para ir a la página
                        </a>
                    </div>
                    <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">Fecha del aviso: {time.strftime('%d/%m/%Y a las %H:%M')}</p>
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
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }

    try:
        r = requests.get(url, headers=headers, timeout=8, allow_redirects=True)
        if r.status_code == 200 and r.text.strip():
            return r.text
    except Exception as e:
        print(f"[DIRECTO FALLÓ] {url}: {e}")

    try:
        proxy_url = f"https://api.allorigins.win/raw?url={requests.utils.quote(url)}"
        r_proxy = requests.get(proxy_url, headers=headers, timeout=10)
        if r_proxy.status_code == 200 and r_proxy.text.strip():
            return r_proxy.text
    except Exception as e:
        print(f"[PROXY FALLÓ] {url}: {e}")

    raise Exception("No se pudo obtener el contenido de la URL")

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

def execute_check_logic(filter_device: str = None):
    conn = get_db()
    c = conn.cursor()
    if filter_device:
        c.execute("SELECT id, name, url, notify_email, last_hash FROM pages WHERE device_id = ?", (filter_device.strip(),))
    else:
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
        except Exception as e:
            print(f"[ERROR CHECK] {name}: {e}")
            c.execute("UPDATE pages SET last_checked = ? WHERE id = ?", ("Error de lectura", page_id))
        finally:
            conn.close()

    return detected_changes

def background_loop_15_minutes():
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
    return {"status": "online", "db": DB_FILE}

@app.get("/api/pages")
def list_pages(device_id: str = Query(...)):
    clean_id = device_id.strip()
    if not clean_id:
        return []

    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT id, device_id, name, url, notify_email, last_checked, has_changed, changed_at FROM pages WHERE device_id = ? ORDER BY id DESC",
        (clean_id,)
    )
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    print(f"[GET /api/pages] device_id={clean_id} -> {len(rows)} encontradas")
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
    clean_id = page.device_id.strip()
    if not clean_id:
        raise HTTPException(status_code=400, detail="device_id es obligatorio")

    try:
        initial_hash = calculate_hash(page.url)
        status = "Recién añadida"
    except Exception:
        initial_hash = hashlib.sha256(f"{page.url}_{time.time()}".encode("utf-8")).hexdigest()
        status = "Pendiente de 1ª lectura"

    conn = get_db()
    c = conn.cursor()
    c.execute(
        "INSERT INTO pages (device_id, name, url, notify_email, last_hash, last_checked, has_changed, changed_at) VALUES (?, ?, ?, ?, ?, ?, 0, '')",
        (clean_id, page.name.strip(), page.url.strip(), page.notify_email.strip(), initial_hash, status)
    )
    new_id = c.lastrowid
    conn.close()
    print(f"[INSERT OK] id={new_id} device_id={clean_id} name={page.name}")
    return {"status": "success", "id": new_id}

@app.post("/api/check")
def trigger_manual_check(device_id: str = Query(None)):
    clean_id = device_id.strip() if device_id else None
    changes = execute_check_logic(filter_device=clean_id)
    return {"status": "ok", "changes_detected": changes, "total": len(changes)}

@app.post("/api/pages/{page_id}/dismiss")
def dismiss_change_alert(page_id: int):
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE pages SET has_changed = 0 WHERE id = ?", (page_id,))
    conn.close()
    return {"status": "success"}

@app.delete("/api/pages/reset/all")
def reset_all_pages():
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM pages")
    conn.close()
    return {"status": "base de datos vaciada con exito"}

@app.delete("/api/pages/{page_id}")
def delete_page(page_id: int):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM pages WHERE id = ?", (page_id,))
    conn.close()
    return {"status": "success"}