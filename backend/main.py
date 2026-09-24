import os
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

# Compatibilidad para Render / Heroku (remplaza postgres:// por postgresql://)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

# ------------------------------------------------------------------
# MODELO DE DATOS (SQLModel)
# ------------------------------------------------------------------
class Alert(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    url: str
    email: str
    last_text: Optional[str] = None  # Almacena el texto visible procesado
    last_checked: Optional[datetime] = None
    status: str = "active"  # 'active', 'changed', 'error'

class AlertCreate(BaseModel):
    title: str
    url: HttpUrl
    email: str

# ------------------------------------------------------------------
# CONFIGURACIÓN DE FASTAPI
# ------------------------------------------------------------------
app = FastAPI(title="OposAlert API", version="3.0")

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
# LÓGICA DE EXTRACCIÓN Y DETECCIÓN DE AÑADIDOS
# ------------------------------------------------------------------
def extract_clean_text(url: str) -> Optional[str]:
    """
    Descarga la página web, elimina elementos dinámicos o ruidosos
    (scripts, menús, footers, contadores) y extrae únicamente el texto visible relevante.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, "html.parser")
        
        # 1. Eliminar etiquetas de estructura/dinámicas que producen falsas alarmas
        unwanted_tags = [
            "script", "style", "nav", "footer", "header", "aside", 
            "form", "input", "noscript", "svg", "iframe"
        ]
        for tag in soup(unwanted_tags):
            tag.decompose()
            
        # 2. Localizar el contenedor principal de contenido
        main_content = (
            soup.find("main") or 
            soup.find("article") or 
            soup.find(id=lambda x: x and "content" in str(x).lower()) or
            soup.find(class_=lambda x: x and "content" in str(x).lower())
        )
        
        text_source = main_content if main_content else soup
        raw_text = text_source.get_text(separator="\n", strip=True)
        
        # 3. Filtrar líneas muy cortas o residuales (menos de 4 caracteres)
        lines = [line.strip() for line in raw_text.splitlines() if len(line.strip()) > 3]
        return "\n".join(lines)
    except Exception as e:
        print(f"Error extrayendo texto de {url}: {e}")
        return None


def detect_additions(old_text: str, new_text: str) -> bool:
    """
    Compara el texto anterior con el nuevo y determina si hay líneas o bloques
    de información completamente nuevos agregados a la página.
    """
    if not old_text:
        return False
        
    old_lines = set(old_text.splitlines())
    new_lines = set(new_text.splitlines())
    
    # Obtener únicamente las líneas que no existían previamente
    added_lines = new_lines - old_lines
    
    # Se considera un añadido real si hay al menos una línea nueva relevante
    return len(added_lines) >= 1

# ------------------------------------------------------------------
# ENVÍO DE NOTIFICACIONES POR CORREO (BREVO)
# ------------------------------------------------------------------
def send_email_notification(to_email: str, title: str, url: str):
    brevo_api_key = os.getenv("BREVO_API_KEY")
    if not brevo_api_key:
        print("Aviso: BREVO_API_KEY no configurada. Omitiendo envío de email.")
        return

    payload = {
        "sender": {
            "name": "OposAlert", 
            "email": os.getenv("SENDER_EMAIL", "no-reply@oposalert.com")
        },
        "to": [{"email": to_email}],
        "subject": f"🚨 ¡Nuevas publicaciones/añadidos en {title}!",
        "htmlContent": f"""
            <h2>¡Atención! Hay novedades en tu convocatoria</h2>
            <p>Hemos detectado nuevas publicaciones o contenido añadido en <strong>{title}</strong>.</p>
            <p style="margin: 20px 0;">
                <a href="{url}" target="_blank" style="padding: 12px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    Ver contenido oficial en la web
                </a>
            </p>
            <br>
            <small>Recibes este aviso porque configuraste una alerta en OposAlert.</small>
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
        print(f"Error enviando correo a través de Brevo: {e}")

# ------------------------------------------------------------------
# TAREA DE COMPROBACIÓN EN SEGUNDO PLANO
# ------------------------------------------------------------------
def run_checks_task():
    with Session(engine) as session:
        alerts = session.exec(select(Alert)).all()
        for alert in alerts:
            current_text = extract_clean_text(alert.url)
            
            if current_text is None:
                alert.status = "error"
            elif alert.last_text is None:
                # Primera lectura al registrar la alerta
                alert.last_text = current_text
                alert.status = "active"
            elif detect_additions(alert.last_text, current_text):
                # ¡Nuevo contenido o publicación añadida!
                alert.last_text = current_text
                alert.status = "changed"
                send_email_notification(alert.email, alert.title, alert.url)
            else:
                alert.status = "active"
                
            alert.last_checked = datetime.utcnow()
            session.add(alert)
        session.commit()

# ------------------------------------------------------------------
# ENDPOINTS Y RUTAS DE LA API
# ------------------------------------------------------------------
@app.get("/")
def read_root():
    return {"status": "ok", "message": "OposAlert API v3.0 operativa"}

@app.get("/api/alerts", response_model=List[Alert])
def get_alerts():
    with Session(engine) as session:
        return session.exec(select(Alert)).all()

@app.post("/api/alerts", response_model=Alert)
def create_alert(alert_in: AlertCreate):
    url_str = str(alert_in.url)
    initial_text = extract_clean_text(url_str)
    
    alert = Alert(
        title=alert_in.title,
        url=url_str,
        email=alert_in.email,
        last_text=initial_text,
        last_checked=datetime.utcnow() if initial_text else None,
        status="active" if initial_text else "error"
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
    return {"message": "Proceso de comprobación iniciado en segundo plano"}