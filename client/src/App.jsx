import { useMemo, useState } from 'react';
import WhiteboardPage from './components/WhiteboardPage';
import SetupPage from './components/SetupPage';
import RetrosPage from './components/RetrosPage';
import GuidePage from './components/GuidePage';


function App() {
  const [currentPage, setCurrentPage] = useState('guide');
  const initialDates = useMemo(() => {
    const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = new Date().toISOString().split('T')[0];
    return { start, end };
  }, []);
  const [config, setConfig] = useState({
    dateRange: initialDates,
    teamMembers: []
  });
  // Deprecated: autoGenerate (kept for compatibility earlier)

  const handleSetupComplete = (setupConfig) => {
    setConfig(prev => ({ ...prev, ...setupConfig }));
    setCurrentPage('whiteboard');
  };

  // Demo and setup helpers not used in minimalist flow; keep for future demo mode

  const handleNavigate = (key) => {
    setCurrentPage(key);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {currentPage === 'guide' && (
        <GuidePage onNavigate={handleNavigate} />
      )}
      {currentPage === 'whiteboard' && (
        <WhiteboardPage 
          dateRange={config.dateRange}
          teamMembers={config.teamMembers}
          onChangeDateRange={(dr) => setConfig(prev => ({ ...prev, dateRange: dr }))}
          onNavigate={handleNavigate}
        />
      )}
      {currentPage === 'setup' && (
        <SetupPage 
          onComplete={handleSetupComplete}
          onNavigate={handleNavigate}
        />
      )}
      {currentPage === 'retros' && (
        <RetrosPage 
          onNavigate={handleNavigate}
          onLoadRetro={(key) => {
            const list = JSON.parse(localStorage.getItem('retronet_retros') || '[]');
            const match = list.find((r) => r.key === key);
            if (match) {
              localStorage.setItem('retronet_board', JSON.stringify(match.board));
              setConfig(prev => ({ ...prev, dateRange: match.dateRange }));
            }
            setCurrentPage('whiteboard');
          }}
        />
      )}

    </div>
  );
}

export default App;