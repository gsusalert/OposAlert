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

app = FastAPI(title="OposAlert API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Claves y configuración de APIs externas
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

DB_FILE = "oposalert.db"

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
    c.execute("PRAGMA table_info(pages)")
    columns = [col[1] for col in c.fetchall()]
    if "has_changed" not in columns:
        c.execute("ALTER TABLE pages ADD COLUMN has_changed INTEGER DEFAULT 0")
    if "changed_at" not in columns:
        c.execute("ALTER TABLE pages ADD COLUMN changed_at TEXT DEFAULT ''")
    conn.commit()
    conn.close()

init_db()

class PageRequest(BaseModel):
    name: str
    url: str
    notify_email: str

def send_alert_async(recipient: str, page_name: str, page_url: str):
    """Envía la alerta por Resend HTTP API y Telegram en segundo plano."""
    def _worker():
        if RESEND_API_KEY:
            try:
                res = requests.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {RESEND_API_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "from": "OposAlert <onboarding@resend.dev>",
                        "to": [recipient],
                        "subject": f"🔔 [OposAlert] ¡Novedad en: {page_name}!",
                        "html": f"""
                            <h2>¡Novedad detectada!</h2>
                            <p>Se ha detectado una modificación en la página que vigilas:</p>
                            <p><b>Web:</b> {page_name}</p>
                            <p><a href="{page_url}" style="background-color:#7c3aed;color:white;padding:10px 15px;text-decoration:none;border-radius:6px;display:inline-block;">Ir a la convocatoria</a></p>
                            <p><small>Fecha: {time.strftime('%d/%m/%Y a las %H:%M')}</small></p>
                        """
                    },
                    timeout=8
                )
                if res.status_code in [200, 201]:
                    print(f"[OK EMAIL] Alerta enviada con éxito a {recipient}")
                else:
                    print(f"[ERROR RESEND]: {res.status_code} - {res.text}")
            except Exception as e:
                print(f"[ERROR RESEND EXCEPTION]: {e}")
        else:
            print("[AVISO] Configura RESEND_API_KEY en Render Environment para recibir emails.")

        if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
            try:
                tg_msg = f"🔔 *[OposAlert] Cambio detectado*\n\n📌 *Web:* {page_name}\n🔗 [Abrir enlace]({page_url})"
                tg_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
                requests.post(tg_url, json={"chat_id": TELEGRAM_CHAT_ID, "text": tg_msg, "parse_mode": "Markdown"}, timeout=5)
                print("[OK TG] Notificación de Telegram enviada")
            except Exception as e:
                print(f"[ERROR TG]: {e}")

    threading.Thread(target=_worker, daemon=True).start()

def get_page_hash(url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Sec-Ch-Ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"macOS"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
    }
    
    session = requests.Session()
    response = session.get(url, headers=headers, timeout=8, allow_redirects=True)
    
    # Manejo de bloqueo Cloudflare/anti-bot (403): hash fallback para no detener la app
    if response.status_code == 403:
        print(f"[BLOQUEO 403] Acceso denegado por Cloudflare en: {url}")
        return hashlib.sha256(f"cloudflare_protected_{url}_{response.status_code}".encode("utf-8")).hexdigest()

    if response.status_code != 200:
        raise Exception(f"HTTP {response.status_code}")

    content_type = response.headers.get("content-type", "")
    if "json" in content_type or not ("<html" in response.text.lower()):
        cleaned_text = response.text.strip()
    else:
        soup = BeautifulSoup(response.text, "html.parser")
        for tag in soup(["script", "style", "noscript", "svg", "iframe"]):
            tag.decompose()
        cleaned_text = soup.get_text(separator=" ", strip=True)

    if not cleaned_text:
        raise Exception("Sin contenido legible")

    return hashlib.sha256(cleaned_text.encode("utf-8")).hexdigest()

def check_all_pages_logic():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, name, url, notify_email, last_hash FROM pages")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    detected = []
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
            current_hash = get_page_hash(url)
            
            # Si se generó un hash de protección Cloudflare, se marca como aviso en lugar de romper
            if "cloudflare_protected" in current_hash:
                c.execute(
                    "UPDATE pages SET last_checked = ? WHERE id = ?",
                    ("Bloqueo 403 (Cloudflare)", page_id)
                )
            elif last_hash and current_hash != last_hash:
                print(f"[CAMBIO DETECTADO] {name}")
                send_alert_async(notify_email, name, url)
                detected.append(name)
                c.execute(
                    "UPDATE pages SET last_hash = ?, last_checked = ?, has_changed = 1, changed_at = ? WHERE id = ?",
                    (current_hash, f"Hoy · {current_time_str}", f"Hoy · {current_time_str}", page_id)
                )
            else:
                c.execute(
                    "UPDATE pages SET last_checked = ? WHERE id = ?",
                    (f"Hoy · {current_time_str}", page_id)
                )
            conn.commit()
        except Exception as e:
            print(f"[ERROR CHECK] {name}: {e}")
            c.execute("UPDATE pages SET last_checked = ? WHERE id = ?", ("Error de lectura", page_id))
            conn.commit()
        finally:
            conn.close()

    return detected

def background_checker():
    while True:
        try:
            check_all_pages_logic()
        except Exception as e:
            print(f"[ERROR BKG]: {e}")
        time.sleep(900)

threading.Thread(target=background_checker, daemon=True).start()

# --- ENDPOINTS ---

@app.get("/")
def root():
    return {"status": "online", "app": "OposAlert API"}

@app.get("/api/pages")
def get_pages():
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
        initial_hash = get_page_hash(page.url)
        conn = get_db()
        c = conn.cursor()
        c.execute(
            "INSERT INTO pages (name, url, notify_email, last_hash, last_checked, has_changed, changed_at) VALUES (?, ?, ?, ?, ?, 0, '')",
            (page.name, page.url, page.notify_email, initial_hash, "Recién añadida")
        )
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/check")
@app.post("/api/check")
def manual_check():
    changes = check_all_pages_logic()
    return {"status": "ok", "changes_detected": changes, "total_checked": len(changes)}

@app.post("/api/pages/{page_id}/dismiss")
def dismiss_change(page_id: int):
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