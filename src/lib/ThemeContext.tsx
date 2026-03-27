import { createContext, useContext, useEffect, useState } from 'react';
import { loadPref, savePref } from './utils';

export type Theme = 'dark' | 'light';
export const ZOOM_LEVELS = [90, 100, 115, 130] as const;
export type ZoomLevel = typeof ZOOM_LEVELS[number];

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  zoom: ZoomLevel;
  setZoom: (z: ZoomLevel) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
  zoom: 100,
  setZoom: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function applyTheme(theme: Theme) {
  if (theme === 'light') {
    document.documentElement.dataset.theme = 'light';
  } else {
    delete document.documentElement.dataset.theme;
  }
}

function applyZoom(zoom: number) {
  document.documentElement.style.zoom = String(zoom / 100);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => loadPref<Theme>('ui_theme', 'dark'));
  const [zoom, setZoomState] = useState<ZoomLevel>(() => loadPref<ZoomLevel>('ui_zoom', 100));

  // Apply saved preferences immediately on mount
  useEffect(() => {
    applyTheme(theme);
    applyZoom(zoom);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function setTheme(t: Theme) {
    setThemeState(t);
    savePref('ui_theme', t);
    applyTheme(t);
  }

  function setZoom(z: ZoomLevel) {
    setZoomState(z);
    savePref('ui_zoom', z);
    applyZoom(z);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, zoom, setZoom }}>
      {children}
    </ThemeContext.Provider>
  );
}
