import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'freedomTrailSettings';

const defaults = { animations: true, music: true };

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  // Respect the OS "reduce motion" preference for the animations default.
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return { ...defaults, animations: false };
    }
  } catch {
    /* ignore */
  }
  return { ...defaults };
}

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  const toggleAnimations = useCallback(
    () => setSettings((s) => ({ ...s, animations: !s.animations })),
    []
  );
  const toggleMusic = useCallback(
    () => setSettings((s) => ({ ...s, music: !s.music })),
    []
  );

  return (
    <SettingsContext.Provider value={{ ...settings, toggleAnimations, toggleMusic }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
