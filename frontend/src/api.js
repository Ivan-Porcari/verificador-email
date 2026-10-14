// Comunicación con la API de FastAPI (a través del proxy de Vite).

const BASE = "/api";

const SIN_CONEXION =
  "No se pudo conectar con la API. Revisá que esté corriendo con `python api.py`.";

async function pedir(url, opciones) {
  let respuesta;
  try {
    respuesta = await fetch(url, opciones);
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new Error(SIN_CONEXION);
  }

  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    // respuesta sin JSON (por ejemplo, el proxy no pudo llegar a la API)
  }

  if (!respuesta.ok) {
    if (!datos) throw new Error(SIN_CONEXION);
    const detalle = datos.detail;
    throw new Error(
      typeof detalle === "string" ? detalle : `Error ${respuesta.status} de la API`
    );
  }
  return datos;
}

export function verificarUno(email, sinSmtp, signal) {
  const params = new URLSearchParams({ email, sin_smtp: String(sinSmtp) });
  return pedir(`${BASE}/verificar?${params}`, { signal });
}

export function verificarLista(emails, sinSmtp, signal) {
  const params = new URLSearchParams({ sin_smtp: String(sinSmtp) });
  return pedir(`${BASE}/verificar-lista?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emails }),
    signal,
  });
}
