const DEFAULT_FOLDER = "bookmark-backups";
const DEFAULT_INCLUDE_FAVICONS = false;

const folderInput = document.getElementById("folder");
const modeCompactInput = document.getElementById("modeCompact");
const modeFullInput = document.getElementById("modeFull");
const saveButton = document.getElementById("save");
const backupCompactButton = document.getElementById("backupCompact");
const backupFullButton = document.getElementById("backupFull");
const statusEl = document.getElementById("status");

init();

async function init() {
  const settings = await chrome.storage.local.get({
    folder: DEFAULT_FOLDER,
    includeFavicons: DEFAULT_INCLUDE_FAVICONS
  });
  folderInput.value = settings.folder || DEFAULT_FOLDER;
  setMode(Boolean(settings.includeFavicons));
}

saveButton.addEventListener("click", saveSettings);
backupCompactButton.addEventListener("click", async () => backupNow(false));
backupFullButton.addEventListener("click", async () => backupNow(true));

folderInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") saveSettings();
});

modeCompactInput.addEventListener("change", () => saveSettings(false));
modeFullInput.addEventListener("change", () => saveSettings(false));

async function backupNow(includeFaviconsOverride) {
  await saveSettings(false);
  status(includeFaviconsOverride ? "Backup mit Favicons wird erstellt …" : "Kompaktes Backup wird erstellt …");
  const response = await chrome.runtime.sendMessage({
    type: "EXPORT_BOOKMARKS",
    includeFaviconsOverride
  });
  if (response?.ok) {
    const stats = response.result.stats;
    let detail = "";
    if (stats) {
      detail = `\nBookmarks: ${stats.bookmarks}; Ordner: ${stats.folders}; Favicons: ${stats.faviconsEmbedded}/${stats.faviconCandidates}`;
    }
    status(`Backup erstellt: ${response.result.filename}${detail}`);
  } else {
    status(`Fehler: ${response?.error || "Unbekannter Fehler"}`, true);
  }
}

async function saveSettings(showOk = true) {
  const cleaned = sanitizeRelativeFolder(folderInput.value);
  const includeFavicons = getModeIncludeFavicons();
  folderInput.value = cleaned;
  const response = await chrome.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    folder: cleaned,
    includeFavicons
  });

  if (!response?.ok) {
    status(`Fehler beim Speichern: ${response?.error || "Unbekannter Fehler"}`, true);
    return;
  }

  if (showOk) {
    status(`Gespeichert: Downloads\\${cleaned}\nStandardmodus: ${includeFavicons ? "voll mit Favicons" : "kompakt ohne Favicons"}`);
  }
}

function getModeIncludeFavicons() {
  return modeFullInput.checked;
}

function setMode(includeFavicons) {
  modeFullInput.checked = includeFavicons;
  modeCompactInput.checked = !includeFavicons;
}

function sanitizeRelativeFolder(input) {
  let value = String(input || DEFAULT_FOLDER).trim();
  value = value.replaceAll("\\", "/");
  value = value.replace(/^[a-zA-Z]:\//, "");
  value = value.replace(/^\/+/, "");

  const parts = value
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..");

  const cleaned = parts
    .map((part) => part.replace(/[<>:"|?*\x00-\x1F]/g, "_"))
    .join("/");

  return cleaned || DEFAULT_FOLDER;
}

function status(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "";
}
