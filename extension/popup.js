const statusEl = document.getElementById("status");
const progressEl = document.getElementById("progress");
const button = document.getElementById("downloadBtn");
const formatEl = document.getElementById("format");
const filenameEl = document.getElementById("filename");
const outputPathEl = document.getElementById("outputPath");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "#222";
}

function setProgress(value) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  progressEl.value = percent;
  progressEl.textContent = `${percent}%`;
}

function setUIFromJob(job) {
  if (!job) {
    return;
  }

  setProgress(job.progress);
  setStatus(job.error ? `${job.message}\n${job.error}` : (job.message || `Status: ${job.status}`), job.status === "failed");
  button.disabled = job.status !== "completed" && job.status !== "failed";
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

async function getCurrentTabUrl() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs || tabs.length === 0 || !tabs[0].url) {
    throw new Error("Could not read current tab URL.");
  }
  return tabs[0].url;
}

chrome.runtime.onMessage.addListener(message => {
  if (!message || message.type !== "job-update") {
    return;
  }

  setUIFromJob(message.job);
});

async function loadCurrentState() {
  const state = await sendRuntimeMessage({ type: "get-state" });
  if (!state?.ok) {
    return;
  }

  if (state.activeJob) {
    setUIFromJob(state.activeJob);
  } else {
    button.disabled = false;
    setStatus("Ready.");
    setProgress(0);
  }
}

button.addEventListener("click", async () => {
  try {
    button.disabled = true;
    setProgress(0);
    setStatus("Reading current tab...");

    const url = await getCurrentTabUrl();

    const response = await sendRuntimeMessage({
      type: "start-download",
      payload: {
        url,
        format: formatEl.value,
        filename: filenameEl.value.trim(),
        outputPath: outputPathEl.value.trim()
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Unknown error from helper.");
    }

    setStatus("Started download job...");
  } catch (error) {
    button.disabled = false;
    setStatus(error?.message || String(error), true);
  }
});

loadCurrentState().catch(error => {
  setStatus(error?.message || String(error), true);
  button.disabled = false;
});
