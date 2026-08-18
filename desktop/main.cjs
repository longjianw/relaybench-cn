const { app, BrowserWindow, dialog, shell } = require("electron");
const { fork } = require("node:child_process");
const path = require("node:path");

const PORT = 8790;
const APP_URL = `http://127.0.0.1:${PORT}`;
let serverProcess;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

async function waitForServer(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${APP_URL}/api/system`);
      if (response.ok) return;
    } catch {
      // The local service may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("本机服务启动超时");
}

async function serverIsReady() {
  try {
    const response = await fetch(`${APP_URL}/api/system`);
    return response.ok;
  } catch {
    return false;
  }
}

function startServer() {
  const serverPath = path.join(__dirname, "server.cjs");
  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      RELAYBENCH_NODE_PATH: process.execPath,
      RELAYBENCH_DIST_PATH: path.join(__dirname, "..", "dist"),
      NODE_ENV: "production",
      PORT: String(PORT),
    },
    silent: true,
  });
  serverProcess.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  serverProcess.stderr?.on("data", (chunk) => process.stderr.write(chunk));
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 980,
    minHeight: 700,
    title: "模型验真台",
    backgroundColor: "#f5f7f8",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) shell.openExternal(url);
    return { action: "deny" };
  });
  window.loadURL(APP_URL);
}

app.on("second-instance", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

app.whenReady().then(async () => {
  try {
    if (!(await serverIsReady())) startServer();
    await waitForServer();
    createWindow();
  } catch (error) {
    dialog.showErrorBox(
      "模型验真台无法启动",
      `${error instanceof Error ? error.message : "未知错误"}\n\n请退出应用后重试。`,
    );
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  serverProcess?.kill("SIGTERM");
});
