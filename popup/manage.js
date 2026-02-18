document.addEventListener('DOMContentLoaded', async () => {
    const listElement = document.getElementById('list');
    const backBtn = document.querySelector('.back-btn');
    const addBtn = document.getElementById('add-btn');
    const newNameInput = document.getElementById('new-name');
    const colorPicker = document.getElementById('color-picker');
    let selectedColor = 'blue';

    // Back button
    backBtn.addEventListener('click', () => {
        window.location.href = 'popup.html';
    });

    // Color picker
    colorPicker.querySelectorAll('.color-option').forEach(opt => {
        opt.addEventListener('click', () => {
            colorPicker.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedColor = opt.dataset.color;
        });
    });
    // Select first by default
    colorPicker.querySelector('.color-option').classList.add('selected');

    // Load and render
    await renderList();

    // Add container
    addBtn.addEventListener('click', async () => {
        const name = newNameInput.value.trim();
        if (!name) return;

        const data = await chrome.storage.local.get("containers");
        const containers = data.containers || {};
        const id = "container-" + Date.now();

        containers[id] = {
            name: name,
            color: selectedColor,
            icon: "fingerprint" // Default for now
        };

        await chrome.storage.local.set({ containers });
        newNameInput.value = '';
        await renderList();
    });

    async function renderList() {
        listElement.innerHTML = '';
        const data = await chrome.storage.local.get("containers");
        const containers = data.containers || {};

        const colorMap = {
            "blue": "#37adff",
            "orange": "#ff9400",
            "green": "#5b5b5b",
            "pink": "#ff4bda",
            "purple": "#af51f5",
            "red": "#ff0039"
        };

        Object.keys(containers).forEach(key => {
            const container = containers[key];
            const item = document.createElement('div');
            item.className = 'item';

            const dotColor = colorMap[container.color] || container.color;

            item.innerHTML = `
                <div class="item-info">
                    <div class="color-dot" style="background-color: ${dotColor}"></div>
                    <div>${container.name}</div>
                </div>
                <div class="delete-btn" data-id="${key}">&times;</div>
            `;

            item.querySelector('.delete-btn').addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                delete containers[id];
                await chrome.storage.local.set({ containers });
                renderList();
            });

            listElement.appendChild(item);
        });
    }
});
