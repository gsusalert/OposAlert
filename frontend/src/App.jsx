import React, { useState, useEffect } from 'react';

const API_BASE_URL = "https://gsusalert.onrender.com";

export default function App() {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPage, setEditingPage] = useState(null);

  const [formData, setFormData] = useState({ name: '', url: '', notify_email: '' });

  const fetchPages = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/pages`);
      const data = await res.json();
      setPages(data);
    } catch (err) {
      console.error("Error al cargar páginas:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPages();
    const interval = setInterval(fetchPages, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleManualCheck = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/check`, { method: 'POST' });
      const data = await res.json();
      const count = data.changes_detected ? data.changes_detected.length : 0;
      alert(`Comprobación finalizada.\nCambios detectados: ${count}`);
      await fetchPages();
    } catch (e) {
      alert("Error en la comprobación: " + e.message);
    } finally {
      setChecking(false);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/api/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.status === 'success') {
        setShowAddModal(false);
        setFormData({ name: '', url: '', notify_email: '' });
        fetchPages();
      } else {
        alert("Error: " + data.message);
      }
    } catch (err) {
      alert("Error al conectar con el servidor: " + err.message);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/api/pages/${editingPage.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.status === 'success') {
        setEditingPage(null);
        setFormData({ name: '', url: '', notify_email: '' });
        fetchPages();
      } else {
        alert("Error al actualizar la página");
      }
    } catch (err) {
      alert("Error al actualizar: " + err.message);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`¿Seguro que deseas eliminar "${name}"?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/pages/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'success') {
        fetchPages();
      }
    } catch (err) {
      alert("Error al eliminar: " + err.message);
    }
  };

  const handleDismiss = async (id) => {
    try {
      await fetch(`${API_BASE_URL}/api/pages/${id}/dismiss`, { method: 'POST' });
      fetchPages();
    } catch (err) {
      console.error(err);
    }
  };

  const openEditModal = (page) => {
    setEditingPage(page);
    setFormData({ name: page.name, url: page.url, notify_email: page.notify_email });
  };

  const changesCount = pages.filter(p => p.has_changed).length;

  return (
    <div style={{ maxWidth: 860, margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#7c3aed', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>O</div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>OposAlert</h1>
        </div>
        <button
          onClick={handleManualCheck}
          disabled={checking}
          style={{ padding: '10px 18px', backgroundColor: checking ? '#e5e7eb' : '#f3e8ff', color: '#7c3aed', border: 'none', borderRadius: 8, fontWeight: 600, cursor: checking ? 'not-allowed' : 'pointer' }}
        >
          {checking ? '🔄 Comprobando...' : '🔄 Comprobar ahora'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        <div style={{ padding: 20, backgroundColor: '#f9fafb', borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{pages.length}</div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>Webs</div>
        </div>
        <div style={{ padding: 20, backgroundColor: '#faf5ff', borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed' }}>{changesCount}</div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>Cambios</div>
        </div>
        <div style={{ padding: 20, backgroundColor: '#f9fafb', borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>0</div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>Errores</div>
        </div>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: 12 }}>Páginas vigiladas</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pages.map(page => (
          <div key={page.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 18, border: page.has_changed ? '2px solid #ef4444' : '1px solid #e5e7eb', borderRadius: 12, backgroundColor: '#fff' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 16 }}>{page.name}</span>
                {page.has_changed && <span style={{ backgroundColor: '#fee2e2', color: '#dc2626', fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>¡CAMBIO DETECTADO!</span>}
              </div>
              <a href={page.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none', display: 'block', marginTop: 2 }}>{page.url}</a>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>✉️ {page.notify_email} · Última revisión: {page.last_checked}</div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {page.has_changed && (
                <button onClick={() => handleDismiss(page.id)} style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, backgroundColor: '#fff', cursor: 'pointer' }}>
                  Descartar aviso
                </button>
              )}
              <button
                onClick={() => openEditModal(page)}
                style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, backgroundColor: '#f9fafb', color: '#374151', cursor: 'pointer' }}
              >
                ✏️ Modificar
              </button>
              <button
                onClick={() => handleDelete(page.id, page.name)}
                style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #fee2e2', borderRadius: 6, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
              >
                🗑️ Eliminar
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={() => { setFormData({ name: '', url: '', notify_email: '' }); setShowAddModal(true); }}
          style={{ padding: 16, border: '2px dashed #d1d5db', borderRadius: 12, background: 'none', color: '#4b5563', fontWeight: 600, cursor: 'pointer', marginTop: 8 }}
        >
          + AÑADIR PÁGINA
        </button>
      </div>

      {(showAddModal || editingPage) && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <form
            onSubmit={editingPage ? handleEditSubmit : handleAddSubmit}
            style={{ backgroundColor: '#fff', padding: 28, borderRadius: 16, width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              {editingPage ? 'Modificar página vigilada' : 'Añadir nueva página'}
            </h2>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Nombre identificativo</label>
              <input
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej. Convocatoria Administrativo"
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>URL</label>
              <input
                required
                type="url"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
                value={formData.url}
                onChange={e => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Email de aviso</label>
              <input
                required
                type="email"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
                value={formData.notify_email}
                onChange={e => setFormData({ ...formData, notify_email: e.target.value })}
                placeholder="tu_correo@gmail.com"
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                onClick={() => { setShowAddModal(false); setEditingPage(null); }}
                style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={{ padding: '8px 16px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                {editingPage ? 'Guardar cambios' : 'Añadir'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}