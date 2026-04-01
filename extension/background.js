const HELPER_BASE = "http://127.0.0.1:3030";
const POLL_INTERVAL_MS = 1000;

let activeJobId = null;
let activeJob = null;
let pollTimer = null;

function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // It's normal for this to fail when no popup window is open.
  });
}

function setActiveJob(jobId, job) {
  activeJobId = jobId;
  activeJob = job;
  broadcast({ type: "job-update", jobId: activeJobId, job: activeJob });
}

function clearPollTimer() {
  if (!pollTimer) {
    return;
  }

  clearInterval(pollTimer);
  pollTimer = null;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Helper request failed.");
  }

  return data;
}

async function pollProgress() {
  if (!activeJobId) {
    return;
  }

  try {
    const data = await fetchJson(`${HELPER_BASE}/progress?jobId=${encodeURIComponent(activeJobId)}`);
    setActiveJob(activeJobId, data.job);

    if (data.job.status === "completed" || data.job.status === "failed") {
      clearPollTimer();
    }
  } catch (error) {
    const message = error?.message || String(error);
    setActiveJob(activeJobId, {
      id: activeJobId,
      status: "failed",
      progress: activeJob?.progress || 0,
      message: message,
      error: message
    });
    clearPollTimer();
  }
}

function ensurePolling() {
  if (pollTimer) {
    return;
  }

  pollTimer = setInterval(() => {
    pollProgress().catch(() => {
      // pollProgress already handles error state
    });
  }, POLL_INTERVAL_MS);
}

async function startDownload(payload) {
  const data = await fetchJson(`${HELPER_BASE}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  setActiveJob(data.jobId, {
    id: data.jobId,
    status: "starting",
    progress: 0,
    message: data.message,
    error: null
  });

  ensurePolling();
  await pollProgress();

  return { ok: true, jobId: data.jobId };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "start-download") {
    startDownload(message.payload)
      .then(result => sendResponse(result))
      .catch(error => {
        sendResponse({ ok: false, error: error?.message || String(error) });
      });
    return true;
  }

  if (message.type === "get-state") {
    sendResponse({
      ok: true,
      activeJobId,
      activeJob
    });
  }
});
