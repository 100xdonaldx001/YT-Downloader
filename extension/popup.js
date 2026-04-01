const statusEl = document.getElementById("status");
const button = document.getElementById("downloadBtn");
const formatEl = document.getElementById("format");
const outputPathEl = document.getElementById("outputPath");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "#222";
}

async function getCurrentTabUrl() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs || tabs.length === 0 || !tabs[0].url) {
    throw new Error("Could not read current tab URL.");
  }
  return tabs[0].url;
}

button.addEventListener("click", async () => {
  try {
    setStatus("Reading current tab...");

    const url = await getCurrentTabUrl();
    const format = formatEl.value;
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
        outputPath
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unknown error from helper.");
    }

    setStatus(`Started.\n${data.message}`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
});
