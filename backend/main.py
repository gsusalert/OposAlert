import os
import re
import time
import json
import hashlib
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from bs4 import BeautifulSoup

app = FastAPI(title="GsusAlert Engine API")

# Habilitar CORS total
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ruta del archivo donde se guardarán las alertas de forma permanente
DB_FILE = "pages.json"

def load_pages_from_file() -> list:
    """Carga la lista de páginas desde el archivo JSON si existe."""
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error leyendo {DB_FILE}: {e}")
            return []
    return []

def save_pages_to_file(pages: list):
    """Guarda la lista de páginas en el archivo JSON."""
    try:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(pages, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error guardando en {DB_FILE}: {e}")

# Cargar base de datos inicial
db_pages = load_pages_from_file()

class PageCreate(BaseModel):
    device_id: str
    name: str
    url: str
    notify_email: str

def get_clean_text_and_hash(url: str):
    """
    Extrae el texto relevante de la web eliminando contenido dinámico/invisible
    y genera un hash único SHA-256 para comparaciones exactas.
    """
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache'
        }
        response = requests.get(url, headers=headers, timeout=12)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Eliminar elementos dinámicos que causan falsos positivos
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'iframe', 
                         'noscript', 'svg', 'form', 'input', 'meta', 'link']):
            tag.extract()

        text = soup.get_text(separator=' ')
        clean_text = re.sub(r'\s+', ' ', text).strip().lower()
        clean_text = re.sub(r'\b\d{10,13}\b', '', clean_text)

        content_hash = hashlib.sha256(clean_text.encode('utf-8')).hexdigest()

        return clean_text, content_hash
    except Exception as e:
        print(f"Error extrayendo {url}: {e}")
        return None, None

@app.get("/")
def home():
    return {"status": "ok", "message": "Backend GsusAlert en línea"}

@app.get("/api/pages")
def get_pages(device_id: str = Query(...)):
    """Retorna únicamente las páginas asignadas al dispositivo."""
    current_pages = load_pages_from_file()
    return [p for p in current_pages if p.get("device_id") == device_id]

@app.post("/api/pages")
def create_page(item: PageCreate):
    """Crea una nueva alerta y la guarda permanentemente."""
    if not item.name or not item.url or not item.notify_email:
        raise HTTPException(status_code=400, detail="Todos los campos son obligatorios")
    
    clean_text, content_hash = get_clean_text_and_hash(item.url)
    
    current_pages = load_pages_from_file()
    
    new_page = {
        "id": f"page_{int(time.time() * 1000)}",
        "device_id": item.device_id,
        "name": item.name,
        "url": item.url,
        "notify_email": item.notify_email,
        "last_hash": content_hash or "",
        "last_text_length": len(clean_text) if clean_text else 0,
        "has_changed": False,
        "last_checked": "Recién añadida"
    }
    
    current_pages.append(new_page)
    save_pages_to_file(current_pages)
    
    return {"status": "success", "page": new_page}

@app.post("/api/check")
def check_pages(device_id: str = Query(...)):
    """Compara los hashes de contenido para evitar falsos positivos."""
    current_pages = load_pages_from_file()
    new_additions_count = 0
    
    for page in current_pages:
        if page.get("device_id") != device_id:
            continue

        clean_text, current_hash = get_clean_text_and_hash(page["url"])
        if not current_hash:
            continue
            
        previous_hash = page.get("last_hash", "")
        
        if not previous_hash:
            page["last_hash"] = current_hash
            page["last_text_length"] = len(clean_text)
            continue

        if current_hash != previous_hash:
            old_len = page.get("last_text_length", 0)
            current_len = len(clean_text)
            
            if abs(current_len - old_len) > 15:
                page["has_changed"] = True
                page["last_hash"] = current_hash
                page["last_text_length"] = current_len
                new_additions_count += 1
            else:
                page["last_hash"] = current_hash
                page["last_text_length"] = current_len

        page["last_checked"] = "Comprobado ahora"
        
    save_pages_to_file(current_pages)
    return {"status": "success", "newAdditionsCount": new_additions_count}

@app.post("/api/pages/{page_id}/dismiss")
def dismiss_page(page_id: str):
    """Marca la novedad como vista."""
    current_pages = load_pages_from_file()
    for page in current_pages:
        if page["id"] == page_id:
            page["has_changed"] = False
            save_pages_to_file(current_pages)
            return {"status": "success"}
    raise HTTPException(status_code=404, detail="Alerta no encontrada")

@app.delete("/api/pages/{page_id}")
def delete_page(page_id: str):
    """Elimina la alerta permanentemente."""
    current_pages = load_pages_from_file()
    updated_pages = [p for p in current_pages if p["id"] != page_id]
    save_pages_to_file(updated_pages)
    return {"status": "success"}