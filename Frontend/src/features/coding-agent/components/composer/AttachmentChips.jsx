import { X } from 'lucide-react';
import FileIcon from '../../../../components/FileIcon';
import './AttachmentChips.scss';

/** Files attached to the next message. */
export default function AttachmentChips({ files, onRemove }) {
  return (
    <ul className="orion-attachments">
      {files.map((file) => (
        <li key={file.path} className="orion-attachments__chip">
          <FileIcon filename={file.name} size={11} />
          <span className="orion-attachments__name" title={file.path}>{file.name}</span>
          <button
            type="button"
            className="orion-attachments__remove"
            onClick={() => onRemove(file.path)}
            aria-label={`Remove ${file.name}`}
          >
            <X size={10} />
          </button>
        </li>
      ))}
    </ul>
  );
}
