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
  const resumen = await consulta(t.ruta, params);
  const detalle = await consulta(t.detalle, params).catch(() => []);
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
  const totalDetalle = casetas.reduce((a, c) => a + c.costo, 0);
  return {
    tipo: t.tipo,
    nombre: t.nombre,
    km: num(r.long_km),
    minutos: num(r.tiempo_min),
    casetas,
    totalCasetas: num(r.costo_caseta) || totalDetalle,
    advertencia: r.advertencia || '',
    trazo: geo(r.geojson),
  };
}

// Calcula una ruta directa, o en dos tramos si hay un punto intermedio (origen → parada → destino)
async function calcular(t, o, d, v, parada) {
  if (!parada) return tramo(t, { dest_i: o, dest_f: d, v });
  const a = await tramo(t, { dest_i: o, dest_f: parada.id, v });
  const b = await tramo(t, { dest_i: parada.id, dest_f: d, v });
  if (!a.km || !b.km) return { ...a, km: 0 };
  return {
    tipo: t.tipo + '-via',
    nombre: `${t.nombre} pasando por ${parada.nombre}`,
    km: a.km + b.km,
    minutos: a.minutos + b.minutos,
    casetas: [...a.casetas, ...b.casetas],
    totalCasetas: a.totalCasetas + b.totalCasetas,
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
