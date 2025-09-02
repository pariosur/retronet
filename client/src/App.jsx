import { useMemo, useState } from 'react';
import WhiteboardPage from './components/WhiteboardPage';
import SetupPage from './components/SetupPage';
import RetrosPage from './components/RetrosPage';
import ReleaseNotesPage from './components/ReleaseNotesPage';

function App() {
  const [currentPage, setCurrentPage] = useState('whiteboard');
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

  return (
    <div className="min-h-screen bg-gray-50">
      {currentPage === 'whiteboard' && (
        <WhiteboardPage 
          dateRange={config.dateRange}
          teamMembers={config.teamMembers}
          onChangeDateRange={(dr) => setConfig(prev => ({ ...prev, dateRange: dr }))}
          onNavigate={(key) => {
            if (key === 'setup') return setCurrentPage('setup');
            if (key === 'retros') return setCurrentPage('retros');
            if (key === 'release-notes') return setCurrentPage('release-notes');
            setCurrentPage('whiteboard');
          }} 
        />
      )}
      {currentPage === 'setup' && (
        <SetupPage 
          onComplete={handleSetupComplete}
          onNavigate={(key) => {
            if (key === 'setup') return setCurrentPage('setup');
            if (key === 'retros') return setCurrentPage('retros');
            if (key === 'release-notes') return setCurrentPage('release-notes');
            setCurrentPage('whiteboard');
          }}
        />
      )}
      {currentPage === 'retros' && (
        <RetrosPage 
          onNavigate={(key) => {
            if (key === 'setup') return setCurrentPage('setup');
            if (key === 'release-notes') return setCurrentPage('release-notes');
            setCurrentPage('whiteboard');
          }}
          onLoadRetro={(key) => {
            const list = JSON.parse(localStorage.getItem('retromate_retros') || '[]');
            const match = list.find((r) => r.key === key);
            if (match) {
              localStorage.setItem('retromate_board', JSON.stringify(match.board));
              setConfig(prev => ({ ...prev, dateRange: match.dateRange }));
            }
            setCurrentPage('whiteboard');
          }}
        />
      )}
      {currentPage === 'release-notes' && (
        <ReleaseNotesPage 
          onNavigate={(key) => {
            if (key === 'setup') return setCurrentPage('setup');
            if (key === 'retros') return setCurrentPage('retros');
            setCurrentPage('whiteboard');
          }}
        />
      )}
    </div>
  );
}

export default App;