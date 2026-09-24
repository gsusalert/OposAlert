import React, { useState, useEffect } from 'react';
import { BellRing, Plus, Trash2, RefreshCw, ExternalLink, CheckCircle, AlertTriangle } from 'lucide-react';

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
      const data = await res.json();
      setAlerts(data);
    } catch (err) {
      console.error("Error al cargar alertas:", err);
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
        setMessage({ type: 'success', text: 'Alerta creada correctamente' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al crear la alerta' });
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
      setMessage({ type: 'success', text: 'Comprobación iniciada en segundo plano' });
      setTimeout(fetchAlerts, 3000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al iniciar comprobación' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        
        {/* Encabezado con Nombre e Icono */}
        <header className="flex items-center justify-between pb-6 mb-8 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/30">
              <BellRing className="w-7 h-7 text-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                GsusAlert
              </h1>
              <p className="text-xs text-slate-400">Monitor inteligente de publicaciones y convocatorias</p>
            </div>
          </div>

          <button
            onClick={handleTriggerCheck}
            disabled={checking}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            <span>{checking ? 'Comprobando...' : 'Comprobar Ahora'}</span>
          </button>
        </header>

        {/* Mensajes de notificación */}
        {message && (
          <div className={`p-4 mb-6 rounded-lg text-sm flex items-center gap-2 ${
            message.type === 'success' ? 'bg-emerald-950/50 border border-emerald-800 text-emerald-300' : 'bg-rose-950/50 border border-rose-800 text-rose-300'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Formulario de Nueva Alerta */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-8 backdrop-blur-sm">
          <h2 className="text-lg font-semibold mb-4 text-slate-200">Añadir Nueva Monitorización</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Título (ej: Oposición Auxiliar)"
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
              <Plus className="w-4 h-4" />
              <span>Guardar Alerta</span>
            </button>
          </form>
        </section>

        {/* Lista de Alertas */}
        <section>
          <h2 className="text-lg font-semibold mb-4 text-slate-200">Alertas Activas</h2>
          {loading ? (
            <p className="text-slate-400 text-sm">Cargando alertas...</p>
          ) : alerts.length === 0 ? (
            <p className="text-slate-500 text-sm italic">No hay alertas configuradas todavía.</p>
          ) : (
            <div className="grid gap-4">
              {alerts.map((alert) => (
                <div key={alert.id} className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-5 flex items-center justify-between gap-4 hover:border-slate-600 transition-colors">
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
                      <span>{alert.url}</span>
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </div>

                  <button
                    onClick={() => handleDelete(alert.id)}
                    className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                    title="Eliminar alerta"
                  >
                    <Trash2 className="w-5 h-5" />
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