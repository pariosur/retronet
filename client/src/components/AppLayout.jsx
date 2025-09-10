import { useEffect, useState } from 'react';
import { LayoutGrid, Sparkles, Settings, BarChart, FileText, PanelLeftOpen, PanelLeftClose, Moon, Sun } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';

function Sidebar({ onNavigate }) {
  const items = [
    { key: 'whiteboard', label: 'Whiteboard', icon: LayoutGrid },
    { key: 'setup', label: 'Integrations', icon: Settings },
    { key: 'retros', label: 'Retros', icon: BarChart },

  ];
  const [useDemo, setUseDemo] = useState(true);
  const { darkMode, toggleDarkMode } = useDarkMode();

  useEffect(() => {
    // Initialize from localStorage (default to true)
    try {
      const raw = localStorage.getItem('retromate.useDemo');
      if (raw === null) {
        localStorage.setItem('retromate.useDemo', 'true');
        setUseDemo(true);
      } else {
        setUseDemo(raw === 'true');
      }
    } catch {
      // Ignore localStorage access failures
    }
  }, []);

  const validateRealMode = async () => {
    try {
      // Check configuration without making API calls
      const res = await fetch('http://localhost:3001/api/config-status');
      if (!res.ok) {
        alert('Could not verify integrations. Staying in Demo mode.');
        return false;
      }
      
      const data = await res.json();
      const { integrations } = data;
      
      const missing = [];
      const required = [
        { key: 'LINEAR_API_KEY', label: 'Linear' },
        { key: 'GITHUB_TOKEN', label: 'GitHub' },
        { key: 'SLACK_BOT_TOKEN', label: 'Slack' },
        { key: 'OPENAI_API_KEY', label: 'OpenAI' }
      ];
      
      for (const req of required) {
        if (!integrations[req.key]) {
          missing.push(req.key);
        }
      }

      if (missing.length) {
        alert(`Missing keys: ${missing.join(', ')}\nOpen Integrations to configure.`);
        return false;
      }
      return true;
    } catch {
      alert('Could not verify integrations. Staying in Demo mode.');
      return false;
    }
  };

  const onToggleDemo = async () => {
    const next = !useDemo;
    if (next === false) {
      // Switching to real data: validate first
      const ok = await validateRealMode();
      if (!ok) {
        // keep demo on
        setUseDemo(true);
        try { localStorage.setItem('retromate.useDemo', 'true'); } catch {
          // Ignore storage errors
        }
        return;
      }
    }
    
    // Clear any active generation session when switching modes
    try {
      localStorage.removeItem('retromate_active_session');
    } catch {
      // Ignore storage errors
    }
    
    setUseDemo(next);
    try { localStorage.setItem('retromate.useDemo', String(next)); } catch {
      // Ignore storage errors
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-6">RetroMate</div>
      <nav className="space-y-1 flex-1 overflow-y-auto">
        {items.map(item => (
          <button
            key={item.key}
            onClick={() => onNavigate?.(item.key)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <item.icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4 space-y-3">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm text-gray-600 dark:text-gray-400">Demo data</span>
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only"
              checked={useDemo}
              onChange={onToggleDemo}
            />
            <div className={`block w-10 h-6 rounded-full ${useDemo ? 'bg-gray-900 dark:bg-gray-600' : 'bg-gray-300 dark:bg-gray-700'}`}></div>
            <div className={`absolute left-1 top-1 bg-white dark:bg-gray-200 w-4 h-4 rounded-full transition-transform ${useDemo ? 'translate-x-4' : ''}`}></div>
          </div>
        </label>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{useDemo ? 'Default' : 'Requires integrations'}</div>
        
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleDarkMode();
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>
            {darkMode ? (
              <Sun className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            ) : (
              <Moon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function AppLayout({ children, onNavigate, headerTitle, onChangeTitle, headerPrefix, titleDropdownOptions, onSelectTitleOption, selectedTitleKey, onNewRetro }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Start collapsed on small screens
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setCollapsed(true);
    }
    const onKeyDown = (e) => {
      const isToggle = (e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B');
      if (isToggle) {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex relative">

      {/* Mobile overlay backdrop */}
      {!collapsed && (
        <div
          className="fixed inset-0 bg-black/20 dark:bg-black/40 z-30 md:hidden"
          onClick={() => setCollapsed(true)}
        />
      )}

      {/* Sidebar: off-canvas on mobile, static on desktop */}
      <aside
        className={`transform transition-transform duration-200 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-40 md:z-0 w-56 fixed md:static inset-y-0 left-0 flex flex-col
          ${collapsed ? '-translate-x-full md:-translate-x-0 md:hidden' : 'translate-x-0 md:translate-x-0 md:block'}`}
      >
        <div className="flex items-center justify-between p-4 pb-0 md:hidden">
          <div className="text-sm font-bold text-gray-900 dark:text-gray-100">RetroMate</div>
          <button
            onClick={() => setCollapsed(true)}
            className="p-2 rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            aria-label="Close sidebar"
            title="Close"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 p-4 overflow-hidden flex flex-col">
          <Sidebar onNavigate={onNavigate} />
        </div>
      </aside>
      <main className="flex-1 p-3 md:p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-3 md:mb-4 flex items-center gap-3">
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="p-2 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm"
              title="Toggle sidebar (Cmd+B)"
              aria-label="Toggle sidebar"
            >
              {collapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
            {typeof headerTitle !== 'undefined' && (
              <div className="flex items-center gap-2 flex-1">
                {headerPrefix && (
                  <span className="text-lg font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">{headerPrefix}</span>
                )}
                <input
                  value={headerTitle}
                  onChange={(e) => onChangeTitle?.(e.target.value)}
                  placeholder="Untitled retro"
                  className="flex-1 text-lg font-semibold text-gray-900 dark:text-gray-100 bg-transparent border-0 focus:outline-none focus:ring-0 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
            )}
            {Array.isArray(titleDropdownOptions) && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 dark:text-gray-400">Retros</label>
                <select
                  value={selectedTitleKey || ''}
                  onChange={(e) => onSelectTitleOption?.(e.target.value)}
                  className="px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  title="Select a saved retro"
                >
                  {titleDropdownOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => onNewRetro?.()}
                  className="px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  New
                </button>
              </div>
            )}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

export default AppLayout;


