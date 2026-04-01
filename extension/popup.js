const statusEl = document.getElementById("status");
const progressEl = document.getElementById("progress");
const button = document.getElementById("downloadBtn");
const formatEl = document.getElementById("format");
const filenameEl = document.getElementById("filename");
const outputPathEl = document.getElementById("outputPath");

let progressTimer = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "#222";
}

function setProgress(value) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  progressEl.value = percent;
  progressEl.textContent = `${percent}%`;
}

function stopProgressPolling() {
  if (!progressTimer) {
    return;
  }

  clearInterval(progressTimer);
  progressTimer = null;
}

async function getCurrentTabUrl() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs || tabs.length === 0 || !tabs[0].url) {
    throw new Error("Could not read current tab URL.");
  }
  return tabs[0].url;
}

async function pollProgress(jobId) {
  const response = await fetch(`http://127.0.0.1:3030/progress?jobId=${encodeURIComponent(jobId)}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to read progress from helper.");
  }

  const { status, progress, message, error } = data.job;
  setProgress(progress);
  setStatus(message || `Status: ${status}`, status === "failed");

  if (status === "completed" || status === "failed") {
    stopProgressPolling();
    button.disabled = false;
    if (error) {
      setStatus(`${message}\n${error}`, true);
    }
  }
}

button.addEventListener("click", async () => {
  stopProgressPolling();

  try {
    button.disabled = true;
    setProgress(0);
    setStatus("Reading current tab...");

    const url = await getCurrentTabUrl();
    const format = formatEl.value;
    const filename = filenameEl.value.trim();
    const outputPath = outputPathEl.value.trim();

    setStatus("Sending job to local helper...");

    const response = await fetch("http://127.0.0.1:3030/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url,
        format,
        filename,
        outputPath
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unknown error from helper.");
    }

    setStatus(`Started.\n${data.message}`);

    progressTimer = setInterval(() => {
      pollProgress(data.jobId).catch(error => {
        stopProgressPolling();
        button.disabled = false;
        setStatus(error.message || String(error), true);
      });
    }, 1000);

    await pollProgress(data.jobId);
  } catch (error) {
    stopProgressPolling();
    button.disabled = false;
    setStatus(error.message || String(error), true);
  }
});
