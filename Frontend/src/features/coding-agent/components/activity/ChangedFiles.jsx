import FileIcon from '../../../../components/FileIcon';
import './ChangedFiles.scss';

const TAGS = { create: 'New', update: 'Edited', delete: 'Deleted' };

/** What the run changed in the workspace. */
export default function ChangedFiles({ files, onOpenFile }) {
  return (
    <section className="orion-changed" aria-label="Changed files">
      <h3 className="orion-changed__title">
        {files.length} {files.length === 1 ? 'file' : 'files'} changed
      </h3>
      <ul className="orion-changed__list">
        {files.map(({ path, type }) => (
          <li key={path}>
            <button
              type="button"
              className="orion-changed__row"
              onClick={() => onOpenFile(path)}
              disabled={type === 'delete'}
              title={path}
            >
              <FileIcon filename={path} size={12} />
              <span className="orion-changed__path">{path}</span>
              <span className={`orion-changed__tag orion-changed__tag--${type}`}>{TAGS[type]}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
