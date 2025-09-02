document.addEventListener('DOMContentLoaded', () => {
  const main = document.getElementById('main-photo');
  const thumbs = document.querySelectorAll('.thumb');
  if (!main || !thumbs.length) return;
  thumbs.forEach(btn => {
    btn.addEventListener('click', () => {
      thumbs.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const src = btn.getAttribute('data-src');
      main.style.setProperty('--img', `url('${src}')`);
    });
  });
});
