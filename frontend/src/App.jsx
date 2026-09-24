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
  const [filter, setFilter] = useState('all');
  const [notification, setNotification] = useState(null);

  const loadPages = async () => {
    if (!deviceId) return;
    try {
      const res = await fetch(`${API_URL}/api/pages?device_id=${encodeURIComponent(deviceId)}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setPages(data);
      }
    } catch (e) {
      console.error("Error al cargar las páginas:", e);
    }
  };

  useEffect(() => {
    loadPages();
    const interval = setInterval(loadPages, 30000);
    return () => clearInterval(interval);
  }, [deviceId]);

  const handleManualCheck = async () => {
    setChecking(true);
    setNotification({ text: "Analizando páginas en busca de texto nuevo...", type: "info" });
    try {
      const res = await fetch(`${API_URL}/api/check?device_id=${encodeURIComponent(deviceId)}`, { method: 'POST' });
      const data = await res.json();
      await loadPages();

      if (data.newAdditionsCount && data.newAdditionsCount > 0) {
        setNotification({ 
          text: `¡Atención! Se ha añadido información en ${data.newAdditionsCount} página(s).`, 
          type: "success" 
        });
      } else {
        setNotification({ 
          text: "Sin novedades: No hay contenido nuevo.", 
          type: "neutral" 
        });
      }
      setTimeout(() => setNotification(null), 5000);
    } catch (e) {
      setNotification({ text: "Error de conexión al comprobar.", type: "error" });
      setTimeout(() => setNotification(null), 4000);
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
      if (data.status === 'success' || res.ok) {
        setShowModal(false);
        setForm({ name: '', url: '', notify_email: form.notify_email });
        await loadPages();
        setNotification({ text: "Alerta creada correctamente.", type: "success" });
        setTimeout(() => setNotification(null), 4000);
      } else {
        alert("Error: " + (data.message || data.detail || "No se pudo guardar la alerta"));
      }
    } catch (e) {
      alert("Error de conexión al guardar la alerta.");
    }
  };

  const handleDismiss = async (id) => {
    try {
      await fetch(`${API_URL}/api/pages/${id}/dismiss`, { method: 'POST' });
      loadPages();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`¿Dejar de monitorizar "${name}"?`)) return;
    try {
      await fetch(`${API_URL}/api/pages/${id}`, { method: 'DELETE' });
      loadPages();
    } catch (e) {
      console.error(e);
    }
  };

  const alteredPages = pages.filter(p => p.has_changed);
  const displayedPages = filter === 'alerts' ? alteredPages : pages;

  return (
    <>
      <style>{`
        @keyframes neonGlow {
          0%, 100% {
            box-shadow: 0 0 15px rgba(30, 215, 96, 0.6), inset 0 0 10px rgba(30, 215, 96, 0.3);
            text-shadow: 0 0 8px #1ed760, 0 0 18px rgba(30, 215, 96, 0.8);
          }
          50% {
            box-shadow: 0 0 25px rgba(30, 215, 96, 0.9), inset 0 0 15px rgba(30, 215, 96, 0.5);
            text-shadow: 0 0 12px #1ed760, 0 0 25px rgba(30, 215, 96, 1);
          }
        }

        .neon-bell-box {
          animation: neonGlow 3s infinite ease-in-out;
        }

        .app-container {
          display: flex;
          min-height: 100vh;
          background-color: #000000;
          color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, "Circular Spotify Text", Roboto, Helvetica, Arial, sans-serif;
          flex-direction: row;
        }

        .sidebar {
          width: 250px;
          background-color: #121212;
          border-radius: 8px;
          margin: 8px 0 8px 8px;
          padding: 20px 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          flex-shrink: 0;
        }

        .main-content {
          flex: 1;
          background-color: #121212;
          border-radius: 8px;
          margin: 8px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .header-bar {
          position: sticky;
          top: 0;
          background-color: rgba(18, 18, 18, 0.92);
          backdrop-filter: blur(10px);
          padding: 16px 32px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          z-index: 10;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          gap: 12px;
        }

        .content-body {
          padding: 24px 32px 64px;
        }

        .grid-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 24px;
        }

        @media (max-width: 768px) {
          .app-container {
            flex-direction: column;
          }

          .sidebar {
            width: auto;
            margin: 8px 8px 0 8px;
            padding: 16px;
            border-radius: 8px;
          }

          .sidebar-info {
            display: none;
          }

          .sidebar-box {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 12px !important;
            padding: 12px !important;
          }

          .sidebar-box-desc {
            display: none;
          }

          .sidebar-box-title {
            margin-bottom: 0 !important;
          }

          .main-content {
            margin: 8px;
          }

          .header-bar {
            padding: 12px 16px;
            flex-direction: column;
            align-items: stretch;
          }

          .header-status {
            font-size: 12px !important;
            margin-bottom: 4px;
          }

          .header-actions {
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .content-body {
            padding: 16px 16px 48px;
          }

          .grid-cards {
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 14px;
          }
        }
      `}</style>

      <div className="app-container">
        
        {/* BARRA LATERAL CON EL NUEVO LOGO NEÓN */}
        <aside className="sidebar">
          <div>
            {/* LOGO CAMPANA + TEXTO GSUSALERT EN NEÓN VERDE */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 0 20px',
              gap: 10
            }}>
              {/* Esfera Neón Campana */}
              <div 
                className="neon-bell-box"
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: '50%',
                  backgroundColor: '#050505',
                  border: '2px solid #1ed760',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <span style={{ 
                  fontSize: 28, 
                  filter: 'drop-shadow(0 0 8px #1ed760)' 
                }}>
                  🔔
                </span>
              </div>

              {/* Nombre Neón */}
              <span style={{
                fontSize: 17,
                fontWeight: 900,
                letterSpacing: 1.8,
                color: '#ffffff',
                textTransform: 'uppercase',
                textShadow: '0 0 8px #1ed760, 0 0 20px rgba(30, 215, 96, 0.8)'
              }}>
                GsusAlert
              </span>
            </div>

            {/* Navegación */}
            <nav style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
              <button
                onClick={() => setFilter('all')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: 'none',
                  backgroundColor: filter === 'all' ? '#282828' : 'transparent',
                  color: filter === 'all' ? '#ffffff' : '#b3b3b3',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <span>🏠</span> Inicio
              </button>

              <button
                onClick={() => setFilter('alerts')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
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
                <span>🔔</span> Novedades
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

            {/* Bloque Crear Alerta */}
            <div className="sidebar-box" style={{
              marginTop: 20,
              padding: 16,
              backgroundColor: '#1f1f1f',
              borderRadius: 8
            }}>
              <div>
                <div className="sidebar-box-title" style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                  Vigila una web
                </div>
                <div className="sidebar-box-desc" style={{ fontSize: 12, color: '#b3b3b3', marginBottom: 16 }}>
                  Recibe avisos cuando se añada texto a una convocatoria.
                </div>
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
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                + Crear
              </button>
            </div>
          </div>

          {/* Info Dispositivo */}
          <div className="sidebar-info" style={{ fontSize: 11, color: '#727272', padding: '0 8px', marginTop: 16 }}>
            <div>Dispositivo:</div>
            <div style={{ fontFamily: 'monospace', color: '#a7a7a7', marginTop: 2, wordBreak: 'break-all' }}>{deviceId}</div>
          </div>
        </aside>

        {/* ÁREA DE CONTENIDO PRINCIPAL */}
        <main className="main-content">
          
          <div className="header-bar">
            <div className="header-status" style={{ fontSize: 13, color: '#b3b3b3', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: checking ? '#ffa42b' : '#1ed760',
                display: 'inline-block',
                flexShrink: 0
              }} />
              {checking ? 'Rastreando páginas...' : 'Monitorización activa'}
            </div>

            <div className="header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {notification && (
                <span style={{
                  fontSize: 11,
                  padding: '6px 12px',
                  borderRadius: 16,
                  backgroundColor: notification.type === 'success' ? 'rgba(30,215,96,0.15)' : 'rgba(255,255,255,0.1)',
                  color: notification.type === 'success' ? '#1ed760' : '#ffffff',
                  border: notification.type === 'success' ? '1px solid #1ed760' : '1px solid #444',
                  whiteSpace: 'nowrap'
                }}>
                  {notification.text}
                </span>
              )}

              <button
                onClick={handleManualCheck}
                disabled={checking}
                style={{
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 20,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: checking ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {checking ? 'Comprobando...' : 'Comprobar ahora'}
              </button>
            </div>
          </div>

          <div className="content-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>
                {filter === 'alerts' ? 'Modificaciones' : 'Seguimiento'}
              </h2>
              <span style={{ fontSize: 12, color: '#b3b3b3', fontWeight: 600 }}>
                {displayedPages.length} {displayedPages.length === 1 ? 'página' : 'páginas'}
              </span>
            </div>

            {displayedPages.length === 0 ? (
              <div style={{
                backgroundColor: '#181818',
                borderRadius: 8,
                padding: '40px 20px',
                textAlign: 'center',
                color: '#b3b3b3'
              }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                <h3 style={{ color: '#fff', fontSize: 16, margin: '0 0 8px' }}>
                  {filter === 'alerts' ? 'Sin novedades' : 'Lista vacía'}
                </h3>
                <p style={{ fontSize: 13, maxWidth: 360, margin: '0 auto' }}>
                  {filter === 'alerts'
                    ? 'Todas las páginas permanecen sin cambios.'
                    : 'Añade una URL para comenzar a monitorizar.'}
                </p>
              </div>
            ) : (
              <div className="grid-cards">
                {displayedPages.map(page => {
                  const screenshotUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(page.url)}?w=600`;

                  return (
                    <div
                      key={page.id}
                      style={{
                        backgroundColor: '#181818',
                        borderRadius: 8,
                        padding: 12,
                        position: 'relative',
                        border: page.has_changed ? '2px solid #e91429' : '1px solid rgba(255,255,255,0.05)',
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                    >
                      <div style={{
                        position: 'relative',
                        width: '100%',
                        paddingTop: '100%',
                        borderRadius: 6,
                        overflow: 'hidden',
                        backgroundColor: '#282828',
                        marginBottom: 12,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
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
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />

                        {page.has_changed && (
                          <div style={{
                            position: 'absolute',
                            top: 6,
                            left: 6,
                            backgroundColor: '#e91429',
                            color: '#fff',
                            fontSize: 9,
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            padding: '2px 6px',
                            borderRadius: 4
                          }}>
                            ¡Cambio!
                          </div>
                        )}

                        <a
                          href={page.url}
                          target="_blank"
                          rel="noreferrer"
                          title="Ir a la web"
                          style={{
                            position: 'absolute',
                            bottom: 6,
                            right: 6,
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            backgroundColor: page.has_changed ? '#e91429' : '#1ed760',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#000',
                            textDecoration: 'none',
                            fontSize: 16,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                          }}
                        >
                          ↗
                        </a>
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{
                          fontSize: 14,
                          fontWeight: 700,
                          margin: '0 0 4px',
                          color: '#ffffff',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {page.name}
                        </h3>
                        
                        <div style={{
                          fontSize: 11,
                          color: '#b3b3b3',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginBottom: 4
                        }}>
                          {page.url.replace(/^https?:\/\//, '')}
                        </div>
                      </div>

                      <div style={{
                        display: 'flex',
                        gap: 6,
                        marginTop: 10,
                        paddingTop: 8,
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
                              fontSize: 11,
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
                            padding: '6px 8px',
                            backgroundColor: 'transparent',
                            color: '#727272',
                            border: 'none',
                            borderRadius: 4,
                            fontSize: 11,
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

        {/* MODAL CREAR ALERTA */}
        {showModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
              maxWidth: 400,
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
            }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: '#fff' }}>
                Nueva alerta web
              </h3>
              <p style={{ margin: '0 0 18px', fontSize: 12, color: '#b3b3b3' }}>
                Generará una carátula automática y enviará avisos al correo ingresado.
              </p>

              <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#fff' }}>
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
                      padding: '10px 12px',
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
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#fff' }}>
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
                      padding: '10px 12px',
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
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#fff' }}>
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
                      padding: '10px 12px',
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

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{
                      padding: '10px 16px',
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
                      padding: '10px 20px',
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
    </>
  );
}