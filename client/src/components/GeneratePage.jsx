import { useEffect, useRef, useState } from 'react';
import { Loader2, ArrowLeft, Sparkles, Clock } from 'lucide-react';
import axios from 'axios';
import AppLayout from './AppLayout';

function GeneratePage({ config, onRetroGenerated, onBack, autoStart = false, onNavigate }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [etaMs, setEtaMs] = useState(null);
  
  const pollRef = useRef(null);

  useEffect(() => {
    if (autoStart && !isGenerating) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const formatEta = (ms) => {
    if (!ms || ms <= 0) return null;
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const friendlyStepLabel = (stepIndex) => {
    switch (stepIndex) {
      case 0: return 'Getting things ready…';
      case 1: return 'Preparing AI Analysis…';
      case 2: return 'AI is thinking…';
      case 3: return 'Polishing the insights…';
      case 4: return 'Wrapping up…';
      default: return 'Working…';
    }
  };

  const startProgressPolling = (sid) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:3001/api/progress/${sid}`);
        if (!res.ok) {
          // If tracker not found, keep a gentle indeterminate state
          return;
        }
        const data = await res.json();
        const pct = data?.progress?.percentage ?? 0;
        setProgressPct(pct);
        const currentIndex = data?.currentStep?.index ?? 0;
        setProgressText(`${friendlyStepLabel(currentIndex)} (${data?.progress?.completedSteps || 0}/${data?.progress?.totalSteps || 0})`);
        setEtaMs(data?.progress?.estimatedTimeRemaining ?? null);
        if (data?.completed) {
          clearInterval(pollRef.current);
        }
      } catch {
        // Swallow polling errors; UI stays in current state
      }
    }, 750);
  };

  const stopProgressPolling = () => {
    clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgressText('Starting…');
    setProgressPct(0);
    setEtaMs(null);

    const sid = (window.crypto?.randomUUID && window.crypto.randomUUID()) || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    startProgressPolling(sid);

    try {
      // Read demo toggle and variant from localStorage
      let useDemo = true;
      let demoVariant = 'large';
      try {
        const raw = localStorage.getItem('retromate.useDemo');
        useDemo = raw === null ? true : (raw === 'true');
        const rawVar = localStorage.getItem('retromate.demoVariant');
        if (rawVar === 'small' || rawVar === 'large') demoVariant = rawVar;
      } catch {
        // Ignore localStorage access issues (e.g., privacy mode)
      }

      const response = await axios.post('http://localhost:3001/api/generate-retro', {
        dateRange: config.dateRange,
        teamMembers: config.teamMembers,
        sessionId: sid,
        useDemo,
        demoVariant,
      });
      onRetroGenerated(response.data);
    } catch (error) {
      console.error('Error generating retro:', error);
      const errorMessage = error.response?.data?.error || 'Failed to generate retro. Please try again.';
      alert(errorMessage);
    } finally {
      stopProgressPolling();
      setIsGenerating(false);
      setProgressText('');
      setProgressPct(0);
      setEtaMs(null);
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
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">{progressText}</p>
              {etaMs != null && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" /> ETA {formatEta(etaMs)}
                </span>
              )}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gray-900 h-2 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
              />
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