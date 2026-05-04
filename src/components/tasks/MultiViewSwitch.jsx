import Icon from '../Icon.jsx';

const VIEWS = [
  { id: 'board',    icon: 'columns',  label: 'Board'      },
  { id: 'list',     icon: 'list',     label: 'Lista'      },
  { id: 'calendar', icon: 'calendar', label: 'Calendário' },
];

export default function MultiViewSwitch({ view, setView }) {
  return (
    <div className="mv-switch">
      {VIEWS.map(v => (
        <button
          key={v.id}
          className={`mv-btn${view === v.id ? ' active' : ''}`}
          onClick={() => setView(v.id)}
          title={v.label}
        >
          <Icon name={v.icon} size={13} />
          {v.label}
        </button>
      ))}
    </div>
  );
}
