import { useEffect, useRef } from 'react';
import FileIcon from '../../../../components/FileIcon';
import './FileSuggestions.scss';

/** File menu shared by the @ mention and the attach button. */
export default function FileSuggestions({ items, activeIndex = -1, onPick }) {
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <ul ref={listRef} className="orion-file-menu" role="listbox" aria-label="Project files">
      {items.length === 0 && <li className="orion-file-menu__empty">No files available</li>}
      {items.map((file, index) => (
        <li key={file} role="option" aria-selected={index === activeIndex}>
          <button
            type="button"
            className={`orion-file-menu__item ${index === activeIndex ? 'orion-file-menu__item--active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(file)}
          >
            <FileIcon filename={file} size={12} />
            <span className="orion-file-menu__path">{file}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
