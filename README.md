# Home Inventory Manager

This is a lightweight, client‑side web application that helps you track the contents of your home.  You can add, edit and delete items, assign them to categories, and record where they are stored.  The data is saved in your web browser's **localStorage**, so you can continue using the app even after closing the browser or shutting down your computer.  You can also export your inventory to a JSON file and import it later if needed.

## Features

- Add new items with name, category, quantity, unit, location and optional notes.
- Edit existing items or delete them when they are no longer needed.
- Filter items by category or search by name/notes.
- Export your entire inventory to a JSON file.
- Import a previously exported inventory file (replaces current data).
- All data is stored locally in your browser and never sent to any server.

## Getting Started

1. Clone or download the contents of this `inventory_app` directory.
2. Open `index.html` in any modern web browser.  There is no server required.
3. Begin adding items using the form at the top of the page.  Your data will be saved automatically.

## Deploying to GitHub Pages

If you'd like to host this app on GitHub Pages so that you can access it from any device, follow these steps:

1. Create a new repository on GitHub (for example, `home-inventory`).  You can do this by signing into [GitHub](https://github.com/) and clicking **New** in the repositories section.
2. Upload all files from the `inventory_app` directory into the root of your new repository.  You can drag and drop the files via GitHub’s web interface or use `git` on your computer to commit and push them.
3. Once the files are in the repository, go to the repository **Settings** → **Pages** section.
4. Under **Source**, select the branch (usually `main`) and the folder `/ (root)` where the files are located.  Click **Save**.
5. GitHub will build your site and provide a URL (something like `https://<username>.github.io/home-inventory`).  Open this URL to access your inventory manager online.

## Import/Export Tips

- **Exporting:** Click **Export JSON** to download a file named `inventory_export.json`.  This file contains your entire inventory as JSON.
- **Importing:** Click **Import JSON** and choose a previously exported JSON file.  Importing will replace your current inventory, so be sure you really intend to overwrite.

## Editing Categories

Categories are determined automatically based on your existing items.  When you add a new item with a category that doesn't already exist, it will automatically appear in the category filter and autocomplete list.

## Notes

This app uses HTML, CSS and vanilla JavaScript.  There's no backend or database server – all data stays in your browser.  Because of this, if you clear your browser's storage or switch to a different browser/device, you won't see your inventory unless you import it from a JSON file or host the app online via GitHub Pages.