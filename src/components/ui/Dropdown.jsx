import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import './Dropdown.css';

export function useClickOutside(onClose) {
  const ref = useRef(null);

  useEffect(() => {
    const onMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return ref;
}

export default function Dropdown({
  value,
  options = [],
  onChange = () => {},
  placeholder = 'Select…'
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  const items = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o
  );
  const current = items.find((i) => i.value === value);

  return (
    <div className={`dropdown${open ? ' open' : ''}`} ref={ref}>
      <button
        type="button"
        className="dropdown-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={current ? '' : 'dropdown-placeholder'}>
          {current?.label ?? placeholder}
        </span>
        <ChevronDown size={15} className="dropdown-chevron" />
      </button>

      {open && (
        <div className="dropdown-panel">
          {items.map((item) => (
            <button
              type="button"
              key={item.value}
              className={`dropdown-option${item.value === value ? ' selected' : ''}`}
              onClick={() => {
                onChange(item.value);
                setOpen(false);
              }}
            >
              <span>{item.label}</span>
              {item.value === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
