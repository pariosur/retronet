import { useEffect, useState } from 'react';
import { LayoutGrid, Sparkles, Settings, BarChart, PanelLeftOpen, PanelLeftClose } from 'lucide-react';

function Sidebar({ onNavigate }) {
  const items = [
    { key: 'whiteboard', label: 'Whiteboard', icon: LayoutGrid },
    { key: 'setup', label: 'Integrations', icon: Settings },
    { key: 'retros', label: 'Retros', icon: BarChart },
  ];
  return (
    <div className="w-56">
      <div className="text-sm font-bold text-gray-900 mb-6">RetroMate</div>
      <nav className="space-y-1">
        {items.map(item => (
          <button
            key={item.key}
            onClick={() => onNavigate?.(item.key)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50"
          >
            <item.icon className="w-4 h-4 text-gray-500" />
            {item.label}
          </button>
        ))}
      </nav>
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
    <div className="min-h-screen bg-gray-50 flex relative">

      {/* Mobile overlay backdrop */}
      {!collapsed && (
        <div
          className="fixed inset-0 bg-black/20 z-30 md:hidden"
          onClick={() => setCollapsed(true)}
        />
      )}

      {/* Sidebar: off-canvas on mobile, static on desktop */}
      <aside
        className={`transform transition-transform duration-200 bg-white border-r border-gray-200 p-4 z-40 md:z-0 w-56 fixed md:static inset-y-0 left-0 overflow-y-auto
          ${collapsed ? '-translate-x-full md:-translate-x-0 md:hidden' : 'translate-x-0 md:translate-x-0 md:block'}`}
      >
        <div className="flex items-center justify-between mb-4 md:hidden">
          <div className="text-sm font-bold text-gray-900">RetroMate</div>
          <button
            onClick={() => setCollapsed(true)}
            className="p-2 rounded-md border border-gray-200"
            aria-label="Close sidebar"
            title="Close"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
        <Sidebar onNavigate={onNavigate} />
      </aside>
      <main className="flex-1 p-3 md:p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-3 md:mb-4 flex items-center gap-3">
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="p-2 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm"
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
                  <span className="text-lg font-semibold text-gray-700 whitespace-nowrap">{headerPrefix}</span>
                )}
                <input
                  value={headerTitle}
                  onChange={(e) => onChangeTitle?.(e.target.value)}
                  placeholder="Untitled retro"
                  className="flex-1 text-lg font-semibold text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-0"
                />
              </div>
            )}
            {Array.isArray(titleDropdownOptions) && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600">Retros</label>
                <select
                  value={selectedTitleKey || ''}
                  onChange={(e) => onSelectTitleOption?.(e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded-md text-sm bg-white"
                  title="Select a saved retro"
                >
                  {titleDropdownOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => onNewRetro?.()}
                  className="px-2 py-2 border border-gray-300 rounded-md text-sm"
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


