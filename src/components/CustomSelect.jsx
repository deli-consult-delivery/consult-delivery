import { useEffect, useRef, useState, useCallback } from 'react';
import Icon from './Icon.jsx';

function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
  disabled = false,
  groups = false,
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const containerRef = useRef(null);

  const flat = groups
    ? options.flatMap(g => [{ _type:'group', label:g.label }, ...g.items.map(i => ({ _type:'item', ...i }))])
    : options.map(o => (typeof o === 'string' ? { value: o, label: o } : o));

  const selectedItem = flat.find(f => f.value === value);
  const itemCount = flat.filter(f => f._type !== 'group').length;

  const openDropdown = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    const selIdx = flat.findIndex(f => f.value === value && f._type !== 'group');
    setHighlighted(selIdx >= 0 ? selIdx : flat.findIndex(f => f._type !== 'group'));
  }, [disabled, flat, value]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  function selectOption(opt) {
    if (opt._type === 'group') return;
    onChange(opt.value);
    closeDropdown();
  }

  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) closeDropdown();
    }
    if (open) {
      document.addEventListener('mousedown', onClickOutside);
      return () => document.removeEventListener('mousedown', onClickOutside);
    }
  }, [open, closeDropdown]);

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.querySelector(`[data-index="${highlighted}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted, open]);

  function onKeyDown(e) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDropdown();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeDropdown();
        break;
      case 'ArrowDown': {
        e.preventDefault();
        let next = highlighted + 1;
        while (next < flat.length && flat[next]._type === 'group') next++;
        if (next < flat.length) setHighlighted(next);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        let prev = highlighted - 1;
        while (prev >= 0 && flat[prev]._type === 'group') prev--;
        if (prev >= 0) setHighlighted(prev);
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const opt = flat[highlighted];
        if (opt && opt._type !== 'group') selectOption(opt);
        break;
      }
      case 'Tab':
        closeDropdown();
        break;
      default:
        break;
    }
  }

  const isOpen = open && !disabled;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (isOpen ? closeDropdown() : openDropdown())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        role="combobox"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: compact ? '4px 8px' : '12px 16px',
          background: disabled ? '#151515' : '#1a1a1a',
          border: `1px solid ${isOpen ? '#e63946' : '#2a2a2a'}`,
          borderRadius: 8,
          color: selectedItem ? '#ffffff' : '#9ca3af',
          fontSize: compact ? 12 : 14,
          fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 200ms ease, box-shadow 200ms ease',
          boxShadow: isOpen ? '0 0 0 2px rgba(230,57,70,0.2)' : 'none',
          textAlign: 'left',
          minHeight: compact ? 28 : 44,
        }}
        onMouseEnter={e => { if (!disabled && !isOpen) e.currentTarget.style.borderColor = '#e63946'; }}
        onMouseLeave={e => { if (!disabled && !isOpen) e.currentTarget.style.borderColor = '#2a2a2a'; }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedItem ? selectedItem.label : placeholder}
        </span>
        <span style={{
          display: 'inline-flex',
          transition: 'transform 200ms ease',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          flexShrink: 0,
          marginLeft: compact ? 4 : 8,
        }}>
          <Icon name="chevdown" size={compact ? 12 : 16} />
        </span>
      </button>

      {isOpen && (
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 100,
            background: '#1e1e1e',
            border: '1px solid #2a2a2a',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            maxHeight: 240,
            overflowY: 'auto',
            animation: 'csFadeIn 150ms ease-out',
          }}
        >
          <style>{`
            @keyframes csFadeIn {
              from { opacity: 0; transform: translateY(-6px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            .cs-scroll::-webkit-scrollbar { width: 4px; }
            .cs-scroll::-webkit-scrollbar-track { background: #1a1a1a; }
            .cs-scroll::-webkit-scrollbar-thumb { background: #3a3a3a; border-radius: 4px; }
            .cs-scroll::-webkit-scrollbar-thumb:hover { background: #e63946; }
          `}</style>
          <div className="cs-scroll">
            {flat.map((opt, idx) => {
              if (opt._type === 'group') {
                return (
                  <div key={`g-${idx}`} style={{
                    padding: compact ? '6px 10px 2px' : '8px 16px 4px',
                    fontSize: compact ? 10 : 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                    color: '#6b7280',
                    borderTop: idx > 0 ? '1px solid #2a2a2a' : 'none',
                  }}>
                    {opt.label}
                  </div>
                );
              }

              const isSelected = opt.value === value;
              const isHighlighted = idx === highlighted;

              return (
                <div
                  key={`i-${idx}`}
                  data-index={idx}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => selectOption(opt)}
                  onMouseEnter={() => setHighlighted(idx)}
                  style={{
                    padding: compact ? '6px 10px' : '10px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: isHighlighted ? '#2a2a2a' : 'transparent',
                    color: isSelected ? '#e63946' : '#ffffff',
                    fontSize: compact ? 12 : 14,
                    transition: 'background 100ms ease',
                  }}
                >
                  <span>{opt.label}</span>
                  {isSelected && (
                    <span style={{ display: 'inline-flex', flexShrink: 0, marginLeft: 8 }}>
                      <Icon name="check" size={14} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomSelect;
