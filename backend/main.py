import os
import re
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import cloudscraper
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Boolean, Text
from sqlalchemy.orm import declarative_base, sessionmaker

from apscheduler.schedulers.background import BackgroundScheduler
from contextlib import asynccontextmanager

# 1. Variables de Entorno de Render
DATABASE_URL = os.getenv("DATABASE_URL")
EMAIL_USER = os.getenv("EMAIL_USER")  # Correo de Gmail (remitente)
EMAIL_PASS = os.getenv("EMAIL_PASS")  # Contraseña de aplicación de Gmail

if not DATABASE_URL:
    raise ValueError("ERROR: La variable DATABASE_URL no está configurada.")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class PageModel(Base):
    __tablename__ = "pages"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, index=True)
    name = Column(String)
    url = Column(String)
    notify_email = Column(String)
    has_changed = Column(Boolean, default=False)
    last_content = Column(Text, nullable=True)

Base.metadata.create_all(bind=engine)

# 2. Función para enviar correo al destinatario específico de la alarma
def send_email_notification(to_email: str, page_name: str, page_url: str):
    if not to_email or not EMAIL_USER or not EMAIL_PASS:
        print("[Aviso Email] Omitiendo envío: No hay email de destino o faltan credenciales SMTP.")
        return

    try:
        msg = MIMEMultipart()
        msg['From'] = f"GsusAlert <{EMAIL_USER}>"
        msg['To'] = to_email
        msg['Subject'] = f"🔔 Novedad detectada: {page_name}"

        body = f"""
        Hola,

        Se ha detectado nuevo contenido o respuestas en la página que monitorizas:

        📌 Nombre: {page_name}
        🔗 Enlace: {page_url}

        Abre la aplicación para consultar los cambios.
        """
        msg.attach(MIMEText(body, 'plain'))

        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(EMAIL_USER, EMAIL_PASS)
        server.send_message(msg)
        server.quit()
        print(f"[Email enviado] Notificación enviada con éxito a {to_email}")
    except Exception as e:
        print(f"[Error Email] No se pudo enviar el correo a {to_email}: {e}")

# 3. Extracción de texto optimizada (Adaptada a RSS para Forocoches)
def fetch_page_text(url: str) -> str:
    clean_url = url.split('#')[0]

    # Si es Forocoches, extraemos el ID del hilo y usamos su Feed RSS/XML sin bloqueo
    thread_match = re.search(r't=(\d+)', clean_url)
    if "forocoches.com" in clean_url and thread_match:
        thread_id = thread_match.group(1)
        rss_url = f"https://forocoches.com/foro/external.php?type=rss2&threadid={thread_id}"
        
        scraper = cloudscraper.create_scraper()
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

        try:
            res = scraper.get(rss_url, headers=headers, timeout=15)
            if res.status_code == 200 and "<rss" in res.text.lower():
                soup = BeautifulSoup(res.text, 'xml')
                items = soup.find_all('item')
                if items:
                    # Guardamos la fecha/identificador del último ítem del RSS
                    last_item = items[0]
                    pub_date = last_item.find('pubDate')
                    title = last_item.find('title')
                    content = f"{title.text if title else ''}_{pub_date.text if pub_date else ''}"
                    print(f"[Forocoches RSS Exitoso] Último ítem RSS: {content}")
                    return content
        except Exception as e:
            print(f"[Forocoches RSS Error] Error al leer RSS, recurriendo a web normal: {e}")

    # Método secundario (Web scraping estándar para otros sitios)
    scraper = cloudscraper.create_scraper(
        delay=5,
        browser={
            'browser': 'chrome',
            'platform': 'windows',
            'desktop': True
        }
    )

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Referer': 'https://forocoches.com/'
    }

    try:
        response = scraper.get(clean_url, headers=headers, allow_redirects=True, timeout=20)
        
        if response.status_code != 200 or "Just a moment..." in response.text or "Challenge" in response.text:
            print(f"[Aviso Scraping] Estado {response.status_code} o bloqueo de Cloudflare en: {clean_url}")
            return ""

        soup = BeautifulSoup(response.text, 'html.parser')

        for element in soup(["script", "style", "noscript", "iframe", "header", "footer"]):
            element.decompose()

        text_content = soup.get_text(separator=' ', strip=True)
        cleaned_text = re.sub(r'\s+', ' ', text_content)

        print(f"[Scraping Generico Exitoso] Longitud: {len(cleaned_text)} caracteres.")
        return cleaned_text

    except Exception as e:
        print(f"[Error Scraping] Excepción al raspar {clean_url}: {e}")
        return ""

# 4. Tarea Automática (Revisa cada 30 min todas las alarmas)
def job_check_all_pages():
    print("[Cron Job] Ejecutando revisión programada cada 30 minutos...")
    db = SessionLocal()
    pages = db.query(PageModel).all()

    for page in pages:
        current_content = fetch_page_text(page.url)

        if not current_content:
            continue

        if not page.last_content:
            page.last_content = current_content
            db.commit()
            continue

        if current_content != page.last_content:
            page.has_changed = True
            page.last_content = current_content
            db.commit()

            print(f"[Cambio detectado] {page.name} ({page.url})")
            
            if page.notify_email:
                send_email_notification(page.notify_email, page.name, page.url)

    db.close()
    print("[Cron Job] Revisión completada.")

# 5. Configurar Scheduler
scheduler = BackgroundScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(job_check_all_pages, 'interval', minutes=30)
    scheduler.start()
    print("[Scheduler] Programador automático de 30 minutos iniciado.")
    yield
    scheduler.shutdown()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PageCreate(BaseModel):
    device_id: str
    name: str
    url: str
    notify_email: str

# ----------------- ENDPOINTS -----------------

@app.get("/api/pages")
def get_pages(device_id: str):
    db = SessionLocal()
    pages = db.query(PageModel).filter(PageModel.device_id == device_id).all()
    db.close()
    return pages

@app.post("/api/pages")
def create_page(page: PageCreate):
    db = SessionLocal()
    initial_content = fetch_page_text(page.url)

    new_page = PageModel(
        device_id=page.device_id,
        name=page.name,
        url=page.url,
        notify_email=page.notify_email,
        has_changed=False,
        last_content=initial_content
    )
    db.add(new_page)
    db.commit()
    db.refresh(new_page)
    db.close()
    return {"status": "success", "id": new_page.id}

@app.post("/api/check")
def check_pages(device_id: str):
    db = SessionLocal()
    pages = db.query(PageModel).filter(PageModel.device_id == device_id).all()
    new_additions_count = 0

    for page in pages:
        current_content = fetch_page_text(page.url)

        if not current_content:
            continue

        if not page.last_content:
            page.last_content = current_content
            db.commit()
            continue

        if current_content != page.last_content:
            page.has_changed = True
            page.last_content = current_content
            new_additions_count += 1
            db.commit()

            if page.notify_email:
                send_email_notification(page.notify_email, page.name, page.url)

    db.close()
    return {"status": "success", "newAdditionsCount": new_additions_count}

@app.post("/api/pages/{page_id}/dismiss")
def dismiss_page(page_id: int):
    db = SessionLocal()
    page = db.query(PageModel).filter(PageModel.id == page_id).first()
    if page:
        page.has_changed = False
        db.commit()
    db.close()
    return {"status": "success"}

@app.delete("/api/pages/{page_id}")
def delete_page(page_id: int):
    db = SessionLocal()
    page = db.query(PageModel).filter(PageModel.id == page_id).first()
    if page:
        db.delete(page)
        db.commit()
        db.close()
        return {"status": "success"}
    db.close()
    raise HTTPException(status_code=404, detail="Página no encontrada")