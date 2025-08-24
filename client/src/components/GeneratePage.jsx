import { useEffect, useState } from 'react';
import { Loader2, ArrowLeft, Sparkles } from 'lucide-react';
import axios from 'axios';
import AppLayout from './AppLayout';

function GeneratePage({ config, onRetroGenerated, onBack, autoStart = false, onNavigate }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    if (autoStart && !isGenerating) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    
    try {
      // Simulate progress updates
      setProgress('Analyzing Linear tickets...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setProgress('Processing Slack messages...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setProgress('Reviewing GitHub activity...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setProgress('Generating insights...');
      
      const response = await axios.post('http://localhost:3001/api/generate-retro', {
        dateRange: config.dateRange,
        teamMembers: config.teamMembers
      });
      
      onRetroGenerated(response.data);
    } catch (error) {
      console.error('Error generating retro:', error);
      const errorMessage = error.response?.data?.error || 'Failed to generate retro. Please try again.';
      alert(errorMessage);
    } finally {
      setIsGenerating(false);
      setProgress('');
    }
  };

  return (
    <AppLayout onNavigate={onNavigate}>
      <div className="max-w-2xl mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Setup
        </button>

        <div className="mb-6">
          <div className="mb-2">
            <Sparkles className="w-6 h-6 text-gray-700" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Generate Retro</h1>
          <p className="text-sm text-gray-600">Analyze your team's data and produce insights.</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Configuration</h2>
          <div className="space-y-1 text-sm text-gray-700">
            <div>
              <span className="text-gray-600">Date Range:</span>{' '}
              {config.dateRange.start} to {config.dateRange.end}
            </div>
            <div>
              <span className="text-gray-600">Team Members:</span>{' '}
              {config.teamMembers.length > 0 ? config.teamMembers.join(', ') : 'All team members'}
            </div>
          </div>
        </div>

        {isGenerating ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-2 text-gray-900">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">Generating your retro…</span>
            </div>
            <p className="text-sm text-gray-600 mb-4">{progress}</p>
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div className="bg-gray-900 h-1.5 w-1/2 animate-pulse"></div>
            </div>
          </div>
        ) : (
          <button
            onClick={handleGenerate}
            className="w-full bg-gray-900 text-white py-3 px-4 rounded-md hover:bg-black transition-colors flex items-center justify-center gap-2 text-sm font-medium"
          >
            <Sparkles className="w-4 h-4" />
            Generate Retro Insights
          </button>
        )}
      </div>
    </AppLayout>
  );
}

export default GeneratePage;