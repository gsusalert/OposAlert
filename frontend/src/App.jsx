import React, { useState, useEffect } from 'react';

// Si estás en producción en Render, pon la URL de tu backend
const API_URL = "https://gsusalert.onrender.com";

export default function App() {
  const [pages, setPages] = useState([]);
  const [checking, setChecking] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', notify_email: '' });

  const loadPages = async () => {
    try {
      const res = await fetch(`${API_URL}/api/pages`);
      const data = await res.json();
      setPages(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadPages();
    const interval = setInterval(loadPages, 30000); // Refresca la vista cada 30 segundos
    return () => clearInterval(interval);
  }, []);

  const handleManualCheck = async () => {
    setChecking(true);
    try {
      const res = await fetch(`${API_URL}/api/check`, { method: 'POST' });
      const data = await res.json();
      alert(`Comprobación finalizada. Cambios detectados: ${data.changes_detected ? data.changes_detected.length : 0}`);
      await loadPages();
    } catch (e) {
      alert("Error al comprobar: " + e.message);
    } finally {
      setChecking(false);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.status === 'success') {
        setShowModal(false);
        setForm({ name: '', url: '', notify_email: '' });
        loadPages();
      } else {
        alert("Error: " + data.message);
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
  };

  const handleDismiss = async (id) => {
    await fetch(`${API_URL}/api/pages/${id}/dismiss`, { method: 'POST' });
    loadPages();
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`¿Eliminar la monitorización de "${name}"?`)) return;
    await fetch(`${API_URL}/api/pages/${id}`, { method: 'DELETE' });
    loadPages();
  };

  const alteredPages = pages.filter(p => p.has_changed);

  return (
    <div style={{ maxWidth: 840, margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Barra superior */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#111827' }}>Monitor de Páginas Web</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>Actualización automática programada cada 15 minutos</p>
        </div>
        <button
          onClick={handleManualCheck}
          disabled={checking}
          style={{ padding: '10px 18px', backgroundColor: checking ? '#e5e7eb' : '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: checking ? 'not-allowed' : 'pointer' }}
        >
          {checking ? '🔄 Comprobando...' : '🔄 Comprobar ahora'}
        </button>
      </div>

      {/* RECUADRO ROJO DESTACADO CON AVISO CUANDO HAY MODIFICACIONES */}
      {alteredPages.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            🚨 Alerta de modificaciones detectadas
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {alteredPages.map(page => (
              <div
                key={`alert-${page.id}`}
                style={{
                  border: '2px solid #dc2626',
                  backgroundColor: '#fef2f2',
                  borderRadius: 12,
                  padding: '20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.1)'
                }}
              >
                <div>
                  <span style={{ backgroundColor: '#dc2626', color: '#ffffff', fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>
                    ¡Cambio detectado!
                  </span>
                  <h3 style={{ margin: '8px 0 4px 0', fontSize: 18, fontWeight: 700, color: '#991b1b' }}>{page.name}</h3>
                  <div style={{ fontSize: 13, color: '#4b5563' }}>
                    Modificación registrada: <b>{page.changed_at}</b> · Aviso enviado a: <b>{page.notify_email}</b>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '10px 18px',
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      textDecoration: 'none',
                      borderRadius: 8,
                      fontWeight: 700,
                      fontSize: 14,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    🔗 Ir a la web
                  </a>
                  <button
                    onClick={() => handleDismiss(page.id)}
                    style={{ padding: '9px 14px', border: '1px solid #d1d5db', borderRadius: 8, backgroundColor: '#ffffff', color: '#374151', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                  >
                    Descartar aviso
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista general de páginas vigiladas */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#374151', textTransform: 'uppercase', margin: 0 }}>
          Páginas bajo seguimiento ({pages.length})
        </h2>
        <button
          onClick={() => setShowModal(true)}
          style={{ padding: '8px 16px', backgroundColor: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
        >
          + Añadir nueva web
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pages.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', border: '1px dashed #d1d5db', borderRadius: 12, color: '#6b7280' }}>
            No hay páginas monitorizadas aún. Pulsa el botón superior para añadir una.
          </div>
        ) : (
          pages.map(page => (
            <div
              key={page.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                border: page.has_changed ? '2px solid #ef4444' : '1px solid #e5e7eb',
                borderRadius: 12,
                backgroundColor: '#ffffff'
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>{page.name}</div>
                <a href={page.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#4b5563', textDecoration: 'none', display: 'block', marginTop: 2 }}>
                  {page.url}
                </a>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                  ✉️ {page.notify_email} · Última comprobación: {page.last_checked}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <a
                  href={page.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, textDecoration: 'none', color: '#374151', backgroundColor: '#f9fafb' }}
                >
                  Abrir
                </a>
                <button
                  onClick={() => handleDelete(page.id, page.name)}
                  style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #fee2e2', borderRadius: 6, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal para añadir página */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <form
            onSubmit={handleAddSubmit}
            style={{ backgroundColor: '#ffffff', padding: 28, borderRadius: 16, width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Añadir página a monitorizar</h3>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Nombre identificativo</label>
              <input
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ej. Convocatoria Oposición"
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Dirección web (URL)</label>
              <input
                required
                type="url"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
                value={form.url}
                onChange={e => setForm({ ...form, url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Correo para recibir la alerta</label>
              <input
                required
                type="email"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
                value={form.notify_email}
                onChange={e => setForm({ ...form, notify_email: e.target.value })}
                placeholder="correo@destino.com"
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={{ padding: '8px 16px', borderRadius: 8, background: '#dc2626', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                Guardar y vigilar
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}