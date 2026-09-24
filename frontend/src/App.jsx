import React, { useState, useEffect } from 'react';

const API_URL = "https://gsusalert.onrender.com";

function setCookie(name, value, days = 365) {
  const date = new Date();
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
  document.cookie = `${name}=${value};expires=${date.toUTCString()};path=/;SameSite=Lax`;
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

function getOrCreateDeviceId() {
  let id = null;
  try {
    id = localStorage.getItem("opos_device_id");
  } catch (e) {}

  if (!id) {
    id = getCookie("opos_device_id");
  }

  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }

  try {
    localStorage.setItem("opos_device_id", id);
  } catch (e) {}
  setCookie("opos_device_id", id, 365);

  return id;
}

export default function App() {
  const [deviceId] = useState(() => getOrCreateDeviceId());
  const [pages, setPages] = useState([]);
  const [checking, setChecking] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', notify_email: '' });
  const [copied, setCopied] = useState(false);

  const loadPages = async () => {
    if (!deviceId) return;
    try {
      const res = await fetch(`${API_URL}/api/pages?device_id=${encodeURIComponent(deviceId)}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setPages(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadPages();
    const interval = setInterval(loadPages, 30000);
    return () => clearInterval(interval);
  }, [deviceId]);

  const handleManualCheck = async () => {
    setChecking(true);
    try {
      const res = await fetch(`${API_URL}/api/check?device_id=${encodeURIComponent(deviceId)}`, { method: 'POST' });
      const data = await res.json();
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
        body: JSON.stringify({
          device_id: deviceId,
          name: form.name,
          url: form.url,
          notify_email: form.notify_email
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setShowModal(false);
        setForm({ name: '', url: '', notify_email: form.notify_email });
        loadPages();
      } else {
        alert("Error: " + (data.message || data.detail));
      }
    } catch (e) {
      alert("Error de conexión");
    }
  };

  const handleDismiss = async (id) => {
    await fetch(`${API_URL}/api/pages/${id}/dismiss`, { method: 'POST' });
    loadPages();
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`¿Dejar de vigilar "${name}"?`)) return;
    await fetch(`${API_URL}/api/pages/${id}`, { method: 'DELETE' });
    loadPages();
  };

  const copyDeviceId = () => {
    navigator.clipboard.writeText(deviceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const alteredPages = pages.filter(p => p.has_changed);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#fbfbfb',
      color: '#1a1a1a',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      WebkitFontSmoothing: 'antialiased',
      padding: '40px 16px 80px'
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Encabezado principal */}
        <header style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 36,
          paddingBottom: 24,
          borderBottom: '1px solid #ebebeb'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: checking ? '#f59e0b' : '#10b981',
                boxShadow: checking ? '0 0 0 3px #fef3c7' : '0 0 0 3px #d1fae5'
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#666', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {checking ? 'Rastreando cambios...' : 'Vigilancia en segundo plano'}
              </span>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: '#111' }}>
              OposAlert
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#666' }}>
              Detección y notificación automática de cambios en páginas públicas.
            </p>
          </div>

          <button
            onClick={handleManualCheck}
            disabled={checking}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 500,
              color: checking ? '#999' : '#222',
              backgroundColor: '#fff',
              border: '1px solid #dcdcdc',
              borderRadius: 6,
              cursor: checking ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}
          >
            <span style={{ display: 'inline-block', transform: checking ? 'rotate(180deg)' : 'none', transition: 'transform 0.5s ease' }}>
              ↻
            </span>
            {checking ? 'Comprobando' : 'Comprobar'}
          </button>
        </header>

        {/* Notificaciones de cambio detectado */}
        {alteredPages.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#b91c1c' }}>
                Cambios detectados ({alteredPages.length})
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {alteredPages.map(page => (
                <div
                  key={`alert-${page.id}`}
                  style={{
                    backgroundColor: '#fff',
                    border: '1px solid #fecaca',
                    borderLeft: '4px solid #dc2626',
                    borderRadius: 8,
                    padding: '16px 18px',
                    boxShadow: '0 2px 4px rgba(220, 38, 38, 0.05)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#991b1b' }}>
                        {page.name}
                      </h2>
                      <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                        Detectado: <strong style={{ color: '#333' }}>{page.changed_at}</strong> · Aviso enviado a: <span style={{ color: '#333' }}>{page.notify_email}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          padding: '6px 12px',
                          fontSize: 13,
                          fontWeight: 500,
                          color: '#fff',
                          backgroundColor: '#dc2626',
                          borderRadius: 6,
                          textDecoration: 'none'
                        }}
                      >
                        Abrir web ↗
                      </a>
                      <button
                        onClick={() => handleDismiss(page.id)}
                        style={{
                          padding: '6px 12px',
                          fontSize: 13,
                          fontWeight: 500,
                          color: '#555',
                          backgroundColor: '#f3f4f6',
                          border: 'none',
                          borderRadius: 6,
                          cursor: 'pointer'
                        }}
                      >
                        Visto
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Listado de páginas en seguimiento */}
        <section>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 16
          }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
              Páginas vigiladas ({pages.length})
            </h2>
            <button
              onClick={() => setShowModal(true)}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                backgroundColor: '#111',
                border: 'none',
                padding: '7px 14px',
                borderRadius: 6,
                cursor: 'pointer'
              }}
            >
              + Añadir enlace
            </button>
          </div>

          {pages.length === 0 ? (
            <div style={{
              backgroundColor: '#fff',
              border: '1px dashed #d1d5db',
              borderRadius: 8,
              padding: '48px 24px',
              textAlign: 'center'
            }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#333' }}>
                No tienes ninguna página en este dispositivo
              </p>
              <p style={{ margin: '6px 0 16px', fontSize: 13, color: '#777' }}>
                Añade el enlace de una convocatoria o boletín para recibir un correo en cuanto se actualice.
              </p>
              <button
                onClick={() => setShowModal(true)}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#111',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #dcdcdc',
                  padding: '7px 14px',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                Añadir la primera página
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pages.map(page => (
                <div
                  key={page.id}
                  style={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e5e5',
                    borderRadius: 8,
                    padding: '14px 18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 16
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>
                        {page.name}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 13,
                      color: '#666',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      marginTop: 2
                    }}>
                      <a href={page.url} target="_blank" rel="noreferrer" style={{ color: '#666', textDecoration: 'none' }}>
                        {page.url}
                      </a>
                    </div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4, display: 'flex', gap: 12 }}>
                      <span>Aviso a: <strong style={{ fontWeight: 500, color: '#555' }}>{page.notify_email}</strong></span>
                      <span>·</span>
                      <span>Última revisión: {page.last_checked}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: '5px 10px',
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#444',
                        backgroundColor: '#f8f8f8',
                        border: '1px solid #e0e0e0',
                        borderRadius: 5,
                        textDecoration: 'none'
                      }}
                    >
                      Visitar
                    </a>
                    <button
                      onClick={() => handleDelete(page.id, page.name)}
                      title="Eliminar"
                      style={{
                        padding: '5px 10px',
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#991b1b',
                        backgroundColor: '#fff',
                        border: '1px solid #fecaca',
                        borderRadius: 5,
                        cursor: 'pointer'
                      }}
                    >
                      Borrar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Modal de añadir página */}
        {showModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 100
          }}>
            <div style={{
              backgroundColor: '#fff',
              borderRadius: 10,
              width: '100%',
              maxWidth: 420,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
              border: '1px solid #e5e5e5'
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 600, color: '#111' }}>
                Añadir página a vigilar
              </h3>

              <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5, color: '#333' }}>
                    Nombre descriptivo
                  </label>
                  <input
                    required
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Ej. Convocatoria Auxiliares"
                    style={{
                      width: '100%',
                      padding: '8px 11px',
                      fontSize: 14,
                      border: '1px solid #ccc',
                      borderRadius: 6,
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5, color: '#333' }}>
                    Dirección web (URL exacta)
                  </label>
                  <input
                    required
                    type="url"
                    value={form.url}
                    onChange={e => setForm({ ...form, url: e.target.value })}
                    placeholder="https://www.boe.es/..."
                    style={{
                      width: '100%',
                      padding: '8px 11px',
                      fontSize: 14,
                      border: '1px solid #ccc',
                      borderRadius: 6,
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5, color: '#333' }}>
                    Email donde recibir el aviso
                  </label>
                  <input
                    required
                    type="email"
                    value={form.notify_email}
                    onChange={e => setForm({ ...form, notify_email: e.target.value })}
                    placeholder="tu@email.com"
                    style={{
                      width: '100%',
                      padding: '8px 11px',
                      fontSize: 14,
                      border: '1px solid #ccc',
                      borderRadius: 6,
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{
                      padding: '8px 14px',
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#555',
                      backgroundColor: '#f3f4f6',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: '8px 16px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#fff',
                      backgroundColor: '#111',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer'
                    }}
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Pie discreto */}
        <footer style={{
          marginTop: 64,
          paddingTop: 20,
          borderTop: '1px solid #ebebeb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 12,
          color: '#888'
        }}>
          <div>
            Sesión: <code style={{ fontFamily: 'monospace', backgroundColor: '#f0f0f0', padding: '2px 5px', borderRadius: 4, color: '#444' }}>{deviceId}</code>
          </div>
          <button
            onClick={copyDeviceId}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 12,
              color: '#555',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            {copied ? 'Copiado al portapapeles' : 'Copiar ID'}
          </button>
        </footer>

      </div>
    </div>
  );
}