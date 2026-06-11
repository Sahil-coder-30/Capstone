# Guide: Setting Up a Web Code Editor for Your Sandbox Environment

To give users a premium experience where they can view, edit, and fix files inside the sandbox alongside the AI agent, you can implement one of two patterns:

1. **Option A: The Lightweight Web IDE (Monaco + Existing API)** — Frontend uses Monaco Editor (the engine behind VS Code) and talks directly to your existing Agent File APIs. (Recommended for performance and simplicity).
2. **Option B: The Cloud IDE Container (code-server)** — Adding a full VS Code container inside the Kubernetes Pod that shares the `/workspace` volume.

---

## Option A: The Lightweight Web IDE (Monaco + Existing API)

Instead of spinning up a heavy new container, the frontend renders **Monaco Editor** in the browser. It loads and saves files using the Express API endpoints already implemented in your `agent-container` (`/api/agent/read-file` and `/api/agent/update-file`).

### How It Works:
```
Browser (Monaco Editor UI)
  ├── 1. Get file list    ──> /api/agent/list-files
  ├── 2. Fetch file content ──> /api/agent/read-file?files=src/App.jsx
  └── 3. Save file edits  ──> PATCH /api/agent/update-file
```

### Frontend Implementation (React Example):
You can install `@monaco-editor/react` in your dashboard interface.

```javascript
import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import axios from 'axios';

export function CodeEditor({ sandboxId, activeFile }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  // Load file content when activeFile changes
  useEffect(() => {
    if (!activeFile) return;
    setLoading(true);
    axios.get(`http://${sandboxId}.agent.localhost/api/agent/read-file?files=${activeFile}`)
      .then(res => {
        const fileData = res.data.files.find(f => f.file === activeFile);
        setCode(fileData?.content || '');
      })
      .finally(() => setLoading(false));
  }, [activeFile, sandboxId]);

  // Save changes when user presses Ctrl+S / Cmd+S
  const handleSave = () => {
    axios.patch(`http://${sandboxId}.agent.localhost/api/agent/update-file`, {
      updates: [{ file: activeFile, content: code }]
    }).then(() => alert('Saved successfully!'));
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px', background: '#1e1e1e', color: '#fff', display: 'flex', justifyContent: 'space-between' }}>
        <span>Editing: {activeFile}</span>
        <button onClick={handleSave} style={{ background: '#007acc', color: '#fff', border: 'none', padding: '4px 12px', cursor: 'pointer' }}>
          Save (Cmd+S)
        </button>
      </div>
      <Editor
        height="100%"
        theme="vs-dark"
        path={activeFile}
        value={code}
        onChange={(value) => setCode(value || '')}
        loading={loading ? "Loading..." : undefined}
      />
    </div>
  );
}
```

---

## Option B: The Cloud IDE Container (code-server)

If you want to give the user a **complete VS Code interface** (with their custom extension support, native file trees, search-in-files, and terminals) in their browser, you can run a `code-server` sidecar container inside each sandbox pod.

### 1. Update the Kubernetes Pod Manifest
Modify your pod creator in [pod.js](file:///Users/home/Desktop/Capstone/Sandbox/server/src/kubernetes/pod.js) to add the `code-server` container:

```javascript
// Inside the containers array in createPod function:
containers: [
  // ... your existing sandbox-container and agent-container ...
  {
    image: "codercom/code-server:latest",
    imagePullPolicy: "IfNotPresent",
    name: "editor-container",
    ports: [{ containerPort: 8080, name: "editor-port" }],
    env: [
      {
        name: "PASSWORD",
        value: "sandbox-password-123" // Set editor access password
      }
    ],
    args: [
      "--auth", "password",
      "--bind-addr", "0.0.0.0:8080",
      "/workspace" // Automatically open the workspace folder
    ],
    resources: {
      limits: {
        cpu: "500m",
        memory: "512Mi",
      },
      requests: {
        cpu: "250m",
        memory: "256Mi",
      },
    },
    volumeMounts: [
      {
        name: "workspace-volume",
        mountPath: "/workspace",
      },
    ],
  }
]
```

### 2. Update the Kubernetes Service Manifest
Expose port `8080` in [service.js](file:///Users/home/Desktop/Capstone/Sandbox/server/src/kubernetes/service.js):

```javascript
ports: [
  // ... existing port 80 and 3000 mapping ...
  {
    protocol: 'TCP',
    port: 8080,
    targetPort: 8080,
    name: 'editor-port'
  }
]
```

### 3. Update the Router proxy rules
Expose the editor sub-domain (e.g. `http://{sandboxId}.editor.localhost`) in your proxy service [app.js](file:///Users/home/Desktop/Capstone/Sandbox/router/src/app.js):

```javascript
// 1. Add Editor Proxy Cache
const editorProxyies = {};

const getEditorProxy = (sandboxId) => {
    if(!editorProxyies[sandboxId]){
        editorProxyies[sandboxId] = createProxyMiddleware({
            target: `http://sandbox-service-${sandboxId}:8080`,
            changeOrigin: true,
            ws: true, // Crucial for terminal streams inside VS Code
        });
    }
    return editorProxyies[sandboxId];
};

// 2. Add sub-domain routing handler
app.use((req, res , next) => {
    const host = req.headers.host;
    const sandboxId = host.split('.')[0];
    const targetHost = host.split('.')[1];

    if(targetHost === 'editor'){
        return getEditorProxy(sandboxId)(req, res, next);
    }
    else if(targetHost === 'agent'){
        return getAgentProxy(sandboxId)(req, res, next);
    }
    else if(targetHost === 'preview'){
        return getProxyies(sandboxId)(req, res, next);
    }
})
```

---

## Comparison: Which Option Should You Choose?

| Feature | Option A: Monaco Editor | Option B: Cloud IDE Container |
| :--- | :--- | :--- |
| **Memory Cost** | **0 MB** (Runs entirely on client browser) | **~250-500 MB** RAM per Pod |
| **Startup Speed** | Instant | Requires downloading/spinning up container |
| **User Experience** | Clean, minimalist, embedded directly in your UI | Embedded iframe containing full VS Code |
| **Key Advantage** | High control over UI. Easy to synchronize with the AI Agent's actions in real-time. | Out-of-the-box support for extensions, search-in-files, git integration. |
