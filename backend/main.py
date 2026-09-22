import hashlib
import smtplib
import requests
from bs4 import BeautifulSoup
from email.mime.text import MIMEText
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

# Configuración de notificaciones
TELEGRAM_BOT_TOKEN = "TU_TELEGRAM_BOT_TOKEN"
TELEGRAM_CHAT_ID = "TU_TELEGRAM_CHAT_ID"

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
EMAIL_USER = "tu_correo@gmail.com"
EMAIL_PASS = "tu_contraseña_de_aplicacion"
EMAIL_RECEIVER = "correo_donde_recibes@gmail.com"

MONITORED_PAGES = []

class PageRequest(BaseModel):
    name: str
    url: str

def send_telegram(message: str):
    if TELEGRAM_BOT_TOKEN == "TU_TELEGRAM_BOT_TOKEN":
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": TELEGRAM_CHAT_ID, "text": message}
    try:
        requests.post(url, json=payload, timeout=5)
    except Exception as e:
        print(f"Error Telegram: {e}")

def send_email(subject: str, message: str):
    if EMAIL_USER == "tu_correo@gmail.com":
        return
    msg = MIMEText(message)
    msg["Subject"] = subject
    msg["From"] = EMAIL_USER
    msg["To"] = EMAIL_RECEIVER

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(EMAIL_USER, EMAIL_PASS)
            server.sendmail(EMAIL_USER, [EMAIL_RECEIVER], msg.as_string())
    except Exception as e:
        print(f"Error Email: {e}")

def get_page_hash(url: str) -> str:
    response = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
    soup = BeautifulSoup(response.text, "html.parser")
    for script in soup(["script", "style"]):
        script.extract()
    text = soup.get_text()
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

@app.get("/api/pages")
def get_pages():
    return MONITORED_PAGES

@app.post("/api/pages")
def add_page(page: PageRequest):
    try:
        initial_hash = get_page_hash(page.url)
        new_entry = {
            "id": len(MONITORED_PAGES) + 1,
            "name": page.name,
            "url": page.url,
            "last_hash": initial_hash,
            "last_checked": "Recién añadida"
        }
        MONITORED_PAGES.append(new_entry)
        return {"status": "success", "page": new_entry}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/check")
def check_all_pages():
    detected_changes = []
    for page in MONITORED_PAGES:
        try:
            current_hash = get_page_hash(page["url"])
            if current_hash != page["last_hash"]:
                page["last_hash"] = current_hash
                msg = f"🔔 ¡Aviso OposAlert!\n\nSe ha detectado un cambio en: {page['name']}\nURL: {page['url']}"
                send_telegram(msg)
                send_email(f"Cambio detectado: {page['name']}", msg)
                detected_changes.append(page["name"])
        except Exception as e:
            print(f"Error comprobando {page['url']}: {e}")
    return {"checked": len(MONITORED_PAGES), "changes_detected": detected_changes}