/*
 * Home Inventory Manager
 *
 * This script powers a simple client‑side inventory management application.
 * It stores all data in the browser's localStorage so that your inventory
 * persists across sessions without any backend or server. Items can be
 * added, edited, deleted, filtered and searched. You can also export
 * your inventory as a JSON file or import a previously exported file.
 */

(function () {
  // Key used to store data in localStorage
  const STORAGE_KEY = 'homeInventoryData';

  /**
   * Remote storage configuration. When enabled, the application will
   * attempt to load and persist inventory data to a JSON file in a
   * GitHub repository. You must supply your GitHub username,
   * repository name, path to the JSON file, and a personal access token
   * with "repo" scope. If REMOTE_STORAGE_ENABLED is false or the token
   * is left blank, the app will continue to use localStorage only.
   */
  const REMOTE_STORAGE_ENABLED = true;
  const GH_REPO_OWNER = 'danilolaurindo'; // change if different owner
  const GH_REPO_NAME = 'home-inventory';   // change if your repo name differs
  const GH_FILE_PATH = 'inventory_data.json';
  const GH_TOKEN = ''; // insert your GitHub personal access token here

  /**
   * Fetch inventory data from a remote JSON file hosted on GitHub. This function
   * constructs the raw file URL and attempts to retrieve the contents. If the
   * file does not exist or cannot be parsed, it returns null so the caller
   * can fall back to local storage. The returned data should be an array of
   * inventory objects. Any network or parsing errors are caught and logged.
   *
   * @returns {Promise<Array|null>} The parsed array of inventory items, or null on error.
   */
  async function fetchRemoteData() {
    if (!REMOTE_STORAGE_ENABLED || !GH_TOKEN) {
      return null;
    }
    const rawUrl = `https://raw.githubusercontent.com/${GH_REPO_OWNER}/${GH_REPO_NAME}/main/${GH_FILE_PATH}`;
    try {
      const response = await fetch(rawUrl, {
        headers: {
          // Use a token here to avoid rate limiting; GitHub raw can still be accessed anonymously
          Authorization: `token ${GH_TOKEN}`,
        },
      });
      if (!response.ok) {
        // A 404 is expected if the file doesn't exist yet
        console.warn('Remote inventory fetch failed:', response.status, response.statusText);
        return null;
      }
      const text = await response.text();
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return data;
      }
      console.error('Remote data is not an array');
    } catch (err) {
      console.error('Error fetching remote inventory:', err);
    }
    return null;
  }

  /**
   * Retrieve the SHA of the remote inventory file on GitHub. The SHA is
   * required when updating an existing file via the GitHub API. If the file
   * does not exist, this function returns null.
   *
   * @returns {Promise<string|null>} The SHA string or null if the file does not exist.
   */
  async function getRemoteFileSha() {
    const apiUrl = `https://api.github.com/repos/${GH_REPO_OWNER}/${GH_REPO_NAME}/contents/${GH_FILE_PATH}`;
    try {
      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `token ${GH_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        console.warn('Failed to get remote file SHA:', response.status, response.statusText);
        return null;
      }
      const json = await response.json();
      return json.sha || null;
    } catch (err) {
      console.error('Error fetching remote file SHA:', err);
      return null;
    }
  }

  /**
   * Persist the current inventory array to a remote JSON file in the
   * configured GitHub repository. The data is base64 encoded and sent via
   * a PUT request to the GitHub REST API. If a SHA exists, it is included
   * to update the file; otherwise GitHub will create a new file. Errors
   * during the update are caught and logged, but do not interrupt the
   * application flow.
   */
  async function updateRemoteData() {
    if (!REMOTE_STORAGE_ENABLED || !GH_TOKEN) {
      return;
    }
    const apiUrl = `https://api.github.com/repos/${GH_REPO_OWNER}/${GH_REPO_NAME}/contents/${GH_FILE_PATH}`;
    try {
      const sha = await getRemoteFileSha();
      const contentString = JSON.stringify(inventory, null, 2);
      // Encode as base64 for GitHub API
      const contentBase64 = btoa(unescape(encodeURIComponent(contentString)));
      const payload = {
        message: 'Update inventory data',
        content: contentBase64,
        branch: 'main',
      };
      if (sha) {
        payload.sha = sha;
      }
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          Authorization: `token ${GH_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        console.warn('Failed to update remote inventory:', response.status, response.statusText);
      }
    } catch (err) {
      console.error('Error updating remote inventory:', err);
    }
  }

  // DOM elements
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

  // In‑memory array of inventory items
  let inventory = [];

  // Chart instance for category visualization
  let categoryChart = null;

  /**
   * Update or create the bar chart showing total quantity per category.
   * This uses Chart.js (imported in index.html). If the chart already
   * exists, its data will be updated; otherwise a new chart is created.
   */
  function updateCategoryChart() {
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('categoryChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    // Compute totals per category
    const totals = {};
    inventory.forEach((item) => {
      const category = item.category || 'Uncategorised';
      const qty = typeof item.qty === 'number' ? item.qty : 0;
      totals[category] = (totals[category] || 0) + qty;
    });
    const labels = Object.keys(totals);
    const data = Object.values(totals);
    if (categoryChart) {
      // Update existing chart
      categoryChart.data.labels = labels;
      categoryChart.data.datasets[0].data = data;
      categoryChart.update();
    } else {
      // Create new chart
      categoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Total Quantity',
              data: data,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: {
              title: {
                display: true,
                text: 'Category',
              },
            },
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Total Quantity',
              },
            },
          },
        },
      });
    }
  }

  /**
   * Load inventory data. When remote storage is enabled and a valid token is
   * present, this function first attempts to fetch the inventory from the
   * remote JSON file in GitHub. If that fails (for example if the file is
   * missing or cannot be parsed), it falls back to the locally stored
   * inventory in localStorage. If neither exists, an empty array is used.
   *
   * @returns {Promise<void>} Resolves once the inventory array is loaded.
   */
  async function loadInventory() {
    // Attempt to load from GitHub if configured
    if (REMOTE_STORAGE_ENABLED && GH_TOKEN) {
      const remoteData = await fetchRemoteData();
      if (remoteData && Array.isArray(remoteData)) {
        inventory = remoteData.map((item) => {
          return {
            id: item.id || Date.now().toString(),
            name: item.name || '',
            category: item.category || '',
            qty: typeof item.qty === 'number' ? item.qty : 0,
            unit: item.unit || '',
            location: item.location || '',
            notes: item.notes || '',
          };
        });
        // also cache locally
        localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
        return;
      }
    }
    // Fallback to localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    inventory = saved ? JSON.parse(saved) : [];
  }

  /**
   * Persist the current inventory array to localStorage and, if remote
   * storage is enabled, update the remote JSON file on GitHub. The
   * update to GitHub is asynchronous and any errors are logged but not
   * propagated. This function should be called every time the inventory
   * array is mutated.
   */
  function saveInventory() {
    // Always update local storage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
    // Trigger remote update asynchronously
    if (REMOTE_STORAGE_ENABLED && GH_TOKEN) {
      updateRemoteData();
    }
  }

  /**
   * Reset the form to its default state, clearing all inputs and removing
   * the editing state. Hides the cancel button and resets the save button text.
   */
  function resetForm() {
    itemIdField.value = '';
    form.reset();
    saveButton.textContent = 'Save Item';
    cancelEditButton.style.display = 'none';
  }

  /**
   * Render the inventory table and populate the category controls based
   * on current data and filters. Filters come from the search input and
   * category filter drop‑down.
   */
  function render() {
    // First, derive the set of categories from the current inventory
    const categories = new Set(inventory.map((item) => item.category).filter(Boolean));

    // Populate the datalist for category input autocomplete
    categoryOptionsList.innerHTML = '';
    categories.forEach((cat) => {
      const option = document.createElement('option');
      option.value = cat;
      categoryOptionsList.appendChild(option);
    });

    // Populate the category filter drop‑down
    // Save the currently selected value to restore after resetting options
    const selectedFilter = categoryFilter.value;
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

    // Filter inventory by search and category
    const searchTerm = searchInput.value.trim().toLowerCase();
    const categoryTerm = categoryFilter.value;
    const filtered = inventory.filter((item) => {
      // Category filter: if selected, ensure exact match
      if (categoryTerm && item.category !== categoryTerm) return false;
      // Search filter: match name or notes (case insensitive)
      if (searchTerm) {
        const haystack = `${item.name} ${item.notes}`.toLowerCase();
        return haystack.includes(searchTerm);
      }
      return true;
    });

    // Render table body
    tableBody.innerHTML = '';
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
      // Edit button
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.className = 'action-button edit-btn';
      editBtn.onclick = () => startEdit(item.id);
      actionCell.appendChild(editBtn);
      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'action-button delete-btn';
      deleteBtn.onclick = () => deleteItem(item.id);
      actionCell.appendChild(deleteBtn);
      row.appendChild(actionCell);

      tableBody.appendChild(row);
    });

    // After rendering the table and updating category lists, update the chart
    updateCategoryChart();
  }

  /**
   * Handle form submission: either add a new item or update an existing one
   * depending on whether there is an ID present in the hidden field.
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
        saveInventory();
        resetForm();
        render();
      }
    } else {
      // Add new item, generate a unique ID using timestamp
      const newItem = {
        id: Date.now().toString(),
        name,
        category,
        qty,
        unit,
        location,
        notes,
      };
      inventory.push(newItem);
      saveInventory();
      resetForm();
      render();
    }
  }

  /**
   * Begin editing an existing item. Populate the form fields with that item's
   * data and set the hidden ID field. Show the cancel button and update
   * the save button's text.
   *
   * @param {string} id The item ID to edit.
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
   *
   * @param {string} id The ID of the item to remove.
   */
  function deleteItem(id) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    const index = inventory.findIndex((it) => it.id === id);
    if (index !== -1) {
      inventory.splice(index, 1);
      saveInventory();
      // If we were editing this item, reset the form
      if (itemIdField.value === id) {
        resetForm();
      }
      render();
    }
  }

  /**
   * Export the current inventory to a JSON file. Triggers a download
   * of a file named inventory_export.json.
   */
  function exportJSON() {
    const dataStr = JSON.stringify(inventory, null, 2);
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
   * current inventory with the imported items after user confirmation.
   */
  function handleImport(evt) {
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) throw new Error('Invalid format');
        if (!confirm('Importing will replace your current inventory. Continue?')) {
          return;
        }
        // Use imported data; ensure each item has required properties
        inventory = data.map((item) => {
          return {
            id: item.id || Date.now().toString(),
            name: item.name || '',
            category: item.category || '',
            qty: typeof item.qty === 'number' ? item.qty : 0,
            unit: item.unit || '',
            location: item.location || '',
            notes: item.notes || '',
          };
        });
        saveInventory();
        resetForm();
        render();
      } catch (err) {
        alert('Failed to import: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // Event listeners
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

  // Initial load from storage (remote or local) and render once loaded
  (async function init() {
    await loadInventory();
    render();
  })();
})();