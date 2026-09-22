import hashlib
import os
import smtplib
import sqlite3
import threading
import time
from email.mime.text import MIMEText
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

# Variables de entorno configuradas en Render
EMAIL_USER = os.getenv("EMAIL_USER", "")
EMAIL_PASS = os.getenv("EMAIL_PASS", "")
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
    """Envía la alerta por Email y Telegram en un hilo de fondo sin congelar la web."""
    def _worker():
        # Envío de correo por Gmail
        if EMAIL_USER and EMAIL_PASS:
            try:
                subject = f"🔔 [OposAlert] ¡Novedad en: {page_name}!"
                body = (
                    f"Hola,\n\n"
                    f"Se ha detectado una nueva publicación o cambio en la web que vigilas:\n\n"
                    f"📌 Nombre: {page_name}\n"
                    f"🔗 Enlace: {page_url}\n\n"
                    f"Fecha: {time.strftime('%d/%m/%Y a las %H:%M')}\n\n"
                    f"— Equipo OposAlert"
                )
                msg = MIMEText(body)
                msg["Subject"] = subject
                msg["From"] = EMAIL_USER
                msg["To"] = recipient

                with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=8) as server:
                    server.login(EMAIL_USER, EMAIL_PASS)
                    server.sendmail(EMAIL_USER, [recipient], msg.as_string())
                print(f"[OK EMAIL] Alerta enviada a {recipient}")
            except Exception as e:
                print(f"[ERROR EMAIL]: {e}")
        else:
            print(f"[AVISO EMAIL] Credenciales EMAIL_USER/EMAIL_PASS no detectadas en Render.")

        # Envío por Telegram (opcional)
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
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
    }
    response = requests.get(url, headers=headers, timeout=6, allow_redirects=True)
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
        raise Exception("Sin contenido")

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
            if last_hash and current_hash != last_hash:
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

# Acepta tanto peticiones directas en navegador (GET) como llamadas desde frontend (POST)
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