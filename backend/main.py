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

# Configuración de CORS para permitir conexiones desde Vercel o local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Variables de entorno para el envío de correo (Render Environment)
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
EMAIL_USER = os.getenv("EMAIL_USER", "tu_cuenta@gmail.com")
EMAIL_PASS = os.getenv("EMAIL_PASS", "tu_contraseña_de_aplicacion")

DB_FILE = "oposalert.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    # Creación de tabla base si no existe
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
    # Migración automática si faltan columnas en una base de datos ya existente
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

def send_email_alert(recipient: str, page_name: str, page_url: str):
    if not EMAIL_USER or EMAIL_USER == "tu_cuenta@gmail.com":
        print(f"[ALERTA] Email omitido a {recipient}: faltan configurar EMAIL_USER y EMAIL_PASS en Render.")
        return

    subject = f"🔔 [OposAlert] ¡Novedad detectada en: {page_name}!"
    body = (
        f"Hola,\n\n"
        f"Se ha detectado una modificación o nueva publicación en la web vigilada:\n\n"
        f"📌 Nombre: {page_name}\n"
        f"🔗 Enlace directo: {page_url}\n\n"
        f"Fecha y hora: {time.strftime('%d/%m/%Y a las %H:%M')}\n\n"
        f"— Equipo OposAlert"
    )

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = EMAIL_USER
    msg["To"] = recipient

    try:
        # Conexión SSL directa por puerto 465 con timeout de 8 segundos para evitar bloqueos
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=8) as server:
            server.login(EMAIL_USER, EMAIL_PASS)
            server.sendmail(EMAIL_USER, [recipient], msg.as_string())
        print(f"[OK] Correo de alerta enviado exitosamente a {recipient}")
    except Exception as e:
        print(f"[ERROR SMTP] No se pudo enviar el correo a {recipient}: {e}")

def get_page_hash(url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
    }
    response = requests.get(url, headers=headers, timeout=12, allow_redirects=True)
    
    if response.status_code != 200:
        raise Exception(f"HTTP {response.status_code}: Acceso no permitido o web caída")

    # Si es JSON o texto plano (como httpbin.org/uuid), limpia directamente
    content_type = response.headers.get("content-type", "")
    if "json" in content_type or not ("<html" in response.text.lower()):
        cleaned_text = response.text.strip()
    else:
        soup = BeautifulSoup(response.text, "html.parser")
        for tag in soup(["script", "style", "noscript", "svg", "iframe"]):
            tag.decompose()
        cleaned_text = soup.get_text(separator=" ", strip=True)

    if not cleaned_text:
        raise Exception("El contenido de la página está vacío o bloqueado")
        
    return hashlib.sha256(cleaned_text.encode("utf-8")).hexdigest()

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
            print(f"[CHECK] {name} -> Hash actual: {current_hash[:8]}... | Hash guardado: {str(last_hash)[:8]}...")
            
            if last_hash and current_hash != last_hash:
                print(f"[CAMBIO DETECTADO] ¡Novedad en {name}! Enviando alerta a {notify_email}...")
                send_email_alert(notify_email, name, url)
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
            error_msg = f"Error: {str(e)[:30]}"
            print(f"[FALLO SCRAPING] {name} ({url}): {e}")
            c.execute("UPDATE pages SET last_checked = ? WHERE id = ?", (error_msg, page_id))
            conn.commit()

    conn.close()
    return detected

# Hilo en segundo plano que revisa periódicamente cada 15 minutos (900 segundos)
def background_checker():
    while True:
        try:
            print("[AUTO-CHECK] Ejecutando comprobación automática de páginas...")
            check_all_pages_logic()
        except Exception as e:
            print(f"[ERROR AUTO-CHECK] {e}")
        time.sleep(900)

threading.Thread(target=background_checker, daemon=True).start()

# --- ENDPOINTS API ---

@app.get("/")
def root():
    return {"status": "online", "app": "OposAlert API"}

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

@app.delete("/api/pages/{page_id}")
def delete_page(page_id: int):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM pages WHERE id = ?", (page_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}