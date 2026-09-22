const handleManualCheck = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/check`, { 
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!res.ok) {
        throw new Error(`Error en el servidor (código HTTP ${res.status})`);
      }
      
      const data = await res.json();
      const numCambios = data.changes_detected ? data.changes_detected.length : 0;
      alert(`Comprobación finalizada con éxito.\nNuevos cambios detectados: ${numCambios}`);
      await fetchPages();
    } catch (e) {
      alert("No se pudo completar la comprobación: " + e.message + "\nSi Render estaba en reposo, espera 30 segundos y vuelve a pulsar.");
    } finally {
      setChecking(false);
    }
  };