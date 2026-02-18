// Popup Logic with Sub-View Navigation

let currentMode = 'newTab'; // 'newTab', 'reopen', 'always'
let containersData = {};

document.addEventListener('DOMContentLoaded', async () => {
    // Load data
    const cData = await chrome.storage.local.get("containers");
    containersData = cData.containers || {};

    // Render Main List (always 'newTab' mode equivalent logic for shortcut)
    renderList('container-list-main', 'newTab');

    // Menu Event Listeners
    document.getElementById('menu-new-tab').addEventListener('click', () => showSubView('newTab', 'Open a New Tab in...'));
    document.getElementById('menu-reopen').addEventListener('click', () => showSubView('reopen', 'Reopen This Site in...'));
    document.getElementById('menu-always').addEventListener('click', () => showSubView('always', 'Always Open This Site in...'));

    // Direct Action
    document.getElementById('menu-sort').addEventListener('click', sortTabs);

    // Search Main
    document.getElementById('search-input').addEventListener('input', (e) => {
        renderList('container-list-main', 'newTab', e.target.value);
    });

    // Manage
    document.getElementById('manage-btn').addEventListener('click', () => window.location.href = 'manage.html');

    // Back Button
    document.getElementById('sub-back-btn').addEventListener('click', showMainView);

    // Info Icon
    document.getElementById('info-icon').addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
    });

    // Credit Link
    document.getElementById('credit-link').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://credshields.com/' });
    });
});

function showSubView(mode, title) {
    currentMode = mode;
    document.getElementById('main-view').classList.add('hidden');
    document.getElementById('sub-view').classList.remove('hidden');
    document.getElementById('sub-title-text').innerText = title;

    // Render sub list
    renderList('container-list-sub', mode);
}

function showMainView() {
    currentMode = 'newTab';
    document.getElementById('sub-view').classList.add('hidden');
    document.getElementById('main-view').classList.remove('hidden');
}

async function renderList(targetId, mode, filterText = '') {
    const listElement = document.getElementById(targetId);
    listElement.innerHTML = '';

    // Color map
    const colorMap = {
        "blue": "#37adff", "orange": "#ff9400", "green": "#5b5b5b",
        "pink": "#ff4bda", "purple": "#af51f5", "red": "#ff0039",
        "yellow": "#ffea35", "teal": "#00cbb0", "grey": "#999"
    };

    Object.keys(containersData).forEach(key => {
        const container = containersData[key];
        if (filterText && !container.name.toLowerCase().includes(filterText.toLowerCase())) return;

        const item = document.createElement('div');
        item.className = 'container-item';
        const dotColor = colorMap[container.color] || container.color;

        item.innerHTML = `
      <div class="color-circle" style="background-color: ${dotColor}"></div>
      <div class="container-name">${container.name}</div>
    `;

        item.addEventListener('click', () => handleContainerClick(key, mode));
        listElement.appendChild(item);
    });
}

async function handleContainerClick(containerId, mode) {
    if (mode === 'newTab') {
        openInContainer(containerId);
    } else if (mode === 'reopen') {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
            openInContainer(containerId, tabs[0].url);
            chrome.tabs.remove(tabs[0].id);
        }
    } else if (mode === 'always') {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0] && tabs[0].url) {
            const url = new URL(tabs[0].url);
            const domain = url.hostname;
            const data = await chrome.storage.local.get("siteContainerMap");
            const map = data.siteContainerMap || {};

            map[domain] = containerId;
            await chrome.storage.local.set({ siteContainerMap: map });

            // Allow user to confirm visual feedback? For now just go back.
            showMainView();
        }
    }
}

function openInContainer(containerId, url = "chrome://newtab") {
    chrome.runtime.sendMessage({
        type: "OPEN_CONTAINER_TAB",
        containerId: containerId,
        url: url
    });
    window.close();
}

async function sortTabs() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const cData = await chrome.storage.local.get("tabContainerMap");
    const map = cData.tabContainerMap || {};

    tabs.sort((a, b) => {
        const cA = map[a.id] || "default";
        const cB = map[b.id] || "default";
        if (cA < cB) return -1;
        if (cA > cB) return 1;
        return 0;
    });

    for (let i = 0; i < tabs.length; i++) {
        await chrome.tabs.move(tabs[i].id, { index: i });
    }
    window.close();
}
