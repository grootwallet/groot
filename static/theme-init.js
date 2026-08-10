(() => {
  if (location.pathname === '/marketing' || location.pathname.startsWith('/marketing/')) return;
  let theme = 'dark';
  try {
    const saved = localStorage.getItem('groot-theme');
    theme = saved === 'light' || saved === 'dark'
      ? saved
      : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  } catch {
    // Fail closed to the high-contrast dark palette when browser preferences are unavailable.
  }
  document.documentElement.dataset.theme = theme;
  const themeColor = document.createElement('meta');
  themeColor.name = 'theme-color';
  themeColor.content = theme === 'light' ? '#f4f1e9' : '#0d1118';
  document.head.append(themeColor);
})();
