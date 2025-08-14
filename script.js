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
  // To allow anyone to save changes without requiring a GitHub account, this
  // version uses a public JSON storage API. You must create a JSON endpoint
  // on a service like ExtendsClass (https://extendsclass.com/json-storage.html),
  // jsonstorage.net, or another free JSON storage provider. Set the URL
  // below to the endpoint that stores your inventory JSON. If the provider
  // requires a write key or API token to update the data, put it in
  // JSON_STORE_WRITE_KEY. Leave JSON_STORE_WRITE_KEY empty if not needed.
  const REMOTE_STORAGE_ENABLED = true;
  const JSON_STORE_URL = '';
  const JSON_STORE_WRITE_KEY = '';
  // Some JSON storage services require a custom header for the write key.
  // For example, jsonstorage.net expects 'X-Access-Key', while jsonbin.io
  // uses 'X-Master-Key'. Adjust this constant to match your service.
  const JSON_STORE_HEADER_NAME = 'X-Access-Key';

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
  const saveCloudButton = document.getElementById('save-cloud-btn');

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
    // Load the inventory from a remote JSON storage endpoint. The endpoint
    // should return a JSON array. If fetching or parsing fails, null is
    // returned. A missing URL or disabled remote storage also returns null.
    if (!REMOTE_STORAGE_ENABLED || !JSON_STORE_URL) return null;
    try {
      const response = await fetch(JSON_STORE_URL);
      if (!response.ok) {
        console.warn(
          'Failed to fetch remote inventory:',
          response.status,
          response.statusText
        );
        return null;
      }
      const data = await response.json();
      /*
       * Some JSON storage services (such as jsonbin.io) wrap your data in a
       * `record` property and include metadata.  Accept both plain arrays
       * and objects with a `record` array.  If neither case matches, the
       * remote data is considered invalid.
       */
      if (Array.isArray(data)) {
        return data;
      }
      if (data && typeof data === 'object') {
        // jsonbin.io returns { record: [...] , metadata: {...} }
        if (Array.isArray(data.record)) {
          return data.record;
        }
        // Some services might nest arrays differently
        if (data.record && Array.isArray(data.record.data)) {
          return data.record.data;
        }
      }
      console.error('Remote inventory is not a recognised array format');
    } catch (err) {
      console.error('Error fetching remote inventory:', err);
    }
    return null;
  }

  // Removed getRemoteFileSha; not needed for JSON storage API

  async function updateRemoteData() {
    // Update the remote JSON storage endpoint with the current inventory.
    // This function sends the plain inventory (without internal IDs) as
    // JSON. If the storage provider requires a secret or token for
    // updating, set JSON_STORE_WRITE_KEY accordingly. A missing URL
    // disables this update silently.
    if (!REMOTE_STORAGE_ENABLED || !JSON_STORE_URL) {
      return;
    }
    const plain = inventory.map(({ id, ...rest }) => rest);
    try {
      const response = await fetch(JSON_STORE_URL, {
        method: 'PUT',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          ...(JSON_STORE_WRITE_KEY
            ? { [JSON_STORE_HEADER_NAME]: JSON_STORE_WRITE_KEY }
            : {}),
        },
        body: JSON.stringify(plain, null, 2),
      });
      if (!response.ok) {
        console.warn(
          'Failed to update remote inventory:',
          response.status,
          response.statusText
        );
      }
      return response.ok;
    } catch (err) {
      console.error('Error updating remote inventory:', err);
    }
    return false;
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
    // maintained across page reloads. Remote updates via JSON storage
    // are triggered manually when the user clicks the Save to Cloud button.
    try {
      const plain = inventory.map(({ id, ...rest }) => rest);
      localStorage.setItem('inventory', JSON.stringify(plain));
    } catch (err) {
      console.warn('Failed to save inventory to localStorage:', err);
    }
    // Note: there is no need to refresh a GitHub link here because
    // the update workflow relies on copying JSON to the clipboard.
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

  // Handle saving the current inventory to the shared cloud JSON.
  // This function calls updateRemoteData(), which performs a PUT request to
  // the configured JSON store. After the request completes, we alert the
  // user with the status. Remote updates are disabled if
  // REMOTE_STORAGE_ENABLED is false or JSON_STORE_URL is empty.
  if (saveCloudButton) {
    saveCloudButton.addEventListener('click', async (evt) => {
      evt.preventDefault();
      if (!REMOTE_STORAGE_ENABLED || !JSON_STORE_URL) {
        alert('Cloud save is not configured. Please set JSON_STORE_URL in script.js');
        return;
      }
      // Persist changes to local storage first, then update remote
      saveInventory();
      const success = await updateRemoteData();
      if (success) {
        alert('Inventory saved to cloud.');
      } else {
        alert('Failed to save inventory to cloud. Check your JSON store URL and key.');
      }
    });
  }

  // === GitHub update helpers ===
  // There is no GitHub update modal in the cloud version.  All users will
  // use the "Save to Cloud" button instead.
  const openIssueButton = null;


  // Open the issue modal when the user clicks the Prepare GitHub Update button.
  // No GitHub issue modal in the cloud version, so no event handlers here.
  (async function init() {
    await loadInventory();
    render();
    // Copy button and issue button are always available; nothing else to initialise
  })();
})();