import { useEffect, useState } from 'react';
import { DarkModeContext } from './darkModeContext';

export function DarkModeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      // Check localStorage first
      const saved = localStorage.getItem('retronet_darkmode');
      if (saved !== null) {
        return saved === 'true';
      }
      // Otherwise check system preference
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  });

  useEffect(() => {
    // Apply dark mode class to document
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    
    // Save preference
    try {
      localStorage.setItem('retronet_darkmode', darkMode.toString());
    } catch (error) {
      // Silently fail if localStorage is not available
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };

  return (
    <DarkModeContext.Provider value={{ darkMode, toggleDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  );
}

