/*
 * Home Inventory Manager (No Token Version)
 *
 * This script powers a simple client‑side inventory management application.
 * The data for the inventory is fetched from a JSON file stored in a
 * public GitHub repository using the raw file URL. No personal access
 * token is required for reading the data. All changes you make in the
 * interface remain local until you choose to manually update the file on
 * GitHub. To assist with updating, the app provides buttons to copy the
 * current JSON to your clipboard and to open the GitHub edit page for
 * the JSON file. Sorting, searching, filtering, adding, editing and
 * deleting items are all supported in the browser.
 */

(function () {
  // ==== Configuration ====
  // URL of the JSON file in your public GitHub repository. Adjust the
  // username, repository and branch/path to match your setup. When the
  // page loads, the app will fetch data from this URL.
  const REMOTE_JSON_URL =
    'https://raw.githubusercontent.com/danilolaurindo/home-inventory/main/inventory_data.json';
  // URL of the GitHub edit page for the JSON file. Clicking the GitHub
  // button will open this URL in a new tab. You can then paste the
  // updated JSON from your clipboard and commit the change. No token
  // authentication is required to view the page, but you must be logged
  // in to GitHub and have write permissions to save changes.
  const GITHUB_EDIT_URL =
    'https://github.com/danilolaurindo/home-inventory/edit/main/inventory_data.json';

  // ==== DOM Elements ====
  const form = document.getElementById('inventory-form');
  const itemIdField = document.getElementById('item-id');
  const nameInput = document.getElementById('item-name');
  const categoryInput = document.getElementById('item-category');
  const qtyInput = document.getElementById('item-qty');
  const unitInput = document.getElementById('item-unit');
  const locationInput = document.getElementById('item-location');
  const notesInput = document.getElementById('item-notes');
  const saveButton = document.getElementById('save-button');
  const cancelEditButton = document.getElementById('cancel-edit');
  const tableBody = document.querySelector('#inventory-table tbody');
  const searchInput = document.getElementById('search-input');
  const categoryFilter = document.getElementById('category-filter');
  const categoryOptionsList = document.getElementById('category-options');
  const exportButton = document.getElementById('export-btn');
  const importButton = document.getElementById('import-btn');
  const importFileInput = document.getElementById('import-file');
  const copyButton = document.getElementById('copy-btn');
  const githubButton = document.getElementById('github-btn');

  // ==== State ====
  // In‑memory array of inventory items. Each item is an object with
  // name, category, qty, unit, location and notes properties. An
  // internal id property is added for editing convenience.
  let inventory = [];
  // Current sort settings. Null means no sort has been applied yet.
  let currentSortColumn = null;
  let currentSortAscending = true;

  // ==== Helpers ====
  /**
   * Generate a unique identifier for an inventory item. Combines the
   * current timestamp with a random component to reduce collisions.
   * @returns {string}
   */
  function generateId() {
    return (
      Date.now().toString(36) + Math.random().toString(36).substring(2, 11)
    );
  }

  /**
   * Fetch the remote inventory JSON from GitHub. If the request
   * succeeds and the data is valid JSON, an array of items is returned.
   * Any errors will cause an empty array to be returned. The
   * cache is bypassed to ensure the latest version is loaded.
   * @returns {Promise<Array>}
   */
  async function fetchRemoteInventory() {
    try {
      const response = await fetch(REMOTE_JSON_URL, { cache: 'no-store' });
      if (!response.ok) {
        console.warn(
          'Failed to fetch remote inventory:',
          response.status,
          response.statusText
        );
        return [];
      }
      const text = await response.text();
      const trimmed = text.trim();
      if (!trimmed) {
        return [];
      }
      const data = JSON.parse(trimmed);
      if (Array.isArray(data)) {
        return data;
      }
      console.warn('Remote data is not an array');
    } catch (err) {
      console.error('Error fetching remote inventory:', err);
    }
    return [];
  }

  /**
   * Render the inventory table and category filters based on the current
   * inventory, sort order and filter settings. The rendering is
   * idempotent – it always clears the table body before inserting rows.
   */
  function render() {
    // Compute set of unique categories for autocompletion and filtering
    const categories = new Set(
      inventory.map((item) => item.category).filter((c) => c)
    );
    // Populate datalist for category input
    categoryOptionsList.innerHTML = '';
    categories.forEach((cat) => {
      const option = document.createElement('option');
      option.value = cat;
      categoryOptionsList.appendChild(option);
    });
    // Preserve selected filter
    const selectedFilter = categoryFilter.value;
    // Populate category filter select
    categoryFilter.innerHTML = '<option value="">All Categories</option>';
    categories.forEach((cat) => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      categoryFilter.appendChild(option);
    });
    if (selectedFilter && categories.has(selectedFilter)) {
      categoryFilter.value = selectedFilter;
    }

    // Apply search and category filters
    const searchTerm = searchInput.value.trim().toLowerCase();
    const categoryTerm = categoryFilter.value;
    let filtered = inventory;
    if (categoryTerm) {
      filtered = filtered.filter((item) => item.category === categoryTerm);
    }
    if (searchTerm) {
      filtered = filtered.filter((item) => {
        const haystack = `${item.name} ${item.notes}`.toLowerCase();
        return haystack.includes(searchTerm);
      });
    }

    // Clear table body
    tableBody.innerHTML = '';
    // Build table rows
    filtered.forEach((item) => {
      const row = document.createElement('tr');
      // Name
      const nameCell = document.createElement('td');
      nameCell.textContent = item.name;
      row.appendChild(nameCell);
      // Category
      const categoryCell = document.createElement('td');
      categoryCell.textContent = item.category;
      row.appendChild(categoryCell);
      // Quantity
      const qtyCell = document.createElement('td');
      qtyCell.textContent = item.qty;
      row.appendChild(qtyCell);
      // Unit
      const unitCell = document.createElement('td');
      unitCell.textContent = item.unit;
      row.appendChild(unitCell);
      // Location
      const locationCell = document.createElement('td');
      locationCell.textContent = item.location;
      row.appendChild(locationCell);
      // Notes
      const notesCell = document.createElement('td');
      notesCell.textContent = item.notes;
      row.appendChild(notesCell);
      // Actions
      const actionCell = document.createElement('td');
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.className = 'action-button edit-btn';
      editBtn.onclick = () => startEdit(item.id);
      actionCell.appendChild(editBtn);
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'action-button delete-btn';
      deleteBtn.onclick = () => deleteItem(item.id);
      actionCell.appendChild(deleteBtn);
      row.appendChild(actionCell);
      tableBody.appendChild(row);
    });
  }

  /**
   * Sort the inventory array by a given column. If the same column is
   * clicked consecutively, the sort direction is toggled. Otherwise
   * ascending order is used. After sorting, the table is re‑rendered
   * and sort indicators are updated on the column headers.
   * @param {string} column The property to sort by (name, category, qty, unit, location, notes).
   */
  function sortInventoryBy(column) {
    if (currentSortColumn === column) {
      currentSortAscending = !currentSortAscending;
    } else {
      currentSortColumn = column;
      currentSortAscending = true;
    }
    inventory.sort((a, b) => {
      let aVal = a[column];
      let bVal = b[column];
      if (column === 'qty') {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
        return currentSortAscending ? aVal - bVal : bVal - aVal;
      }
      aVal = (aVal || '').toString().toLowerCase();
      bVal = (bVal || '').toString().toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return currentSortAscending ? cmp : -cmp;
    });
    // Update sort indicators on header cells
    const headerCells = document.querySelectorAll('#inventory-table th[data-column]');
    headerCells.forEach((th) => {
      th.removeAttribute('data-sort');
      if (th.dataset.column === currentSortColumn) {
        th.setAttribute('data-sort', currentSortAscending ? 'asc' : 'desc');
      }
    });
    render();
  }

  /**
   * Reset the form to its default state, clearing all inputs and
   * removing the editing state. Hides the cancel button and resets
   * the save button text.
   */
  function resetForm() {
    itemIdField.value = '';
    form.reset();
    saveButton.textContent = 'Save Item';
    cancelEditButton.style.display = 'none';
  }

  /**
   * Handle form submission for adding or updating an item. If the
   * hidden ID field contains a value, the corresponding item is
   * updated; otherwise a new item is added.
   * @param {Event} evt
   */
  function handleFormSubmit(evt) {
    evt.preventDefault();
    const id = itemIdField.value;
    const name = nameInput.value.trim();
    const category = categoryInput.value.trim();
    const qty = qtyInput.value ? parseFloat(qtyInput.value) : 0;
    const unit = unitInput.value.trim();
    const location = locationInput.value.trim();
    const notes = notesInput.value.trim();
    if (!name) {
      alert('Please enter an item name.');
      return;
    }
    if (id) {
      // Update existing item
      const index = inventory.findIndex((it) => it.id === id);
      if (index !== -1) {
        inventory[index] = {
          id,
          name,
          category,
          qty,
          unit,
          location,
          notes,
        };
      }
    } else {
      // Add new item
      const newItem = {
        id: generateId(),
        name,
        category,
        qty,
        unit,
        location,
        notes,
      };
      inventory.push(newItem);
    }
    resetForm();
    render();
  }

  /**
   * Begin editing an existing item. Populates the form fields with
   * that item's data and shows the cancel button.
   * @param {string} id
   */
  function startEdit(id) {
    const item = inventory.find((it) => it.id === id);
    if (!item) return;
    itemIdField.value = item.id;
    nameInput.value = item.name;
    categoryInput.value = item.category;
    qtyInput.value = item.qty;
    unitInput.value = item.unit;
    locationInput.value = item.location;
    notesInput.value = item.notes;
    saveButton.textContent = 'Update Item';
    cancelEditButton.style.display = 'inline-block';
  }

  /**
   * Delete an item by its ID after confirming with the user.
   * @param {string} id
   */
  function deleteItem(id) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    const index = inventory.findIndex((it) => it.id === id);
    if (index !== -1) {
      inventory.splice(index, 1);
      // If we were editing this item, reset the form
      if (itemIdField.value === id) {
        resetForm();
      }
      render();
    }
  }

  /**
   * Export the current inventory to a JSON file. Triggers a download
   * named inventory_export.json.
   */
  function exportJSON() {
    const dataStr = JSON.stringify(
      inventory.map(({ id, ...rest }) => rest),
      null,
      2
    );
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory_export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Open the hidden file input when the user clicks the import button.
   */
  function openImportDialog() {
    importFileInput.value = '';
    importFileInput.click();
  }

  /**
   * Handle importing data from a selected JSON file. It replaces the
   * current inventory with the imported items after confirmation.
   * @param {Event} evt
   */
  function handleImport(evt) {
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) throw new Error('Invalid format');
        if (
          !confirm(
            'Importing will replace your current inventory. Continue?'
          )
        ) {
          return;
        }
        inventory = data.map((item) => {
          return {
            id: generateId(),
            name: item.name || '',
            category: item.category || '',
            qty: typeof item.qty === 'number' ? item.qty : 0,
            unit: item.unit || '',
            location: item.location || '',
            notes: item.notes || '',
          };
        });
        resetForm();
        render();
      } catch (err) {
        alert('Failed to import: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  /**
   * Copy the current inventory JSON (without internal IDs) to the
   * clipboard. Uses the Clipboard API where available. If copying
   * fails, an alert notifies the user.
   */
  async function copyJSONToClipboard() {
    const dataStr = JSON.stringify(
      inventory.map(({ id, ...rest }) => rest),
      null,
      2
    );
    try {
      await navigator.clipboard.writeText(dataStr);
      alert('Inventory JSON copied to clipboard.');
    } catch (err) {
      console.error('Failed to copy JSON:', err);
      alert('Unable to copy to clipboard. Please copy manually.');
    }
  }

  /**
   * Open the GitHub edit page for the inventory data file in a new
   * browser tab. Before opening, it copies the current JSON to the
   * clipboard so you can quickly paste it into the GitHub editor.
   */
  async function openGitHubEditPage() {
    await copyJSONToClipboard();
    window.open(GITHUB_EDIT_URL, '_blank');
  }

  // ==== Event Listeners ====
  form.addEventListener('submit', handleFormSubmit);
  cancelEditButton.addEventListener('click', () => {
    resetForm();
  });
  searchInput.addEventListener('input', () => {
    render();
  });
  categoryFilter.addEventListener('change', () => {
    render();
  });
  exportButton.addEventListener('click', exportJSON);
  importButton.addEventListener('click', openImportDialog);
  importFileInput.addEventListener('change', handleImport);
  copyButton.addEventListener('click', copyJSONToClipboard);
  githubButton.addEventListener('click', openGitHubEditPage);
  // Column sorting events
  const headerCells = document.querySelectorAll('#inventory-table th[data-column]');
  headerCells.forEach((th) => {
    th.addEventListener('click', () => {
      const column = th.dataset.column;
      sortInventoryBy(column);
    });
  });

  // ==== Initialization ====
  (async function init() {
    // Load inventory from remote JSON file on GitHub
    const data = await fetchRemoteInventory();
    inventory = data.map((item) => {
      return {
        id: generateId(),
        name: item.name || '',
        category: item.category || '',
        qty: typeof item.qty === 'number' ? item.qty : 0,
        unit: item.unit || '',
        location: item.location || '',
        notes: item.notes || '',
      };
    });
    render();
  })();
})();