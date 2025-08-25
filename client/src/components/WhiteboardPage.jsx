import { useEffect, useState } from 'react';
import { LayoutGrid, Sparkles, Settings, BarChart, Edit2, Trash2, Save } from 'lucide-react';
import AppLayout from './AppLayout';
import ShinyText from './ShinyText';
import axios from 'axios';

function DraggableCard({ item, onEdit, onDelete, onDragStart }) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(item.text);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed !== item.text) onEdit({ ...item, text: trimmed });
    setIsEditing(false);
  };

  const isAI = item.source === 'ai';

  const aiStyle = undefined; // remove silver overlay for clarity

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      className={`relative overflow-hidden bg-gray-50 border ${item.isSample ? 'border-dashed' : 'border-solid'} border-gray-200 rounded-lg p-3 text-sm text-gray-800 group`}
      style={aiStyle}
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
          className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm bg-white"
        />
      ) : (
        <div className="relative flex items-center justify-between">
          {isAI ? (
            <ShinyText text={item.text} className={`${item.isSample ? 'text-gray-600' : ''}`} speed={4} once lifetimeMs={1800} />
          ) : (
            <span className={`${item.isSample ? 'text-gray-600' : ''}`}>{item.text}</span>
          )}
          <div className="flex items-center gap-2">
            {isAI && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">AI</span>
            )}
            {item.isSample && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700">Sample</span>
            )}
            <button
              onClick={() => onDelete(item.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-600"
              aria-label="Delete card"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-gray-800"
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

function Column({ title, items = [], placeholderItems = [], onDropItem, onEditItem, onAddItem, onDeleteItem }) {
  return (
    <div className="flex-1 min-w-0 bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">{title}</h2>
      <div
        className="space-y-2 min-h-[120px]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => onDropItem(e)}
      >
        {items.length === 0 && placeholderItems.length > 0
          ? placeholderItems.map((t, i) => (
              <div key={`p-${i}`} className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-3 text-sm text-gray-600">
                <div className="flex items-center justify-between">
                  <span>{t}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700">Sample</span>
                </div>
              </div>
            ))
          : items.map((item) => (
              <DraggableCard key={item.id} item={item} onEdit={onEditItem} onDelete={onDeleteItem} onDragStart={onDropItem.onDragStart} />
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
        className="flex-1 px-2 py-1 border border-gray-300 rounded-md text-sm"
        placeholder="Add a card..."
      />
      <button onClick={submit} className="px-2 py-1 bg-gray-900 text-white rounded-md text-xs hover:bg-black">Add</button>
    </div>
  );
}

function WhiteboardPage({ onNavigate, dateRange, onChangeDateRange, teamMembers }) {
  const toItems = (arr, isSample = false) => (arr || []).map((text, idx) => ({ id: `${Date.now()}-${Math.random()}-${idx}`, text, isSample }));
  const [board, setBoard] = useState({ wentWell: [], didntGoWell: [], actionItems: [] });
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState(null);
  const [title, setTitle] = useState('');
  const [currentId, setCurrentId] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

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
    const saved = localStorage.getItem('retromate_board');
    const savedTime = localStorage.getItem('retromate_last_generated');
    const savedTitle = localStorage.getItem('retromate_title');
    const savedId = localStorage.getItem('retromate_current_id');
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

  const saveRetro = () => {
    try {
      setSaveStatus('saving');
      // Ensure we have an id for this retro
      let id = currentId;
      if (!id) {
        id = `r-${Date.now()}`;
        setCurrentId(id);
        localStorage.setItem('retromate_current_id', id);
      }

      const start = dateRange?.start; const end = dateRange?.end;
      const retrosRaw = JSON.parse(localStorage.getItem('retromate_retros') || '[]');
      const retros = Array.isArray(retrosRaw) ? retrosRaw.map(r => (r.id ? r : { id: r.key || `legacy-${Date.now()}`, ...r })) : [];
      const updated = {
        id,
        dateRange: { start, end },
        title: title || 'Retro',
        board,
        savedAt: new Date().toISOString()
      };
      const next = retros.filter(r => (r.id || r.key) !== id);
      next.unshift(updated);
      localStorage.setItem('retromate_retros', JSON.stringify(next));
      // Persist ephemeral hydration of the current working board/title for convenience
      localStorage.setItem('retromate_board', JSON.stringify(board));
      localStorage.setItem('retromate_title', title || '');
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 1200);
    } catch {
      setSaveStatus('');
    }
  };

  const startDrag = (e, item, from) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ id: item.id, from }));
  };

  const handleDropTo = (to) => (e) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;
    const { id, from } = JSON.parse(data);
    if (!from) return;
    setBoard(prev => {
      const next = { ...prev };
      const [moved] = next[from].filter(x => x.id === id);
      if (!moved) return prev;
      next[from] = next[from].filter(x => x.id !== id);
      next[to] = [...next[to], { ...moved, isSample: false, source: moved.source }];
      return next;
    });
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
    try {
      const response = await axios.post('http://localhost:3001/api/generate-retro', {
        dateRange: { start, end },
        teamMembers: teamMembers || []
      });
      const data = response.data;
      const aiWW = (data.wentWell || []).map(i => i.title);
      const aiDW = (data.didntGoWell || []).map(i => i.title);
      const aiAI = (data.actionItems || []).map(i => i.title);
      setBoard(prev => ({
        wentWell: [...prev.wentWell.filter(i => i.source === 'user' || !i.source && !i.isSample), ...toItems(aiWW).map(x => ({ ...x, source: 'ai' }))],
        didntGoWell: [...prev.didntGoWell.filter(i => i.source === 'user' || !i.source && !i.isSample), ...toItems(aiDW).map(x => ({ ...x, source: 'ai' }))],
        actionItems: [...prev.actionItems.filter(i => i.source === 'user' || !i.source && !i.isSample), ...toItems(aiAI).map(x => ({ ...x, source: 'ai' }))]
      }));
      const ts = new Date().toISOString();
      setLastGeneratedAt(ts);
      localStorage.setItem('retromate_last_generated', ts);
      // Note: no auto-save here. Use the Save Retro button to persist.
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to generate retro');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <AppLayout 
      onNavigate={onNavigate} 
      headerTitle={title} 
      onChangeTitle={setTitle}
      headerPrefix={(() => {
        const retros = JSON.parse(localStorage.getItem('retromate_retros') || '[]');
        const ids = retros.map(r => r.id || r.key);
        const idx = ids.indexOf(currentId);
        if (idx === -1) return `#${retros.length + 1}`;
        return `#${retros.length - idx}`;
      })()}
      titleDropdownOptions={(() => {
        const retros = JSON.parse(localStorage.getItem('retromate_retros') || '[]');
        const total = retros.length;
        return retros.map((r, i) => ({
          key: r.id || r.key,
          label: `#${total - i} ${r.title || r.rangeLabel}`
        }));
      })()}
      onSelectTitleOption={(key) => {
        const retros = JSON.parse(localStorage.getItem('retromate_retros') || '[]');
        const match = retros.find(r => (r.id || r.key) === key);
        if (!match) return;
        localStorage.setItem('retromate_board', JSON.stringify(match.board));
        setBoard(match.board);
        setLastGeneratedAt(match.savedAt);
        setTitle(match.title || 'Retro');
        setCurrentId(match.id || key);
        localStorage.setItem('retromate_current_id', match.id || key);
        // also update the date range so filters make sense
        onChangeDateRange?.({ start: match.dateRange.start, end: match.dateRange.end });
      }}
      selectedTitleKey={currentId}
      onNewRetro={() => {
        // Create a fresh whiteboard with a brand-new id so Save won't overwrite
        const newId = `r-${Date.now()}`;
        setCurrentId(newId);
        localStorage.setItem('retromate_current_id', newId);
        setBoard({
          wentWell: toItems(placeholders.wentWell, true),
          didntGoWell: toItems(placeholders.didntGoWell, true),
          actionItems: toItems(placeholders.actionItems, true)
        });
        setLastGeneratedAt(null);
        setTitle('Retro');
        // Clear ephemeral hydration values
        localStorage.setItem('retromate_board', JSON.stringify({
          wentWell: toItems(placeholders.wentWell, true),
          didntGoWell: toItems(placeholders.didntGoWell, true),
          actionItems: toItems(placeholders.actionItems, true)
        }));
        localStorage.setItem('retromate_title', 'Retro');
        localStorage.removeItem('retromate_last_generated');
      }}
    >
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Start</label>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => onChangeDateRange?.({ ...dateRange, start: e.target.value })}
            className="px-2 py-1 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">End</label>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => onChangeDateRange?.({ ...dateRange, end: e.target.value })}
            className="px-2 py-1 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div className="flex-1" />
        <div className="text-xs text-gray-500 mr-3">
          {lastGeneratedAt && <>Last generated {new Date(lastGeneratedAt).toLocaleString()} • </>}
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : null}
        </div>
        <button
          onClick={saveRetro}
          disabled={saveStatus === 'saving'}
          className="bg-white border border-gray-300 text-gray-800 px-3 py-2 rounded-md text-sm hover:bg-gray-50 inline-flex items-center gap-2 disabled:opacity-60"
        >
          <Save className="w-4 h-4" /> Save
        </button>
        
        <button
          onClick={generateFromServer}
          disabled={isGenerating}
          className="bg-gray-900 text-white px-3 py-2 rounded-md text-sm hover:bg-black inline-flex items-center gap-2 disabled:opacity-60"
        >
          {isGenerating ? (
            <span className="inline-flex items-center gap-2"><span className="animate-spin border-b-2 border-white rounded-full w-4 h-4"></span> Generating</span>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate</>
          )}
        </button>
        {saveStatus === 'saved' && (
          <span className="ml-2 text-xs text-gray-600">Saved</span>
        )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Column 
          title="What Went Well"
          items={board.wentWell}
          placeholderItems={placeholders.wentWell}
          onDropItem={Object.assign(handleDropTo('wentWell'), { onDragStart: (e, item) => startDrag(e, item, 'wentWell') })}
          onEditItem={handleEdit('wentWell')}
          onAddItem={handleAdd('wentWell')}
          onDeleteItem={handleDelete('wentWell')}
        />
        <Column 
          title="What Didn't Go Well"
          items={board.didntGoWell}
          placeholderItems={placeholders.didntGoWell}
          onDropItem={Object.assign(handleDropTo('didntGoWell'), { onDragStart: (e, item) => startDrag(e, item, 'didntGoWell') })}
          onEditItem={handleEdit('didntGoWell')}
          onAddItem={handleAdd('didntGoWell')}
          onDeleteItem={handleDelete('didntGoWell')}
        />
        <Column 
          title="Action Items"
          items={board.actionItems}
          placeholderItems={placeholders.actionItems}
          onDropItem={Object.assign(handleDropTo('actionItems'), { onDragStart: (e, item) => startDrag(e, item, 'actionItems') })}
          onEditItem={handleEdit('actionItems')}
          onAddItem={handleAdd('actionItems')}
          onDeleteItem={handleDelete('actionItems')}
        />
      </div>
    </AppLayout>
  );
}

export default WhiteboardPage;


