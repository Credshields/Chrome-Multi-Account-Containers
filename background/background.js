// Background Service Worker for Multi-Account Containers
// Domain-Scoped Cookie Isolation — only swaps cookies for the active domain

// --- Constants & Init ---
const DEFAULT_CONTAINERS = {
    "default": { name: "Default", color: "grey", icon: "circle" },
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
            tabContainerMap: {},
            domainOwnerMap: {}   // tracks which container currently "owns" each domain's cookies
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
    const newTab = await chrome.tabs.create({ url: url, active: false });

    const data = await chrome.storage.local.get("tabContainerMap");
    const map = data.tabContainerMap || {};
    map[newTab.id] = containerId;
    await chrome.storage.local.set({ tabContainerMap: map });

    await groupTab(newTab.id, containerId);
    await chrome.tabs.update(newTab.id, { active: true });
}

// --- Domain-Scoped Cookie Isolation ---

// When user switches to a tab, swap cookies ONLY for that tab's domain
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId).catch(() => null);
    if (!tab || !tab.url) return;

    // Skip internal Chrome pages
    if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) return;

    try {
        const url = new URL(tab.url);
        const domain = url.hostname;
        if (!domain) return;

        const data = await chrome.storage.local.get(["tabContainerMap", "domainOwnerMap"]);
        const tabMap = data.tabContainerMap || {};
        const domainOwnerMap = data.domainOwnerMap || {};

        const containerId = tabMap[tab.id] || "default";
        const currentOwner = domainOwnerMap[domain] || "default";

        // If this container already owns this domain's cookies, nothing to do
        if (currentOwner === containerId) return;

        console.log(`[Swap] ${domain}: ${currentOwner} → ${containerId}`);

        // 1. Save current domain cookies under the current owner
        await saveDomainCookies(domain, currentOwner);

        // 2. Clear only this domain's cookies
        await clearDomainCookies(domain);

        // 3. Restore this domain's cookies for the target container
        await restoreDomainCookies(domain, containerId);

        // 4. Update ownership
        domainOwnerMap[domain] = containerId;
        await chrome.storage.local.set({ domainOwnerMap });
    } catch (e) {
        // Ignore errors for invalid URLs
        console.warn("[Swap] Skipped:", e.message);
    }
});

// Tab Creation — inherit container from opener
chrome.tabs.onCreated.addListener(async (tab) => {
    if (tab.openerTabId) {
        const data = await chrome.storage.local.get("tabContainerMap");
        const map = data.tabContainerMap || {};
        const parentContainer = map[tab.openerTabId];
        if (parentContainer) {
            map[tab.id] = parentContainer;
            await chrome.storage.local.set({ tabContainerMap: map });
            groupTab(tab.id, parentContainer);
        }
    }
});

// Tab URL change — handle site-to-container assignment AND domain cookie swap
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && tab.url) {
        // Skip internal Chrome pages
        if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) return;

        try {
            const url = new URL(tab.url);
            const domain = url.hostname;
            if (!domain) return;

            const data = await chrome.storage.local.get(["siteContainerMap", "tabContainerMap", "domainOwnerMap"]);
            const siteMap = data.siteContainerMap || {};
            const tabMap = data.tabContainerMap || {};
            const domainOwnerMap = data.domainOwnerMap || {};

            // Site assignment redirect
            const targetContainer = siteMap[domain];
            const currentContainer = tabMap[tabId] || "default";

            if (targetContainer && targetContainer !== currentContainer) {
                console.log(`[Redirect] ${domain} needs ${targetContainer}, currently in ${currentContainer}`);

                const newTab = await chrome.tabs.create({ url: tab.url, active: true });
                tabMap[newTab.id] = targetContainer;
                await chrome.storage.local.set({ tabContainerMap: tabMap });
                groupTab(newTab.id, targetContainer);
                await chrome.tabs.remove(tabId);
                return;
            }

            // Domain cookie swap for container tabs navigating to a new domain
            const containerId = tabMap[tabId] || "default";
            const currentOwner = domainOwnerMap[domain] || "default";

            if (currentOwner !== containerId) {
                console.log(`[Swap-Nav] ${domain}: ${currentOwner} → ${containerId}`);

                await saveDomainCookies(domain, currentOwner);
                await clearDomainCookies(domain);
                await restoreDomainCookies(domain, containerId);

                domainOwnerMap[domain] = containerId;
                await chrome.storage.local.set({ domainOwnerMap });
            }
        } catch (e) {
            console.warn("[Update] Skipped:", e.message);
        }
    }
});

// Tab Removal — cleanup
chrome.tabs.onRemoved.addListener(async (tabId) => {
    const data = await chrome.storage.local.get("tabContainerMap");
    const map = data.tabContainerMap || {};
    if (map[tabId]) {
        delete map[tabId];
        await chrome.storage.local.set({ tabContainerMap: map });
    }
});

// --- Visual Grouping ---

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
        "blue": "blue", "orange": "orange", "green": "green",
        "pink": "pink", "purple": "purple", "red": "red",
        "yellow": "yellow", "teal": "cyan", "grey": "grey"
    };
    return colorMap[color] || "grey";
}

// --- Domain-Scoped Cookie Management ---
// Only touches cookies for ONE specific domain. All other domains are untouched.

async function saveDomainCookies(domain, containerId) {
    // Get cookies matching this domain (includes parent domain cookies like .google.com)
    const cookies = await chrome.cookies.getAll({ domain: domain });
    const storeKey = `cookies_${containerId}_${domain}`;
    await chrome.storage.local.set({ [storeKey]: cookies });
    console.log(`[Save] ${cookies.length} cookies for ${domain} → ${containerId}`);
}

async function clearDomainCookies(domain) {
    const cookies = await chrome.cookies.getAll({ domain: domain });
    const promises = cookies.map(c => {
        let cookieDomain = c.domain;
        if (cookieDomain.startsWith('.')) {
            cookieDomain = cookieDomain.substring(1);
        }
        const url = "http" + (c.secure ? "s" : "") + "://" + cookieDomain + c.path;
        return chrome.cookies.remove({ url: url, name: c.name }).catch(() => { });
    });
    await Promise.all(promises);
    console.log(`[Clear] Removed ${cookies.length} cookies for ${domain} only`);
}

async function restoreDomainCookies(domain, containerId) {
    const storeKey = `cookies_${containerId}_${domain}`;
    const data = await chrome.storage.local.get(storeKey);
    const cookies = data[storeKey] || [];

    const promises = cookies.map(c => {
        let cookieDomain = c.domain;
        if (cookieDomain.startsWith('.')) {
            cookieDomain = cookieDomain.substring(1);
        }
        const url = "http" + (c.secure ? "s" : "") + "://" + cookieDomain + c.path;

        const details = {
            url: url,
            name: c.name,
            value: c.value,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            expirationDate: c.expirationDate,
            storeId: c.storeId
        };

        if (!c.hostOnly) {
            details.domain = c.domain;
        }
        if (c.sameSite) {
            details.sameSite = c.sameSite;
        }

        return chrome.cookies.set(details).catch(e => {
            console.warn("Failed to restore cookie", c.name, e.message);
        });
    });

    await Promise.all(promises);
    console.log(`[Restore] ${cookies.length} cookies for ${domain} ← ${containerId}`);
}
