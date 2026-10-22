// GET /api/ruta?o=<id origen>&d=<id destino>&v=1
// Devuelve las rutas de cuota, libre y sugerida con distancia, tiempo, trazo para el mapa
// y cada caseta con su precio y ubicación. v: 0 = motocicleta, 1 = automóvil.
// Añade &debug=1 para ver qué respondió el INEGI en cada tipo de ruta.
const { inegi, num } = require('./_inegi');

const TIPOS = [
  { tipo: 'cuota', nombre: 'Por autopista de cuota', ruta: 'cuota', detalle: 'detalle_c' },
  { tipo: 'libre', nombre: 'Por carretera libre', ruta: 'libre', detalle: 'detalle_l' },
  { tipo: 'optima', nombre: 'Ruta sugerida', ruta: 'optima', detalle: 'detalle_o' },
];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// El INEGI a veces rechaza consultas simultáneas: se hacen una por una, con un reintento.
async function consulta(endpoint, params) {
  try {
    return await inegi(endpoint, params);
  } catch (e) {
    await esperar(400);
    return inegi(endpoint, params);
  }
}

function geo(g) {
  if (!g) return null;
  if (typeof g === 'object') return g;
  try { return JSON.parse(g); } catch { return null; }
}

function limpiarNombre(dir) {
  return String(dir || 'Caseta')
    .replace(/\s+/g, ' ')
    .replace(/^(cruce|pasar|paso)\s+(por\s+)?(la\s+)?/i, '')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

async function tramo(t, params) {
  const [resumen, detalle] = await Promise.all([
    consulta(t.ruta, params),
    consulta(t.detalle, params).catch(() => []),
  ]);
  const r = Array.isArray(resumen) ? resumen[0] || {} : resumen || {};
  const tramos = Array.isArray(detalle) ? detalle : [];
  const casetas = tramos
    .filter((s) => num(s.costo_caseta) > 0)
    .map((s) => {
      const p = geo(s.punto_caseta);
      const c = p && Array.isArray(p.coordinates) ? p.coordinates : null;
      return {
        nombre: limpiarNombre(s.direccion),
        costo: num(s.costo_caseta),
        lon: c ? num(c[0]) : null,
        lat: c ? num(c[1]) : null,
      };
    });
  const unicas = sinRepetidas(casetas);
  const totalDetalle = unicas.reduce((a, c) => a + c.costo, 0);
  return {
    tipo: t.tipo,
    nombre: t.nombre,
    km: num(r.long_km),
    minutos: num(r.tiempo_min),
    casetas: unicas,
    // Si quitamos repetidas, el total se recalcula con la lista limpia
    totalCasetas: unicas.length < casetas.length ? totalDetalle : num(r.costo_caseta) || totalDetalle,
    advertencia: r.advertencia || '',
    trazo: geo(r.geojson),
  };
}

// Distancia aproximada en km entre dos casetas
function km(a, b) {
  if (a.lat == null || b.lat == null) return Infinity;
  const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return 6371 * Math.hypot(x, y);
}
const clave = (c) => c.nombre.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

// Quita casetas repetidas: mismo nombre, o mismo precio a menos de 3 km (pasa al unir dos tramos)
function sinRepetidas(lista) {
  const out = [];
  for (const c of lista) {
    const dup = out.some((o) => clave(o) === clave(c) || (o.costo === c.costo && km(o, c) < 3));
    if (!dup) out.push(c);
  }
  return out;
}

// Calcula una ruta directa, o en dos tramos si hay un punto intermedio (origen → parada → destino)
async function calcular(t, o, d, v, parada) {
  if (!parada) return tramo(t, { dest_i: o, dest_f: d, v });
  const [a, b] = await Promise.all([
    tramo(t, { dest_i: o, dest_f: parada.id, v }),
    tramo(t, { dest_i: parada.id, dest_f: d, v }),
  ]);
  if (!a.km || !b.km) return { ...a, km: 0 };
  const unidas = sinRepetidas([...a.casetas, ...b.casetas]);
  return {
    tipo: t.tipo + '-via',
    nombre: `${t.nombre} pasando por ${String(parada.nombre).split(',')[0].trim()}`,
    km: a.km + b.km,
    minutos: a.minutos + b.minutos,
    casetas: unidas,
    totalCasetas: unidas.reduce((s, c) => s + c.costo, 0),
    advertencia: [a.advertencia, b.advertencia].filter(Boolean).join(' '),
    trazo: { type: 'GeometryCollection', geometries: [a.trazo, b.trazo].filter(Boolean) },
  };
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const o = String(q.o || '').trim();
  const d = String(q.d || '').trim();
  const v = ['0', '1'].includes(String(q.v)) ? String(q.v) : '1';
  const debug = String(q.debug || '') === '1';
  if (!/^\d+$/.test(o) || !/^\d+$/.test(d)) {
    return res.status(400).json({ error: 'Elige el origen y el destino de la lista.' });
  }
  const p = String(q.p || '').trim();
  const parada = /^\d+$/.test(p) ? { id: p, nombre: String(q.pn || 'la parada').slice(0, 60) } : null;
  // Con parada: rutas directas (cuota y libre) y las mismas pasando por la parada.
  const plan = parada
    ? [[TIPOS[0], null], [TIPOS[1], null], [TIPOS[0], parada], [TIPOS[1], parada]]
    : TIPOS.map((t) => [t, null]);
  // Modo de una sola ruta: &t=cuota|libre|optima (y &via=1 para pasar por la parada).
  // La app pide cada ruta por separado para que ninguna consulta rebase el tiempo límite del servidor.
  if (q.t) {
    const t = TIPOS.find((x) => x.tipo === String(q.t));
    if (!t) return res.status(400).json({ error: 'Tipo de ruta no válido.' });
    const via = String(q.via || '') === '1' ? parada : null;
    try {
      const r = await calcular(t, o, d, v, via);
      if (!r.km) return res.status(404).json({ error: 'Sin ruta de este tipo.' });
      if (!debug) res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
      return res.status(200).json({ ruta: r });
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message || 'No se pudo calcular la ruta.' });
    }
  }
  const rutas = [];
  const errores = [];
  const vistas = new Set();
  for (const [t, via] of plan) {
    try {
      const r = await calcular(t, o, d, v, via);
      if (!r.km) { errores.push({ tipo: t.tipo, error: 'sin distancia' }); continue; }
      // La ruta sugerida suele coincidir con otra: se muestra una sola vez
      const firma = `${Math.round(r.km)}-${Math.round(r.totalCasetas)}`;
      if (vistas.has(firma)) { errores.push({ tipo: t.tipo, error: 'igual a otra ruta' }); continue; }
      vistas.add(firma);
      rutas.push(r);
    } catch (e) {
      errores.push({ tipo: t.tipo, error: e.message });
    }
  }
  if (!rutas.length) {
    return res.status(404).json({ error: 'El INEGI no encontró una ruta entre esos lugares.', ...(debug ? { errores } : {}) });
  }
  if (!debug) res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
  res.status(200).json({ rutas, fuente: 'API de Ruteo, INEGI', ...(debug ? { errores } : {}) });
};
