# Frontend Codegen Workflow

Use this skill for any React+Vite build/edit task in the sandbox.

## Available Tools (8)
You have access to exactly 8 tools. Always invoke them using their exact snake_case names:
1. `list_files`: List all files in the project directory.
2. `read_file`: Read contents of one or more files.
3. `create_file`: Create a new file with content.
4. `update_file`: Rewrite an existing file completely.
5. `patch_file`: Make a targeted, surgical line-level replacement in a file.
6. `delete_file`: Delete files or directories.
7. `execute_command`: Run shell commands (limited to package installs, folder creation, git commands, and file deletions).
8. `get_vite_runtime_errors`: Fetch active Vite runtime and compiler console/network errors.

---

## Workflow Steps

1. **Explore**:
   - Call `list_files` once at the start of the task to understand the structure.
   - Call `read_file` on `package.json` to inspect dependencies.

2. **Clean Canvas (Vite Templates)**:
   - When starting a new project or working from a Vite boilerplate template, clear out or reset all prewritten default template files (`src/App.jsx` or `App.js`/`App.tsx`, `src/index.css`, `src/App.css`) completely so you build on a clean canvas without leftover starter boilerplate or styles.

3. **Plan**:
   - Create a `todo.md` checklist using `create_file`.
   - Write exactly one line per task in the checklist using this format:
     `[ ] N. action: filename — description of why`

4. **Install** (Optional):
   - Only if a package needed for the implementation is missing from `package.json`, install it using `execute_command` (e.g., `npm install <package-name>`), one package at a time.

5. **Build** (One file per turn):
   - Create or edit exactly one file at a time using `create_file` or `update_file`.
   - Immediately tick off the completed item in `todo.md` by rewriting/updating it using `update_file` (changing `[ ] N.` to `[x] N.`).
   - Do not modify or start working on any subsequent files until the current checklist item is ticked off.

6. **Verify**:
   - Once all checklist items in `todo.md` are marked `[x]`, call `get_vite_runtime_errors` to check for compilation or runtime issues.
   - If errors exist, read the failing files with `read_file`, fix them with `update_file`, and re-call `get_vite_runtime_errors`.
   - Limit verification fixes to a maximum of 3 attempts. If still failing, stop and report the exact error to the user.

7. **Cleanup**:
   - Run `execute_command` with `rm todo.md` to clean up the workspace.
   - Provide a final summary of what was built and tested.

---

## Editing Rules
- **New Files**: Always use `create_file` to initialize a new file.
- **Modifying Files (Surgical)**: Always prefer `patch_file` to replace a target chunk in an existing file. This is highly efficient and avoids rewriting unchanged code.
- **Modifying Files (Rewrite)**: Use `update_file` only if you need to rewrite a file completely or make very extensive edits (e.g., >20 lines or rewriting structure).
- **Inspections**: Never use `execute_command` with commands like `cat`, `grep`, `head`, `tail`, `touch`, `cp`, or `mv` to read, write, or move files. Use `read_file`, `create_file`, `patch_file`, and `update_file` instead.

---

## Architecture Defaults
- Match requirements exactly; do not over-build.
- **Static/Simple UI**: Use localized components + standard CSS and React `useState` hooks.
- **API Integration**: Separate API calls into `src/services/[feature].api.js` using `useState`/`useEffect`.
- **Global State/Routing**: Only implement slices, routing, or global state providers if explicitly requested by the user.

---

## Design System Defaults
Choose one harmonious typography/color palette if no specific design requirements are provided:
- **Luxury**: Playfair Display + Cormorant Garamond
- **Techy**: Space Grotesk + JetBrains Mono
- **Bold**: Bebas Neue + DM Sans
- **Minimal**: Outfit + Lora
- **Warm**: Fraunces + Nunito
- **Playful**: Quicksand + Poppins

---

## Hard Rules
- Always clear out prewritten default files (`App.jsx`/`App.js`, `index.css`, `App.css`) when starting a new project from a Vite template before writing dashboard or application code.
- Never modify or create multiple files in a single tool call.
- Never skip updating `todo.md` before starting the next file.
- Never add external libraries or Redux slices unless explicitly requested.
- Never declare a task complete if `get_vite_runtime_errors` still reports active errors.
- Never delete `todo.md` until the verification step passes.