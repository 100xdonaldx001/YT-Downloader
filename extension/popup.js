const SETTINGS_KEY = "defaultOptions";
const DEFAULT_OUTPUT_PATH = "%USERPROFILE%\\Videos";

const statusEl = document.getElementById("status");
const progressEl = document.getElementById("progress");
const button = document.getElementById("downloadBtn");
const formatEl = document.getElementById("format");
const filenameEl = document.getElementById("filename");
const outputPathEl = document.getElementById("outputPath");
const pickFolderBtn = document.getElementById("pickFolderBtn");

const defaultFormatEl = document.getElementById("defaultFormat");
const defaultOutputPathEl = document.getElementById("defaultOutputPath");
const defaultPickFolderBtn = document.getElementById("defaultPickFolderBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const settingsStatusEl = document.getElementById("settingsStatus");

const downloadTabBtn = document.getElementById("downloadTabBtn");
const settingsTabBtn = document.getElementById("settingsTabBtn");
const downloadPanel = document.getElementById("downloadPanel");
const settingsPanel = document.getElementById("settingsPanel");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "#222";
}

function setSettingsStatus(message, isError = false) {
  settingsStatusEl.textContent = message;
  settingsStatusEl.style.color = isError ? "#b00020" : "#0f172a";
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

function getStorageValue(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], result => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result[key]);
    });
  });
}

function setStorageValue(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
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

function setActiveTab(name) {
  const isSettings = name === "settings";

  downloadTabBtn.classList.toggle("active", !isSettings);
  settingsTabBtn.classList.toggle("active", isSettings);

  downloadTabBtn.setAttribute("aria-selected", String(!isSettings));
  settingsTabBtn.setAttribute("aria-selected", String(isSettings));

  downloadPanel.classList.toggle("hidden", isSettings);
  settingsPanel.classList.toggle("hidden", !isSettings);
}

async function pickFolder(targetInput) {
  try {
    const response = await sendRuntimeMessage({ type: "pick-folder" });
    if (!response?.ok || !response.path) {
      if (response?.error) {
        throw new Error(response.error);
      }
      return;
    }

    targetInput.value = response.path;
    if (targetInput === defaultOutputPathEl) {
      outputPathEl.value = response.path;
    }
  } catch (error) {
    setStatus(error?.message || String(error), true);
  }
}

async function loadSettings() {
  const saved = await getStorageValue(SETTINGS_KEY);
  const defaults = {
    format: saved?.format || "mp4",
    outputPath: saved?.outputPath || DEFAULT_OUTPUT_PATH
  };

  defaultFormatEl.value = defaults.format;
  defaultOutputPathEl.value = defaults.outputPath;

  formatEl.value = defaults.format;
  outputPathEl.value = defaults.outputPath;
}

async function saveSettings() {
  const defaults = {
    format: defaultFormatEl.value,
    outputPath: defaultOutputPathEl.value.trim()
  };

  await setStorageValue({ [SETTINGS_KEY]: defaults });

  formatEl.value = defaults.format;
  if (!outputPathEl.value.trim()) {
    outputPathEl.value = defaults.outputPath;
  }

  setSettingsStatus("Defaults saved.");
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

downloadTabBtn.addEventListener("click", () => setActiveTab("download"));
settingsTabBtn.addEventListener("click", () => setActiveTab("settings"));
pickFolderBtn.addEventListener("click", () => pickFolder(outputPathEl));
defaultPickFolderBtn.addEventListener("click", () => pickFolder(defaultOutputPathEl));

saveSettingsBtn.addEventListener("click", async () => {
  try {
    await saveSettings();
  } catch (error) {
    setSettingsStatus(error?.message || String(error), true);
  }
});

Promise.all([loadSettings(), loadCurrentState()])
  .catch(error => {
    setStatus(error?.message || String(error), true);
    button.disabled = false;
  });
