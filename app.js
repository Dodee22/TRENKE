'use strict';

const STORAGE_KEY = 'sandelis-krovimas-v2';
const OLD_KEY = 'sandelis-krovimas-v1';

const DEFAULT_CATEGORIES = ['LED', 'Garsas', 'Šviesa', 'Video', 'Kabeliai', 'Rigging', 'Kita'];
const CATEGORY_COLORS = {
  'LED': '#7c3aed',
  'Garsas': '#dc2626',
  'Šviesa': '#f59e0b',
  'Video': '#2563eb',
  'Kabeliai': '#0891b2',
  'Rigging': '#475569',
  'Kita': '#64748b',
};
function categoryColor(cat) {
  if (!cat) return 'transparent';
  return CATEGORY_COLORS[cat] || '#64748b';
}

/**
 * data = {
 *   categories: string[],
 *   catalog: [{id, name, category, warehouse}],
 *   events: [{ id, name, date, items: [{id, warehouse, equipment, quantity, category, done}] }]
 * }
 */
let data = { events: [], categories: DEFAULT_CATEGORIES.slice(), catalog: [] };
let currentEventId = null;
let filterMode = 'all';            // all | pending | done
let groupMode = 'none';            // none | warehouse | category | case
let loadMode = 'load';             // load | return
let editingItemId = null;

// Kurį lauką žymim pagal režimą: krovimas -> done, grąžinimas -> returned
function statusField() { return loadMode === 'load' ? 'done' : 'returned'; }

// --- Persistence ---------------------------------------------------------
function ensureDefaults(d) {
  if (!d || typeof d !== 'object') d = {};
  if (!Array.isArray(d.events)) d.events = [];
  if (!Array.isArray(d.categories) || d.categories.length === 0) d.categories = DEFAULT_CATEGORIES.slice();
  if (!Array.isArray(d.catalog)) d.catalog = [];
  d.events.forEach((e) => { if (!Array.isArray(e.items)) e.items = []; });
  return d;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      data = ensureDefaults(JSON.parse(raw));
      return;
    }
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const items = JSON.parse(old);
      if (Array.isArray(items) && items.length) {
        data = ensureDefaults({ events: [{ id: uid(), name: 'Bendras sąrašas', date: '', items }] });
        save();
        return;
      }
    }
    data = ensureDefaults({});
  } catch (e) {
    data = ensureDefaults({});
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { /* ignore quota errors */ }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function allWarehouses() {
  const fromItems = data.events.flatMap((e) => e.items.map((i) => i.warehouse));
  const fromCatalog = data.catalog.map((c) => c.warehouse);
  return [...new Set([...fromItems, ...fromCatalog].filter(Boolean))].sort();
}

// --- Elements ------------------------------------------------------------
const el = {
  eventsView: document.getElementById('eventsView'),
  detailView: document.getElementById('detailView'),
  catalogView: document.getElementById('catalogView'),
  headerTitle: document.getElementById('headerTitle'),
  headerSubtitle: document.getElementById('headerSubtitle'),
  backBtn: document.getElementById('backBtn'),
  // events
  addEventForm: document.getElementById('addEventForm'),
  eventName: document.getElementById('eventName'),
  eventDate: document.getElementById('eventDate'),
  eventList: document.getElementById('eventList'),
  eventsEmpty: document.getElementById('eventsEmpty'),
  openCatalogBtn: document.getElementById('openCatalogBtn'),
  // items
  addItemForm: document.getElementById('addItemForm'),
  warehouse: document.getElementById('warehouse'),
  equipment: document.getElementById('equipment'),
  quantity: document.getElementById('quantity'),
  itemCategory: document.getElementById('itemCategory'),
  itemCase: document.getElementById('itemCase'),
  itemList: document.getElementById('itemList'),
  itemsEmpty: document.getElementById('itemsEmpty'),
  warehouseList: document.getElementById('warehouseList'),
  catalogNames: document.getElementById('catalogNames'),
  caseList: document.getElementById('caseList'),
  modeToggle: document.getElementById('modeToggle'),
  // progress
  progressCard: document.getElementById('progressCard'),
  progressText: document.getElementById('progressText'),
  progressPercent: document.getElementById('progressPercent'),
  progressFill: document.getElementById('progressFill'),
  // toolbar
  filterBtn: document.getElementById('filterBtn'),
  clearDoneBtn: document.getElementById('clearDoneBtn'),
  groupBtn: document.getElementById('groupBtn'),
  // edit modal
  editModal: document.getElementById('editModal'),
  editForm: document.getElementById('editForm'),
  editWarehouse: document.getElementById('editWarehouse'),
  editEquipment: document.getElementById('editEquipment'),
  editQuantity: document.getElementById('editQuantity'),
  editCategory: document.getElementById('editCategory'),
  editCase: document.getElementById('editCase'),
  editCancel: document.getElementById('editCancel'),
  // catalog
  addCatalogForm: document.getElementById('addCatalogForm'),
  catName: document.getElementById('catName'),
  catCategory: document.getElementById('catCategory'),
  catWarehouse: document.getElementById('catWarehouse'),
  catalogListEl: document.getElementById('catalogList'),
  catalogEmpty: document.getElementById('catalogEmpty'),
};

function currentEvent() {
  return data.events.find((e) => e.id === currentEventId) || null;
}

// --- Category <select> helpers ------------------------------------------
function fillCategorySelect(select, selected) {
  const opts = ['<option value="">— kategorija —</option>']
    .concat(data.categories.map((c) => `<option value="${escapeHtml(c)}"${c === selected ? ' selected' : ''}>${escapeHtml(c)}</option>`));
  select.innerHTML = opts.join('');
}

function allCases() {
  return [...new Set(
    data.events.flatMap((e) => e.items.map((i) => i.caseName)).filter(Boolean)
  )].sort();
}

function refreshDatalists() {
  el.warehouseList.innerHTML = allWarehouses().map((w) => `<option value="${escapeHtml(w)}">`).join('');
  el.catalogNames.innerHTML = data.catalog
    .map((c) => `<option value="${escapeHtml(c.name)}">`).join('');
  el.caseList.innerHTML = allCases().map((c) => `<option value="${escapeHtml(c)}">`).join('');
}

function syncModeToggle() {
  el.modeToggle.querySelectorAll('.mode-opt').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === loadMode);
  });
}

// --- View switching ------------------------------------------------------
function showEvents() {
  currentEventId = null;
  el.detailView.hidden = true;
  el.catalogView.hidden = true;
  el.eventsView.hidden = false;
  el.backBtn.hidden = true;
  el.headerTitle.textContent = '📦 Renginiai';
  el.headerSubtitle.textContent = 'Ką reikia pasikrauti kiekvienam renginiui';
  renderEvents();
}

function showCatalog() {
  el.eventsView.hidden = true;
  el.detailView.hidden = true;
  el.catalogView.hidden = false;
  el.backBtn.hidden = false;
  el.headerTitle.textContent = '📚 Katalogas';
  el.headerSubtitle.textContent = 'Jūsų įrangos sąrašas daugkartiniam naudojimui';
  fillCategorySelect(el.catCategory, '');
  refreshDatalists();
  renderCatalog();
}

function openEvent(id) {
  currentEventId = id;
  const ev = currentEvent();
  if (!ev) { showEvents(); return; }
  filterMode = 'all';
  loadMode = 'load';
  el.filterBtn.textContent = 'Rodyti: visi';
  syncGroupBtn();
  el.eventsView.hidden = true;
  el.catalogView.hidden = true;
  el.detailView.hidden = false;
  el.backBtn.hidden = false;
  el.headerTitle.textContent = ev.name;
  el.headerSubtitle.textContent = ev.date ? `📅 ${formatDate(ev.date)}` : 'Krovimo sąrašas';
  el.equipment.value = '';
  el.quantity.value = '1';
  el.itemCase.value = '';
  fillCategorySelect(el.itemCategory, '');
  syncModeToggle();
  refreshDatalists();
  renderItems();
}

// --- Rendering: events ---------------------------------------------------
function renderEvents() {
  const evs = data.events;
  el.eventsEmpty.hidden = evs.length !== 0;
  el.eventList.innerHTML = evs.map(eventCardHtml).join('');
}

function eventCardHtml(ev) {
  const total = ev.items.length;
  const done = ev.items.filter((i) => i.done).length;
  const allDone = total > 0 && done === total;
  return `
    <li class="event-card ${allDone ? 'all-done' : ''}" data-id="${ev.id}">
      <button class="event-open" data-action="open">
        <span class="event-main">
          <span class="event-name">${escapeHtml(ev.name)}</span>
          ${ev.date ? `<span class="event-date">📅 ${formatDate(ev.date)}</span>` : ''}
        </span>
        <span class="event-meta">
          <span class="event-count ${allDone ? 'done' : ''}">${done} / ${total}</span>
          <span class="event-chevron">›</span>
        </span>
      </button>
      <button class="icon-btn event-copy" data-action="copyEvent" aria-label="Kopijuoti renginį" title="Kopijuoti">⧉</button>
      <button class="del-btn event-del" data-action="delEvent" aria-label="Ištrinti renginį">✕</button>
    </li>`;
}

// --- Rendering: items ----------------------------------------------------
function visibleItems(ev) {
  if (filterMode === 'pending') return ev.items.filter((i) => !i.done);
  if (filterMode === 'done') return ev.items.filter((i) => i.done);
  return ev.items;
}

function groupKey(item) {
  if (groupMode === 'warehouse') return item.warehouse || '(be sandėlio)';
  if (groupMode === 'category') return item.category || '(be kategorijos)';
  if (groupMode === 'case') return item.caseName || '(be dėžės)';
  return null;
}

function renderItems() {
  const ev = currentEvent();
  if (!ev) return;

  const field = statusField();
  const shown = visibleItems(ev);
  if (groupMode !== 'none') {
    const groups = {};
    shown.forEach((i) => { const k = groupKey(i); (groups[k] = groups[k] || []).push(i); });
    const icon = groupMode === 'warehouse' ? '🏬' : groupMode === 'case' ? '📦' : '🏷️';
    el.itemList.innerHTML = Object.keys(groups).sort().map((k) => {
      const gi = groups[k];
      const gdone = gi.filter((i) => i[field]).length;
      const dot = groupMode === 'category'
        ? `<span class="cat-dot" style="background:${categoryColor(k)}"></span>` : '';
      return `<li class="wh-group-head">
          <span class="wh-group-name">${dot}${icon} ${escapeHtml(k)}</span>
          <span class="wh-group-count ${gdone === gi.length ? 'done' : ''}">${gdone} / ${gi.length}</span>
        </li>` + gi.map(itemRowHtml).join('');
    }).join('');
  } else {
    el.itemList.innerHTML = shown.map(itemRowHtml).join('');
  }
  el.itemsEmpty.hidden = ev.items.length !== 0;

  const total = ev.items.length;
  const done = ev.items.filter((i) => i[field]).length;
  el.progressCard.hidden = total === 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const word = loadMode === 'load' ? 'pakrauta' : 'grąžinta';
  el.progressText.textContent = `${done} / ${total} ${word}`;
  el.progressPercent.textContent = `${pct}%`;
  el.progressFill.style.width = `${pct}%`;
}

function itemRowHtml(item) {
  const field = statusField();
  const on = !!item[field];
  const dot = item.category
    ? `<span class="cat-dot" style="background:${categoryColor(item.category)}" title="${escapeHtml(item.category)}"></span>`
    : '';
  const caseTag = item.caseName
    ? `<small class="item-case">📦 ${escapeHtml(item.caseName)}</small>` : '';
  const checkChar = on ? (loadMode === 'load' ? '✓' : '↩') : '';
  return `
    <li class="item-row ${on ? 'done' : ''}" data-id="${item.id}">
      <button class="item-check ${on ? 'checked' : ''} ${loadMode === 'return' ? 'return' : ''}" data-action="toggle" aria-label="Pažymėti">${checkChar}</button>
      <span class="item-wh" data-action="edit">${escapeHtml(item.warehouse)}</span>
      <span class="item-eq" data-action="edit">
        <span class="eq-line">${dot}${escapeHtml(item.equipment)}</span>
        ${caseTag}
      </span>
      <span class="item-qty" data-action="edit">${item.quantity}</span>
      <button class="del-btn" data-action="delete" aria-label="Ištrinti">✕</button>
    </li>`;
}

// --- Rendering: catalog --------------------------------------------------
function renderCatalog() {
  const cat = data.catalog;
  el.catalogEmpty.hidden = cat.length !== 0;
  // sugrupuota pagal kategoriją
  const groups = {};
  cat.forEach((c) => { const k = c.category || '(be kategorijos)'; (groups[k] = groups[k] || []).push(c); });
  el.catalogListEl.innerHTML = Object.keys(groups).sort().map((k) => {
    const gi = groups[k].sort((a, b) => a.name.localeCompare(b.name));
    const dot = `<span class="cat-dot" style="background:${categoryColor(k)}"></span>`;
    return `<li class="wh-group-head"><span class="wh-group-name">${dot}${escapeHtml(k)}</span><span class="wh-group-count">${gi.length}</span></li>`
      + gi.map((c) => `
        <li class="catalog-row" data-id="${c.id}">
          <span class="cat-name">${escapeHtml(c.name)}</span>
          <span class="cat-wh">${escapeHtml(c.warehouse || '')}</span>
          <button class="del-btn" data-action="delCatalog" aria-label="Ištrinti">✕</button>
        </li>`).join('');
  }).join('');
}

// --- Actions: events -----------------------------------------------------
el.addEventForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = el.eventName.value.trim();
  if (!name) return;
  data.events.unshift({ id: uid(), name, date: el.eventDate.value || '', items: [] });
  save();
  el.eventName.value = '';
  el.eventDate.value = '';
  renderEvents();
});

el.eventList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const card = btn.closest('.event-card');
  const id = card && card.dataset.id;
  const ev = data.events.find((x) => x.id === id);
  if (!ev) return;

  if (btn.dataset.action === 'open') {
    openEvent(id);
  } else if (btn.dataset.action === 'copyEvent') {
    const suggested = `${ev.name} (kopija)`;
    const name = prompt('Naujo renginio pavadinimas:', suggested);
    if (name === null) return;
    const finalName = name.trim() || suggested;
    data.events.unshift({
      id: uid(), name: finalName, date: ev.date,
      items: ev.items.map((i) => ({
        id: uid(), warehouse: i.warehouse, equipment: i.equipment,
        quantity: i.quantity, category: i.category || '', caseName: i.caseName || '',
        done: false, returned: false,
      })),
    });
    save();
    renderEvents();
  } else if (btn.dataset.action === 'delEvent') {
    if (confirm(`Ištrinti renginį „${ev.name}" ir visą jo įrangą?`)) {
      data.events = data.events.filter((x) => x.id !== id);
      save();
      renderEvents();
    }
  }
});

el.backBtn.addEventListener('click', showEvents);
el.openCatalogBtn.addEventListener('click', showCatalog);

// --- Actions: add item (su katalogo autopildymu) -------------------------
el.equipment.addEventListener('change', () => {
  const match = data.catalog.find((c) => c.name.toLowerCase() === el.equipment.value.trim().toLowerCase());
  if (match) {
    // Katalogo įrašas žino, kur ta įranga laikoma – nustatom sandėlį ir kategoriją
    if (match.warehouse) el.warehouse.value = match.warehouse;
    if (match.category) fillCategorySelect(el.itemCategory, match.category);
  }
});

el.addItemForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const ev = currentEvent();
  if (!ev) return;
  const warehouse = el.warehouse.value.trim();
  const equipment = el.equipment.value.trim();
  const quantity = Math.max(1, parseInt(el.quantity.value, 10) || 1);
  const category = el.itemCategory.value || '';
  const caseName = el.itemCase.value.trim();
  if (!warehouse || !equipment) return;

  ev.items.unshift({ id: uid(), warehouse, equipment, quantity, category, caseName, done: false, returned: false });
  save();
  refreshDatalists();
  renderItems();

  el.equipment.value = '';
  el.quantity.value = '1';
  fillCategorySelect(el.itemCategory, '');
  // Dėžę paliekam – dažnai kelios prekės eina į tą pačią dėžę
  el.equipment.focus();
});

el.itemList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const ev = currentEvent();
  if (!ev) return;
  const row = btn.closest('.item-row');
  const id = row && row.dataset.id;
  const item = ev.items.find((i) => i.id === id);
  if (!item) return;

  if (btn.dataset.action === 'toggle') {
    const f = statusField();
    item[f] = !item[f];
    save();
    renderItems();
  } else if (btn.dataset.action === 'edit') {
    openEdit(item);
  } else if (btn.dataset.action === 'delete') {
    if (confirm(`Ištrinti „${item.equipment}"?`)) {
      ev.items = ev.items.filter((i) => i.id !== id);
      save();
      renderItems();
    }
  }
});

// --- Actions: catalog ----------------------------------------------------
el.addCatalogForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = el.catName.value.trim();
  if (!name) return;
  data.catalog.push({
    id: uid(), name,
    category: el.catCategory.value || '',
    warehouse: el.catWarehouse.value.trim(),
  });
  save();
  el.catName.value = '';
  el.catWarehouse.value = '';
  fillCategorySelect(el.catCategory, '');
  refreshDatalists();
  renderCatalog();
  el.catName.focus();
});

el.catalogListEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="delCatalog"]');
  if (!btn) return;
  const row = btn.closest('.catalog-row');
  const id = row && row.dataset.id;
  const c = data.catalog.find((x) => x.id === id);
  if (!c) return;
  if (confirm(`Pašalinti „${c.name}" iš katalogo?`)) {
    data.catalog = data.catalog.filter((x) => x.id !== id);
    save();
    refreshDatalists();
    renderCatalog();
  }
});

// --- Redagavimo langelis -------------------------------------------------
function openEdit(item) {
  editingItemId = item.id;
  el.editWarehouse.value = item.warehouse;
  el.editEquipment.value = item.equipment;
  el.editQuantity.value = item.quantity;
  el.editCase.value = item.caseName || '';
  fillCategorySelect(el.editCategory, item.category || '');
  el.editModal.hidden = false;
  el.editEquipment.focus();
}

function closeEdit() {
  editingItemId = null;
  el.editModal.hidden = true;
}

el.editForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const ev = currentEvent();
  if (!ev) return closeEdit();
  const item = ev.items.find((i) => i.id === editingItemId);
  if (!item) return closeEdit();
  const warehouse = el.editWarehouse.value.trim();
  const equipment = el.editEquipment.value.trim();
  const quantity = Math.max(1, parseInt(el.editQuantity.value, 10) || 1);
  if (!warehouse || !equipment) return;
  item.warehouse = warehouse;
  item.equipment = equipment;
  item.quantity = quantity;
  item.category = el.editCategory.value || '';
  item.caseName = el.editCase.value.trim();
  save();
  closeEdit();
  refreshDatalists();
  renderItems();
});

el.editCancel.addEventListener('click', closeEdit);
el.editModal.addEventListener('click', (e) => {
  if (e.target === el.editModal) closeEdit();
});

// --- Grupavimas / filtras ------------------------------------------------
function syncGroupBtn() {
  const labels = {
    none: 'Grupuoti: ne', warehouse: 'Grupuoti: sandėlis',
    category: 'Grupuoti: kategorija', case: 'Grupuoti: dėžė',
  };
  el.groupBtn.textContent = labels[groupMode];
  el.groupBtn.classList.toggle('active', groupMode !== 'none');
}

el.groupBtn.addEventListener('click', () => {
  const cycle = { none: 'warehouse', warehouse: 'category', category: 'case', case: 'none' };
  groupMode = cycle[groupMode];
  syncGroupBtn();
  renderItems();
});

el.modeToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-opt');
  if (!btn) return;
  loadMode = btn.dataset.mode;
  syncModeToggle();
  renderItems();
});

el.filterBtn.addEventListener('click', () => {
  filterMode = filterMode === 'all' ? 'pending' : filterMode === 'pending' ? 'done' : 'all';
  const labels = { all: 'visi', pending: 'nepakrauti', done: 'pakrauti' };
  el.filterBtn.textContent = `Rodyti: ${labels[filterMode]}`;
  renderItems();
});

el.clearDoneBtn.addEventListener('click', () => {
  const ev = currentEvent();
  if (!ev) return;
  const doneCount = ev.items.filter((i) => i.done).length;
  if (doneCount === 0) return;
  if (confirm(`Pašalinti ${doneCount} pakrautą (-us) įrašą (-us) iš šio renginio?`)) {
    ev.items = ev.items.filter((i) => !i.done);
    save();
    renderItems();
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
showEvents();
