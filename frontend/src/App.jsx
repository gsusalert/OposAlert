import React, { useState, useEffect } from 'react';

// Si no tienes lucide-react instalado, puedes usar SVG directamente para evitar errores de renderizado.
const BellIcon = () => (
  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const RefreshIcon = ({ spin }) => (
  <svg className={`w-4 h-4 ${spin ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const ExternalIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

const API_BASE_URL = 'https://gsusalert.onrender.com';

export default function App() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [formData, setFormData] = useState({ title: '', url: '', email: '' });
  const [message, setMessage] = useState(null);

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/alerts`);
      if (!res.ok) throw new Error("Error en la conexión con el servidor");
      const data = await res.json();
      
      // Control de seguridad: Garantiza que la variable sea siempre una lista
      if (Array.isArray(data)) {
        setAlerts(data);
      } else {
        setAlerts([]);
      }
    } catch (err) {
      console.error("Error al cargar alertas:", err);
      setAlerts([]);
      setMessage({ type: 'error', text: 'El servidor está arrancando. Reintenta en unos segundos.' });
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
        fetchAlerts();
        setMessage({ type: 'success', text: 'Alerta agregada correctamente' });
      } else {
        setMessage({ type: 'error', text: 'No se pudo guardar la alerta' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al conectar con la API' });
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`${API_BASE_URL}/api/alerts/${id}`, { method: 'DELETE' });
      fetchAlerts();
    } catch (err) {
      console.error("Error al eliminar:", err);
    }
  };

  const handleTriggerCheck = async () => {
    setChecking(true);
    try {
      await fetch(`${API_BASE_URL}/api/check`, { method: 'POST' });
      setMessage({ type: 'success', text: 'Comprobación de novedades iniciada' });
      setTimeout(fetchAlerts, 4000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al comprobar las novedades' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        
        {/* Encabezado GsusAlert */}
        <header className="flex items-center justify-between pb-6 mb-8 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/30">
              <BellIcon />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                GsusAlert
              </h1>
              <p className="text-xs text-slate-400">Detector automático de nuevas publicaciones</p>
            </div>
          </div>

          <button
            onClick={handleTriggerCheck}
            disabled={checking}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all disabled:opacity-50"
          >
            <RefreshIcon spin={checking} />
            <span>{checking ? 'Comprobando...' : 'Comprobar Ahora'}</span>
          </button>
        </header>

        {/* Mensajes de aviso */}
        {message && (
          <div className={`p-4 mb-6 rounded-lg text-sm flex items-center justify-between ${
            message.type === 'success' ? 'bg-emerald-950/50 border border-emerald-800 text-emerald-300' : 'bg-rose-950/50 border border-rose-800 text-rose-300'
          }`}>
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-xs underline ml-4">Cerrar</button>
          </div>
        )}

        {/* Formulario */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4 text-slate-200">Añadir Nueva Monitorización</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Título (ej: Boletín Oficial)"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 text-slate-100"
            />
            <input
              type="url"
              placeholder="URL de la página web"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              required
              className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 text-slate-100"
            />
            <input
              type="email"
              placeholder="Tu correo electrónico"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 text-slate-100"
            />
            <button
              type="submit"
              className="md:col-span-3 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg transition-colors shadow-lg shadow-blue-600/20"
            >
              <span>Guardar Alerta</span>
            </button>
          </form>
        </section>

        {/* Lista de Alertas */}
        <section>
          <h2 className="text-lg font-semibold mb-4 text-slate-200">Alertas Activas</h2>
          {loading ? (
            <div className="p-4 bg-slate-800/20 rounded-lg text-slate-400 text-sm flex items-center gap-3">
              <RefreshIcon spin={true} />
              <span>Conectando con el servidor en Render...</span>
            </div>
          ) : !Array.isArray(alerts) || alerts.length === 0 ? (
            <p className="text-slate-500 text-sm italic">No hay alertas configuradas todavía.</p>
          ) : (
            <div className="grid gap-4">
              {alerts.map((alert) => (
                <div key={alert.id} className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-5 flex items-center justify-between gap-4">
                  <div className="space-y-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-200 truncate">{alert.title}</h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full border ${
                        alert.status === 'changed' ? 'bg-amber-950/60 border-amber-800 text-amber-300' :
                        alert.status === 'error' ? 'bg-rose-950/60 border-rose-800 text-rose-300' :
                        'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                      }`}>
                        {alert.status === 'changed' ? '¡Novedad!' : alert.status === 'error' ? 'Error' : 'Activo'}
                      </span>
                    </div>
                    <a href={alert.url} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1 truncate">
                      <span className="truncate">{alert.url}</span>
                      <ExternalIcon />
                    </a>
                  </div>

                  <button
                    onClick={() => handleDelete(alert.id)}
                    className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors flex-shrink-0"
                    title="Eliminar alerta"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}