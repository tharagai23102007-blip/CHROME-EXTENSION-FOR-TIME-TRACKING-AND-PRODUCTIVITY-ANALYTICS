const SESSION_KEY = "__activeSession";
const CHECKPOINT_ALARM = "timeTrackerCheckpoint";

let currentTabId = null;
let currentSite = "";
let startTime = Date.now();
let focusedWindowId = null;
let operationQueue = Promise.resolve();

function enqueue(operation) {
    operationQueue = operationQueue.then(operation).catch((error) => {
        console.error("Error updating time tracker:", error);
    });
    return operationQueue;
}

async function saveElapsedTime() {
    const now = Date.now();
    let site = currentSite;
    let intervalStart = startTime;

    if (!site) {
        const saved = await chrome.storage.local.get(SESSION_KEY);
        site = saved[SESSION_KEY]?.site;
        intervalStart = saved[SESSION_KEY]?.startedAt;
    }

    if (!site || !Number.isFinite(intervalStart)) return;

    const timeSpent = Math.min(now - intervalStart, 2 * 60 * 1000);
    if (timeSpent <= 0) return;

    const data = await chrome.storage.local.get([site]);
    await chrome.storage.local.set({ [site]: (data[site] || 0) + timeSpent });
    if (site === currentSite) startTime = now;
    await chrome.storage.local.set({
        [SESSION_KEY]: { site, startedAt: now }
    });
}

async function trackTab(tab) {
    const site = tab?.url?.startsWith("http") ? new URL(tab.url).hostname : "";
    const tabId = site ? tab.id : null;
    const windowId = site ? tab.windowId : null;

    if (tabId === currentTabId && site === currentSite) return;

    await saveElapsedTime();
    currentTabId = tabId;
    currentSite = site;
    startTime = Date.now();

    if (site) {
        await chrome.storage.local.set({
            [SESSION_KEY]: { site, startedAt: startTime }
        });
    } else {
        await chrome.storage.local.remove(SESSION_KEY);
    }
}

async function trackFocusedTab(windowId = focusedWindowId) {
    if (windowId === null || windowId === chrome.windows.WINDOW_ID_NONE) {
        await trackTab(null);
        return;
    }

    const [tab] = await chrome.tabs.query({ active: true, windowId });
    await trackTab(tab);
}

async function initializeTracker() {
    const focused = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    focusedWindowId = focused?.focused ? focused.id : null;

    // Bound the gap since the last checkpoint if the worker or browser restarted.
    await saveElapsedTime();
    await trackFocusedTab();
    await chrome.alarms.create(CHECKPOINT_ALARM, { periodInMinutes: 1 });
}

chrome.tabs.onActivated.addListener((activeInfo) => {
    if (activeInfo.windowId === focusedWindowId) {
        enqueue(() => trackFocusedTab(activeInfo.windowId));
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && tab.windowId === focusedWindowId && changeInfo.url) {
        enqueue(() => trackTab(tab));
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === currentTabId) enqueue(() => trackFocusedTab());
});

chrome.windows.onFocusChanged.addListener((windowId) => {
    focusedWindowId = windowId === chrome.windows.WINDOW_ID_NONE ? null : windowId;
    enqueue(() => trackFocusedTab(focusedWindowId));
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CHECKPOINT_ALARM) enqueue(saveElapsedTime);
});

chrome.runtime.onStartup.addListener(() => enqueue(initializeTracker));
chrome.runtime.onInstalled.addListener(() => enqueue(initializeTracker));

enqueue(initializeTracker);