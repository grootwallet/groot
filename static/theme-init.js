(() => {
  let theme = 'dark';
  try {
    const saved = localStorage.getItem('groot-theme');
    theme =
      saved === 'light' || saved === 'dark'
        ? saved
        : matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
  } catch {
    // Fail closed to the high-contrast dark palette when browser preferences are unavailable.
  }
  document.documentElement.dataset.theme = theme;
  const themeColor = document.createElement('meta');
  themeColor.name = 'theme-color';
  themeColor.content = theme === 'light' ? '#fbfbfa' : '#091625';
  document.head.append(themeColor);
})();
