// terminal.service.js
// The one shell of the sandbox, run in the workspace through node-pty.

import pty from "node-pty";
import { WORKING_DIR } from "../workspace/paths.js";

/** Spawns the shell and sends its output to onData. Returns the pty process. */
export function startTerminal(onData) {
  const shell = process.env.SHELL || "bash";
  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-color",
    cols: 80,
    rows: 30,
    cwd: WORKING_DIR,
    env: process.env,
  });

  ptyProcess.onData(onData);

  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`Terminal process exited with code ${exitCode}, signal ${signal}`);
  });

  return ptyProcess;
}
