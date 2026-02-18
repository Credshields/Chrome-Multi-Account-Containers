# Chrome Multi-Account Containers

> **Isolate your online identity. Manage multiple logins. Stay organized.**
> *A powerful productivity tool for Google Chrome to separate your browsing habits.*

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.0-green.svg)
![Chrome](https://img.shields.io/badge/platform-Chrome-red.svg)

## 📖 Overview

**Chrome Multi-Account Containers** allows you to separate your work, personal, and shopping browsing habits into distinct "Containers". 

Each Container has its own **isolated cookie jar**, meaning you can sign in to two different accounts on the same site (e.g., Gmail, Twitter, AWS) simultaneously in different tabs, without using Incognito mode or different browser profiles. Tabs are visually grouped by color and managed automatically.

---

## ✨ Features

- **🍪 True Session Isolation**: Tabs in different containers share no cookies. Log into `Work` email in one tab and `Personal` email in another.
- **🎨 Visual Organization**: Containers are color-coded and automatically grouped using Chrome's **Tab Groups** feature for easy identification.
- **📌 Site Assignment**: "Always Open Site in..." lets you bind specific domains (e.g., `bank.com`) to a specific container, ensuring you never accidentally open a sensitive site in the wrong context.
- **🔄 Session Management**:
  - **Open New Tab in...**: Quickly spawn isolated tabs for specific contexts.
  - **Reopen in Container**: Move existing tabs to a secure container instantly.
  - **Sort Tabs**: Automatically organize your workspace by container group.
- **🌗 Dark Mode Support**: Fully adaptive UI that respects your system theme.

---

## 🚀 Installation

### Manual Installation (Developer Mode)
1. Clone this repository:
   ```bash
   git clone https://github.com/Credshields/Chrome-Multi-Account-Containers.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in top-right).
4. Click **Load unpacked**.
5. Select the `chrome-multi-account-containers` folder from this repository.

---

## 🛠 Usage

1. **Click the Extension Icon**:
   - Select a Container (e.g., "Personal", "Work") to open a new isolated tab.
   - Use the menu to **"Always Open This Site in..."** to assign a domain permanently.
2. **Manage Containers**:
   - Go to "Manage Containers" to create custom containers (e.g., "Side Project", "Shopping") with custom colors and icons.
3. **Tab Groups**:
   - All tabs in a container are automatically grouped. Closing the visual group closes all contained tabs, keeping your workspace clean.

---

## 🏗 Architecture

This extension leverages modern Chrome APIs to deliver robust isolation:

1. **Virtual Containers**: Container states are managed securely in `chrome.storage.local`.
2. **Cookie Swapping**: When you switch tabs, the background service worker snapshots the current cookies and harmoniously swaps them for the target container's cookies.
3. **Tab Groups**: Visual indication is handled via the native `chrome.tabGroups` API to provide a seamless user experience.

> **Note**: Cookies are swapped globally for the active window to maintain session state. Background requests in inactive tabs *may* momentarily use the active tab's cookies. This design is optimized for productivity and session management.

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">
  Built by <a href="https://credshields.com">CredShields</a>
</div>
