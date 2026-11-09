const $ = (id) => document.getElementById(id);

let tabId = null;
let host = null;

async function getState() {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "GET_STATE" });
  } catch (_) {
    // Content script not there yet (tab opened before install) — inject it.
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await new Promise((r) => setTimeout(r, 150)); // let it read its settings
    return await chrome.tabs.sendMessage(tabId, { type: "GET_STATE" });
  }
}

function describe(state) {
  if (state.siteMode === "on") return "Dark mode is ON — you turned it on for this site";
  if (state.siteMode === "off") return "Dark mode is OFF — you turned it off for this site";
  if (state.reason === "auto") return "Dark mode is ON — applied automatically";
  if (state.reason === "auto-already-dark") return "This site is already dark — left as it is";
  return "Dark mode is OFF";
}

async function render() {
  let state;
  try {
    state = await getState();
  } catch (_) {
    $("siteCard").classList.add("disabled");
    $("siteToggle").disabled = true;
    $("status").textContent = "Dark mode can't run on this page (browser or store pages).";
    return;
  }
  host = state.host;
  $("host").textContent = host || "this page";
  $("siteToggle").checked = state.active;
  $("autoToggle").checked = state.autoMode;
  $("status").textContent = describe(state);
  $("status").classList.toggle("on", state.active);
  $("resetSite").hidden = !(state.siteMode && state.autoMode);
}

async function updateSites(fn) {
  const { sites } = await chrome.storage.local.get({ sites: {} });
  fn(sites);
  await chrome.storage.local.set({ sites });
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab && tab.id;

  const { autoMode } = await chrome.storage.local.get({ autoMode: false });
  $("autoToggle").checked = autoMode;

  if (tabId) await render();

  $("siteToggle").addEventListener("change", async (e) => {
    if (!host) return;
    const on = e.target.checked;
    const autoMode = $("autoToggle").checked;
    await updateSites((sites) => {
      // With Auto off, "off" is the default anyway — just forget the site so
      // turning Auto on later still works here.
      if (!on && !autoMode) delete sites[host];
      else sites[host] = on ? "on" : "off";
    });
    setTimeout(render, 150);
  });

  $("resetSite").addEventListener("click", async () => {
    await updateSites((sites) => { delete sites[host]; });
    setTimeout(render, 150);
  });

  $("autoToggle").addEventListener("change", async (e) => {
    await chrome.storage.local.set({ autoMode: e.target.checked });
    setTimeout(render, 150);
  });
}

init();
