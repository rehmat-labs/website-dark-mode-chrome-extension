// Website Dark Mode — background service worker.
// - Shows a colored icon on tabs where dark mode is active, a grey one elsewhere.
// - Handles the keyboard shortcut that toggles dark mode for the current site.

const ICON_ON = { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" };
const ICON_OFF = { 16: "icons/icon-off-16.png", 32: "icons/icon-off-32.png", 48: "icons/icon-off-48.png", 128: "icons/icon-off-128.png" };

function showState(tabId, active, reason) {
  chrome.action.setIcon({ tabId, path: active ? ICON_ON : ICON_OFF }).catch(() => {});
  const auto = active && reason === "auto";
  chrome.action.setBadgeText({ tabId, text: auto ? "A" : "" }).catch(() => {});
  if (auto) chrome.action.setBadgeBackgroundColor({ tabId, color: "#4338ca" }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get({ autoMode: false, sites: {} });
  await chrome.storage.local.set(data); // write defaults once
  chrome.action.setIcon({ path: ICON_OFF });
});

// Content scripts report their state after every change.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "STATE" && sender.tab && sender.frameId === 0) {
    showState(sender.tab.id, msg.active, msg.reason);
  }
});

// Ask the page for its current state, injecting the content script if needed.
async function getTabState(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "GET_STATE" });
  } catch (_) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return await chrome.tabs.sendMessage(tabId, { type: "GET_STATE" });
  }
}

// Alt+Shift+D: flip dark mode for the current site and remember it.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-site") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try {
    const state = await getTabState(tab.id);
    const { sites } = await chrome.storage.local.get({ sites: {} });
    sites[state.host] = state.active ? "off" : "on";
    await chrome.storage.local.set({ sites });
  } catch (_) {
    // Page where extensions can't run (chrome://, Web Store, ...)
  }
});
