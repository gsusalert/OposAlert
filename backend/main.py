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

DB_PATH = "gsusalert.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
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
            'Cache-Control': 'no-cache'
        }
        response = requests.get(url, headers=headers, timeout=12)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
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
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM pages WHERE device_id = ?", (device_id,))
    rows = cursor.fetchall()
    conn.close()
    
    pages = []
    for r in rows:
        p = dict(r)
        p["has_changed"] = bool(p["has_changed"])
        pages.append(p)
    return pages

@app.post("/api/pages")
def create_page(item: PageCreate):
    if not item.name or not item.url or not item.notify_email:
        raise HTTPException(status_code=400, detail="Todos los campos son obligatorios")
    
    clean_text, content_hash = get_clean_text_and_hash(item.url)
    page_id = f"page_{int(time.time() * 1000)}"
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO pages (id, device_id, name, url, notify_email, last_hash, last_text_length, has_changed, last_checked)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    ''', (
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
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM pages WHERE device_id = ?", (device_id,))
    user_pages = cursor.fetchall()
    
    new_additions_count = 0
    
    for row in user_pages:
        page = dict(row)
        clean_text, current_hash = get_clean_text_and_hash(page["url"])
        if not current_hash:
            continue
            
        previous_hash = page["last_hash"]
        has_changed = page["has_changed"]
        new_len = len(clean_text) if clean_text else 0
        
        if not previous_hash:
            cursor.execute("UPDATE pages SET last_hash = ?, last_text_length = ? WHERE id = ?", (current_hash, new_len, page["id"]))
            continue

        if current_hash != previous_hash:
            old_len = page["last_text_length"] or 0
            if abs(new_len - old_len) > 15:
                has_changed = 1
                new_additions_count += 1
            
            cursor.execute("UPDATE pages SET last_hash = ?, last_text_length = ?, has_changed = ? WHERE id = ?", 
                           (current_hash, new_len, has_changed, page["id"]))

        cursor.execute("UPDATE pages SET last_checked = ? WHERE id = ?", ("Comprobado ahora", page["id"]))
        
    conn.commit()
    conn.close()
    return {"status": "success", "newAdditionsCount": new_additions_count}

@app.post("/api/pages/{page_id}/dismiss")
def dismiss_page(page_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE pages SET has_changed = 0 WHERE id = ?", (page_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.delete("/api/pages/{page_id}")
def delete_page(page_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM pages WHERE id = ?", (page_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}