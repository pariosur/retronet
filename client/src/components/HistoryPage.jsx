import AppLayout from './AppLayout';
import { useRef } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, useInView } from 'motion/react';

function AnimatedItem({ children, index }) {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.3, once: false });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.98, y: 8 }}
      animate={inView ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.98, y: 8 }}
      transition={{ duration: 0.16, delay: Math.min(index * 0.03, 0.2) }}
    >
      {children}
    </motion.div>
  );
}

function HistoryPage({ onNavigate, onLoadRetro }) {
  const saved = JSON.parse(localStorage.getItem('retronet_retros') || '[]');
  const removeRetro = (key) => {
    const list = JSON.parse(localStorage.getItem('retronet_retros') || '[]');
    const next = list.filter((r) => (r.id || r.key) !== key);
    localStorage.setItem('retronet_retros', JSON.stringify(next));
    location.reload();
  };
  return (
    <AppLayout onNavigate={onNavigate}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">History</h1>
        {saved.length === 0 ? (
          <div className="text-sm text-gray-600 dark:text-gray-400">No retros saved yet.</div>
        ) : (
          <div className="space-y-2">
            {saved.map((r, idx) => (
              <AnimatedItem key={r.id || r.key} index={idx}>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex items-center justify-between">
                  <div className="text-sm text-gray-800 dark:text-gray-200">
                    <span className="font-medium">#{saved.length - idx} {r.title || r.rangeLabel}</span>
                    <span className="text-gray-500 dark:text-gray-400 ml-2">{new Date(r.savedAt).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => onLoadRetro(r.id || r.key)} className="px-3 py-1 text-sm bg-gray-900 dark:bg-gray-600 text-white rounded-md hover:bg-gray-800 dark:hover:bg-gray-500">Load</button>
                    <button onClick={() => removeRetro(r.id || r.key)} className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700">Delete</button>
                  </div>
                </div>
              </AnimatedItem>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default HistoryPage;


