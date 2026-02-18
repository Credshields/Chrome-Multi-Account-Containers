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

// 1. Tab Activation (Switching tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId).catch(() => null);
    if (tab) {
        await handleTabSwitch(tab.id);
    }
});

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

// --- Core Logic ---

async function handleTabSwitch(tabId) {
    const data = await chrome.storage.local.get(["tabContainerMap", "currentContainer"]);
    const map = data.tabContainerMap || {};
    const previousContainerId = data.currentContainer || "default";
    let newContainerId = map[tabId] || "default";

    // If the map doesn't have it, assume default
    if (!map[tabId]) {
        // It might be a new tab that wasn't caught or external link
        // We essentially treat it as "default"
    }

    // Optimization: If containers match, do nothing (same cookie jar)
    if (previousContainerId === newContainerId) {
        return;
    }

    console.log(`[Switch] ${previousContainerId} -> ${newContainerId}`);

    // 1. Save cookies for the PREVIOUS container
    await saveCookies(previousContainerId);

    // 2. Clear current browser cookies
    await clearCookies(newContainerId); // Pass new ID just for logging if needed

    // 3. Restore cookies for the NEW container
    await restoreCookies(newContainerId);

    // 4. Update current state
    await chrome.storage.local.set({ currentContainer: newContainerId });
}

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

// --- Cookie Management ---

async function getAllCookies() {
    return await chrome.cookies.getAll({});
}

async function saveCookies(containerId) {
    const cookies = await getAllCookies();
    const storeKey = `cookies_${containerId}`;
    await chrome.storage.local.set({ [storeKey]: cookies });
    console.log(`[Save] ${cookies.length} cookies to ${containerId}`);
}

async function clearCookies(exceptForContainerId) {
    const cookies = await getAllCookies();
    const promises = cookies.map(c => {
        let domain = c.domain;
        if (domain.startsWith('.')) {
            domain = domain.substring(1);
        }
        const url = "http" + (c.secure ? "s" : "") + "://" + domain + c.path;
        return chrome.cookies.remove({ url: url, name: c.name });
    });
    await Promise.all(promises);
    console.log(`[Clear] Removed ${cookies.length} cookies.`);
}

async function restoreCookies(containerId) {
    const storeKey = `cookies_${containerId}`;
    const data = await chrome.storage.local.get(storeKey);
    const cookies = data[storeKey] || [];

    const promises = cookies.map(c => {
        let domain = c.domain;
        if (domain.startsWith('.')) {
            domain = domain.substring(1);
        }
        const url = "http" + (c.secure ? "s" : "") + "://" + domain + c.path;

        // Properties that cannot be set: hostOnly, session
        // 'session' cookies (no expiration) SHOULD be restored if we want to maintain login state. 
        // Chrome allows setting session cookies.
        // 'hostOnly' is read-only. We infer it by generic domain setting? 
        // Actually chrome.cookies.set handles strictness.

        // Construct the details object
        const details = {
            url: url,
            name: c.name,
            value: c.value,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            expirationDate: c.expirationDate,
            storeId: c.storeId // Generally '0'
        };

        // Domain: If it was a host-only cookie, we shouldn't set domain? 
        // Actually, chrome.cookies.getAll returns 'domain' property.
        // If it starts with '.', it's a domain cookie. If not, it's host only?
        // Chrome documentation says: "The domain of the cookie... If omitted, the cookie becomes a host-only cookie."
        if (!c.hostOnly) {
            details.domain = c.domain;
        }

        // SameSite
        if (c.sameSite) {
            details.sameSite = c.sameSite;
        }

        return chrome.cookies.set(details).catch(e => {
            // Suppress errors for stubborn cookies we can't set (e.g. some secure/domain mismatches)
            console.warn("Failed to restore cookie", c.name, e);
        });
    });

    await Promise.all(promises);
    console.log(`[Restore] Restored ${cookies.length} cookies for ${containerId}`);
}
