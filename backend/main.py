import os
import hashlib
import requests
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
from typing import List, Optional
from datetime import datetime
from sqlmodel import Field, Session, SQLModel, create_engine, select

# ------------------------------------------------------------------
# CONFIGURACIÓN DE BASE DE DATOS
# ------------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./oposalert.db")

# Ajuste para Render / Heroku Postgres (cambiar postgres:// por postgresql://)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

# ------------------------------------------------------------------
# MODELOS DE DATOS (SQLModel)
# ------------------------------------------------------------------
class Alert(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    url: str
    email: str
    last_hash: Optional[str] = None
    last_checked: Optional[datetime] = None
    status: str = "active"  # 'active', 'changed', 'error'

class AlertCreate(BaseModel):
    title: str
    url: HttpUrl
    email: str

# ------------------------------------------------------------------
# CONFIGURACIÓN DE FASTAPI
# ------------------------------------------------------------------
app = FastAPI(title="OposAlert API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)

# ------------------------------------------------------------------
# LÓGICA DE LIMPIEZA DE HTML (EVITA FALSAS ALARMAS)
# ------------------------------------------------------------------
def clean_and_extract_content(html_raw: str) -> str:
    """
    Limpia el código HTML de elementos dinámicos (scripts, timestamps, banners)
    y extrae solo el texto relevante para comparar únicamente contenido real.
    """
    soup = BeautifulSoup(html_raw, "html.parser")

    # 1. Eliminar etiquetas no deseadas que generan falsos positivos
    unwanted_tags = [
        "script", "style", "nav", "footer", "header", "aside", 
        "form", "input", "noscript", "svg", "iframe"
    ]
    for tag in soup(unwanted_tags):
        tag.decompose()

    # 2. Priorizar el cuerpo principal si existe
    main_content = (
        soup.find("main") or 
        soup.find("article") or 
        soup.find(id=lambda x: x and "content" in x.lower()) or 
        soup.find(class_=lambda x: x and "content" in x.lower())
    )

    if main_content:
        text = main_content.get_text(separator=" ", strip=True)
    else:
        text = soup.get_text(separator=" ", strip=True)

    # 3. Normalizar espacios en blanco repetidos
    clean_text = " ".join(text.split())
    return clean_text


def compute_page_hash(url: str) -> Optional[str]:
    """Descarga la página, limpia el HTML y genera un hash MD5 único."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        
        # Limpiar HTML antes de hashear
        cleaned_text = clean_and_extract_content(response.text)
        return hashlib.md5(cleaned_text.encode("utf-8")).hexdigest()
    except Exception as e:
        print(f"Error al obtener {url}: {e}")
        return None

# ------------------------------------------------------------------
# ENVÍO DE NOTIFICACIONES (BREVO)
# ------------------------------------------------------------------
def send_email_notification(to_email: str, title: str, url: str):
    brevo_api_key = os.getenv("BREVO_API_KEY")
    if not brevo_api_key:
        print("Aviso: BREVO_API_KEY no configurada. Omitiendo envío de email.")
        return

    payload = {
        "sender": {"name": "OposAlert", "email": os.getenv("SENDER_EMAIL", "no-reply@oposalert.com")},
        "to": [{"email": to_email}],
        "subject": f"🚨 ¡Cambio detectado en {title}!",
        "htmlContent": f"""
            <h2>¡Atención! Hay novedades en tu oposición</h2>
            <p>Hemos detectado cambios en el contenido de <strong>{title}</strong>.</p>
            <p><a href="{url}" target="_blank" style="padding: 10px 15px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px;">Ver página oficial</a></p>
            <br>
            <small>Recibes este correo porque configuraste un aviso en OposAlert.</small>
        """
    }
    headers = {
        "accept": "application/json",
        "api-key": brevo_api_key,
        "content-type": "application/json"
    }
    try:
        requests.post("https://api.brevo.com/v3/smtp/email", json=payload, headers=headers, timeout=10)
    except Exception as e:
        print(f"Error enviando email vía Brevo: {e}")

# ------------------------------------------------------------------
# TAREA DE COMPROBACIÓN GENERAL
# ------------------------------------------------------------------
def run_checks_task():
    with Session(engine) as session:
        alerts = session.exec(select(Alert)).all()
        for alert in alerts:
            current_hash = compute_page_hash(alert.url)
            
            if current_hash is None:
                alert.status = "error"
            elif alert.last_hash is None:
                # Primera comprobación registrada
                alert.last_hash = current_hash
                alert.status = "active"
            elif current_hash != alert.last_hash:
                # ¡Cambio real detectado!
                alert.last_hash = current_hash
                alert.status = "changed"
                send_email_notification(alert.email, alert.title, alert.url)
            else:
                alert.status = "active"
                
            alert.last_checked = datetime.utcnow()
            session.add(alert)
        session.commit()

# ------------------------------------------------------------------
# ENDPOINTS DE LA API
# ------------------------------------------------------------------
@app.get("/")
def read_root():
    return {"status": "ok", "message": "OposAlert API operativa"}

@app.get("/api/alerts", response_model=List[Alert])
def get_alerts():
    with Session(engine) as session:
        return session.exec(select(Alert)).all()

@app.post("/api/alerts", response_model=Alert)
def create_alert(alert_in: AlertCreate):
    url_str = str(alert_in.url)
    initial_hash = compute_page_hash(url_str)
    
    alert = Alert(
        title=alert_in.title,
        url=url_str,
        email=alert_in.email,
        last_hash=initial_hash,
        last_checked=datetime.utcnow() if initial_hash else None,
        status="active" if initial_hash else "error"
    )
    
    with Session(engine) as session:
        session.add(alert)
        session.commit()
        session.refresh(alert)
        return alert

@app.delete("/api/alerts/{alert_id}")
def delete_alert(alert_id: int):
    with Session(engine) as session:
        alert = session.get(Alert, alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Alerta no encontrada")
        session.delete(alert)
        session.commit()
        return {"ok": True}

@app.post("/api/check")
def trigger_check(background_tasks: BackgroundTasks):
    background_tasks.add_task(run_checks_task)
    return {"message": "Comprobación iniciada en segundo plano"}