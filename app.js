'use strict';

const STORAGE_KEY = 'sandelis-krovimas-v1';

/** @type {{id:string, warehouse:string, equipment:string, quantity:number, done:boolean}[]} */
let items = [];
let filterMode = 'all'; // all | pending | done

// --- Persistence ---------------------------------------------------------
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    items = raw ? JSON.parse(raw) : [];
  } catch (e) {
    items = [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    /* ignore quota errors */
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// --- Elements ------------------------------------------------------------
const el = {
  form: document.getElementById('addForm'),
  warehouse: document.getElementById('warehouse'),
  equipment: document.getElementById('equipment'),
  quantity: document.getElementById('quantity'),
  list: document.getElementById('itemList'),
  empty: document.getElementById('emptyState'),
  warehouseList: document.getElementById('warehouseList'),
  progressCard: document.getElementById('progressCard'),
  progressText: document.getElementById('progressText'),
  progressPercent: document.getElementById('progressPercent'),
  progressFill: document.getElementById('progressFill'),
  filterBtn: document.getElementById('filterBtn'),
  clearDoneBtn: document.getElementById('clearDoneBtn'),
};

// --- Rendering -----------------------------------------------------------
function visibleItems() {
  if (filterMode === 'pending') return items.filter((i) => !i.done);
  if (filterMode === 'done') return items.filter((i) => i.done);
  return items;
}

function render() {
  // Datalist of known warehouses
  const warehouses = [...new Set(items.map((i) => i.warehouse).filter(Boolean))].sort();
  el.warehouseList.innerHTML = warehouses.map((w) => `<option value="${escapeHtml(w)}">`).join('');

  const shown = visibleItems();
  el.list.innerHTML = shown.map(rowHtml).join('');
  el.empty.hidden = items.length !== 0;

  // Progress
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  el.progressCard.hidden = total === 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  el.progressText.textContent = `${done} / ${total} pakrauta`;
  el.progressPercent.textContent = `${pct}%`;
  el.progressFill.style.width = `${pct}%`;
}

function rowHtml(item) {
  return `
    <li class="item-row ${item.done ? 'done' : ''}" data-id="${item.id}">
      <button class="item-check ${item.done ? 'checked' : ''}" data-action="toggle" aria-label="Pažymėti pakrautą">${item.done ? '✓' : ''}</button>
      <span class="item-wh">${escapeHtml(item.warehouse)}</span>
      <span class="item-eq">${escapeHtml(item.equipment)}</span>
      <span class="item-qty">${item.quantity}</span>
      <button class="del-btn" data-action="delete" aria-label="Ištrinti">✕</button>
    </li>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// --- Actions -------------------------------------------------------------
el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const warehouse = el.warehouse.value.trim();
  const equipment = el.equipment.value.trim();
  const quantity = Math.max(1, parseInt(el.quantity.value, 10) || 1);
  if (!warehouse || !equipment) return;

  items.unshift({ id: uid(), warehouse, equipment, quantity, done: false });
  save();
  render();

  // Reset only equipment + qty, keep warehouse for fast multi-add
  el.equipment.value = '';
  el.quantity.value = '1';
  el.equipment.focus();
});

el.list.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const row = btn.closest('.item-row');
  const id = row && row.dataset.id;
  const item = items.find((i) => i.id === id);
  if (!item) return;

  if (btn.dataset.action === 'toggle') {
    item.done = !item.done;
    save();
    render();
  } else if (btn.dataset.action === 'delete') {
    if (confirm(`Ištrinti „${item.equipment}"?`)) {
      items = items.filter((i) => i.id !== id);
      save();
      render();
    }
  }
});

el.filterBtn.addEventListener('click', () => {
  filterMode = filterMode === 'all' ? 'pending' : filterMode === 'pending' ? 'done' : 'all';
  const labels = { all: 'visi', pending: 'nepakrauti', done: 'pakrauti' };
  el.filterBtn.textContent = `Rodyti: ${labels[filterMode]}`;
  render();
});

el.clearDoneBtn.addEventListener('click', () => {
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === 0) return;
  if (confirm(`Pašalinti ${doneCount} pakrautą (-us) įrašą (-us) iš sąrašo?`)) {
    items = items.filter((i) => !i.done);
    save();
    render();
  }
});

// --- PWA install ---------------------------------------------------------
let deferredPrompt = null;
const installBtn = document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});
window.addEventListener('appinstalled', () => { installBtn.hidden = true; });

// --- Service worker ------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// --- Init ----------------------------------------------------------------
load();
render();
