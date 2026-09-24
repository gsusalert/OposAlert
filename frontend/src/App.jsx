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
  try { id = localStorage.getItem("opos_device_id"); } catch (e) {}
  if (!id) id = getCookie("opos_device_id");
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }
  try { localStorage.setItem("opos_device_id", id); } catch (e) {}
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
  
  // Estado para mensajes/notificaciones tras comprobar manualmente
  const [toast, setToast] = useState(null); // { message: string, type: 'info' | 'success' }

  // Detectar si es pantalla móvil (<768px)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

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
    setToast(null);
    try {
      const res = await fetch(`${API_URL}/api/check?device_id=${encodeURIComponent(deviceId)}`, { method: 'POST' });
      const data = await res.json();
      await loadPages();

      const changes = data.changes_detected || [];
      if (changes.length > 0) {
        showToast(`🎉 ¡Cambios detectados en ${changes.length} página(s)!`, 'success');
      } else {
        showToast('ℹ️ No se detectaron cambios en tus páginas vigiladas.', 'info');
      }
    } catch (e) {
      showToast("❌ Error de conexión al revisar las páginas", 'info');
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
        showToast('✅ Alerta creada correctamente', 'success');
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
      flexDirection: isMobile ? 'column' : 'row',
      minHeight: '100vh',
      backgroundColor: '#000000',
      color: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Circular Spotify Text", Roboto, Helvetica, Arial, sans-serif'
    }}>

      {/* SIDEBAR (Escritorio) / NAV INFERIOR (Móvil) */}
      {!isMobile ? (
        <aside style={{
          width: 240,
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
              }}>⚡</div>
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>OposAlert</span>
            </div>

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
                  cursor: 'pointer'
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

            <div style={{ marginTop: 24, padding: 16, backgroundColor: '#1f1f1f', borderRadius: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Vigila una nueva web</div>
              <div style={{ fontSize: 12, color: '#b3b3b3', marginBottom: 16 }}>
                Recibe avisos de convocatorias y listas.
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
                  width: '100%'
                }}
              >
                + Crear alerta
              </button>
            </div>
          </div>

          <div style={{ fontSize: 11, color: '#727272', padding: '0 8px' }}>
            <div>ID Dispositivo:</div>
            <div style={{ fontFamily: 'monospace', color: '#a7a7a7', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{deviceId}</div>
          </div>
        </aside>
      ) : null}

      {/* ÁREA DE CONTENIDO PRINCIPAL */}
      <main style={{
        flex: 1,
        backgroundColor: '#121212',
        borderRadius: isMobile ? 0 : 8,
        margin: isMobile ? 0 : '8px',
        marginBottom: isMobile ? 70 : 8, // espacio para nav inferior móvil
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>

        {/* Cabecera superior translúcida */}
        <div style={{
          position: 'sticky',
          top: 0,
          backgroundColor: 'rgba(18, 18, 18, 0.95)',
          backdropFilter: 'blur(10px)',
          padding: isMobile ? '12px 16px' : '16px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10,
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
          {isMobile ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#1ed760' }}>⚡ OposAlert</span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#b3b3b3', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: checking ? '#ffa42b' : '#1ed760',
                display: 'inline-block'
              }} />
              {checking ? 'Rastreando cambios...' : 'Revisión automática activa cada 15 min'}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isMobile && (
              <button
                onClick={() => setShowModal(true)}
                style={{
                  backgroundColor: '#1ed760',
                  color: '#000000',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: 20,
                  fontWeight: 700,
                  fontSize: 12
                }}
              >
                + Crear
              </button>
            )}
            <button
              onClick={handleManualCheck}
              disabled={checking}
              style={{
                backgroundColor: '#ffffff',
                color: '#000000',
                border: 'none',
                padding: isMobile ? '8px 14px' : '10px 20px',
                borderRadius: 20,
                fontWeight: 700,
                fontSize: isMobile ? 12 : 13,
                cursor: checking ? 'not-allowed' : 'pointer'
              }}
            >
              {checking ? 'Revisando...' : 'Comprobar ahora'}
            </button>
          </div>
        </div>

        {/* NOTIFICACIÓN TOAST PARA RESULTADO DE BÚSQUEDA / AVISO */}
        {toast && (
          <div style={{
            margin: isMobile ? '12px 16px 0' : '16px 32px 0',
            padding: '12px 16px',
            borderRadius: 8,
            backgroundColor: toast.type === 'success' ? '#1ed760' : '#282828',
            color: toast.type === 'success' ? '#000000' : '#ffffff',
            fontWeight: 600,
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            border: toast.type === 'info' ? '1px solid #3e3e3e' : 'none'
          }}>
            <span>{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* CUERPO PRINCIPAL */}
        <div style={{ padding: isMobile ? '16px' : '24px 32px 64px' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
            <h2 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: 0 }}>
              {filter === 'alerts' ? 'Novedades detectadas' : 'Páginas en seguimiento'}
            </h2>
            <span style={{ fontSize: 13, color: '#b3b3b3', fontWeight: 600 }}>
              {displayedPages.length} {displayedPages.length === 1 ? 'página' : 'páginas'}
            </span>
          </div>

          {displayedPages.length === 0 ? (
            <div style={{
              backgroundColor: '#181818',
              borderRadius: 8,
              padding: isMobile ? '32px 16px' : '64px 32px',
              textAlign: 'center',
              color: '#b3b3b3'
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <h3 style={{ color: '#fff', fontSize: 16, margin: '0 0 8px' }}>
                {filter === 'alerts' ? 'No hay novedades recientes' : 'Tu lista está vacía'}
              </h3>
              <p style={{ fontSize: 13, maxWidth: 360, margin: '0 auto' }}>
                {filter === 'alerts'
                  ? 'Ninguna de tus páginas ha cambiado desde el último escaneo.'
                  : 'Pulsa en "+ Crear alerta" para empezar a monitorizar una web.'}
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(auto-fill, minmax(140px, 1fr))' : 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: isMobile ? 12 : 24
            }}>
              {displayedPages.map(page => {
                const screenshotUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(page.url)}?w=600`;

                return (
                  <div
                    key={page.id}
                    style={{
                      backgroundColor: '#181818',
                      borderRadius: 8,
                      padding: isMobile ? 10 : 16,
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
                      marginBottom: 12
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
                          padding: '2px 6px',
                          borderRadius: 4
                        }}>
                          ¡CAMBIO!
                        </div>
                      )}

                      <a
                        href={page.url}
                        target="_blank"
                        rel="noreferrer"
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
                          fontWeight: 'bold'
                        }}
                      >
                        ↗
                      </a>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{
                        fontSize: isMobile ? 14 : 16,
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
                      <div style={{ fontSize: 10, color: '#727272' }}>
                        {page.last_checked}
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
                            fontWeight: 600
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
                          fontSize: 11
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

      {/* BARRA DE NAVEGACIÓN INFERIOR (Solo vista móvil) */}
      {isMobile && (
        <nav style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 60,
          backgroundColor: '#121212',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          zIndex: 90
        }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              background: 'none',
              border: 'none',
              color: filter === 'all' ? '#1ed760' : '#b3b3b3',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              fontSize: 11,
              fontWeight: 600
            }}
          >
            <span style={{ fontSize: 18 }}>🏠</span>
            Inicio
          </button>
          <button
            onClick={() => setFilter('alerts')}
            style={{
              background: 'none',
              border: 'none',
              color: filter === 'alerts' ? '#1ed760' : '#b3b3b3',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              fontSize: 11,
              fontWeight: 600,
              position: 'relative'
            }}
          >
            <span style={{ fontSize: 18 }}>🔔</span>
            Novedades
            {alteredPages.length > 0 && (
              <span style={{
                position: 'absolute',
                top: -2,
                right: -4,
                backgroundColor: '#e91429',
                color: '#fff',
                fontSize: 9,
                borderRadius: '50%',
                width: 16,
                height: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {alteredPages.length}
              </span>
            )}
          </button>
        </nav>
      )}

      {/* MODAL PARA NUEVA ALERTA (Optimizado para móvil) */}
      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: isMobile ? 'flex-end' : 'center',
          justifyContent: 'center',
          padding: isMobile ? 0 : 16,
          zIndex: 100
        }}>
          <div style={{
            backgroundColor: '#282828',
            borderRadius: isMobile ? '16px 16px 0 0' : 12,
            width: '100%',
            maxWidth: 440,
            padding: 24,
            boxShadow: '0 -10px 30px rgba(0,0,0,0.5)'
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#fff' }}>
              Nueva alerta web
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 12, color: '#b3b3b3' }}>
              Añade el enlace de la oposición o boletín oficial que deseas rastrear.
            </p>

            <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#fff' }}>
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
                    padding: '12px',
                    fontSize: 14,
                    backgroundColor: '#3e3e3e',
                    border: '1px solid transparent',
                    borderRadius: 6,
                    color: '#fff',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#fff' }}>
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
                    padding: '12px',
                    fontSize: 14,
                    backgroundColor: '#3e3e3e',
                    border: '1px solid transparent',
                    borderRadius: 6,
                    color: '#fff',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#fff' }}>
                  Correo electrónico para avisos
                </label>
                <input
                  required
                  type="email"
                  value={form.notify_email}
                  onChange={e => setForm({ ...form, notify_email: e.target.value })}
                  placeholder="tuemail@ejemplo.com"
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: 14,
                    backgroundColor: '#3e3e3e',
                    border: '1px solid transparent',
                    borderRadius: 6,
                    color: '#fff',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#b3b3b3',
                    border: 'none',
                    padding: '10px 16px',
                    borderRadius: 20,
                    fontWeight: 700,
                    fontSize: 13
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    backgroundColor: '#1ed760',
                    color: '#000000',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: 20,
                    fontWeight: 700,
                    fontSize: 13
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