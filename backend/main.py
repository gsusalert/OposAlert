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

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
EMAIL_USER = os.getenv("EMAIL_USER", "tu_cuenta@gmail.com")
EMAIL_PASS = os.getenv("EMAIL_PASS", "tu_contraseña_de_aplicacion")

DB_FILE = "oposalert.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
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

def send_email_alert(recipient: str, page_name: str, page_url: str):
    if not EMAIL_USER or EMAIL_USER == "tu_cuenta@gmail.com":
        print(f"[ALERTA] Email no enviado a {recipient}: configura EMAIL_USER y EMAIL_PASS.")
        return

    subject = f"🔔 [OposAlert] ¡Novedad en: {page_name}!"
    body = (
        f"Hola,\n\n"
        f"Se ha detectado una nueva publicación o modificación en la página que vigilas:\n\n"
        f"📌 Nombre: {page_name}\n"
        f"🔗 Enlace directo: {page_url}\n\n"
        f"Fecha: {time.strftime('%d/%m/%Y a las %H:%M')}\n\n"
        f"— OposAlert"
    )

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = EMAIL_USER
    msg["To"] = recipient

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(EMAIL_USER, EMAIL_PASS)
            server.sendmail(EMAIL_USER, [recipient], msg.as_string())
        print(f"Correo de aviso enviado con éxito a {recipient}")
    except Exception as e:
        print(f"Error al enviar correo a {recipient}: {e}")

def get_page_hash(url: str) -> str:
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
    response = requests.get(url, headers=headers, timeout=12)
    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def check_all_pages_logic():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT id, name, url, notify_email, last_hash FROM pages")
    rows = c.fetchall()
    
    detected = []
    current_time_str = time.strftime("%H:%M")

    for row in rows:
        page_id, name, url, notify_email, last_hash = row
        try:
            current_hash = get_page_hash(url)
            if last_hash and current_hash != last_hash:
                print(f"¡Cambio detectado en {name}! Enviando correo a {notify_email}...")
                send_email_alert(notify_email, name, url)
                detected.append(name)
                # Marcamos que tiene cambios recientes
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
            print(f"Error revisando {url}: {e}")

    conn.close()
    return detected

# Tarea automática en segundo plano cada 15 minutos
def background_checker():
    while True:
        try:
            check_all_pages_logic()
        except Exception as e:
            print(f"Error en tarea automática: {e}")
        time.sleep(900)

threading.Thread(target=background_checker, daemon=True).start()

@app.get("/api/pages")
def get_pages():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT id, name, url, notify_email, last_checked, has_changed, changed_at FROM pages ORDER BY id DESC")
    rows = c.fetchall()
    conn.close()
    return [
        {
            "id": r[0],
            "name": r[1],
            "url": r[2],
            "notify_email": r[3],
            "last_checked": r[4] or "Pendiente",
            "has_changed": bool(r[5]),
            "changed_at": r[6] or "Hoy"
        }
        for r in rows
    ]

@app.post("/api/pages")
def add_page(page: PageRequest):
    try:
        initial_hash = get_page_hash(page.url)
        conn = sqlite3.connect(DB_FILE)
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

@app.post("/api/check")
def manual_check():
    changes = check_all_pages_logic()
    return {"status": "ok", "changes_detected": changes}

@app.post("/api/pages/{page_id}/dismiss")
def dismiss_change(page_id: int):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("UPDATE pages SET has_changed = 0 WHERE id = ?", (page_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}