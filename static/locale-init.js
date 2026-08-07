(() => {
  const supported = ['en', 'fr', 'es'];
  let saved = null;
  try { saved = localStorage.getItem('satchel-language'); } catch { /* private storage can be unavailable */ }
  const candidate = String(saved || navigator.language || 'en').toLowerCase().split('-')[0];
  document.documentElement.lang = supported.includes(candidate) ? candidate : 'en';
})();
