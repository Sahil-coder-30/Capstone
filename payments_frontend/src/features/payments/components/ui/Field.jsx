import { ChevronDown, Search, X } from 'lucide-react';
import './Field.scss';

export function SearchInput({ value, onChange, placeholder = 'Search', label = 'Search' }) {
  return (
    <label className="field field--search">
      <Search size={14} aria-hidden="true" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" className="field__clear" aria-label="Clear search" onClick={() => onChange('')}>
          <X size={13} />
        </button>
      )}
    </label>
  );
}

/** Native select styled to match. options: [{ id, label }] */
export function Select({ value, onChange, options, label }) {
  return (
    <label className="field field--select">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </label>
  );
}
