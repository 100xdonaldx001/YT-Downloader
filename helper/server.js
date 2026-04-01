const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 3030;
const BASE_DIR = "C:\\Custom Chrome Extensions\\YT-Downloader";
const YTDLP_PATH = path.join(BASE_DIR, "yt-dlp.exe");
const DEFAULT_OUTPUT = "F:\\Videos\\New Reports";

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

  const args = getYtDlpArgs(data.url, data.format, data.outputPath, data.filename);
  const child = spawn(YTDLP_PATH, args, {
    shell: false,
    windowsHide: true,
    cwd: BASE_DIR
  });

  child.stdout.on("data", chunk => console.log(`[yt-dlp] ${chunk}`));
  child.stderr.on("data", chunk => console.error(`[yt-dlp error] ${chunk}`));
  child.on("close", code => console.log(`yt-dlp exited with code ${code}`));
  child.on("error", err => console.error(`yt-dlp failed to start: ${err.message}`));

  return sendJson(res, 200, {
    ok: true,
    message: `Download started for ${data.url}`
  });
}

const server = http.createServer((req, res) => {
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
