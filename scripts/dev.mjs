import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
const python =
  process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python";
if (!existsSync(python)) {
  console.error("Create the virtual environment first. See README.md.");
  process.exit(1);
}
const children = [
  spawn(
    python,
    [
      "-m",
      "uvicorn",
      "backend.app.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      "8000",
    ],
    { stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5173",
      "--strictPort",
    ],
    { stdio: "inherit" },
  ),
];
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    shutdown(1);
  });
  child.on("exit", (code) => shutdown(code ?? 0));
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
