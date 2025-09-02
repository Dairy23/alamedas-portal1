const DB_URL = '/alamedas-portal/db/alamedas.db';

function formatDMY(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}
async function loadDb() {
  const SQL = await initSqlJs({
    locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
  });
  const resp = await fetch(DB_URL);
  if (!resp.ok) throw new Error('No se pudo descargar la DB');
  const buf = new Uint8Array(await resp.arrayBuffer());
  return new SQL.Database(buf);
}
function ymd(date) { return date.toISOString().slice(0, 10); }
function firstDayOfMonth(y, m) { const d = new Date(Date.UTC(y, m, 1)); return (d.getUTCDay()+6)%7; }
function daysInMonth(y, m) { return new Date(Date.UTC(y, m+1, 0)).getUTCDate(); }

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fillMonthYearSelectors(monthSel, yearSel) {
  const now = new Date(), yNow = now.getUTCFullYear(), mNow = now.getUTCMonth();
  MESES.forEach((name,i)=>{ const o=document.createElement('option'); o.value=i;o.textContent=name;if(i===mNow)o.selected=true;monthSel.appendChild(o); });
  for(let y=yNow-2;y<=yNow+2;y++){ const o=document.createElement('option'); o.value=y;o.textContent=y;if(y===yNow)o.selected=true;yearSel.appendChild(o); }
}

function getMonthRange(year, month) {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return { start: ymd(start), end: ymd(end) };
}

function toggleEmptyState(hasEvents) {
  const msg = document.getElementById('no-events');
  if (msg) msg.classList.toggle('hidden', hasEvents);
}

function renderCalendarGrid(bodyEl, y, m, eventsByDay) {
  bodyEl.innerHTML = '';
  const now = new Date(), tY=now.getUTCFullYear(), tM=now.getUTCMonth(), tD=now.getUTCDate();
  const offset = firstDayOfMonth(y, m), total = daysInMonth(y, m);
  let day = 1;
  for (let r=0; r<6; r++) {
    const tr = document.createElement('tr');
    for (let c=0; c<7; c++) {
      const td = document.createElement('td');
      if ((r===0 && c<offset) || day>total) { td.className='empty'; }
      else {
        const d = day;
        td.innerHTML = `<div class="day">${d}</div><ul class="evt" id="evt-${d}"></ul>`;
        if (y===tY && m===tM && d===tD) td.classList.add('today');
        (eventsByDay.get(d)||[]).forEach(e=>{
          const li = document.createElement('li');
          li.innerHTML = `<button class="link" aria-label="Ver detalle de ${e.Titulo}">${e.Titulo}</button>`;
          li.querySelector('button').addEventListener('click',()=>openEvent(e));
          td.querySelector('.evt').appendChild(li);
        });
        day++;
      }
      tr.appendChild(td);
    }
    bodyEl.appendChild(tr);
    if (day>total) break;
  }
}

function openEvent(e) {
  const dlg = document.getElementById('event-modal');
  document.getElementById('event-title').textContent = e.Titulo;
  document.getElementById('event-date').textContent = formatDMY(e.Fecha);
  document.getElementById('event-desc').textContent = e['Descripción/Nota'] ?? e.Descripcion ?? '';
  dlg.showModal();
}

async function loadAndRender() {
  const monthSel = document.getElementById('month');
  const yearSel = document.getElementById('year');
  const tbody = document.getElementById('calendar-body');
  const title = document.getElementById('title-month');

  const y = parseInt(yearSel.value, 10);
  const m = parseInt(monthSel.value, 10);
  if (title) title.textContent = `${MESES[m]} ${y}`;

  const { start, end } = getMonthRange(y, m);
  const db = await loadDb();
  const stmt = db.prepare(`
    SELECT Fecha, Titulo, "Descripción/Nota" as Descripcion
    FROM Calendario
    WHERE date(Fecha) BETWEEN date(?) AND date(?)
    ORDER BY date(Fecha) ASC, Titulo ASC;
  `);
  stmt.bind([start, end]);

  const eventsByDay = new Map();
  while (stmt.step()) {
    const row = stmt.getAsObject();
    const d = new Date(row.Fecha);
    const day = d.getUTCDate();
    if (!eventsByDay.has(day)) eventsByDay.set(day, []);
    eventsByDay.get(day).push({ Fecha: row.Fecha, Titulo: row.Titulo, 'Descripción/Nota': row.Descripcion });
  }
  stmt.free(); db.close();

  toggleEmptyState(eventsByDay.size > 0);
  renderCalendarGrid(tbody, y, m, eventsByDay);
}

function shiftMonth(delta) {
  const monthSel = document.getElementById('month');
  const yearSel = document.getElementById('year');
  let m = parseInt(monthSel.value, 10);
  let y = parseInt(yearSel.value, 10);
  m += delta;
  if (m < 0) { m = 11; y -= 1; }
  if (m > 11) { m = 0; y += 1; }
  monthSel.value = m;
  yearSel.value = y;
  loadAndRender();
}

function gotoToday() {
  const now = new Date();
  document.getElementById('month').value = now.getUTCMonth();
  document.getElementById('year').value = now.getUTCFullYear();
  loadAndRender();
}

window.addEventListener('DOMContentLoaded', () => {
  fillMonthYearSelectors(document.getElementById('month'), document.getElementById('year'));
  document.getElementById('month').addEventListener('change', loadAndRender);
  document.getElementById('year').addEventListener('change', loadAndRender);
  const close = document.getElementById('event-close');
  if (close) close.addEventListener('click', () => document.getElementById('event-modal').close());
  const prev = document.getElementById('prev-month');
  const next = document.getElementById('next-month');
  const today = document.getElementById('today');
  if (prev) prev.addEventListener('click', () => shiftMonth(-1));
  if (next) next.addEventListener('click', () => shiftMonth(1));
  if (today) today.addEventListener('click', gotoToday);
  loadAndRender();
});
