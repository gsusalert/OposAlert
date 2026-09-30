import os
import re
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

def normalize_url(url: str) -> str:
    """Limpia la URL quitando anclas #post... y añade parámetros para evitar cachés"""
    clean_url = url.split('#')[0]
    return clean_url

def fetch_page_text(url: str) -> str:
    clean_url = normalize_url(url)

    # Configurar scraper imitando un navegador de escritorio completo
    scraper = cloudscraper.create_scraper(
        delay=10,
        browser={
            'browser': 'chrome',
            'platform': 'windows',
            'mobile': False
        }
    )

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://www.google.com/'
    }

    try:
        response = scraper.get(clean_url, headers=headers, timeout=20)
        
        # Verificar si Cloudflare bloqueó la petición
        if response.status_code != 200 or "Just a moment..." in response.text or "Attention Required" in response.text:
            print(f"[Aviso] Cloudflare o error {response.status_code} en {clean_url}")
            return ""

        soup = BeautifulSoup(response.text, 'html.parser')

        # Si es un hilo de Forocoches, extraemos específicamente los posts
        if "forocoches.com" in clean_url:
            posts = soup.find_all('div', id=re.compile(r'^post_message_'))
            if posts:
                # Unimos el texto de todos los comentarios del hilo
                return " ".join([p.get_text(strip=True) for p in posts])

        # Para el resto de webs genericas, extraemos todo el texto limpio
        for element in soup(["script", "style", "noscript", "header", "footer", "nav"]):
            element.decompose()

        return soup.get_text(separator=' ', strip=True)

    except Exception as e:
        print(f"Excepción al raspar {clean_url}: {e}")
        return ""

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

        # Si la petición falló o devolvió vacío (ej. bloqueo de Cloudflare), no comparamos
        if not current_content:
            continue

        # Si no había contenido guardado previo, guardamos el actual
        if not page.last_content:
            page.last_content = current_content
            db.commit()
            continue

        # Comparación: Si el contenido raspado cambia respecto al anterior
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