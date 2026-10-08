// guards.js
// Shared tool-guard middleware for all agent nodes.
// Prevents misuse of execute_command for file operations that have
// dedicated tools (readFile, createFile, updateFile, etc.).

const guardedToolInvokes = new WeakSet();

const TOOL_RULES = {
  list_files: {
    description: "List all files in the workspace.",
    block: null,
  },
  read_file: {
    description: "Read ANY file content. Never use executeCommand to read files.",
    block: null,
  },
  create_file: {
    description: "Create a new file with content.",
    block: null,
  },
  update_file: {
    description: "Edit an existing file by replacing its entire content.",
    block: null,
  },
  patch_file: {
    description: "Targeted surgical replacement in a file. Preferred for changes under 20 lines.",
    block: null,
  },
  execute_command: {
    description: "Shell only. Valid: npm install, mkdir, git, rm. NOT for reading files.",
    block: {
      patterns: [
        /^\s*cat /,
        /^\s*head /,
        /^\s*tail /,
        /^\s*echo .+>/,
        /^\s*touch /,
        /^\s*cp /,
        /^\s*mv /,
        /^\s*sed /,
        /^\s*awk /,
        /^\s*grep /,
      ],
      message: "WRONG TOOL. Use readFile/createFile/updateFile for file operations, not shell commands.",
    },
  },
  get_vite_runtime_errors: {
    description: "Fetch live Vite dev server runtime errors.",
    block: null,
  },
  delete_file: {
    description: "Delete one or more files in the workspace.",
    block: null,
  },
  search_code: {
    description: "Search for a text pattern across the entire codebase.",
    block: null,
  },
  search_internet: {
    description: "Search the internet using Tavily for documentation or library info.",
    block: null,
  },
};

/**
 * Applies description overrides and shell-command guards to a list of tools.
 * Safe to call multiple times — guards are applied only once per tool instance.
 *
 * @param {Array} tools - Array of LangChain tool instances
 * @returns {Array} The same tools with guards applied
 */
export function applyGuards(tools) {
  return tools.map((toolInstance) => {
    const rule = TOOL_RULES[toolInstance.name];
    if (!rule) return toolInstance;

    // Override description if defined
    if (rule.description) toolInstance.description = rule.description;

    // Apply blocking guard only once per instance
    if (rule.block && !guardedToolInvokes.has(toolInstance)) {
      const original = toolInstance.invoke.bind(toolInstance);

      toolInstance.invoke = async (input, config) => {
        const cmd =
          input?.command ?? input?.cmd ?? Object.values(input ?? {})[0] ?? "";
        const segments = String(cmd).split(/&&|\|\||;|\|/);
        const blocked = segments.some((segment) =>
          rule.block.patterns.some((p) => p.test(segment))
        );
        if (blocked) return { error: rule.block.message };
        return original(input, config);
      };

      guardedToolInvokes.add(toolInstance);
    }

    return toolInstance;
  });
}
