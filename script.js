/*
 * Home Inventory Manager (GitHub Actions Edition)
 *
 * This script powers a client‑side inventory management application that
 * synchronises its data with a JSON file stored in a GitHub repository.
 * To avoid embedding a personal access token in the browser, updates
 * are not written directly from the client. Instead, the application
 * provides a “Prepare GitHub Update” button which generates a link to
 * create a new issue in your repository. A GitHub Action (stored in
 * your repo) can read the JSON data from the issue body and commit
 * it using a secret token stored in your repository’s secrets.
 */

(function () {
  // ==== Remote storage configuration ====
  // Whether to load initial data from GitHub. If true, the app will fetch
  // inventory_data.json from the specified repository using the raw
  // GitHub URL. No authentication is required for reading public files.
  const REMOTE_STORAGE_ENABLED = true;
  // GitHub repository owner and name
  const GH_REPO_OWNER = 'danilolaurindo';
  const GH_REPO_NAME = 'home-inventory';
  // File path and branch for the inventory JSON file
  const GH_FILE_PATH = 'inventory_data.json';
  const GH_BRANCH = 'main';
  // Construct the raw.githubusercontent.com URL for the JSON file
  const RAW_BASE_URL =
    'https://raw.githubusercontent.com/' +
    GH_REPO_OWNER +
    '/' +
    GH_REPO_NAME +
    '/' +
    GH_BRANCH +
    '/' +
    GH_FILE_PATH;
  // Token is no longer used on the client; kept for backward compatibility
  const GH_TOKEN = '';

  // ==== DOM references ====
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

  // ==== State ====
  let inventory = [];
  let currentSortColumn = null;
  let currentSortAscending = true;

  // ==== Helper functions ====
  function generateId() {
    return (
      Date.now().toString(36) + Math.random().toString(36).substring(2, 11)
    );
  }

  async function fetchRemoteData() {
    // Load the inventory from a raw JSON file in the repository. This
    // function does not require authentication because raw files are
    // publicly accessible on GitHub. If the file cannot be fetched or
    // parsed, null is returned.
    if (!REMOTE_STORAGE_ENABLED) return null;
    try {
      const response = await fetch(RAW_BASE_URL);
      if (!response.ok) {
        console.warn(
          'Failed to fetch remote inventory:',
          response.status,
          response.statusText
        );
        return null;
      }
      const text = await response.text();
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return data;
      }
      console.error('Remote inventory is not an array');
    } catch (err) {
      console.error('Error fetching remote inventory:', err);
    }
    return null;
  }

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
        console.warn(
          'Failed to get remote file SHA:',
          response.status,
          response.statusText
        );
        return null;
      }
      const json = await response.json();
      return json.sha || null;
    } catch (err) {
      console.error('Error fetching remote file SHA:', err);
      return null;
    }
  }

  async function updateRemoteData() {
    if (!REMOTE_STORAGE_ENABLED || !GH_TOKEN) {
      return;
    }
    const apiUrl = `https://api.github.com/repos/${GH_REPO_OWNER}/${GH_REPO_NAME}/contents/${GH_FILE_PATH}`;
    try {
      const sha = await getRemoteFileSha();
      const contentString = JSON.stringify(
        inventory.map(({ id, ...rest }) => rest),
        null,
        2
      );
      const contentBase64 = btoa(unescape(encodeURIComponent(contentString)));
      const payload = {
        message: 'Update inventory data',
        content: contentBase64,
        branch: GH_BRANCH,
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
        console.warn(
          'Failed to update remote inventory:',
          response.status,
          response.statusText
        );
      }
    } catch (err) {
      console.error('Error updating remote inventory:', err);
    }
  }

  async function loadInventory() {
    if (REMOTE_STORAGE_ENABLED) {
      const remoteData = await fetchRemoteData();
      if (remoteData && Array.isArray(remoteData)) {
        inventory = remoteData.map((item) => {
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
        return;
      }
    }
    inventory = [];
  }

  function saveInventory() {
    // Persist the current inventory to localStorage so changes are
    // maintained across page reloads. The GitHub JSON file will be
    // updated via a GitHub Action after you create an issue with
    // the updated data (see prepareGithubUpdateLink).
    try {
      const plain = inventory.map(({ id, ...rest }) => rest);
      localStorage.setItem('inventory', JSON.stringify(plain));
    } catch (err) {
      console.warn('Failed to save inventory to localStorage:', err);
    }
    // Refresh the prepared GitHub issue link so it contains the
    // current state of the inventory.
    prepareGithubUpdateLink();
  }

  function render() {
    const categories = new Set(
      inventory.map((item) => item.category).filter((c) => c)
    );
    categoryOptionsList.innerHTML = '';
    categories.forEach((cat) => {
      const option = document.createElement('option');
      option.value = cat;
      categoryOptionsList.appendChild(option);
    });
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
    tableBody.innerHTML = '';
    filtered.forEach((item) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-700';
      nameCell.textContent = item.name;
      row.appendChild(nameCell);
      const categoryCell = document.createElement('td');
      categoryCell.className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-700';
      categoryCell.textContent = item.category;
      row.appendChild(categoryCell);
      const qtyCell = document.createElement('td');
      qtyCell.className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-700';
      qtyCell.textContent = item.qty;
      row.appendChild(qtyCell);
      const unitCell = document.createElement('td');
      unitCell.className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-700';
      unitCell.textContent = item.unit;
      row.appendChild(unitCell);
      const locationCell = document.createElement('td');
      locationCell.className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-700';
      locationCell.textContent = item.location;
      row.appendChild(locationCell);
      const notesCell = document.createElement('td');
      notesCell.className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-700';
      notesCell.textContent = item.notes;
      row.appendChild(notesCell);
      const actionCell = document.createElement('td');
      actionCell.className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-700';
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.className = 'bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 rounded mr-2';
      editBtn.onclick = () => startEdit(item.id);
      actionCell.appendChild(editBtn);
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded';
      deleteBtn.onclick = () => deleteItem(item.id);
      actionCell.appendChild(deleteBtn);
      row.appendChild(actionCell);
      tableBody.appendChild(row);
    });
  }

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
    const headerCells = document.querySelectorAll('#inventory-table th[data-column]');
    headerCells.forEach((th) => {
      th.removeAttribute('data-sort');
      if (th.dataset.column === currentSortColumn) {
        th.setAttribute('data-sort', currentSortAscending ? 'asc' : 'desc');
      }
    });
    render();
  }

  function resetForm() {
    itemIdField.value = '';
    form.reset();
    saveButton.textContent = 'Save Item';
    cancelEditButton.style.display = 'none';
  }

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
    saveInventory();
  }

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

  function deleteItem(id) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    const index = inventory.findIndex((it) => it.id === id);
    if (index !== -1) {
      inventory.splice(index, 1);
      if (itemIdField.value === id) {
        resetForm();
      }
      render();
      saveInventory();
    }
  }

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

  function openImportDialog() {
    importFileInput.value = '';
    importFileInput.click();
  }

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
        saveInventory();
      } catch (err) {
        alert('Failed to import: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

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
  const headerCells = document.querySelectorAll('#inventory-table th[data-column]');
  headerCells.forEach((th) => {
    th.addEventListener('click', () => {
      const column = th.dataset.column;
      sortInventoryBy(column);
    });
  });

  // === GitHub update helpers ===
  const githubUpdateButton = document.getElementById('github-update-btn');
  const githubIssueLink = document.getElementById('github-issue-link');

  /**
   * Build a link to create a new GitHub issue containing the current
   * inventory data. The issue title and body are pre‑populated so that
   * a GitHub Action can read the JSON from the issue body and update
   * the inventory_data.json file using a repository secret.
   */
  function prepareGithubUpdateLink() {
    if (!githubIssueLink) return;
    const plain = inventory.map(({ id, ...rest }) => rest);
    // If there is no data yet, hide the link
    if (plain.length === 0) {
      githubIssueLink.style.display = 'none';
      return;
    }
    const title = 'Update inventory data';
    // JSON wrapped in fenced code block for easier extraction
    const body = '```json\n' + JSON.stringify(plain, null, 2) + '\n```';
    const labels = 'inventory-update';
    const url =
      'https://github.com/' +
      GH_REPO_OWNER +
      '/' +
      GH_REPO_NAME +
      '/issues/new?title=' +
      encodeURIComponent(title) +
      '&labels=' +
      encodeURIComponent(labels) +
      '&body=' +
      encodeURIComponent(body);
    githubIssueLink.href = url;
    githubIssueLink.style.display = 'inline-block';
  }

  if (githubUpdateButton) {
    githubUpdateButton.addEventListener('click', (evt) => {
      evt.preventDefault();
      prepareGithubUpdateLink();
      // Optionally open the link automatically or simply focus on it
      githubIssueLink.focus();
    });
  }
  (async function init() {
    await loadInventory();
    render();
    // Initialise the GitHub issue link based on the loaded inventory
    prepareGithubUpdateLink();
  })();
})();