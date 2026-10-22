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
    signal: AbortSignal.timeout(12000), // si el INEGI se traba, se corta y se reintenta
  });
  if (!res.ok) {
    const err = new Error(`El INEGI respondió con error ${res.status}.`);
    err.status = 502;
    throw err;
  }
  const json = JSON.parse(texto(Buffer.from(await res.arrayBuffer())));
  return json && json.data !== undefined ? json.data : json;
}

// El INEGI a veces responde en Latin-1 (ISO-8859-1) y no en UTF-8: "Cancún" llegaba como "Canc�n".
// Se intenta UTF-8 estricto; si falla, se lee como Windows-1252. También se reparan textos con doble
// codificación ("CancÃºn").
function texto(buf) {
  let t;
  try {
    t = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    t = new TextDecoder('windows-1252').decode(buf);
  }
  if (/Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]/.test(t)) {
    try {
      const r = Buffer.from(t, 'latin1').toString('utf8');
      if (!r.includes('\uFFFD')) t = r;
    } catch {}
  }
  return t;
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

module.exports = { inegi, num };
