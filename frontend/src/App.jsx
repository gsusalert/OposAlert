import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle2, RefreshCw, X, Globe, Mail, ChevronRight, AlertCircle } from 'lucide-react';

const API_BASE_URL = 'https://gsusalert.onrender.com';

function App() {
  const [pages, setPages] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [notifyEmail, setNotifyEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  // Cargar páginas y cambios desde el backend
  const fetchPages = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/pages`);
      if (res.ok) {
        const data = await res.json();
        setPages(data);
      }
    } catch (e) {
      console.error("Backend no disponible aún:", e);
    }
  };

  useEffect(() => {
    fetchPages();

    // Auto-actualización en pantalla cada 15 minutos (900.000 ms)
    const interval = setInterval(() => {
      fetchPages();
    }, 900000);

    return () => clearInterval(interval);
  }, []);

  // Añadir una nueva página
  const handleAddPage = async (e) => {
    e.preventDefault();
    if (!name || !url || !notifyEmail) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, notify_email: notifyEmail }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setName('');
        setUrl('');
        setNotifyEmail('');
        setShowModal(false);
        fetchPages();
      } else {
        alert("Error al guardar la página: " + (data.message || "Revisa la URL"));
      }
    } catch (e) {
      alert("No se pudo conectar con el servidor en Render.");
    } finally {
      setLoading(false);
    }
  };

  // Forzar comprobación manual
  const handleManualCheck = async () => {
    setChecking(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/check`, { method: 'POST' });
      const data = await res.json();
      alert(`Comprobación finalizada.\nCambios detectados: ${data.changes_detected.length}`);
      fetchPages();
    } catch (e) {
      alert("Error al conectar con el servidor.");
    } finally {
      setChecking(false);
    }
  };

  // Marcar cambio como visto
  const handleDismissChange = async (id) => {
    try {
      await fetch(`${API_BASE_URL}/api/pages/${id}/dismiss`, { method: 'POST' });
      fetchPages();
    } catch (e) {
      console.error(e);
    }
  };

  const changedPages = pages.filter(p => p.has_changed);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans p-4 md:p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
        
        {/* Cabecera */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">O</div>
            <h1 className="text-xl font-bold text-gray-900">OposAlert</h1>
          </div>
          <button 
            onClick={handleManualCheck}
            disabled={checking}
            className="flex items-center gap-2 text-sm bg-purple-50 hover:bg-purple-100 text-purple-700 px-3.5 py-2 rounded-lg font-medium transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Comprobando...' : 'Comprobar ahora'}
          </button>
        </div>

        {/* Contenido principal */}
        <div className="p-6">
          <h2 className="text-2xl font-semibold mb-1">Panel de Control</h2>
          <p className="text-gray-500 mb-6">Páginas vigiladas · Auto-refresco activo cada 15 min</p>

          {/* Tarjetas de estadísticas */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 text-center">
              <div className="text-2xl font-bold text-gray-800">{pages.length}</div>
              <div className="text-sm text-gray-500 font-medium">Webs</div>
            </div>
            <div className={`${changedPages.length > 0 ? 'bg-red-50 border-red-100 text-red-600' : 'bg-purple-50 border-purple-100 text-purple-600'} p-4 rounded-lg border text-center transition`}>
              <div className="text-2xl font-bold">{changedPages.length}</div>
              <div className="text-sm font-medium">Cambios</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 text-center">
              <div className="text-2xl font-bold text-gray-800">0</div>
              <div className="text-sm text-gray-500 font-medium">Errores</div>
            </div>
          </div>

          {/* Sección de Cambios Recientes (Alerta Roja) */}
          <h3 className="flex items-center gap-2 font-bold text-gray-800 mb-4 uppercase text-sm tracking-wider">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div> Cambios Recientes
          </h3>
          
          {changedPages.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-4 mb-8 text-center text-sm text-gray-400">
              No hay publicaciones nuevas detectadas en este momento.
            </div>
          ) : (
            <div className="space-y-3 mb-8">
              {changedPages.map((p) => (
                <div key={p.id} className="bg-red-50/70 border border-red-200 rounded-xl p-4 flex justify-between items-center transition hover:bg-red-50">
                  <div>
                    <h4 className="font-semibold text-gray-900 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      {p.name}
                    </h4>
                    <p className="text-sm text-gray-600 mb-1">¡Nueva publicación o cambio detectado!</p>
                    <p className="text-xs text-gray-400">{p.changed_at} · Notificado a {p.notify_email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <a 
                      href={p.url} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center text-xs font-bold text-red-600 bg-white border border-red-200 px-3 py-1.5 rounded-lg shadow-xs hover:bg-red-50 transition"
                    >
                      VER WEB <ChevronRight className="w-4 h-4 ml-0.5" />
                    </a>
                    <button 
                      onClick={() => handleDismissChange(p.id)}
                      title="Marcar como visto"
                      className="text-xs text-gray-400 hover:text-gray-600 p-1.5 hover:bg-red-100/50 rounded-lg transition cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sección de Páginas Vigiladas */}
          <h3 className="flex items-center gap-2 font-bold text-gray-800 mb-4 uppercase text-sm tracking-wider">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div> Páginas Vigiladas
          </h3>
          
          <div className="space-y-3 mb-8">
            {pages.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <Globe className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">No hay páginas añadidas todavía.</p>
              </div>
            ) : (
              pages.map((p) => (
                <div key={p.id} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-lg transition border border-gray-100">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    <div>
                      <span className="font-medium text-gray-800 block">{p.name}</span>
                      <a href={p.url} target="_blank" rel="noreferrer" className="text-xs text-purple-600 hover:underline block truncate max-w-xs md:max-w-md">
                        {p.url}
                      </a>
                      <span className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3" /> {p.notify_email}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{p.last_checked}</span>
                </div>
              ))
            )}
          </div>

          {/* Botón Añadir Página */}
          <button 
            onClick={() => setShowModal(true)}
            className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-semibold hover:border-purple-500 hover:text-purple-600 hover:bg-purple-50/20 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-5 h-5" /> AÑADIR PÁGINA
          </button>
        </div>
      </div>

      {/* Modal Formulario */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 cursor-pointer p-1"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-lg font-bold text-gray-900 mb-1">Añadir nueva página</h3>
            <p className="text-xs text-gray-500 mb-4">Te avisaremos al correo cuando haya novedades.</p>
            
            <form onSubmit={handleAddPage} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Nombre</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: Oposiciones Auxiliar AGE" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">URL a vigilar</label>
                <input 
                  type="url" 
                  required
                  placeholder="https://..." 
                  value={url} 
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Email de aviso</label>
                <input 
                  type="email" 
                  required
                  placeholder="tu_correo@ejemplo.com" 
                  value={notifyEmail} 
                  onChange={(e) => setNotifyEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-purple-600"
                />
              </div>
              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 rounded-lg transition cursor-pointer disabled:opacity-50"
              >
                {loading ? "Analizando página..." : "Activar vigilancia y alertas"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;