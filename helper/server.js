const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const PORT = 3030;
const BASE_DIR = path.resolve(__dirname, "..");
const YTDLP_PATH = path.join(BASE_DIR, "yt-dlp.exe");
const DEFAULT_OUTPUT = path.join(process.env.USERPROFILE || "C:\\Users\\Public", "Videos");
const JOB_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours

const jobs = new Map();

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function getOutputTemplate(finalOutputPath, filename) {
  const safeFilename = filename ? sanitizeFilename(filename) : "";
  const baseName = safeFilename.length > 0 ? safeFilename : "%(title)s";
  return path.join(finalOutputPath, `${baseName}.%(ext)s`);
}

function getYtDlpArgs(url, format, outputPath, filename) {
  const finalOutputPath =
    outputPath && outputPath.trim().length > 0
      ? outputPath.trim()
      : DEFAULT_OUTPUT;

  ensureDir(finalOutputPath);

  const template = getOutputTemplate(finalOutputPath, filename);

  const args = [
    "--compat-options", "filename",
    "--no-playlist",
    "--js-runtimes", getNodeRuntime(),
    "--remote-components", "ejs:github"
  ];

  if (shouldUseBrowserCookies(url)) {
    args.push("--cookies-from-browser", "chrome");
    //args.push("--cookies", "");
  }

  if (format === "mp3") {
    args.push(
      "-x",
      "--audio-format", "mp3",
      "-o", template
    );
  } else if (format === "mp4") {
    args.push(
      "-f", "bv*+ba/b",
      "--merge-output-format", "mp4",
      "-o", template
    );
  } else {
    args.push("-o", template);
  }

  args.push(url);
  return args;
}

function shouldUseBrowserCookies(rawUrl) {
  let hostname = "";
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }

  return (
    hostname === "medal.tv" ||
    hostname.endsWith(".medal.tv")
  );
}

function createJob(url) {
  const id = crypto.randomUUID();
  const job = {
    id,
    url,
    status: "starting",
    progress: 0,
    message: "Preparing download...",
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    finishedAt: null
  };

  jobs.set(id, job);
  return job;
}

function updateJob(jobId, patch) {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  Object.assign(job, patch, { updatedAt: Date.now() });
}

function cleanupOldJobs() {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    const age = now - (job.finishedAt || job.updatedAt);
    if (age > JOB_TTL_MS) {
      jobs.delete(jobId);
    }
  }
}

function parseProgress(text) {
  const match = text.match(/\[download\]\s+([0-9]+(?:\.[0-9]+)?)%/);
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[1]);
  if (Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, value));
}

function handleDownload(req, res, body) {
  let data;
  try {
    data = JSON.parse(body || "{}");
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON payload." });
  }

  if (!data.url || typeof data.url !== "string") {
    return sendJson(res, 400, { error: "Missing URL." });
  }

  if (!fs.existsSync(YTDLP_PATH)) {
    return sendJson(res, 500, { error: `yt-dlp not found at ${YTDLP_PATH}` });
  }

  const job = createJob(data.url);
  const args = getYtDlpArgs(data.url, data.format, data.outputPath, data.filename);
  const child = spawn(YTDLP_PATH, args, {
    shell: false,
    windowsHide: true,
    cwd: BASE_DIR
  });

  child.stdout.on("data", chunk => {
    console.log(`[yt-dlp] ${chunk}`);
  });

  child.stderr.on("data", chunk => {
    const text = chunk.toString();
    console.error(`[yt-dlp error] ${text}`);

    const parsedProgress = parseProgress(text);
    if (parsedProgress !== null) {
      updateJob(job.id, {
        status: "downloading",
        progress: parsedProgress,
        message: `Downloading... ${parsedProgress.toFixed(1)}%`
      });
    }
  });

  child.on("close", code => {
    console.log(`yt-dlp exited with code ${code}`);

    if (code === 0) {
      updateJob(job.id, {
        status: "completed",
        progress: 100,
        message: "Download completed successfully.",
        finishedAt: Date.now()
      });
      return;
    }

    updateJob(job.id, {
      status: "failed",
      message: `Download failed with exit code ${code}.`,
      error: `yt-dlp exited with code ${code}`,
      finishedAt: Date.now()
    });
  });

  child.on("error", err => {
    console.error(`yt-dlp failed to start: ${err.message}`);
    updateJob(job.id, {
      status: "failed",
      message: "yt-dlp failed to start.",
      error: err.message,
      finishedAt: Date.now()
    });
  });

  return sendJson(res, 200, {
    ok: true,
    jobId: job.id,
    message: `Download started for ${data.url}`
  });
}

function handleProgress(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const jobId = reqUrl.searchParams.get("jobId");

  if (!jobId) {
    return sendJson(res, 400, { error: "Missing jobId query parameter." });
  }

  const job = jobs.get(jobId);
  if (!job) {
    return sendJson(res, 404, { error: "Job not found." });
  }

  return sendJson(res, 200, {
    ok: true,
    job: {
      id: job.id,
      status: job.status,
      progress: job.progress,
      message: job.message,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      finishedAt: job.finishedAt
    }
  });
}


function pickFolderFromExplorer() {
  return new Promise((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(new Error("Folder picker is only supported on Windows."));
      return;
    }

    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      '$dialog.Description = "Choose a default download folder"',
      "$dialog.ShowNewFolderButton = $true",
      "$result = $dialog.ShowDialog()",
      "if ($result -eq [System.Windows.Forms.DialogResult]::OK) {",
      "  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
      "  Write-Output $dialog.SelectedPath",
      "}"
    ].join("; ");

    const picker = spawn("powershell.exe", ["-NoProfile", "-STA", "-Command", script], {
      shell: false,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    picker.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });

    picker.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });

    picker.on("error", err => {
      reject(new Error(`Could not open folder picker: ${err.message}`));
    });

    picker.on("close", code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Folder picker exited with code ${code}.`));
        return;
      }

      resolve(stdout.trim());
    });
  });
}

function handleFolderPicker(_req, res) {
  pickFolderFromExplorer()
    .then(selectedPath => {
      sendJson(res, 200, { ok: true, path: selectedPath || "" });
    })
    .catch(error => {
      sendJson(res, 500, { ok: false, error: error.message || String(error) });
    });
}

const server = http.createServer((req, res) => {
  cleanupOldJobs();

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  if (req.method === "GET" && req.url === "/health") {
    return sendJson(res, 200, { ok: true, port: PORT });
  }

  if (req.method === "GET" && req.url.startsWith("/progress")) {
    return handleProgress(req, res);
  }

  if (req.method === "GET" && req.url === "/pick-folder") {
    return handleFolderPicker(req, res);
  }

  if (req.method === "POST" && req.url === "/download") {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
      }
    });
    req.on("end", () => handleDownload(req, res, body));
    return;
  }

  sendJson(res, 404, { error: "Not found." });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Simple yt-dlp helper listening on http://127.0.0.1:${PORT}`);
});

function getNodeRuntime() {
  const candidates = [
    process.execPath,
    "C:\\Program Files\\nodejs\\node.exe",
    "C:\\Program Files (x86)\\nodejs\\node.exe"
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return `node:${candidate}`;
    }
  }

  return "node";
}
