import os
import re
import time
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from bs4 import BeautifulSoup

app = FastAPI(title="OposAlert Engine API")

# Habilitar CORS total para conectar sin trabas con React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Almacenamiento global de páginas en memoria
db_pages = []

class PageCreate(BaseModel):
    device_id: str
    name: str
    url: str
    notify_email: str

def fetch_web_text(url: str) -> Optional[str]:
    """Descarga y extrae solo el texto limpio de la web."""
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Eliminar etiquetas ruidosas
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'iframe', 'noscript']):
            tag.extract()
            
        text = soup.get_text(separator=' ')
        return re.sub(r'\s+', ' ', text).strip()
    except Exception as e:
        print(f"Error scraping {url}: {e}")
        return None

@app.get("/")
def home():
    return {"status": "ok", "message": "Backend OposAlert en línea"}

@app.get("/api/pages")
def get_pages(device_id: str = Query(...)):
    """Obtiene únicamente las alertas del dispositivo que hace la consulta."""
    return [p for p in db_pages if p.get("device_id") == device_id]

@app.post("/api/pages")
def create_page(item: PageCreate):
    """Guarda una nueva alerta asociada al device_id."""
    if not item.name or not item.url or not item.notify_email:
        raise HTTPException(status_code=400, detail="Faltan campos obligatorios")
    
    # Captura del texto base inicial
    initial_text = fetch_web_text(item.url) or ""
    
    new_page = {
        "id": f"page_{int(time.time() * 1000)}",
        "device_id": item.device_id,
        "name": item.name,
        "url": item.url,
        "notify_email": item.notify_email,
        "last_text": initial_text,
        "has_changed": False,
        "last_checked": "Recién añadida"
    }
    
    db_pages.append(new_page)
    return {"status": "success", "page": new_page}

@app.post("/api/check")
def check_pages(device_id: str = Query(...)):
    """Revisa las páginas y solo marca alerta si se ha AÑADIDO texto nuevo (más de 30 caracteres)."""
    user_pages = [p for p in db_pages if p.get("device_id") == device_id]
    new_additions_count = 0
    
    for page in user_pages:
        current_text = fetch_web_text(page["url"])
        if not current_text:
            continue
            
        old_text = page.get("last_text", "")
        
        # FILTRO DE ADICIÓN: Comprueba si el texto nuevo supera en 30 caracteres al anterior
        is_addition = len(old_text) > 0 and len(current_text) > (len(old_text) + 30)
        
        if is_addition:
            page["has_changed"] = True
            page["last_text"] = current_text
            new_additions_count += 1
        else:
            if len(current_text) > 0:
                page["last_text"] = current_text
                
        page["last_checked"] = "Comprobado ahora"
        
    return {"status": "success", "newAdditionsCount": new_additions_count}

@app.post("/api/pages/{page_id}/dismiss")
def dismiss_page(page_id: str):
    """Marca como vista la alerta."""
    for page in db_pages:
        if page["id"] == page_id:
            page["has_changed"] = False
            return {"status": "success"}
    raise HTTPException(status_code=404, detail="No encontrada")

@app.delete("/api/pages/{page_id}")
def delete_page(page_id: str):
    """Elimina la alerta."""
    global db_pages
    db_pages = [p for p in db_pages if p["id"] != page_id]
    return {"status": "success"}