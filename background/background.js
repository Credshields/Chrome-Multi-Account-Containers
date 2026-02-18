// Background Service Worker for Multi-Account Containers

// --- Constants & Init ---
const DEFAULT_CONTAINERS = {
    "default": { name: "Default", color: "grey", icon: "circle" }, // Standard browsing
    "personal": { name: "Personal", color: "blue", icon: "fingerprint" },
    "work": { name: "Work", color: "orange", icon: "briefcase" },
    "banking": { name: "Banking", color: "green", icon: "dollar" },
    "shopping": { name: "Shopping", color: "pink", icon: "cart" }
};

// Initialize
chrome.runtime.onInstalled.addListener(async () => {
    const data = await chrome.storage.local.get("containers");
    if (!data.containers) {
        await chrome.storage.local.set({
            containers: DEFAULT_CONTAINERS,
            currentContainer: "default",
            tabContainerMap: {}
        });
    }
});

// --- Event Listeners ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "OPEN_CONTAINER_TAB") {
        createContainerTab(message.containerId, message.url);
    }
});

async function createContainerTab(containerId, url = "chrome://newtab") {
    // 1. Create tab inactive to prevent early firing of onActivated
    const newTab = await chrome.tabs.create({ url: url, active: false });

    // 2. Set mapping
    const data = await chrome.storage.local.get("tabContainerMap");
    const map = data.tabContainerMap || {};
    map[newTab.id] = containerId;
    await chrome.storage.local.set({ tabContainerMap: map });

    // 3. Group it visually
    await groupTab(newTab.id, containerId);

    // 4. Now activate it, triggering the cookie swap logic in onActivated
    await chrome.tabs.update(newTab.id, { active: true });
}

// Tab Activation — no cookie swapping needed.
// Containers are visual (Tab Groups) + site-assignment based.

// 2. Tab Creation (Inherit container from opener?)
chrome.tabs.onCreated.addListener(async (tab) => {
    if (tab.openerTabId) {
        const data = await chrome.storage.local.get("tabContainerMap");
        const map = data.tabContainerMap || {};
        const parentContainer = map[tab.openerTabId];
        if (parentContainer) {
            map[tab.id] = parentContainer;
            await chrome.storage.local.set({ tabContainerMap: map });
            // Apply visual group
            groupTab(tab.id, parentContainer);
        }
    }
});

// 2.5 Tab Updates (Site Assignment Check)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && tab.url) {
        const url = new URL(tab.url);
        const domain = url.hostname;

        const data = await chrome.storage.local.get(["siteContainerMap", "tabContainerMap"]);
        const siteMap = data.siteContainerMap || {};
        const tabMap = data.tabContainerMap || {};

        const targetContainer = siteMap[domain];
        const currentContainer = tabMap[tabId] || "default";

        if (targetContainer && targetContainer !== currentContainer) {
            console.log(`[Redirect] ${domain} needs ${targetContainer}, currently in ${currentContainer}`);

            // Create new tab in correct container
            const newTab = await chrome.tabs.create({ url: tab.url, active: true });

            // Assign container to new tab
            tabMap[newTab.id] = targetContainer;
            await chrome.storage.local.set({ tabContainerMap: tabMap });

            // Group it (optional, but good for feedback)
            groupTab(newTab.id, targetContainer);

            // Close the old tab
            await chrome.tabs.remove(tabId);
        }
    }
});

// 3. Tab Removal (Cleanup)
chrome.tabs.onRemoved.addListener(async (tabId) => {
    const data = await chrome.storage.local.get("tabContainerMap");
    const map = data.tabContainerMap || {};
    if (map[tabId]) {
        delete map[tabId];
        await chrome.storage.local.set({ tabContainerMap: map });
    }
});



// Visual grouping helper
async function groupTab(tabId, containerId) {
    const cData = await chrome.storage.local.get("containers");
    const container = cData.containers[containerId];
    if (!container || containerId === 'default') return;

    try {
        const groupId = await chrome.tabs.group({ tabIds: tabId });
        await chrome.tabGroups.update(groupId, {
            color: getChromeColor(container.color),
            title: container.name
        });
    } catch (e) {
        console.error("Grouping failed", e);
    }
}

function getChromeColor(color) {
    const colorMap = {
        "blue": "blue",
        "orange": "orange",
        "green": "green",
        "pink": "pink",
        "purple": "purple",
        "red": "red",
        "yellow": "yellow",
        "teal": "cyan",
        "grey": "grey"
    };
    return colorMap[color] || "grey";
}


