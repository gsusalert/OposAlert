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
  const [filter, setFilter] = useState('all'); // 'all' o 'alerts'

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
      await res.json();
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
    if (!window.confirm(`¿Dejar de monitorizar "${name}"?`)) return;
    await fetch(`${API_URL}/api/pages/${id}`, { method: 'DELETE' });
    loadPages();
  };

  const alteredPages = pages.filter(p => p.has_changed);
  const displayedPages = filter === 'alerts' ? alteredPages : pages;

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      backgroundColor: '#000000',
      color: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Circular Spotify Text", Roboto, Helvetica, Arial, sans-serif'
    }}>
      
      {/* BARRA LATERAL ESTILO SPOTIFY */}
      <aside style={{
        width: 250,
        backgroundColor: '#121212',
        borderRadius: 8,
        margin: '8px 0 8px 8px',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div>
          {/* Logo / Nombre */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px', marginBottom: 28 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: '#1ed760',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              color: '#000'
            }}>
              ⚡
            </div>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>OposAlert</span>
          </div>

          {/* Menú principal */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => setFilter('all')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '10px 12px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: filter === 'all' ? '#282828' : 'transparent',
                color: filter === 'all' ? '#ffffff' : '#b3b3b3',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span>🏠</span> Inicio
            </button>
            <button
              onClick={() => setFilter('alerts')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: filter === 'alerts' ? '#282828' : 'transparent',
                color: filter === 'alerts' ? '#ffffff' : '#b3b3b3',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span>🔔</span> Novedades
              </div>
              {alteredPages.length > 0 && (
                <span style={{
                  backgroundColor: '#e91429',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 800,
                  borderRadius: 12,
                  padding: '2px 8px'
                }}>
                  {alteredPages.length}
                </span>
              )}
            </button>
          </nav>

          {/* Sección biblioteca / añadir */}
          <div style={{
            marginTop: 24,
            padding: 16,
            backgroundColor: '#1f1f1f',
            borderRadius: 8
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Vigila una nueva web</div>
            <div style={{ fontSize: 12, color: '#b3b3b3', marginBottom: 16 }}>
              Introduce el enlace de una convocatoria o boletín para recibir avisos.
            </div>
            <button
              onClick={() => setShowModal(true)}
              style={{
                backgroundColor: '#ffffff',
                color: '#000000',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 20,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              Crear alerta
            </button>
          </div>
        </div>

        {/* Info sesión al pie del sidebar */}
        <div style={{ fontSize: 11, color: '#727272', padding: '0 8px' }}>
          <div>Dispositivo:</div>
          <div style={{ fontFamily: 'monospace', color: '#a7a7a7', marginTop: 2 }}>{deviceId}</div>
        </div>
      </aside>

      {/* ÁREA DE CONTENIDO PRINCIPAL */}
      <main style={{
        flex: 1,
        backgroundColor: '#121212',
        borderRadius: 8,
        margin: '8px 8px 8px 8px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        
        {/* Cabecera superior translúcida */}
        <div style={{
          position: 'sticky',
          top: 0,
          backgroundColor: 'rgba(18, 18, 18, 0.85)',
          backdropFilter: 'blur(10px)',
          padding: '16px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10,
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
          <div style={{ fontSize: 14, color: '#b3b3b3', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: checking ? '#ffa42b' : '#1ed760',
              display: 'inline-block'
            }} />
            {checking ? 'Rastreando cambios en segundo plano...' : 'Revisión periódica activa cada 15 min'}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={handleManualCheck}
              disabled={checking}
              style={{
                backgroundColor: '#ffffff',
                color: '#000000',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 20,
                fontWeight: 700,
                fontSize: 13,
                cursor: checking ? 'not-allowed' : 'pointer'
              }}
            >
              {checking ? 'Comprobando...' : 'Comprobar ahora'}
            </button>
          </div>
        </div>

        {/* CUERPO: CUADRÍCULA DE CUADRADITOS / CARÁTULAS */}
        <div style={{ padding: '24px 32px 64px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>
              {filter === 'alerts' ? 'Modificaciones detectadas' : 'Páginas en seguimiento'}
            </h2>
            <span style={{ fontSize: 13, color: '#b3b3b3', fontWeight: 600 }}>
              {displayedPages.length} {displayedPages.length === 1 ? 'página' : 'páginas'}
            </span>
          </div>

          {displayedPages.length === 0 ? (
            <div style={{
              backgroundColor: '#181818',
              borderRadius: 8,
              padding: '64px 32px',
              textAlign: 'center',
              color: '#b3b3b3'
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
              <h3 style={{ color: '#fff', fontSize: 18, margin: '0 0 8px' }}>
                {filter === 'alerts' ? 'No hay novedades recientes' : 'Tu lista de alertas está vacía'}
              </h3>
              <p style={{ fontSize: 14, maxWidth: 400, margin: '0 auto 20px' }}>
                {filter === 'alerts'
                  ? 'Todas las páginas vigiladas permanecen sin modificaciones desde la última lectura.'
                  : 'Pulsa en "+ Crear alerta" en el panel lateral para empezar a monitorizar páginas.'}
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 24
            }}>
              {displayedPages.map(page => {
                // Captura en tiempo real del frontal de la web
                const screenshotUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(page.url)}?w=600`;

                return (
                  <div
                    key={page.id}
                    style={{
                      backgroundColor: '#181818',
                      borderRadius: 8,
                      padding: 16,
                      position: 'relative',
                      transition: 'background-color 0.2s ease, transform 0.2s ease',
                      border: page.has_changed ? '2px solid #e91429' : '1px solid rgba(255,255,255,0.05)',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    {/* FOTO CUADRADA DEL INICIO DE LA WEB (ESTILO CARÁTULA) */}
                    <div style={{
                      position: 'relative',
                      width: '100%',
                      paddingTop: '100%', // Proporción 1:1 cuadrada
                      borderRadius: 6,
                      overflow: 'hidden',
                      backgroundColor: '#282828',
                      marginBottom: 16,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                    }}>
                      <img
                        src={screenshotUrl}
                        alt={page.name}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          objectPosition: 'top center'
                        }}
                        onError={(e) => {
                          // Si falla la captura externa, muestra una carátula con fondo e inicial
                          e.target.style.display = 'none';
                        }}
                      />

                      {/* Etiqueta si hay cambio */}
                      {page.has_changed && (
                        <div style={{
                          position: 'absolute',
                          top: 8,
                          left: 8,
                          backgroundColor: '#e91429',
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          padding: '3px 8px',
                          borderRadius: 4,
                          letterSpacing: 0.5
                        }}>
                          ¡Cambio!
                        </div>
                      )}

                      {/* Botón flotante para visitar la web directo */}
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noreferrer"
                        title="Ir a la web"
                        style={{
                          position: 'absolute',
                          bottom: 8,
                          right: 8,
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          backgroundColor: page.has_changed ? '#e91429' : '#1ed760',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#000',
                          textDecoration: 'none',
                          fontSize: 18,
                          boxShadow: '0 8px 16px rgba(0,0,0,0.4)'
                        }}
                      >
                        ↗
                      </a>
                    </div>

                    {/* TÍTULO Y DETALLES */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{
                        fontSize: 16,
                        fontWeight: 700,
                        margin: '0 0 6px',
                        color: '#ffffff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {page.name}
                      </h3>
                      
                      <div style={{
                        fontSize: 12,
                        color: '#b3b3b3',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginBottom: 4
                      }}>
                        {page.url.replace(/^https?:\/\//, '')}
                      </div>

                      <div style={{ fontSize: 11, color: '#727272' }}>
                        {page.last_checked}
                      </div>
                    </div>

                    {/* ACCIONES AL PIE DEL CUADRADO */}
                    <div style={{
                      display: 'flex',
                      gap: 8,
                      marginTop: 14,
                      paddingTop: 12,
                      borderTop: '1px solid rgba(255,255,255,0.06)'
                    }}>
                      {page.has_changed && (
                        <button
                          onClick={() => handleDismiss(page.id)}
                          style={{
                            flex: 1,
                            padding: '6px 0',
                            backgroundColor: '#282828',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Visto
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(page.id, page.name)}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: 'transparent',
                          color: '#727272',
                          border: 'none',
                          borderRadius: 4,
                          fontSize: 12,
                          cursor: 'pointer'
                        }}
                      >
                        Borrar
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* MODAL PARA AÑADIR NUEVA PÁGINA (TEMA OSCURO SPOTIFY) */}
      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          zIndex: 100
        }}>
          <div style={{
            backgroundColor: '#282828',
            borderRadius: 12,
            width: '100%',
            maxWidth: 440,
            padding: 32,
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#fff' }}>
              Nueva alerta web
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: '#b3b3b3' }}>
              Generará una carátula automática con la foto de la página y te avisará por correo ante cualquier modificación.
            </p>

            <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#fff' }}>
                  Nombre de la página
                </label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej. BOE Oposiciones"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    fontSize: 14,
                    backgroundColor: '#3e3e3e',
                    border: '1px solid transparent',
                    borderRadius: 6,
                    color: '#fff',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#fff' }}>
                  Dirección URL
                </label>
                <input
                  required
                  type="url"
                  value={form.url}
                  onChange={e => setForm({ ...form, url: e.target.value })}
                  placeholder="https://www.boe.es/..."
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    fontSize: 14,
                    backgroundColor: '#3e3e3e',
                    border: '1px solid transparent',
                    borderRadius: 6,
                    color: '#fff',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#fff' }}>
                  Correo electrónico para avisos
                </label>
                <input
                  required
                  type="email"
                  value={form.notify_email}
                  onChange={e => setForm({ ...form, notify_email: e.target.value })}
                  placeholder="tu@email.com"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    fontSize: 14,
                    backgroundColor: '#3e3e3e',
                    border: '1px solid transparent',
                    borderRadius: 6,
                    color: '#fff',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '10px 18px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#b3b3b3',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 24px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#000000',
                    backgroundColor: '#1ed760',
                    border: 'none',
                    borderRadius: 20,
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

    </div>
  );
}