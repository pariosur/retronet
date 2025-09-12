import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Sparkles, Settings, BarChart, Edit2, Trash2, Save, Clock } from 'lucide-react';
import AppLayout from './AppLayout';
import DateRangePicker from './DateRangePicker';
 
import axios from 'axios';

function DraggableCard({ item, onEdit, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(item.text);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed !== item.text) onEdit({ ...item, text: trimmed });
    setIsEditing(false);
  };

  

  return (
    <div
      className={`relative overflow-hidden bg-gray-50 dark:bg-gray-800 border ${item.isSample ? 'border-dashed' : 'border-solid'} border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm text-gray-800 dark:text-gray-200 group`}
    >
      {isEditing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setValue(item.text);
              setIsEditing(false);
            }
          }}
          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
      ) : (
        <div className="relative flex items-center justify-between">
          <span className={`${item.isSample ? 'text-gray-600 dark:text-gray-400' : ''}`}>{item.text}</span>
          <div className="flex items-center gap-2">
            {item.isSample && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">Sample</span>
            )}
            <button
              onClick={() => onDelete(item.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400"
              aria-label="Delete card"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              aria-label="Edit card"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Column({ title, items = [], placeholderItems = [], onEditItem, onAddItem, onDeleteItem }) {
  return (
    <div className="flex-1 min-w-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{title}</h2>
      <div
        className="space-y-2 min-h-[120px]"
      >
        {items.length === 0 && placeholderItems.length > 0
          ? placeholderItems.map((t, i) => (
              <div key={`p-${i}`} className="bg-gray-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center justify-between">
                  <span>{t}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">Sample</span>
                </div>
              </div>
            ))
          : items.map((item) => (
              <DraggableCard key={item.id} item={item} onEdit={onEditItem} onDelete={onDeleteItem} />
            ))}
      </div>
      <div className="mt-3">
        <InlineAdder onAdd={onAddItem} />
      </div>
    </div>
  );
}

function InlineAdder({ onAdd }) {
  const [value, setValue] = useState('');
  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onAdd(text);
    setValue('');
  };
  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        placeholder="Add a card..."
      />
      <button onClick={submit} className="px-2 py-1 bg-gray-900 dark:bg-gray-600 text-white rounded-md text-xs hover:bg-black dark:hover:bg-gray-500">Add</button>
    </div>
  );
}

function DashboardPage({ onNavigate, dateRange, onChangeDateRange, teamMembers }) {
  const toItems = (arr, isSample = false) => (arr || []).map((text, idx) => ({ id: `${Date.now()}-${Math.random()}-${idx}`, text, isSample }));
  const [board, setBoard] = useState({ wentWell: [], didntGoWell: [], actionItems: [] });
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState(null);
  const [title, setTitle] = useState('');
  const [currentId, setCurrentId] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [etaMs, setEtaMs] = useState(null);
  const pollRef = useRef(null);

  const placeholders = {
    wentWell: [
      'Fast incident response reduced downtime',
      'Pair reviews improved code quality',
      'Daily standups stayed on time'
    ],
    didntGoWell: [
      'PR review queue caused delays',
      'Ambiguous ticket scope created rework'
    ],
    actionItems: [
      'Adopt lightweight PR checklist',
      'Clarify acceptance criteria in grooming'
    ]
  };

  useEffect(() => {
    // hydrate from localStorage
    const saved = localStorage.getItem('retronet_board');
    const savedTime = localStorage.getItem('retronet_last_generated');
    const savedTitle = localStorage.getItem('retronet_title');
    const savedId = localStorage.getItem('retronet_current_id');
    if (saved) {
      try {
        setBoard(JSON.parse(saved));
      } catch (err) {
        console.error('Failed to parse saved board', err);
      }
    } else {
      setBoard({
        wentWell: toItems(placeholders.wentWell, true),
        didntGoWell: toItems(placeholders.didntGoWell, true),
        actionItems: toItems(placeholders.actionItems, true)
      });
    }
    if (savedTime) setLastGeneratedAt(savedTime);
    if (savedTitle) setTitle(savedTitle);
    if (savedId) setCurrentId(savedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Removed autosave of board/title to localStorage; saving is now manual via Save button

  useEffect(() => {
    if (!title) setTitle('Retro');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Removed autosave of retros list; replaced with explicit Save action

  const persistRetroToLocalStorage = (boardToPersist, options = { showStatus: true }) => {
    try {
      if (options.showStatus) setSaveStatus('saving');
      let id = currentId;
      if (!id) {
        id = `r-${Date.now()}`;
        setCurrentId(id);
        localStorage.setItem('retronet_current_id', id);
      }
      const start = dateRange?.start; const end = dateRange?.end;
      const retrosRaw = JSON.parse(localStorage.getItem('retronet_retros') || '[]');
      const retros = Array.isArray(retrosRaw) ? retrosRaw.map(r => (r.id ? r : { id: r.key || `legacy-${Date.now()}`, ...r })) : [];
      const updated = { id, dateRange: { start, end }, title: title || 'Retro', board: boardToPersist, savedAt: new Date().toISOString() };
      const next = retros.filter(r => (r.id || r.key) !== id);
      next.unshift(updated);
      localStorage.setItem('retronet_retros', JSON.stringify(next));
      localStorage.setItem('retronet_board', JSON.stringify(boardToPersist));
      localStorage.setItem('retronet_title', title || '');
      if (options.showStatus) { setSaveStatus('saved'); setTimeout(() => setSaveStatus(''), 1200); }
    } catch {
      if (options.showStatus) setSaveStatus('');
    }
  };

  const saveRetro = () => { persistRetroToLocalStorage(board, { showStatus: true }); };

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
        if (!res.ok) return;
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
        // ignore poll errors
      }
    }, 750);
  };

  const stopProgressPolling = () => {
    clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const formatEta = (ms) => {
    if (!ms || ms <= 0) return null;
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const applyRetroData = (data) => {
    // Combine title and details into full text for display
    const aiWW = (data.wentWell || []).map(i => `${i.title}. ${i.details || ''}`);
    const aiDW = (data.didntGoWell || []).map(i => `${i.title}. ${i.details || ''}`);
    const aiAI = (data.actionItems || []).map(i => `${i.title}. ${i.details || ''}`);
    let nextBoardLocal = null;
    setBoard(prev => {
      const computed = {
        wentWell: [...prev.wentWell.filter(i => i.source === 'user' || !i.source && !i.isSample), ...toItems(aiWW).map(x => ({ ...x, source: 'ai' }))],
        didntGoWell: [...prev.didntGoWell.filter(i => i.source === 'user' || !i.source && !i.isSample), ...toItems(aiDW).map(x => ({ ...x, source: 'ai' }))],
        actionItems: [...prev.actionItems.filter(i => i.source === 'user' || !i.source && !i.isSample), ...toItems(aiAI).map(x => ({ ...x, source: 'ai' }))]
      };
      nextBoardLocal = computed;
      return computed;
    });
    const ts = new Date().toISOString();
    setLastGeneratedAt(ts);
    localStorage.setItem('retronet_last_generated', ts);
    if (nextBoardLocal) { persistRetroToLocalStorage(nextBoardLocal, { showStatus: false }); }
  };

  const pollForResult = async (sid) => {
    let done = false;
    while (!done) {
      await new Promise(r => setTimeout(r, 1200));
      const res = await fetch(`http://localhost:3001/api/generate-retro/result/${sid}`);
      if (res.status === 200) {
        const data = await res.json();
        localStorage.removeItem('retronet_active_session');
        applyRetroData(data);
        done = true;
        break;
      }
      if (res.status === 500) {
        const { error } = await res.json().catch(() => ({ error: 'Generation failed' }));
        alert(error || 'Generation failed');
        localStorage.removeItem('retronet_active_session');
        break;
      }
      // 202 pending or 404 not yet available -> continue
    }
  };

  const handleEdit = (column) => (updated) => {
    setBoard(prev => ({
      ...prev,
      [column]: prev[column].map(i => (i.id === updated.id ? { ...updated, isSample: false, source: i.source } : i))
    }));
  };

  const handleAdd = (column) => (text) => {
    setBoard(prev => ({
      ...prev,
      [column]: [...prev[column].filter(i => !i.isSample), { id: `${Date.now()}-${Math.random()}`, text, isSample: false, source: 'user' }]
    }));
  };

  const handleDelete = (column) => (id) => {
    setBoard(prev => ({
      ...prev,
      [column]: prev[column].filter(i => i.id !== id)
    }));
  };

  // Resume active background generation after refresh/navigation
  useEffect(() => {
    const active = localStorage.getItem('retronet_active_session');
    if (active) {
      setIsGenerating(true);
      setProgressPct(0);
      setProgressText('Resuming…');
      setEtaMs(null);
      startProgressPolling(active);
      pollForResult(active).finally(() => {
        stopProgressPolling();
        setIsGenerating(false);
        setProgressPct(0);
        setProgressText('');
        setEtaMs(null);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateFromServer = async () => {
    if (isGenerating) return;
    // Ensure valid ISO dates
    const start = dateRange?.start;
    const end = dateRange?.end;
    if (!start || !end) {
      alert('Please select a valid start and end date.');
      return;
    }
    setIsGenerating(true);
    setProgressPct(0);
    setProgressText('Starting…');
    setEtaMs(null);
    try {
      const sid = (window.crypto?.randomUUID && window.crypto.randomUUID()) || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem('retronet_active_session', sid);
      startProgressPolling(sid);

      // Read demo toggle from localStorage
      let useDemo = true;
      let demoVariant = 'large';
      try {
        const raw = localStorage.getItem('retronet.useDemo');
        useDemo = raw === null ? true : (raw === 'true');
        const rawVar = localStorage.getItem('retronet.demoVariant');
        if (rawVar === 'small' || rawVar === 'large') demoVariant = rawVar;
      } catch {
        // Ignore localStorage access issues
      }
      
      await axios.post('http://localhost:3001/api/generate-retro/start', {
        dateRange: { start, end },
        teamMembers: teamMembers || [],
        sessionId: sid,
        useDemo,
        demoVariant
      });
      await pollForResult(sid);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to generate retro');
    } finally {
      stopProgressPolling();
      setIsGenerating(false);
      setProgressPct(0);
      setProgressText('');
      setEtaMs(null);
    }
  };

  return (
    <AppLayout 
      onNavigate={onNavigate} 
      headerTitle={title} 
      onChangeTitle={setTitle}
      headerPrefix={(() => {
        const retros = JSON.parse(localStorage.getItem('retronet_retros') || '[]');
        const ids = retros.map(r => r.id || r.key);
        const idx = ids.indexOf(currentId);
        if (idx === -1) return `#${retros.length + 1}`;
        return `#${retros.length - idx}`;
      })()}
      titleDropdownOptions={(() => {
        const retros = JSON.parse(localStorage.getItem('retronet_retros') || '[]');
        const total = retros.length;
        return retros.map((r, i) => ({
          key: r.id || r.key,
          label: `#${total - i} ${r.title || r.rangeLabel}`
        }));
      })()}
      onSelectTitleOption={(key) => {
        const retros = JSON.parse(localStorage.getItem('retronet_retros') || '[]');
        const match = retros.find(r => (r.id || r.key) === key);
        if (!match) return;
        localStorage.setItem('retronet_board', JSON.stringify(match.board));
        setBoard(match.board);
        setLastGeneratedAt(match.savedAt);
        setTitle(match.title || 'Retro');
        setCurrentId(match.id || key);
        localStorage.setItem('retronet_current_id', match.id || key);
        // also update the date range so filters make sense
        onChangeDateRange?.({ start: match.dateRange.start, end: match.dateRange.end });
      }}
      selectedTitleKey={currentId}
      onNewRetro={() => {
        // Create a fresh dashboard with a brand-new id so Save won't overwrite
        const newId = `r-${Date.now()}`;
        setCurrentId(newId);
        localStorage.setItem('retronet_current_id', newId);
        setBoard({
          wentWell: toItems(placeholders.wentWell, true),
          didntGoWell: toItems(placeholders.didntGoWell, true),
          actionItems: toItems(placeholders.actionItems, true)
        });
        setLastGeneratedAt(null);
        setTitle('Retro');
        // Clear ephemeral hydration values
        localStorage.setItem('retronet_board', JSON.stringify({
          wentWell: toItems(placeholders.wentWell, true),
          didntGoWell: toItems(placeholders.didntGoWell, true),
          actionItems: toItems(placeholders.actionItems, true)
        }));
        localStorage.setItem('retronet_title', 'Retro');
        localStorage.removeItem('retronet_last_generated');
      }}
    >
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-4">
        <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Date Range</label>
          <DateRangePicker
            value={dateRange}
            onChange={(dr) => onChangeDateRange?.(dr)}
          />
        </div>
        <div className="flex-1" />
        <div className="text-xs text-gray-500 dark:text-gray-400 mr-3">
          {lastGeneratedAt && <>Last generated {new Date(lastGeneratedAt).toLocaleString()} • </>}
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : null}
        </div>
        <button
          onClick={saveRetro}
          disabled={saveStatus === 'saving'}
          className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-md text-sm hover:bg-gray-50 dark:hover:bg-gray-600 inline-flex items-center gap-2 disabled:opacity-60"
        >
          <Save className="w-4 h-4" /> Save
        </button>
        
        <button
          onClick={generateFromServer}
          disabled={isGenerating}
          className="bg-gray-900 dark:bg-gray-600 text-white px-3 py-2 rounded-md text-sm hover:bg-black dark:hover:bg-gray-500 inline-flex items-center gap-2 disabled:opacity-60"
        >
          {isGenerating ? (
            <span className="inline-flex items-center gap-2"><span className="animate-spin border-b-2 border-white rounded-full w-4 h-4"></span> Generating</span>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate</>
          )}
        </button>
        {saveStatus === 'saved' && (
          <span className="ml-2 text-xs text-gray-600 dark:text-gray-400">Saved</span>
        )}
        </div>
        {isGenerating && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-600 dark:text-gray-400">{progressText}</p>
              {etaMs != null && (
                <span className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                  <Clock className="w-3 h-3" /> ETA {formatEta(etaMs)}
                </span>
              )}
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gray-900 dark:bg-gray-600 h-1.5 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Column 
          title="What Went Well"
          items={board.wentWell}
          placeholderItems={placeholders.wentWell}
          onEditItem={handleEdit('wentWell')}
          onAddItem={handleAdd('wentWell')}
          onDeleteItem={handleDelete('wentWell')}
        />
        <Column 
          title="What Didn't Go Well"
          items={board.didntGoWell}
          placeholderItems={placeholders.didntGoWell}
          onEditItem={handleEdit('didntGoWell')}
          onAddItem={handleAdd('didntGoWell')}
          onDeleteItem={handleDelete('didntGoWell')}
        />
        <Column 
          title="Action Items"
          items={board.actionItems}
          placeholderItems={placeholders.actionItems}
          onEditItem={handleEdit('actionItems')}
          onAddItem={handleAdd('actionItems')}
          onDeleteItem={handleDelete('actionItems')}
        />
      </div>
    </AppLayout>
  );
}

export default DashboardPage;


