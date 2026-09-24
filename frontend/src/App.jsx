import React, { useState, useEffect } from 'react';

// Iconos SVG minimalistas estilo Spotify
const BellIcon = () => (
  <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4 text-zinc-400 hover:text-red-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const RefreshIcon = ({ spin }) => (
  <svg className={`w-5 h-5 ${spin ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const ExternalIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

const API_BASE_URL = 'https://gsusalert.onrender.com';

export default function App() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ title: '', url: '', email: '' });
  const [message, setMessage] = useState(null);

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/alerts`);
      if (!res.ok) throw new Error("Error de conexión");
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setFormData({ title: '', url: '', email: '' });
        setShowModal(false);
        fetchAlerts();
        setMessage('Alerta creada con éxito');
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      setMessage('Error al crear alerta');
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`${API_BASE_URL}/api/alerts/${id}`, { method: 'DELETE' });
      fetchAlerts();
    } catch (err) {
      console.error(err);
    }
  };

  const handleTriggerCheck = async () => {
    setChecking(true);
    try {
      await fetch(`${API_BASE_URL}/api/check`, { method: 'POST' });
      setMessage('Comprobando páginas en segundo plano...');
      setTimeout(() => {
        fetchAlerts();
        setChecking(false);
        setMessage(null);
      }, 4000);
    } catch (err) {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-black text-white font-sans overflow-hidden">

      {/* BARRA LATERAL (SIDEBAR ESTILO SPOTIFY) */}
      <aside className="w-full md:w-64 bg-zinc-950 p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-zinc-900 flex-shrink-0">
        <div>
          {/* LOGO */}
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-emerald-500/10 rounded-full">
              <BellIcon />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">GsusAlert</span>
          </div>

          {/* MENÚ DE NAVEGACIÓN */}
          <nav className="space-y-4 text-sm font-semibold text-zinc-400">
            <div className="text-white flex items-center gap-3 cursor-pointer p-2 rounded-lg bg-zinc-900">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Todas tus Alertas
            </div>
          </nav>
        </div>

        {/* BOTÓN DE AÑADIR */}
        <button
          onClick={() => setShowModal(true)}
          className="mt-6 flex items-center justify-center gap-2 w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 rounded-full transition-all duration-200 transform hover:scale-105 shadow-lg shadow-emerald-500/20"
        >
          <PlusIcon />
          <span>Nueva Alerta</span>
        </button>
      </aside>

      {/* ÁREA PRINCIPAL (CONTENIDO) */}
      <main className="flex-1 bg-zinc-900/50 p-6 md:p-8 overflow-y-auto pb-28">
        
        {/* ENCABEZADO */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Páginas Monitorizadas</h1>
            <p className="text-xs md:text-sm text-zinc-400 mt-1">Suscripciones activas y vista previa de contenido</p>
          </div>

          {message && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-4 py-2 rounded-full animate-fade-in">
              {message}
            </div>
          )}
        </div>

        {/* VISTA EN REJILLA DE TARJETAS (ESTILO PLAYLISTS) */}
        {loading ? (
          <div className="text-zinc-500 text-sm italic py-12 text-center">Cargando tus monitorizaciones...</div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-20 bg-zinc-950/50 rounded-2xl border border-zinc-800/60 p-8">
            <p className="text-zinc-400 text-base mb-4">No tienes ninguna página añadida todavía.</p>
            <button
              onClick={() => setShowModal(true)}
              className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full text-sm font-semibold transition-colors"
            >
              Crear mi primera alerta
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="group relative bg-zinc-950/80 hover:bg-zinc-800/60 border border-zinc-800/80 hover:border-zinc-700 p-5 rounded-2xl transition-all duration-300 flex flex-col justify-between shadow-lg"
              >
                {/* CABECERA TARJETA */}
                <div>
                  {/* VISTA PREVIA DEL CONTENIDO DE LA PÁGINA */}
                  <div className="w-full h-28 bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-3 mb-4 overflow-hidden relative">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block mb-1">
                      Vista previa del sitio
                    </span>
                    <p className="text-xs text-zinc-400 line-clamp-4 leading-relaxed font-sans">
                      {alert.last_text ? alert.last_text : "Sin capturas registradas aún. Se analizará en el próximo escaneo."}
                    </p>
                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-zinc-950 to-transparent"></div>
                  </div>

                  {/* TÍTULO Y ESTADO */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-base text-white group-hover:text-emerald-400 transition-colors truncate">
                      {alert.title}
                    </h3>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full flex-shrink-0 ${
                      alert.status === 'changed' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                      alert.status === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
                      'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    }`}>
                      {alert.status === 'changed' ? '¡Novedad!' : alert.status === 'error' ? 'Error' : 'Activo'}
                    </span>
                  </div>

                  {/* ENLACE DE LA URL */}
                  <a
                    href={alert.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-zinc-400 hover:text-emerald-400 flex items-center gap-1.5 truncate mb-4 transition-colors"
                  >
                    <span className="truncate">{alert.url}</span>
                    <ExternalIcon />
                  </a>
                </div>

                {/* BOTÓN ELIMINAR */}
                <div className="flex items-center justify-between pt-3 border-t border-zinc-900">
                  <span className="text-[11px] text-zinc-500">
                    {alert.email}
                  </span>
                  <button
                    onClick={() => handleDelete(alert.id)}
                    title="Eliminar monitorización"
                    className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* BARRA INFERIOR DE ACCIÓN Y CONTROL (REPRODUCTOR SPOTIFY) */}
      <footer className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/80 px-6 py-4 flex items-center justify-between z-40">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
          <div>
            <p className="text-xs font-bold text-white">Sistema Monitor de GsusAlert</p>
            <p className="text-[11px] text-zinc-400">{alerts.length} páginas agregadas</p>
          </div>
        </div>

        <button
          onClick={handleTriggerCheck}
          disabled={checking}
          className="flex items-center gap-2 bg-white hover:bg-zinc-200 text-black font-bold text-xs md:text-sm px-5 py-2.5 rounded-full transition-all shadow-md disabled:opacity-50"
        >
          <RefreshIcon spin={checking} />
          <span>{checking ? 'Comprobando...' : 'Comprobar Ahora'}</span>
        </button>
      </footer>

      {/* MODAL PARA CREAR NUEVA ALERTA */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-950 border border-zinc-800 p-6 md:p-8 rounded-3xl max-w-md w-full shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-white">Añadir nueva página</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Nombre o Título</label>
                <input
                  type="text"
                  placeholder="Ej: Oposición Junta de Andalucía"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">URL de la web</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  required
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Correo electrónico de notificación</label>
                <input
                  type="email"
                  placeholder="tuemail@ejemplo.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-full text-xs font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-full text-xs font-bold transition-colors shadow-lg shadow-emerald-500/20"
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