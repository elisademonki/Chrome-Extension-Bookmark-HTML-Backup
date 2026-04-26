const DEFAULT_FOLDER = "bookmark-backups";
const DEFAULT_INCLUDE_FAVICONS = false;
const DOUBLE_CLICK_MS = 350;
const OFFSCREEN_PATH = "offscreen.html";

let clickTimer = null;
let creatingOffscreen = null;

chrome.runtime.onInstalled.addListener(async () => {
  await normalizeStoredSettings();
  rebuildContextMenu();
});

chrome.runtime.onStartup.addListener(async () => {
  await normalizeStoredSettings();
});

chrome.action.onClicked.addListener(() => {
  // Chrome hat kein echtes Doppelklick-Event für das Toolbar-Icon.
  // Deshalb: 1 Klick wartet kurz; kommt ein zweiter Klick, öffnen wir die Optionen.
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
    chrome.runtime.openOptionsPage();
    return;
  }

  clickTimer = setTimeout(() => {
    clickTimer = null;
    exportBookmarksHtml();
  }, DOUBLE_CLICK_MS);
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "backup_default") exportBookmarksHtml();
  if (info.menuItemId === "backup_compact") exportBookmarksHtml({ includeFaviconsOverride: false });
  if (info.menuItemId === "backup_full") exportBookmarksHtml({ includeFaviconsOverride: true });
  if (info.menuItemId === "open_options") chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "EXPORT_BOOKMARKS") {
    exportBookmarksHtml({ includeFaviconsOverride: message.includeFaviconsOverride }).then(
      (result) => sendResponse({ ok: true, result }),
      (error) => sendResponse({ ok: false, error: String(error?.message || error) })
    );
    return true;
  }

  if (message?.type === "SAVE_SETTINGS") {
    saveSettings(message).then(
      (result) => sendResponse({ ok: true, result }),
      (error) => sendResponse({ ok: false, error: String(error?.message || error) })
    );
    return true;
  }
});

async function normalizeStoredSettings() {
  const current = await chrome.storage.local.get({
    folder: DEFAULT_FOLDER,
    includeFavicons: DEFAULT_INCLUDE_FAVICONS
  });

  await chrome.storage.local.set({
    folder: sanitizeRelativeFolder(current.folder),
    includeFavicons: Boolean(current.includeFavicons)
  });
}

function rebuildContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "backup_default",
      title: "Backup erstellen (gespeicherter Modus)",
      contexts: ["action"]
    });
    chrome.contextMenus.create({
      id: "backup_compact",
      title: "Backup kompakt ohne Favicons",
      contexts: ["action"]
    });
    chrome.contextMenus.create({
      id: "backup_full",
      title: "Backup voll mit Favicons",
      contexts: ["action"]
    });
    chrome.contextMenus.create({
      id: "sep1",
      type: "separator",
      contexts: ["action"]
    });
    chrome.contextMenus.create({
      id: "open_options",
      title: "Backup-Ordner und Standardmodus einstellen",
      contexts: ["action"]
    });
  });
}

async function saveSettings(message) {
  const folder = sanitizeRelativeFolder(message.folder);
  const includeFavicons = Boolean(message.includeFavicons);
  await chrome.storage.local.set({ folder, includeFavicons });
  return { folder, includeFavicons };
}

async function exportBookmarksHtml(options = {}) {
  try {
    await setBadge("…");

    const settings = await chrome.storage.local.get({
      folder: DEFAULT_FOLDER,
      includeFavicons: DEFAULT_INCLUDE_FAVICONS
    });
    const folder = sanitizeRelativeFolder(settings.folder);
    const includeFavicons = typeof options.includeFaviconsOverride === "boolean"
      ? options.includeFaviconsOverride
      : Boolean(settings.includeFavicons);
    await chrome.storage.local.set({ folder, includeFavicons: Boolean(settings.includeFavicons) });

    const tree = await chrome.bookmarks.getTree();
    const timestamp = makeTimestamp();
    const mode = includeFavicons ? "mit_Favicons" : "ohne_Favicons";
    const filename = `${folder}/Chrome_Bookmarks_${timestamp}_${mode}.html`;

    const { url, stats } = await makeExportBlobUrl(tree, includeFavicons);

    const downloadId = await chrome.downloads.download({
      url,
      filename,
      saveAs: false,
      conflictAction: "uniquify"
    });

    await setBadge(includeFavicons ? "ICO" : "OK");
    setTimeout(() => setBadge(""), 2500);
    return { downloadId, filename, stats, includeFavicons };
  } catch (error) {
    console.error(error);
    await setBadge("ERR");
    setTimeout(() => setBadge(""), 4000);
    throw error;
  }
}

async function makeExportBlobUrl(tree, includeFavicons) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({
    type: "MAKE_EXPORT_BLOB_URL",
    tree,
    includeFavicons
  });
  if (!response?.ok || !response.url) {
    throw new Error(response?.error || "Blob-URL konnte nicht erzeugt werden.");
  }
  return { url: response.url, stats: response.stats || null };
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["BLOBS"],
    justification: "Erzeugt eine Blob-URL für große HTML-Lesezeichen-Backups."
  });

  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

function makeTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function sanitizeRelativeFolder(input) {
  let value = String(input || DEFAULT_FOLDER).trim();
  value = value.replaceAll("\\", "/");

  // Chrome downloads.download akzeptiert nur Pfade relativ zum Download-Ordner.
  // Absolute Windows-/Unix-Pfade werden hier bewusst in relative Ordner umgewandelt.
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

async function setBadge(text) {
  await chrome.action.setBadgeText({ text });
  if (text === "OK" || text === "ICO") await chrome.action.setBadgeBackgroundColor({ color: "#2e7d32" });
  else if (text === "ERR") await chrome.action.setBadgeBackgroundColor({ color: "#b00020" });
  else await chrome.action.setBadgeBackgroundColor({ color: "#555555" });
}
