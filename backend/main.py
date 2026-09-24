import os
import re
import time
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

# Base de datos global en memoria
db_pages = []

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
        
        # Eliminar elementos que suelen cambiar sin aportar contenido real
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'iframe', 
                         'noscript', 'svg', 'form', 'input', 'meta', 'link']):
            tag.extract()

        # Extraer el texto
        text = soup.get_text(separator=' ')
        
        # Normalización estricta del texto:
        # 1. Convertir a minúsculas
        # 2. Reemplazar múltiples espacios/saltos por un solo espacio
        clean_text = re.sub(r'\s+', ' ', text).strip().lower()
        
        # Opcional: Eliminar patrones numéricos dinámicos muy cambiantes (ej. marcas de tiempo de Unix)
        clean_text = re.sub(r'\b\d{10,13}\b', '', clean_text)

        # Generar hash SHA-256 único del contenido limpio
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
    return [p for p in db_pages if p.get("device_id") == device_id]

@app.post("/api/pages")
def create_page(item: PageCreate):
    """Crea una nueva alerta guardando el hash inicial del contenido."""
    if not item.name or not item.url or not item.notify_email:
        raise HTTPException(status_code=400, detail="Todos los campos son obligatorios")
    
    clean_text, content_hash = get_clean_text_and_hash(item.url)
    
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
    
    db_pages.append(new_page)
    return {"status": "success", "page": new_page}

@app.post("/api/check")
def check_pages(device_id: str = Query(...)):
    """Compara los hashes de contenido para evitar falsos positivos."""
    user_pages = [p for p in db_pages if p.get("device_id") == device_id]
    new_additions_count = 0
    
    for page in user_pages:
        clean_text, current_hash = get_clean_text_and_hash(page["url"])
        if not current_hash:
            continue
            
        previous_hash = page.get("last_hash", "")
        
        # Si el hash guardado está vacío (p. ej. en la primera comprobación tras actualizar)
        if not previous_hash:
            page["last_hash"] = current_hash
            page["last_text_length"] = len(clean_text)
            continue

        # Solo marcamos cambio si el HASH es diferente Y la longitud del texto ha variado significativamente
        # (evita pequeños micro-cambios y asegura que hay texto nuevo agregado o modificado)
        if current_hash != previous_hash:
            old_len = page.get("last_text_length", 0)
            current_len = len(clean_text)
            
            # Verificamos que realmente haya variación sustancial en el contenido del texto
            if abs(current_len - old_len) > 15:
                page["has_changed"] = True
                page["last_hash"] = current_hash
                page["last_text_length"] = current_len
                new_additions_count += 1
            else:
                # Si el hash cambió por algún microdetalle pero el texto es casi idéntico, actualizamos silenciosamente
                page["last_hash"] = current_hash
                page["last_text_length"] = current_len

        page["last_checked"] = "Comprobado ahora"
        
    return {"status": "success", "newAdditionsCount": new_additions_count}

@app.post("/api/pages/{page_id}/dismiss")
def dismiss_page(page_id: str):
    """Marca la novedad como vista."""
    for page in db_pages:
        if page["id"] == page_id:
            page["has_changed"] = False
            return {"status": "success"}
    raise HTTPException(status_code=404, detail="Alerta no encontrada")

@app.delete("/api/pages/{page_id}")
def delete_page(page_id: str):
    """Elimina la alerta."""
    global db_pages
    db_pages = [p for p in db_pages if p["id"] != page_id]
    return {"status": "success"}