import os
import re
import time
import hashlib
import sqlite3
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from bs4 import BeautifulSoup

app = FastAPI(title="GsusAlert Engine API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

def get_connection():
    if DATABASE_URL:
        import psycopg2
        return psycopg2.connect(DATABASE_URL)
    else:
        conn = sqlite3.connect("gsusalert.db")
        conn.row_factory = sqlite3.Row
        return conn

def init_db():
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pages (
                id TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                notify_email TEXT NOT NULL,
                last_hash TEXT,
                last_text_length INTEGER,
                has_changed INTEGER DEFAULT 0,
                last_checked TEXT
            )
        ''')
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error inicializando BD: {e}")

init_db()

class PageCreate(BaseModel):
    device_id: str
    name: str
    url: str
    notify_email: str

def get_clean_text_and_hash(url: str):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Eliminar elementos que suelen meter cambios dinámicos
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'iframe', 
                         'noscript', 'svg', 'form', 'input', 'meta', 'link', 'button']):
            tag.extract()

        # Priorizar el contenido principal
        main_content = soup.find('main') or soup.find('article') or soup.find('div', id=re.compile(r'content|main|pagina', re.I))
        if main_content:
            text = main_content.get_text(separator=' ')
        else:
            text = soup.get_text(separator=' ')

        # Limpieza de texto
        clean_text = re.sub(r'\s+', ' ', text).strip().lower()
        clean_text = re.sub(r'\b[a-f0-9]{32,64}\b', '', clean_text)
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
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, device_id, name, url, notify_email, last_hash, last_text_length, has_changed, last_checked FROM pages WHERE device_id = %s" if DATABASE_URL else "SELECT id, device_id, name, url, notify_email, last_hash, last_text_length, has_changed, last_checked FROM pages WHERE device_id = ?", (device_id,))
    rows = cursor.fetchall()
    conn.close()
    
    pages = []
    for r in rows:
        if isinstance(r, dict) or hasattr(r, 'keys'):
            p = dict(r)
        else:
            p = {
                "id": r[0], "device_id": r[1], "name": r[2], "url": r[3],
                "notify_email": r[4], "last_hash": r[5], "last_text_length": r[6],
                "has_changed": bool(r[7]), "last_checked": r[8]
            }
        p["has_changed"] = bool(p["has_changed"])
        pages.append(p)
    return pages

@app.post("/api/pages")
def create_page(item: PageCreate):
    if not item.name or not item.url or not item.notify_email:
        raise HTTPException(status_code=400, detail="Todos los campos son obligatorios")
    
    clean_text, content_hash = get_clean_text_and_hash(item.url)
    page_id = f"page_{int(time.time() * 1000)}"
    
    conn = get_connection()
    cursor = conn.cursor()
    q = "INSERT INTO pages (id, device_id, name, url, notify_email, last_hash, last_text_length, has_changed, last_checked) VALUES (%s, %s, %s, %s, %s, %s, %s, 0, %s)" if DATABASE_URL else "INSERT INTO pages (id, device_id, name, url, notify_email, last_hash, last_text_length, has_changed, last_checked) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)"
    cursor.execute(q, (
        page_id,
        item.device_id,
        item.name,
        item.url,
        item.notify_email,
        content_hash or "",
        len(clean_text) if clean_text else 0,
        "Recién añadida"
    ))
    conn.commit()
    conn.close()
    
    return {"status": "success", "page": {"id": page_id, "name": item.name, "url": item.url}}

@app.post("/api/check")
def check_pages(device_id: str = Query(...)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, url, last_hash, last_text_length, has_changed FROM pages WHERE device_id = %s" if DATABASE_URL else "SELECT id, url, last_hash, last_text_length, has_changed FROM pages WHERE device_id = ?", (device_id,))
    user_pages = cursor.fetchall()
    
    new_additions_count = 0
    
    for row in user_pages:
        page_id, url, prev_hash, prev_len, has_changed = row[0], row[1], row[2], row[3], row[4]
        clean_text, current_hash = get_clean_text_and_hash(url)
        if not current_hash:
            continue
            
        new_len = len(clean_text) if clean_text else 0
        
        if not prev_hash:
            q_up = "UPDATE pages SET last_hash = %s, last_text_length = %s WHERE id = %s" if DATABASE_URL else "UPDATE pages SET last_hash = ?, last_text_length = ? WHERE id = ?"
            cursor.execute(q_up, (current_hash, new_len, page_id))
            continue

        if current_hash != prev_hash:
            old_len = prev_len or 0
            if abs(new_len - old_len) > 30:
                has_changed = 1
                new_additions_count += 1
            
            q_up = "UPDATE pages SET last_hash = %s, last_text_length = %s, has_changed = %s WHERE id = %s" if DATABASE_URL else "UPDATE pages SET last_hash = ?, last_text_length = ?, has_changed = ? WHERE id = ?"
            cursor.execute(q_up, (current_hash, new_len, has_changed, page_id))

        q_chk = "UPDATE pages SET last_checked = %s WHERE id = %s" if DATABASE_URL else "UPDATE pages SET last_checked = ? WHERE id = ?"
        cursor.execute(q_chk, ("Comprobado ahora", page_id))
        
    conn.commit()
    conn.close()
    return {"status": "success", "newAdditionsCount": new_additions_count}

@app.post("/api/pages/{page_id}/dismiss")
def dismiss_page(page_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE pages SET has_changed = 0 WHERE id = %s" if DATABASE_URL else "UPDATE pages SET has_changed = 0 WHERE id = ?", (page_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.delete("/api/pages/{page_id}")
def delete_page(page_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM pages WHERE id = %s" if DATABASE_URL else "DELETE FROM pages WHERE id = ?", (page_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}