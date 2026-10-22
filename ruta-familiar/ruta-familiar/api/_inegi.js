// Conexión con la API de Ruteo del INEGI (Sakbé v3.1).
// El token se guarda como variable de entorno INEGI_TOKEN en el servidor, nunca en el navegador.
const BASE = 'https://gaia.inegi.org.mx/sakbe_v3.1/';

async function inegi(endpoint, params) {
  const key = process.env.INEGI_TOKEN;
  if (!key) {
    const err = new Error('Falta configurar INEGI_TOKEN en el servidor.');
    err.status = 500;
    throw err;
  }
  const body = new URLSearchParams({ type: 'json', ...params, key });
  const res = await fetch(BASE + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const err = new Error(`El INEGI respondió con error ${res.status}.`);
    err.status = 502;
    throw err;
  }
  const json = await res.json();
  return json && json.data !== undefined ? json.data : json;
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

module.exports = { inegi, num };
