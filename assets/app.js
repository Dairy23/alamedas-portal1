function formatDMY(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}
(async () => {
  const SQL = await initSqlJs({
    locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
  });
  const resp = await fetch('/alamedas-portal/db/alamedas.db');
  const ul = document.getElementById('news-list');
  if (!resp.ok) {
    if (ul) ul.innerHTML = '<li>No se pudo cargar la base de datos.</li>';
    return;
  }
  const db = new SQL.Database(new Uint8Array(await resp.arrayBuffer()));
  const res = db.exec(`
    SELECT Fecha, Noticia
    FROM Noticias
    ORDER BY date(Fecha) DESC
    LIMIT 3;
  `);
  const rows = res.length ? res[0].values : [];
  if (!rows.length) ul.innerHTML = '<li>Sin noticias.</li>';
  else rows.forEach(([fecha, noticia]) => {
    const li = document.createElement('li');
    li.className = 'card';
    li.innerHTML = `<strong>${formatDMY(fecha)}</strong><br>${noticia}`;
    ul.appendChild(li);
  });
  db.close();
})();
