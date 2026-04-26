const urls = new Set();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "MAKE_EXPORT_BLOB_URL") {
    makeExportBlobUrl(message.tree || [], Boolean(message.includeFavicons)).then(
      (result) => sendResponse({ ok: true, ...result }),
      (error) => sendResponse({ ok: false, error: String(error?.message || error) })
    );
    return true;
  }

  if (message?.type === "REVOKE_BLOB_URL" && message.url) {
    revoke(message.url);
    sendResponse({ ok: true });
    return true;
  }
});

async function makeExportBlobUrl(tree, includeFavicons) {
  const { html, stats } = await buildBookmarksHtml(tree, includeFavicons);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  urls.add(url);

  // Sicherheitsnetz: Chrome muss die Datei erst vollständig lesen.
  setTimeout(() => revoke(url), 2 * 60 * 1000);
  return { url, stats };
}

async function buildBookmarksHtml(tree, includeFavicons) {
  const stats = countTree(tree);
  const iconMap = includeFavicons ? await loadFavicons(tree, stats) : new Map();
  stats.faviconsEmbedded = Array.from(iconMap.values()).filter(Boolean).length;

  const generatedAt = new Date().toISOString();
  const lines = [];
  lines.push("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
  lines.push("<!-- This is an automatically generated file. It will be read and overwritten. DO NOT EDIT! -->");
  lines.push(`<!-- Exported by Bookmark HTML Backup v1.2.0 at ${generatedAt}; bookmarks=${stats.bookmarks}; folders=${stats.folders}; favicons=${stats.faviconsEmbedded}/${stats.faviconCandidates}; iconsIncluded=${includeFavicons} -->`);
  lines.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">');
  lines.push("<TITLE>Bookmarks</TITLE>");
  lines.push("<H1>Bookmarks</H1>");
  lines.push("<DL><p>");

  for (const root of tree) {
    for (const child of root.children || []) {
      appendNode(lines, child, 1, iconMap);
    }
  }

  lines.push("</DL><p>");
  return { html: lines.join("\n"), stats };
}

function appendNode(lines, node, depth, iconMap) {
  const indent = "    ".repeat(depth);
  const addDate = toBookmarkTime(node.dateAdded);
  const modified = toBookmarkTime(node.dateGroupModified || node.dateAdded);
  const title = escapeHtml(node.title || "");

  if (node.url) {
    const icon = iconMap.get(node.url) || "";
    const iconAttr = icon ? ` ICON="${escapeAttr(icon)}"` : "";
    lines.push(`${indent}<DT><A HREF="${escapeAttr(node.url)}" ADD_DATE="${addDate}"${iconAttr}>${title}</A>`);
    return;
  }

  lines.push(`${indent}<DT><H3 ADD_DATE="${addDate}" LAST_MODIFIED="${modified}">${title}</H3>`);
  lines.push(`${indent}<DL><p>`);
  for (const child of node.children || []) appendNode(lines, child, depth + 1, iconMap);
  lines.push(`${indent}</DL><p>`);
}

function countTree(tree) {
  const stats = {
    bookmarks: 0,
    folders: 0,
    faviconCandidates: 0,
    uniqueFaviconCandidates: 0,
    faviconsEmbedded: 0
  };

  walkAll(tree, (node) => {
    if (node.url) {
      stats.bookmarks += 1;
      if (/^https?:\/\//i.test(node.url)) stats.faviconCandidates += 1;
    } else if (node.children) {
      stats.folders += 1;
    }
  });

  return stats;
}

async function loadFavicons(tree, stats) {
  const uniqueUrls = [];
  const seen = new Set();

  walkAll(tree, (node) => {
    if (!node.url || !/^https?:\/\//i.test(node.url)) return;
    if (seen.has(node.url)) return;
    seen.add(node.url);
    uniqueUrls.push(node.url);
  });

  stats.uniqueFaviconCandidates = uniqueUrls.length;

  const result = new Map();
  const concurrency = 8;
  let index = 0;

  async function worker() {
    while (index < uniqueUrls.length) {
      const url = uniqueUrls[index++];
      try {
        result.set(url, await fetchFaviconDataUrl(url));
      } catch (error) {
        result.set(url, "");
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, uniqueUrls.length) }, worker));
  return result;
}

function walkAll(nodes, fn) {
  for (const node of nodes || []) {
    fn(node);
    if (node.children) walkAll(node.children, fn);
  }
}

async function fetchFaviconDataUrl(pageUrl) {
  const iconUrl = faviconURL(pageUrl, 16);
  const response = await fetch(iconUrl, { cache: "force-cache" });
  if (!response.ok) return "";
  const blob = await response.blob();
  if (!blob || blob.size === 0) return "";
  return await blobToDataUrl(blob);
}

function faviconURL(pageUrl, size) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", String(size || 16));
  return url.toString();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("FileReader fehlgeschlagen"));
    reader.readAsDataURL(blob);
  });
}

function toBookmarkTime(value) {
  if (!value || !Number.isFinite(value)) return Math.floor(Date.now() / 1000);
  return Math.floor(value / 1000);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function revoke(url) {
  if (!urls.has(url)) return;
  URL.revokeObjectURL(url);
  urls.delete(url);
}
