import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker
import requests
from bs4 import BeautifulSoup

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

# 2. Estructura de la tabla en Supabase
class PageModel(Base):
    __tablename__ = "pages"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, index=True)
    name = Column(String)
    url = Column(String)
    notify_email = Column(String)
    has_changed = Column(Boolean, default=False)

# Crea la tabla automáticamente en Supabase si no existe
Base.metadata.create_all(bind=engine)

# 3. Inicializar App
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
    new_page = PageModel(
        device_id=page.device_id,
        name=page.name,
        url=page.url,
        notify_email=page.notify_email,
        has_changed=False
    )
    db.add(new_page)
    db.commit()
    db.refresh(new_page)
    db.close()
    return {"status": "success", "id": new_page.id}

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