import os
import cloudscraper
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Boolean, Text
from sqlalchemy.orm import declarative_base, sessionmaker

# 1. Obtener la URL de conexión desde la variable de entorno
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("ERROR: La variable DATABASE_URL no está configurada.")

# Adaptar el prefijo para compatibilidad con SQLAlchemy
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Configuración de SQLAlchemy
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# 2. Estructura de la tabla en Supabase (Añadido last_content para guardar el HTML/texto)
class PageModel(Base):
    __tablename__ = "pages"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, index=True)
    name = Column(String)
    url = Column(String)
    notify_email = Column(String)
    has_changed = Column(Boolean, default=False)
    last_content = Column(Text, nullable=True)

# Crea la tabla automáticamente en Supabase si no existe
Base.metadata.create_all(bind=engine)

# 3. Función para extraer contenido evitando bloqueos (Cloudflare / Forocoches)
def fetch_page_text(url: str) -> str:
    # Quitar el hash #post... de la URL si viene incluido
    clean_url = url.split('#')[0]

    scraper = cloudscraper.create_scraper(
        browser={
            'browser': 'chrome',
            'platform': 'windows',
            'desktop': True
        }
    )

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    }

    try:
        response = scraper.get(clean_url, headers=headers, timeout=15)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')

            # Limpiar etiquetas no deseadas que cambian constantemente (scripts, estilos)
            for element in soup(["script", "style", "noscript", "header", "footer"]):
                element.decompose()

            # Extraer únicamente el texto visible de la web
            text = soup.get_text(separator=' ', strip=True)
            return text
        else:
            print(f"Error HTTP {response.status_code} al consultar {clean_url}")
            return ""
    except Exception as e:
        print(f"Excepción al raspar la URL {clean_url}: {e}")
        return ""

# 4. Inicializar App
app = FastAPI()

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
    
    # Obtener contenido inicial de la web al registrarla
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

        # Si no había contenido guardado previo, guardamos el actual
        if not page.last_content:
            page.last_content = current_content
            db.commit()
            continue

        # Si el contenido ha cambiado respecto al guardado anteriormente
        if current_content != page.last_content:
            page.has_changed = True
            page.last_content = current_content
            new_additions_count += 1

    db.commit()
    db.close()

    return {
        "status": "success",
        "newAdditionsCount": new_additions_count
    }

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