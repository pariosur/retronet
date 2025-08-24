import { useState } from 'react';
import SetupPage from './components/SetupPage';
import GeneratePage from './components/GeneratePage';
import ResultsPage from './components/ResultsPage';

function App() {
  const [currentPage, setCurrentPage] = useState('setup');
  const [retroData, setRetroData] = useState(null);
  const [config, setConfig] = useState({
    dateRange: { start: '', end: '' },
    teamMembers: []
  });

  const handleSetupComplete = (setupConfig) => {
    setConfig(setupConfig);
    setCurrentPage('generate');
  };

  const handleRetroGenerated = (data) => {
    setRetroData(data);
    setCurrentPage('results');
  };

  const handleBackToGenerate = () => {
    setCurrentPage('generate');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {currentPage === 'setup' && (
        <SetupPage onComplete={handleSetupComplete} />
      )}
      {currentPage === 'generate' && (
        <GeneratePage 
          config={config}
          onRetroGenerated={handleRetroGenerated}
          onBack={() => setCurrentPage('setup')}
        />
      )}
      {currentPage === 'results' && (
        <ResultsPage 
          retroData={retroData}
          onBack={handleBackToGenerate}
        />
      )}
    </div>
  );
}

export default App;