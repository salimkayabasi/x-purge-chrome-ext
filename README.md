# X-Purge Chrome Extension 🪓

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](package.json)

**X-Purge** is a powerful Chrome extension designed to help you reclaim your privacy on X (formerly Twitter). It provides automated post deletion, allowing you to easily clear your timeline in bulk and protect your digital footprint.

---

## ✨ Features

- **🎯 Precision Targeting**: Specify exactly how many posts you want to delete.
- **↕️ Directional Control**: Choose between deleting your **Latest** posts or hunting down your **Oldest** ones.
- **🎭 Flexible Execution**: 
  - **Foreground Mode**: Watch the automation work in real-time.
  - **Background Mode**: Deletion happens in a non-focused tab, allowing you to continue your work.
- **🖥️ Live Status Overlay**: Injects a dashboard into the X.com interface so you can track progress (e.g., "Deleted: 5/20").
- **🧹 Automated Cleanup**: Automatically closes the working tab or signals completion once the task is finished.

---

## 🚀 How It Works

1. **User Discovery**: The extension identifies your logged-in handle from the X.com navigation bar.
2. **Auto-Navigation**: It automatically redirects to your specific profile page.
3. **UI Automation**: Using safe DOM interaction, it locates the "More" menu on each post, triggers the "Delete" workflow, and confirms the action.
4. **Recursive Logic**: It intelligently waits for the DOM to update before moving to the next post, ensuring no deletions are missed.

---

## 🛠️ Installation (Developer Mode)

Since this is a specialized tool, you can install it manually:

1. Clone this repository: `git clone https://github.com/your-username/x-purge.git`
2. Run the build process:
   ```bash
   npm install
   npm run build
   ```
3. Open Chrome and navigate to `chrome://extensions/`.
4. Enable **Developer mode** (toggle in the top right).
5. Click **Load unpacked** and select the `dist` folder in this project directory.

---

## ⚙️ Configuration

Open the extension popup to configure your deletion run:

- **Count**: Total number of posts to remove.
- **Direction**:
  - `Latest`: Starts from the top of your timeline.
  - `Oldest`: Starts from your earliest accessible posts.
- **Mode**:
  - `Background`: Tab opens but does not take focus.
  - `Foreground`: Tab opens and remains active.

---

## ⚠️ Limitations & Safety

- **Rate Limiting**: X may limit the speed of deletions. The extension includes pauses, but extreme usage might trigger temporary platform restrictions.
- **UI Changes**: This tool relies on the structure of X.com. If X updates its interface, the extension may require an update.
- **Destructive Action**: Deletions are **permanent**. Please use the "Count" parameter carefully.
- **Authentication**: You must be logged into X.com in your browser for the extension to function.

---

## 👩‍💻 Development

### Scripts
- `npm run build`: Cleans the `dist` folder, copies source files, and minifies assets.
- `npm run test`: Runs the Jest test suite with coverage reports.
- `npm run minify`: Manually triggers minification of JS/CSS/HTML.

### Tech Stack
- **Manifest V3**: Built on the latest Chrome Extension standards.
- **Esbuild**: High-performance JavaScript bundling and minification.
- **Jest**: Comprehensive testing framework for logic validation.

---

## ⚖️ Disclaimer & Warning

> [!WARNING]
> **Not Official**: This project is not intended to be an official Chrome Extension and will not be published to the Chrome Web Store.

> [!IMPORTANT]
> **No Warranty**: There is no warranty that this extension will continue to work in the future if X (Twitter) updates its UI.

> [!NOTE]
> **Unmaintained**: This project has no active maintainer and is provided as-is.

*This tool is for personal use and privacy management. The authors are not responsible for any accidental data loss or account restrictions imposed by X.com. Use at your own risk.*
