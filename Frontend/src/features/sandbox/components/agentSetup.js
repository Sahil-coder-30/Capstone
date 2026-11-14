// agentSetup.js
// Setup for external MCP clients: a prompt the user pastes into their own
// agent (the agent writes the config itself), a one-click install link where
// the client has one, and the manual config as a fallback.

const SERVER_NAME = 'taksha';

const header = (token) => `Bearer ${token || '<your-token>'}`;

const json = (value) => JSON.stringify(value, null, 2);

const RULES = 'Rules: never print, repeat or log the token in your replies, and do not store it anywhere other than this MCP config.';

const TRY_IT = `call the ${SERVER_NAME} list_files tool and tell me how many files my Taksha project has`;

/** Adds the server to a JSON config file under "mcpServers", keeping the other servers. */
const jsonConfigSteps = (fileStep, entry) => `${fileStep}
2. Inside "mcpServers", add the "${SERVER_NAME}" entry below, or replace it if it already exists:

${json({ [SERVER_NAME]: entry })}

   Keep every other server exactly as it is. The file must stay valid JSON (no comments).`;

export const AGENTS = [
  {
    id: 'claude',
    label: 'Claude Code',
    hint: 'Paste into Claude Code. It runs the setup command for you.',
    prompt: (url, token) => `Connect Claude Code to my Taksha CodeSpace sandbox, a remote MCP server. Do these steps yourself, one by one:

1. Run: claude mcp remove ${SERVER_NAME} --scope user
   It is fine if this fails because "${SERVER_NAME}" does not exist yet.
2. Run: claude mcp add --transport http --scope user ${SERVER_NAME} ${url} --header "Authorization: ${header(token)}"
3. Run: claude mcp list and check that "${SERVER_NAME}" shows Connected. If it does not, tell me the exact error.
4. Tell me to restart Claude Code so the ${SERVER_NAME} tools load, and that after the restart I can ask: "${TRY_IT}".

${RULES}`,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    hint: 'One click installs it in Cursor. Or paste the prompt into Cursor chat (Agent mode).',
    installLink: (url, token) => {
      const config = btoa(JSON.stringify({ url, headers: { Authorization: header(token) } }));
      return `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${encodeURIComponent(config)}`;
    },
    prompt: (url, token) => `Connect Cursor to my Taksha CodeSpace sandbox, a remote MCP server. Do these steps yourself:

${jsonConfigSteps(
  '1. Open ~/.cursor/mcp.json in my home folder. If it does not exist, create it with {"mcpServers": {}}.',
  { url, headers: { Authorization: header(token) } },
)}
3. Tell me to open Cursor Settings > MCP and check that "${SERVER_NAME}" is on with a green dot. Then ${TRY_IT}.

${RULES}`,
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    hint: 'Paste into the Antigravity agent. It edits its MCP config for you.',
    prompt: (url, token) => `Connect Antigravity to my Taksha CodeSpace sandbox, a remote MCP server. Do these steps yourself:

${jsonConfigSteps(
  `1. Find the Antigravity MCP config in my home folder: use ~/.gemini/antigravity/mcp_config.json if it exists, else ~/.gemini/config/mcp_config.json if it exists, else create ~/.gemini/antigravity/mcp_config.json with {"mcpServers": {}}.`,
  { serverUrl: url, headers: { Authorization: header(token) } },
)}
3. Tell me to open the Agent panel menu > MCP Servers > Manage MCP Servers and press Refresh. Then ${TRY_IT}.

${RULES}`,
  },
  {
    id: 'other',
    label: 'Other',
    hint: 'For any MCP client that supports remote servers.',
    prompt: (url, token) => `Connect to my Taksha CodeSpace sandbox, a remote MCP server. Add it to your MCP settings under the name "${SERVER_NAME}", keeping every other server as it is:

- Transport: Streamable HTTP
- URL: ${url}
- Header: Authorization: ${header(token)}

Then ${TRY_IT}.

${RULES}`,
  },
];

/** Manual config for users who prefer to set it up by hand. */
export const manualSnippets = (url, token) => [
  {
    id: 'claude',
    title: 'Claude Code (terminal)',
    code: `claude mcp add --transport http --scope user ${SERVER_NAME} ${url} --header "Authorization: ${header(token)}"`,
  },
  {
    id: 'cursor',
    title: 'Cursor (~/.cursor/mcp.json)',
    code: json({ mcpServers: { [SERVER_NAME]: { url, headers: { Authorization: header(token) } } } }),
  },
  {
    id: 'antigravity',
    title: 'Antigravity (mcp_config.json)',
    code: json({ mcpServers: { [SERVER_NAME]: { serverUrl: url, headers: { Authorization: header(token) } } } }),
  },
];
