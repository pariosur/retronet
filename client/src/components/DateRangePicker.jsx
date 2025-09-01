import { useMemo, useState, useEffect, useRef } from 'react';
import { DayPicker, useDayPicker } from 'react-day-picker';
import { format, parseISO, isValid } from 'date-fns';
import 'react-day-picker/dist/style.css';

function toISO(date) {
  try {
    if (!date) return '';
    return format(date, 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

function fromISO(value) {
  if (!value) return undefined;
  const d = parseISO(value);
  return isValid(d) ? d : undefined;
}

// A small, reusable date range picker with a text button and an inline popover calendar.
// Props: value: { start: 'yyyy-MM-dd', end: 'yyyy-MM-dd' }, onChange(next)
function DateRangePicker({ value, onChange, className = '' }) {
  const startDate = useMemo(() => fromISO(value?.start), [value?.start]);
  const endDate = useMemo(() => fromISO(value?.end), [value?.end]);

  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const label = useMemo(() => {
    if (startDate && endDate) return `${format(startDate, 'MMM d, yyyy')} – ${format(endDate, 'MMM d, yyyy')}`;
    if (startDate) return `${format(startDate, 'MMM d, yyyy')} – …`;
    return 'Select dates';
  }, [startDate, endDate]);

  const selected = useMemo(() => ({ from: startDate, to: endDate }), [startDate, endDate]);

  const handleSelect = (range) => {
    if (!range) return;
    const from = range.from;
    const to = range.to;
    // Allow setting start immediately; end can be chosen later
    if (from && !to) {
      onChange?.({ start: toISO(from), end: '' });
      return;
    }
    if (from && to) {
      onChange?.({ start: toISO(from), end: toISO(to) });
    }
  };

  // Custom top caption with inline navigation (moves arrows to the top)
  function TopCaption(props) {
    const { nextMonth, previousMonth, goToMonth } = useDayPicker();
    return (
      <div className="flex items-center justify-between px-1 pt-1 pb-2">
        <button
          type="button"
          onClick={() => previousMonth && goToMonth(previousMonth)}
          disabled={!previousMonth}
          className="h-7 w-7 rounded-full border border-gray-300 hover:bg-gray-100 text-gray-900 disabled:opacity-40 flex items-center justify-center"
          aria-label="Previous month"
        >
          ◀
        </button>
        <span className="text-sm font-medium text-gray-700">
          {format(props.calendarMonth?.date || new Date(), 'MMMM yyyy')}
        </span>
        <button
          type="button"
          onClick={() => nextMonth && goToMonth(nextMonth)}
          disabled={!nextMonth}
          className="h-7 w-7 rounded-full border border-gray-300 hover:bg-gray-100 text-gray-900 disabled:opacity-40 flex items-center justify-center"
          aria-label="Next month"
        >
          ▶
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 border border-gray-200 rounded-md text-sm bg-white hover:bg-gray-50 text-gray-700"
      >
        {label}
      </button>
      {open && (
        <div className="absolute z-10 mt-2 bg-white border border-gray-200 rounded-lg shadow-sm p-2">
          <DayPicker
            mode="range"
            selected={selected}
            onSelect={handleSelect}
            numberOfMonths={1}
            showOutsideDays={false}
            hideNavigation
            components={{ MonthCaption: TopCaption }}
            className="rdp"
            classNames={{
              months: 'flex gap-3',
              month: 'space-y-2',
              caption: 'px-1 pt-1 pb-2',
              caption_label: 'hidden',
              nav: 'hidden',
              nav_button: 'hidden',
              table: 'border-collapse',
              head_cell: 'text-xs font-medium text-gray-500 w-9',
              cell: 'text-center p-0',
              day: 'h-8 w-8 rounded text-sm hover:bg-gray-100 text-gray-700',
              day_selected: 'bg-gray-900 text-white hover:bg-gray-900',
              day_range_start: 'bg-gray-900 text-white',
              day_range_end: 'bg-gray-900 text-white',
              day_range_middle: 'bg-gray-200 text-gray-800',
              day_today: 'border border-gray-300',
              weekday: 'text-xs text-gray-500'
            }}
            // Neutralize default blue accent using CSS variables
            style={{
              '--rdp-accent-color': '#111827',
              '--rdp-background-color': '#e5e7eb'
            }}
          />
        </div>
      )}
    </div>
  );
}

export default DateRangePicker;


