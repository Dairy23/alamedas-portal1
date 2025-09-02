const DB_URL = '/alamedas-portal/db/alamedas.db';

function normText(s) {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}
function toISODate(value) {
  const v = (value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const d = m[1].padStart(2,'0');
    const mo = m[2].padStart(2,'0');
    const y = m[3];
    return `${y}-${mo}-${d}`;
  }
  const dt = new Date(v);
  if (!isNaN(dt)) {
    const y = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2,'0');
    const d = String(dt.getDate()).padStart(2,'0');
    return `${y}-${mo}-${d}`;
  }
  return '';
}
function formatDMY(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function todayISO() { return new Date().toISOString().slice(0,10); }
function ymNow() { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth()+1 }; }

async function openDb() {
  const SQL = await initSqlJs({
    locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
  });
  const resp = await fetch(DB_URL, { cache: 'no-store' });
  if (!resp.ok) throw new Error('No se pudo descargar la base de datos.');
  const buf = new Uint8Array(await resp.arrayBuffer());
  return new SQL.Database(buf);
}
function validarEntrada({ dpi, casa, nombre, apellido, fechaISO }) {
  const errs = [];
  if (!/^\d{13}$/.test(dpi)) errs.push('DPI debe tener 13 dígitos.');
  if (!casa) errs.push('Número de casa es requerido.');
  if (!/^[A-Za-zÁÉÍÓÚÑáéíóúñ\s\'-]{2,}$/.test(nombre)) errs.push('Primer nombre inválido.');
  if (!/^[A-Za-zÁÉÍÓÚÑáéíóúñ\s\'-]{2,}$/.test(apellido)) errs.push('Primer apellido inválido.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaISO)) errs.push('Fecha de nacimiento inválida.');
  return errs;
}
async function verificarEstadoMesActual({ dpi, casa, nombre, apellido, fechaISO }) {
  const db = await openDb();
  const stmt = db.prepare(`
    SELECT DPI, PrimerNombre, PrimerApellido, FechaNacimiento, NumeroCasa
    FROM Inquilino
    WHERE DPI = ? AND NumeroCasa = ?
    LIMIT 1;
  `);
  stmt.bind([dpi, casa]);
  const found = stmt.step();
  const row = found ? stmt.getAsObject() : null;
  stmt.free();
  if (!row) { db.close(); return { ok:false, msg:'No existe inquilino con ese DPI y Número de Casa.' }; }
  const nombreOK   = normText(row.PrimerNombre)   === normText(nombre);
  const apellidoOK = normText(row.PrimerApellido) === normText(apellido);
  const fechaOK    = (row.FechaNacimiento || '').trim() === fechaISO;
  if (!nombreOK || !apellidoOK || !fechaOK) {
    db.close();
    const faltan = [
      !nombreOK   ? 'Primer Nombre' : null,
      !apellidoOK ? 'Primer Apellido' : null,
      !fechaOK    ? 'Fecha de Nacimiento (use el selector)' : null,
    ].filter(Boolean).join(', ');
    return { ok:false, msg:`Datos no coinciden (${faltan}).` };
  }
  const { y, m } = ymNow();
  const pago = db.prepare(`
    SELECT 1 FROM PagoDeCuotas
    WHERE NumeroCasa = ? AND Anio = ? AND Mes = ?;
  `);
  pago.bind([casa, y, m]);
  const alDia = pago.step();
  pago.free();
  db.close();
  return {
    ok:true,
    alDia,
    msg: alDia ? '✅ Cuota de mantenimiento al día'
               : '⚠️ Cuota de mantenimiento pendiente'
  };
}
async function cargarHistorial(casa, desdeISO, hastaISO) {
  const db = await openDb();
  const params = [casa];
  let where = `WHERE NumeroCasa = ?`;
  if (desdeISO) { where += ` AND date(FechaPago) >= date(?)`; params.push(desdeISO); }
  if (hastaISO) { where += ` AND date(FechaPago) <= date(?)`; params.push(hastaISO); }
  const res = db.exec(`
    SELECT FechaPago, Anio, Mes, NumeroCasa
    FROM PagoDeCuotas
    ${where}
    ORDER BY date(FechaPago) DESC
    LIMIT 120;
  `, params);
  const rows = res.length ? res[0].values : [];
  db.close();
  const tbody = document.querySelector('#tbl-hist tbody');
  tbody.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4" class="muted">Sin pagos en el rango seleccionado.</td>`;
    tbody.appendChild(tr);
    return;
  }
  rows.forEach(([fecha, anio, mes, casa]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${formatDMY(fecha)}</td><td>${anio}</td><td>${mes}</td><td>${casa}</td>`;
    tbody.appendChild(tr);
  });
}
function mostrarResultado(r) {
  const box = document.getElementById('resultado');
  box.className = 'mt';
  if (!r.ok)         box.innerHTML = `<div class="alert warn">${r.msg}</div>`;
  else if (r.alDia)  box.innerHTML = `<div class="alert ok">${r.msg}</div>`;
  else               box.innerHTML = `<div class="alert err">${r.msg}</div>`;
}
window.addEventListener('DOMContentLoaded', () => {
  const frm = document.getElementById('frm-consulta');
  const iDpi      = document.getElementById('dpi');
  const iCasa     = document.getElementById('casa');
  const iNombre   = document.getElementById('nombre');
  const iApellido = document.getElementById('apellido');
  const iFecha = document.getElementById('fecha') || document.getElementById('fechaNacimiento');
  frm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fechaISO = toISODate(iFecha?.value || '');
    const data = {
      dpi:      (iDpi.value || '').trim(),
      casa:     (iCasa.value || '').trim(),
      nombre:   (iNombre.value || '').trim(),
      apellido: (iApellido.value || '').trim(),
      fechaISO
    };
    const errs = validarEntrada(data);
    if (errs.length) { mostrarResultado({ ok:false, msg: errs.join(' ') }); return; }
    const res = await verificarEstadoMesActual(data);
    mostrarResultado(res);
    if (res.ok) {
      const hoy = new Date();
      const hace12 = new Date(hoy); hace12.setFullYear(hoy.getFullYear()-1);
      await cargarHistorial(data.casa, toISODate(hace12), todayISO());
    }
  });
  const frmHist = document.getElementById('frm-hist');
  const iDesde = document.getElementById('desde');
  const iHasta = document.getElementById('hasta');
  frmHist.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const casa = (iCasa.value || '').trim();
    if (!casa) { mostrarResultado({ ok:false, msg:'Para ver historial, indique el Número de Casa arriba.'}); return; }
    const dISO = toISODate(iDesde?.value || '');
    const hISO = toISODate(iHasta?.value || '');
    await cargarHistorial(casa, dISO || null, hISO || null);
  });
});
