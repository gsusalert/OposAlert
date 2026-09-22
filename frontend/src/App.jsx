import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle2, RefreshCw, X, Globe, Bell } from 'lucide-react';

function App() {
  const [pages, setPages] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  // Obtener páginas guardadas desde el backend
  const fetchPages = async () => {
    try {
      const res = await fetch('https://gsusalert.onrender.com');
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
  }, []);

  // Enviar nueva página al backend
  const handleAddPage = async (e) => {
    e.preventDefault();
    if (!name || !url) return;
    setLoading(true);
    try {
      const res = await fetch('https://oposalert-backend.onrender.com/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setName('');
        setUrl('');
        setShowModal(false);
        fetchPages();
      } else {
        alert("Error al vigilar la página: " + (data.message || "Revisa la URL"));
      }
    } catch (e) {
      alert("No se pudo conectar con el backend (puerto 8000). Asegúrate de que uvicorn está corriendo.");
    } finally {
      setLoading(false);
    }
  };

  // Forzar comprobación de cambios
  const handleManualCheck = async () => {
    setChecking(true);
    try {
      const res = await fetch('https://oposalert-backend.onrender.com/api/check', { method: 'POST' });
      const data = await res.json();
      alert(`Comprobación finalizada.\nWebs analizadas: ${data.checked}\nCambios detectados: ${data.changes_detected.length}`);
    } catch (e) {
      alert("Error al conectar con el servidor.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans p-6">
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

        {/* Panel principal */}
        <div className="p-6">
          <h2 className="text-2xl font-semibold mb-1">Panel de Control</h2>
          <p className="text-gray-500 mb-6">Páginas bajo vigilancia activa</p>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 text-center">
              <div className="text-2xl font-bold text-gray-800">{pages.length}</div>
              <div className="text-sm text-gray-500 font-medium">Webs activas</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 text-center">
              <div className="text-2xl font-bold text-purple-600">Activo</div>
              <div className="text-sm text-purple-600 font-medium">Monitor</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 text-center">
              <div className="text-2xl font-bold text-gray-800">0</div>
              <div className="text-sm text-gray-500 font-medium">Errores</div>
            </div>
          </div>

          <h3 className="flex items-center gap-2 font-bold text-gray-800 mb-4 uppercase text-sm tracking-wider">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div> Páginas Vigiladas
          </h3>
          
          <div className="space-y-3 mb-8">
            {pages.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <Globe className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">No hay páginas añadidas todavía.</p>
                <p className="text-xs text-gray-400">Pulsa el botón de abajo para empezar a vigilar convocatorias.</p>
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
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{p.last_checked}</span>
                </div>
              ))
            )}
          </div>

          {/* Botón que abre el modal */}
          <button 
            onClick={() => setShowModal(true)}
            className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-semibold hover:border-purple-500 hover:text-purple-600 hover:bg-purple-50/20 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-5 h-5" /> AÑADIR PÁGINA
          </button>
        </div>
      </div>

      {/* Ventana modal (formulario) */}
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
            <p className="text-xs text-gray-500 mb-4">Introduce la URL donde se publican las listas o novedades.</p>
            
            <form onSubmit={handleAddPage} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Nombre identificador</label>
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
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">URL completa</label>
                <input 
                  type="url" 
                  required
                  placeholder="https://sede.inap.gob.es/..." 
                  value={url} 
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-purple-600"
                />
              </div>
              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 rounded-lg transition cursor-pointer disabled:opacity-50"
              >
                {loading ? "Analizando página..." : "Comenzar a vigilar"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;