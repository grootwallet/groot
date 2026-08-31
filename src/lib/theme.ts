export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'groot-theme';
export const THEME_COLORS: Record<Theme, string> = {
  light: '#f4f1e9',
  dark: '#0d1118'
};

export function resolveTheme(saved: string | null, prefersLight: boolean): Theme {
  return saved === 'light' || saved === 'dark' ? saved : prefersLight ? 'light' : 'dark';
}

type ThemeRoot = Pick<HTMLElement, 'dataset'>;
type ThemeColorMeta = Pick<HTMLMetaElement, 'setAttribute'>;

export function currentTheme(root: ThemeRoot = document.documentElement): Theme {
  return root.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(
  theme: Theme,
  options: {
    root?: ThemeRoot;
    themeColor?: ThemeColorMeta | null;
    storage?: Pick<Storage, 'setItem'> | null;
  } = {}
): void {
  const root = options.root ?? document.documentElement;
  const themeColor =
    options.themeColor === undefined
      ? document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      : options.themeColor;
  root.dataset.theme = theme;
  themeColor?.setAttribute('content', THEME_COLORS[theme]);
  try {
    (options.storage === undefined ? localStorage : options.storage)?.setItem(
      THEME_STORAGE_KEY,
      theme
    );
  } catch {
    // The visible preference still applies when browser storage is unavailable.
  }
}
