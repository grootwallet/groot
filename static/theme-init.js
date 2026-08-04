(() => {
  let theme = 'dark';
  try {
    const saved = localStorage.getItem('satchel-theme');
    theme = saved === 'light' || saved === 'dark'
      ? saved
      : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  } catch {
    // Fail closed to the high-contrast dark palette when browser preferences are unavailable.
  }
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f1e9' : '#0d1118');
})();
