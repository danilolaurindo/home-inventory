(function() {
  // ======== Remote storage config (GitHub JSON only) ========
  const GH_REPO_OWNER = 'danilolaurindo';      // e.g., danilolaurindo
  const GH_REPO_NAME  = 'home-inventory';     // repository name
  const GH_FILE_PATH  = 'inventory_data.json';// path to JSON file in repo
  const GH_BRANCH     = 'main';               // branch name
  const GH_TOKEN      = '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';                   // fine-grained PAT for this repo (Contents: read/write)

  // ======== App state ========
  let inventory = [];
  let editingId = null;
  let sortKey = 'name';
  let sortDir = 'asc'; // 'asc' or 'desc'

  // ======== DOM ========
  const els = {
    name: document.getElementById('name'),
    category: document.getElementById('category'),
    qty: document.getElementById('qty'),
    unit: document.getElementById('unit'),
    location: document.getElementById('location'),
    notes: document.getElementById('notes'),
    addBtn: document.getElementById('addBtn'),
    updateBtn: document.getElementById('updateBtn'),
    cancelEditBtn: document.getElementById('cancelEditBtn'),
    tableBody: document.querySelector('#inventoryTable tbody'),
    tableHead: document.querySelector('#inventoryTable thead'),
    searchInput: document.getElementById('searchInput'),
    categoryFilter: document.getElementById('categoryFilter'),
    exportBtn: document.getElementById('exportBtn'),
    importInput: document.getElementById('importInput')
  };

  function generateId() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  }

  // ======== Remote helpers (GitHub Contents API) ========
  async function ghGetFile() {
    const url = `https://api.github.com/repos/${GH_REPO_OWNER}/${GH_REPO_NAME}/contents/${GH_FILE_PATH}?ref=${GH_BRANCH}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github+json',
        ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {})
      }
    });
    if (res.status === 404) return { exists:false, sha:null, data:[] };
    if (!res.ok) throw new Error('GitHub fetch failed: ' + res.status);
    const json = await res.json();
    const text = atob((json.content || '').replace(/\n/g,''));
    const data = JSON.parse(text || '[]');
    return { exists:true, sha: json.sha, data };
  }

  async function ghPutFile(newData, prevSha) {
    const url = `https://api.github.com/repos/${GH_REPO_OWNER}/${GH_REPO_NAME}/contents/${GH_FILE_PATH}`;
    const body = {
      message: 'Update inventory_data.json via web app',
      content: btoa(JSON.stringify(newData, null, 2)),
      branch: GH_BRANCH,
      sha: prevSha || undefined
    };
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {})
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('GitHub update failed: ' + res.status);
    return res.json();
  }

  // ======== Load & Save ========
  let currentSha = null;

  async function loadInventory() {
    try {
      const { exists, sha, data } = await ghGetFile();
      currentSha = sha || null;
      // ensure every item has an id
      inventory = (Array.isArray(data) ? data : []).map(it => ({
        id: it.id || generateId(),
        name: it.name || '',
        category: it.category || '',
        qty: Number(it.qty || 0),
        unit: it.unit || '',
        location: it.location || '',
        notes: it.notes || ''
      }));
      render();
    } catch (e) {
      console.error(e);
      alert('Failed to load inventory from GitHub. Check repo path, branch, and token.');
      inventory = [];
      render();
    }
  }

  async function saveInventory() {
    try {
      const data = inventory.map(it => ({ id: it.id, name: it.name, category: it.category, qty: it.qty, unit: it.unit, location: it.location, notes: it.notes }));
      const json = await ghPutFile(data, currentSha);
      currentSha = json.content?.sha || currentSha; // update known sha
    } catch (e) {
      console.error(e);
      alert('Failed to save inventory to GitHub. Check token permissions.');
    }
  }

  // ======== UI Helpers ========
  function clearForm() {
    els.name.value = '';
    els.category.value = '';
    els.qty.value = '';
    els.unit.value = '';
    els.location.value = '';
    els.notes.value = '';
  }

  function startEdit(item) {
    editingId = item.id;
    els.name.value = item.name;
    els.category.value = item.category;
    els.qty.value = item.qty;
    els.unit.value = item.unit;
    els.location.value = item.location;
    els.notes.value = item.notes;
    els.addBtn.style.display = 'none';
    els.updateBtn.style.display = '';
    els.cancelEditBtn.style.display = '';
  }

  function stopEdit() {
    editingId = null;
    clearForm();
    els.addBtn.style.display = '';
    els.updateBtn.style.display = 'none';
    els.cancelEditBtn.style.display = 'none';
  }

  // Sorting logic
  function compare(a, b, key) {
    const va = a[key]; const vb = b[key];
    if (key === 'qty') return (Number(va) - Number(vb));
    return String(va || '').localeCompare(String(vb || ''), undefined, { sensitivity:'base' });
  }

  function sortData(data) {
    const arr = [...data].sort((a,b) => compare(a,b,sortKey));
    if (sortDir === 'desc') arr.reverse();
    return arr;
  }

  function updateSortIndicators() {
    document.querySelectorAll('#inventoryTable thead th').forEach(th => {
      th.classList.remove('sorted-asc','sorted-desc');
      const k = th.getAttribute('data-key');
      if (k && k === sortKey) th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    });
  }

  // ======== Render ========
  function render() {
    // derive category list
    const categories = [...new Set(inventory.map(i => i.category).filter(Boolean))].sort();
    els.categoryFilter.innerHTML = '<option value="">All categories</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');

    const q = (els.searchInput.value || '').trim().toLowerCase();
    const cf = els.categoryFilter.value || '';
    let rows = inventory.filter(it => {
      const text = `${it.name} ${it.location} ${it.notes}`.toLowerCase();
      const okText = !q || text.includes(q);
      const okCat = !cf || it.category === cf;
      return okText && okCat;
    });

    rows = sortData(rows);
    updateSortIndicators();

    els.tableBody.innerHTML = rows.map(it => `
      <tr data-id="${it.id}">
        <td>${escapeHtml(it.name)}</td>
        <td>${escapeHtml(it.category)}</td>
        <td class="numeric">${Number(it.qty)}</td>
        <td>${escapeHtml(it.unit)}</td>
        <td>${escapeHtml(it.location)}</td>
        <td>${escapeHtml(it.notes)}</td>
        <td>
          <button data-action="edit" data-id="${it.id}">Edit</button>
          <button class="danger" data-action="delete" data-id="${it.id}">Delete</button>
        </td>
      </tr>`).join('');
  }

  function escapeHtml(s='') {
    return s.replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  }

  // ======== Events ========
  els.addBtn.addEventListener('click', async () => {
    const item = {
      id: generateId(),
      name: els.name.value.trim(),
      category: els.category.value.trim(),
      qty: Number(els.qty.value || 0),
      unit: els.unit.value.trim(),
      location: els.location.value.trim(),
      notes: els.notes.value.trim()
    };
    if (!item.name) return alert('Name is required');
    inventory.push(item);
    stopEdit();
    render();
    await saveInventory();
  });

  els.updateBtn.addEventListener('click', async () => {
    if (!editingId) return;
    const idx = inventory.findIndex(i => i.id === editingId);
    if (idx === -1) return;
    inventory[idx] = {
      ...inventory[idx],
      name: els.name.value.trim(),
      category: els.category.value.trim(),
      qty: Number(els.qty.value || 0),
      unit: els.unit.value.trim(),
      location: els.location.value.trim(),
      notes: els.notes.value.trim()
    };
    stopEdit();
    render();
    await saveInventory();
  });

  els.cancelEditBtn.addEventListener('click', () => stopEdit());

  // Table actions (edit/delete)
  els.tableBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (action === 'edit') {
      const item = inventory.find(i => i.id === id);
      if (item) startEdit(item);
    } else if (action === 'delete') {
      const idx = inventory.findIndex(i => i.id === id);
      if (idx !== -1 && confirm('Delete this item?')) {
        inventory.splice(idx,1);
        render();
        await saveInventory();
      }
    }
  });

  // Sorting: click table headers
  els.tableHead.addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th) return;
    const key = th.getAttribute('data-key');
    if (!key) return;
    if (sortKey === key) {
      sortDir = (sortDir === 'asc') ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'asc';
    }
    render();
  });

  // Filters
  els.searchInput.addEventListener('input', render);
  els.categoryFilter.addEventListener('change', render);

  // Export/Import
  els.exportBtn.addEventListener('click', () => {
    const data = inventory.map(it => ({ id: it.id, name: it.name, category: it.category, qty: it.qty, unit: it.unit, location: it.location, notes: it.notes }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'inventory_data.json'; a.click();
    URL.revokeObjectURL(url);
  });

  els.importInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    let parsed = [];
    try { parsed = JSON.parse(text); } catch { return alert('Invalid JSON'); }
    if (!Array.isArray(parsed)) return alert('Expected an array of items');
    inventory = parsed.map(it => ({
      id: it.id || generateId(),
      name: it.name || '',
      category: it.category || '',
      qty: Number(it.qty || 0),
      unit: it.unit || '',
      location: it.location || '',
      notes: it.notes || ''
    }));
    render();
    await saveInventory();
    e.target.value = '';
  });

  // Init
  loadInventory();
})();
