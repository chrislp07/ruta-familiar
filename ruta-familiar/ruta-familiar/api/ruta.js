// GET /api/ruta?o=<id origen>&d=<id destino>&v=1
// Devuelve hasta tres rutas (cuota, libre, sugerida) con distancia, tiempo y cada caseta con su precio.
// v: tipo de vehículo del INEGI (0 = motocicleta, 1 = automóvil).
const { inegi, num } = require('./_inegi');

const TIPOS = [
  { tipo: 'cuota', nombre: 'Por autopista de cuota', ruta: 'cuota', detalle: 'detalle_c' },
  { tipo: 'libre', nombre: 'Por carretera libre', ruta: 'libre', detalle: 'detalle_l' },
  { tipo: 'optima', nombre: 'Ruta sugerida', ruta: 'optima', detalle: 'detalle_o' },
];

function limpiarNombre(dir) {
  return String(dir || 'Caseta')
    .replace(/\s+/g, ' ')
    .replace(/^(cruce|pasar|paso)\s+(por\s+)?(la\s+)?/i, '')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

async function calcular(t, params) {
  const [resumen, detalle] = await Promise.all([
    inegi(t.ruta, params),
    inegi(t.detalle, params).catch(() => []),
  ]);
  const r = Array.isArray(resumen) ? resumen[0] || {} : resumen || {};
  const tramos = Array.isArray(detalle) ? detalle : [];
  const casetas = tramos
    .filter((s) => num(s.costo_caseta) > 0)
    .map((s) => ({ nombre: limpiarNombre(s.direccion), costo: num(s.costo_caseta) }));
  const totalDetalle = casetas.reduce((a, c) => a + c.costo, 0);
  return {
    tipo: t.tipo,
    nombre: t.nombre,
    km: num(r.long_km),
    minutos: num(r.tiempo_min),
    casetas,
    totalCasetas: num(r.costo_caseta) || totalDetalle,
    advertencia: r.advertencia || '',
  };
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const o = String(q.o || '').trim();
  const d = String(q.d || '').trim();
  const v = ['0', '1'].includes(String(q.v)) ? String(q.v) : '1';
  if (!/^\d+$/.test(o) || !/^\d+$/.test(d)) {
    return res.status(400).json({ error: 'Elige el origen y el destino de la lista.' });
  }
  const params = { dest_i: o, dest_f: d, v };
  try {
    const resultados = await Promise.allSettled(TIPOS.map((t) => calcular(t, params)));
    const rutas = [];
    const vistas = new Set();
    for (const r of resultados) {
      if (r.status !== 'fulfilled' || !r.value.km) continue;
      // Evita repetir la ruta sugerida si es idéntica a otra
      const firma = `${Math.round(r.value.km)}-${Math.round(r.value.totalCasetas)}`;
      if (vistas.has(firma)) continue;
      vistas.add(firma);
      rutas.push(r.value);
    }
    if (!rutas.length) {
      return res.status(404).json({ error: 'El INEGI no encontró una ruta entre esos lugares.' });
    }
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    res.status(200).json({ rutas, fuente: 'API de Ruteo, INEGI' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo calcular la ruta.' });
  }
};
