import { useState } from 'react';
import Icon from '../Icon.jsx';

const PRIORITY_COLORS = {
  high: { bg: '#FEE2E2', text: '#B91C1C' },
  med:  { bg: '#FEF3C7', text: '#92400E' },
  low:  { bg: '#D1FAE5', text: '#065F46' },
};
const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function parseDue(label) {
  if (!label) return null;
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const l     = label.trim().toLowerCase();
  if (l === 'hoje') return today;
  if (l === 'amanhã' || l === 'amanha') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }
  const m = label.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (m) {
    const year = m[3] ? parseInt(m[3]) : now.getFullYear();
    const d = new Date(year, parseInt(m[2]) - 1, parseInt(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function TaskCalendar({ tasks, onEdit }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();

  function prevMonth() { setViewDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setViewDate(new Date(year, month + 1, 1)); }
  function goToday()   { setViewDate(new Date(today.getFullYear(), today.getMonth(), 1)); }

  // Build calendar cells
  const firstDay   = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays    = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, prevDays - i), current: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), current: true });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: new Date(year, month + 1, cells.length - daysInMonth - firstDay + 1), current: false });
  }

  // Map tasks to dates
  const tasksWithDate    = tasks.map(t => ({ ...t, parsedDate: parseDue(t.due) }));
  const tasksWithoutDate = tasksWithDate.filter(t => !t.parsedDate);
  const tasksWithDates   = tasksWithDate.filter(t => !!t.parsedDate);

  function tasksForDay(date) {
    return tasksWithDates.filter(t => sameDay(t.parsedDate, date));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn-icon" onClick={prevMonth} title="Mês anterior"><Icon name="chevleft" size={16} /></button>
        <button className="btn-icon" onClick={nextMonth} title="Próximo mês"><Icon name="chevright" size={16} /></button>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)', minWidth: 160 }}>
          {MONTH_NAMES[month]} {year}
        </span>
        <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={goToday}>Hoje</button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--g-500)' }}>
          {tasks.length} tarefa{tasks.length !== 1 ? 's' : ''} · {tasksWithDates.length} com data
        </span>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 1 }}>
        {DAY_NAMES.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--g-400)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 0' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="cal-grid">
        {cells.map((cell, idx) => {
          const isToday   = sameDay(cell.date, today);
          const dayTasks  = tasksForDay(cell.date);
          const CHIP_LIMIT = 3;
          return (
            <div
              key={idx}
              className={`cal-cell${!cell.current ? ' other-month' : ''}${isToday ? ' today' : ''}`}
            >
              <div className="cal-day-num">{cell.date.getDate()}</div>
              {dayTasks.slice(0, CHIP_LIMIT).map(t => {
                const c = PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.med;
                return (
                  <div
                    key={t.id}
                    className="cal-task-chip"
                    style={{ background: c.bg, color: c.text }}
                    onClick={() => onEdit(t)}
                    title={t.title}
                  >
                    {t.title}
                  </div>
                );
              })}
              {dayTasks.length > CHIP_LIMIT && (
                <div style={{ fontSize: 10, color: 'var(--g-400)', paddingLeft: 2 }}>
                  +{dayTasks.length - CHIP_LIMIT} mais
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tasks without date */}
      {tasksWithoutDate.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--g-500)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Sem data definida ({tasksWithoutDate.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tasksWithoutDate.map(t => {
              const c = PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.med;
              return (
                <div
                  key={t.id}
                  onClick={() => onEdit(t)}
                  style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 9999, background: c.bg, color: c.text, cursor: 'pointer' }}
                >
                  {t.title}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
