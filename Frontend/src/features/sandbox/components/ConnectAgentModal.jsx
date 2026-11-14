import { useState } from 'react';
import { X, Plug, Copy, Check, Trash2, AlertTriangle, KeyRound, Loader2, Download } from 'lucide-react';
import { useMcpTokens } from '../Hooks/mcpTokens.hooks';
import { AGENTS, manualSnippets } from './agentSetup';
import './ConnectAgentModal.scss';

const EXPIRY_OPTIONS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

const SCOPE_LABEL = { read: 'Read', write: 'Write', exec: 'Run commands' };

const formatDate = (value) => (value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'never');

function CopyButton({ text, label = 'Copy', className = 'connect-agent__copy' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  );
}

/** Per-agent setup: a prompt to paste into the agent, plus one-click install where the client has one. */
function AgentSetup({ mcpUrl, token }) {
  const [agentId, setAgentId] = useState(AGENTS[0].id);
  const agent = AGENTS.find((a) => a.id === agentId);
  const prompt = agent.prompt(mcpUrl, token);

  return (
    <div className="connect-agent__setup">
      <div className="connect-agent__tabs" role="tablist" aria-label="Your agent">
        {AGENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={a.id === agentId}
            className={`connect-agent__tab${a.id === agentId ? ' connect-agent__tab--active' : ''}`}
            onClick={() => setAgentId(a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="connect-agent__setup-body" role="tabpanel">
        <p className="connect-agent__muted">{agent.hint}</p>
        <div className="connect-agent__actions">
          {agent.installLink && (
            <a className="connect-agent__primary" href={agent.installLink(mcpUrl, token)}>
              <Download size={13} />
              <span>Add to {agent.label}</span>
            </a>
          )}
          <CopyButton text={prompt} label="Copy setup prompt" className="connect-agent__primary" />
        </div>
        <details className="connect-agent__details">
          <summary>Show prompt</summary>
          <pre>{prompt}</pre>
        </details>
      </div>
    </div>
  );
}

/**
 * "Connect your own agent": create MCP tokens so Claude Code, Cursor or any
 * MCP client can work in this project's sandbox.
 */
export default function ConnectAgentModal({ projectId, onClose }) {
  const { tokens, mcpUrl, loading, error, newToken, clearNewToken, create, revoke } = useMcpTokens(projectId);
  const [name, setName] = useState('Claude Code');
  const [allowWrite, setAllowWrite] = useState(true);
  const [allowExec, setAllowExec] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    const scopes = ['read', ...(allowWrite ? ['write'] : []), ...(allowExec ? ['exec'] : [])];
    await create({ name: name.trim(), scopes, expiresInDays });
    setCreating(false);
  };

  return (
    <div className="connect-agent__overlay" onClick={onClose}>
      <div className="connect-agent" role="dialog" aria-labelledby="connect-agent-title" onClick={(e) => e.stopPropagation()}>
        <header className="connect-agent__header">
          <div className="connect-agent__title">
            <Plug size={16} />
            <h2 id="connect-agent-title">Connect your own agent</h2>
          </div>
          <button type="button" className="connect-agent__close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <p className="connect-agent__intro">
          Use Claude Code, Cursor, Antigravity or any MCP client to work in this project&apos;s sandbox. Create a token, then paste one prompt into your agent. A stopped sandbox starts on the first call.
        </p>

        {error && <div className="connect-agent__error">{error}</div>}

        {newToken ? (
          <section className="connect-agent__created">
            <div className="connect-agent__warning">
              <KeyRound size={14} />
              <span>Copy this token now. It will not be shown again.</span>
            </div>
            <div className="connect-agent__token">
              <code>{newToken.token}</code>
              <CopyButton text={newToken.token} />
            </div>

            <h3>Connect your agent</h3>
            <AgentSetup mcpUrl={mcpUrl} token={newToken.token} />
            <div className="connect-agent__warning">
              <AlertTriangle size={14} />
              <span>The prompt and the install link contain your token. Paste them only into your own agent.</span>
            </div>

            <details className="connect-agent__details">
              <summary>Manual setup</summary>
              {manualSnippets(mcpUrl, newToken.token).map((s) => (
                <div key={s.id} className="connect-agent__snippet">
                  <div className="connect-agent__snippet-head">
                    <span>{s.title}</span>
                    <CopyButton text={s.code} />
                  </div>
                  <pre>{s.code}</pre>
                </div>
              ))}
            </details>
            <button type="button" className="connect-agent__primary" onClick={clearNewToken}>Done</button>
          </section>
        ) : (
          <form className="connect-agent__form" onSubmit={handleCreate}>
            <label className="connect-agent__field">
              <span>Name</span>
              <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Claude Code on my laptop" required />
            </label>

            <fieldset className="connect-agent__scopes">
              <legend>Access</legend>
              <label><input type="checkbox" checked disabled /> Read files and logs</label>
              <label><input type="checkbox" checked={allowWrite} onChange={(e) => setAllowWrite(e.target.checked)} /> Create and edit files</label>
              <label><input type="checkbox" checked={allowExec} onChange={(e) => setAllowExec(e.target.checked)} /> Run commands (npm install, build)</label>
              {allowExec && (
                <div className="connect-agent__warning connect-agent__warning--danger">
                  <AlertTriangle size={14} />
                  <span>Commands get a full shell in your sandbox. Anyone with this token can run anything there.</span>
                </div>
              )}
            </fieldset>

            <label className="connect-agent__field">
              <span>Expires after</span>
              <select value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value))}>
                {EXPIRY_OPTIONS.map((o) => <option key={o.days} value={o.days}>{o.label}</option>)}
              </select>
            </label>

            <button type="submit" className="connect-agent__primary" disabled={creating || !name.trim()}>
              {creating ? <Loader2 size={13} className="connect-agent__spin" /> : <KeyRound size={13} />}
              <span>Create token</span>
            </button>
          </form>
        )}

        <section className="connect-agent__list">
          <h3>Active tokens</h3>
          {loading && !tokens.length ? (
            <p className="connect-agent__muted">Loading…</p>
          ) : tokens.length === 0 ? (
            <p className="connect-agent__muted">No tokens yet.</p>
          ) : (
            <ul>
              {tokens.map((t) => (
                <li key={t.id}>
                  <div>
                    <strong>{t.name}</strong>
                    <span className="connect-agent__muted">
                      {t.prefix}… · {t.scopes.map((s) => SCOPE_LABEL[s] || s).join(', ')} · expires {formatDate(t.expiresAt)} · last used {formatDate(t.lastUsedAt)}
                    </span>
                  </div>
                  <button type="button" className="connect-agent__revoke" onClick={() => revoke(t.id)} title="Revoke">
                    <Trash2 size={13} />
                    <span>Revoke</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {mcpUrl && (
            <p className="connect-agent__muted connect-agent__url">
              MCP URL: <code>{mcpUrl}</code>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
