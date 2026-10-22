// GET /api/buscar?q=Villahermosa  ->  { lugares: [{ id, nombre, estado }] }
const { inegi } = require('./_inegi');

module.exports = async (req, res) => {
  const q = String((req.query && req.query.q) || '').trim();
  if (q.length < 3) return res.status(200).json({ lugares: [] });
  try {
    const data = await inegi('buscadestino', { buscar: q, num: '12' });
    const lista = Array.isArray(data) ? data : [];
    const lugares = lista.map((d) => ({
      id: d.id_dest,
      nombre: d.nombre,
      estado: d.ent_abr || '',
    }));
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ lugares });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo buscar el lugar.' });
  }
};
