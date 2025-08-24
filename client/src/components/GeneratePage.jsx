import { useState } from 'react';
import { Loader2, ArrowLeft, Sparkles } from 'lucide-react';
import axios from 'axios';

function GeneratePage({ config, onRetroGenerated, onBack }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');

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
    <div className="max-w-2xl mx-auto p-8">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Setup
      </button>

      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-4">
          <Sparkles className="w-12 h-12 text-purple-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Generate Retro
        </h1>
        <p className="text-gray-600">
          Ready to analyze your team's data and generate insights
        </p>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
        <h2 className="text-lg font-semibold mb-4">Configuration Summary</h2>
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium">Date Range:</span>{' '}
            {config.dateRange.start} to {config.dateRange.end}
          </div>
          <div>
            <span className="font-medium">Team Members:</span>{' '}
            {config.teamMembers.length > 0 
              ? config.teamMembers.join(', ')
              : 'All team members'
            }
          </div>
        </div>
      </div>

      {isGenerating ? (
        <div className="bg-white p-8 rounded-lg shadow-sm border text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <h3 className="text-lg font-semibold mb-2">Generating Your Retro</h3>
          <p className="text-gray-600 mb-4">{progress}</p>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all duration-500 w-3/4"></div>
          </div>
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          className="w-full bg-purple-600 text-white py-4 px-6 rounded-md hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 text-lg font-semibold"
        >
          <Sparkles className="w-5 h-5" />
          Generate Retro Insights
        </button>
      )}
    </div>
  );
}

export default GeneratePage;