# Tool Usage Guidelines

This skill guides the efficient and perfect usage of the 7 available tools.

## The 7 Available Tools

### 1. `list_files`
* **Description**: Lists all relative file and directory paths in the workspace.
* **Efficient Usage**: 
  - Call **exactly once** at the very beginning of a task to map the project structure.
  - Never call repeatedly or redundantly in the same session.

### 2. `read_file`
* **Description**: Reads the content of one or more files in the workspace.
* **Parameters**: `file` (array of relative file paths).
* **Efficient Usage**:
  - Proactively read configuration files (like `package.json` or `vite.config.js`) to check settings and dependencies.
  - Read files before editing to understand context and ensure edits are correct.
  - You can read multiple files in a single call by passing them as a list. Do not make multiple sequential calls to read files when you can batch them.

### 3. `create_file`
* **Description**: Creates a new file with content in the workspace.
* **Parameters**: `file` (relative path), `content` (file content).
* **Efficient Usage**:
  - Always use this tool (not `execute_command` with echo/touch) to initialize a new file.
  - Only write one file per turn to respect the checklist sequence.

### 4. `update_file`
* **Description**: Rewrites the entire content of an existing file.
* **Parameters**: `file` (relative path), `content` (full new file content).
* **Efficient Usage**:
  - Use this tool for modifying existing files.
  - Ensure you read the file first to preserve any existing code/comments that shouldn't be touched.

### 5. `delete_file`
* **Description**: Deletes one or more files/directories.
* **Parameters**: `files` (array of relative paths).
* **Efficient Usage**:
  - Batch all files/directories to delete into a single call.
  - Use only when cleaning up files or when requested.

### 6. `execute_command`
* **Description**: Runs shell commands inside the container.
* **Parameters**: `command` (the command to run).
* **Efficient Usage**:
  - **Allowed commands**: `npm install <package>`, `rm <file>`, `mkdir <directory>`, and `git <command>`.
  - **Strictly Forbidden**: Never use to inspect files (e.g. `cat`, `grep`, `head`, `tail`) or modify/create files (e.g. `echo`, `touch`, `cp`, `mv`, `sed`, `awk`). Use the specific file tools instead.

### 7. `get_vite_runtime_errors`
* **Description**: Fetches live Vite runtime/compiler errors from the application console and network.
* **Efficient Usage**:
  - Call only **after** you have made all changes and ticked off the `todo.md` items.
  - Inspect any reported compiler errors or warnings, locate the files, fix them, and run verification again.

---

## Hard Rules of Tool Execution
1. **Always read before editing**: Never write or update a file without first reading it to understand its structure.
2. **One file modification per turn**: Do not attempt to modify multiple source code files in a single step.
3. **Checklist integration**: Update `todo.md` using `update_file` immediately after completing any change.
4. **Never ignore compiler warnings/errors**: Always verify that `get_vite_runtime_errors` returns clean before declaring success.
