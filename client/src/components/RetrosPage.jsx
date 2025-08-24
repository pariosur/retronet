import AppLayout from './AppLayout';

function RetrosPage({ onNavigate, onLoadRetro }) {
  const saved = JSON.parse(localStorage.getItem('retromate_retros') || '[]');
  const removeRetro = (key) => {
    const list = JSON.parse(localStorage.getItem('retromate_retros') || '[]');
    const next = list.filter((r) => (r.id || r.key) !== key);
    localStorage.setItem('retromate_retros', JSON.stringify(next));
    location.reload();
  };
  return (
    <AppLayout onNavigate={onNavigate}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Saved Retros</h1>
        {saved.length === 0 ? (
          <div className="text-sm text-gray-600">No retros saved yet.</div>
        ) : (
          <div className="space-y-2">
            {saved.map((r, idx) => (
              <div key={r.id || r.key} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                <div className="text-sm text-gray-800">
                  <span className="font-medium">#{saved.length - idx} {r.title || r.rangeLabel}</span>
                  <span className="text-gray-500 ml-2">{new Date(r.savedAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => onLoadRetro(r.id || r.key)} className="px-3 py-1 text-sm bg-gray-900 text-white rounded-md">Load</button>
                  <button onClick={() => removeRetro(r.id || r.key)} className="px-3 py-1 text-sm border border-gray-300 rounded-md">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default RetrosPage;


