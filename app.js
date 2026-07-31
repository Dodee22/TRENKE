'use strict';

const STORAGE_KEY = 'sandelis-krovimas-v2';
const OLD_KEY = 'sandelis-krovimas-v1';

/**
 * data.events = [{ id, name, date, items: [{id, warehouse, equipment, quantity, done}] }]
 */
let data = { events: [] };
let currentEventId = null;
let filterMode = 'all'; // all | pending | done
let groupByWarehouse = false;
let editingItemId = null;

// --- Persistence ---------------------------------------------------------
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      data = JSON.parse(raw);
      if (!data || !Array.isArray(data.events)) data = { events: [] };
      return;
    }
    // Migracija iš senosios versijos (plokščias sąrašas -> vienas renginys)
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const items = JSON.parse(old);
      if (Array.isArray(items) && items.length) {
        data = { events: [{ id: uid(), name: 'Bendras sąrašas', date: '', items }] };
        save();
      }
    }
  } catch (e) {
    data = { events: [] };
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    /* ignore quota errors */
  }
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

// --- Elements ------------------------------------------------------------
const el = {
  // views
  eventsView: document.getElementById('eventsView'),
  detailView: document.getElementById('detailView'),
  headerTitle: document.getElementById('headerTitle'),
  headerSubtitle: document.getElementById('headerSubtitle'),
  backBtn: document.getElementById('backBtn'),
  // events
  addEventForm: document.getElementById('addEventForm'),
  eventName: document.getElementById('eventName'),
  eventDate: document.getElementById('eventDate'),
  eventList: document.getElementById('eventList'),
  eventsEmpty: document.getElementById('eventsEmpty'),
  // items
  addItemForm: document.getElementById('addItemForm'),
  warehouse: document.getElementById('warehouse'),
  equipment: document.getElementById('equipment'),
  quantity: document.getElementById('quantity'),
  itemList: document.getElementById('itemList'),
  itemsEmpty: document.getElementById('itemsEmpty'),
  warehouseList: document.getElementById('warehouseList'),
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
  editCancel: document.getElementById('editCancel'),
};

function currentEvent() {
  return data.events.find((e) => e.id === currentEventId) || null;
}

// --- View switching ------------------------------------------------------
function showEvents() {
  currentEventId = null;
  el.detailView.hidden = true;
  el.eventsView.hidden = false;
  el.backBtn.hidden = true;
  el.headerTitle.textContent = '📦 Renginiai';
  el.headerSubtitle.textContent = 'Ką reikia pasikrauti kiekvienam renginiui';
  renderEvents();
}

function openEvent(id) {
  currentEventId = id;
  const ev = currentEvent();
  if (!ev) { showEvents(); return; }
  filterMode = 'all';
  el.filterBtn.textContent = 'Rodyti: visi';
  el.groupBtn.textContent = groupByWarehouse ? 'Grupuoti: pagal sandėlį' : 'Grupuoti: ne';
  el.groupBtn.classList.toggle('active', groupByWarehouse);
  el.eventsView.hidden = true;
  el.detailView.hidden = false;
  el.backBtn.hidden = false;
  el.headerTitle.textContent = ev.name;
  el.headerSubtitle.textContent = ev.date ? `📅 ${formatDate(ev.date)}` : 'Krovimo sąrašas';
  el.equipment.value = '';
  el.quantity.value = '1';
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

function renderItems() {
  const ev = currentEvent();
  if (!ev) return;

  // Datalist su visais sandėliais iš visų renginių
  const warehouses = [...new Set(
    data.events.flatMap((e) => e.items.map((i) => i.warehouse)).filter(Boolean)
  )].sort();
  el.warehouseList.innerHTML = warehouses.map((w) => `<option value="${escapeHtml(w)}">`).join('');

  const shown = visibleItems(ev);
  if (groupByWarehouse) {
    const groups = {};
    shown.forEach((i) => { (groups[i.warehouse] = groups[i.warehouse] || []).push(i); });
    el.itemList.innerHTML = Object.keys(groups).sort().map((wh) => {
      const gi = groups[wh];
      const gdone = gi.filter((i) => i.done).length;
      return `<li class="wh-group-head">
          <span class="wh-group-name">🏬 ${escapeHtml(wh)}</span>
          <span class="wh-group-count ${gdone === gi.length ? 'done' : ''}">${gdone} / ${gi.length}</span>
        </li>` + gi.map(itemRowHtml).join('');
    }).join('');
  } else {
    el.itemList.innerHTML = shown.map(itemRowHtml).join('');
  }
  el.itemsEmpty.hidden = ev.items.length !== 0;

  const total = ev.items.length;
  const done = ev.items.filter((i) => i.done).length;
  el.progressCard.hidden = total === 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  el.progressText.textContent = `${done} / ${total} pakrauta`;
  el.progressPercent.textContent = `${pct}%`;
  el.progressFill.style.width = `${pct}%`;
}

function itemRowHtml(item) {
  return `
    <li class="item-row ${item.done ? 'done' : ''}" data-id="${item.id}">
      <button class="item-check ${item.done ? 'checked' : ''}" data-action="toggle" aria-label="Pažymėti pakrautą">${item.done ? '✓' : ''}</button>
      <span class="item-wh" data-action="edit">${escapeHtml(item.warehouse)}</span>
      <span class="item-eq" data-action="edit">${escapeHtml(item.equipment)}</span>
      <span class="item-qty" data-action="edit">${item.quantity}</span>
      <button class="del-btn" data-action="delete" aria-label="Ištrinti">✕</button>
    </li>`;
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
    if (name === null) return; // atšaukta
    const finalName = name.trim() || suggested;
    const copy = {
      id: uid(),
      name: finalName,
      date: ev.date,
      // Nukopijuojam įrangą, bet varneles nuimam (naujam renginiui dar nepakrauta)
      items: ev.items.map((i) => ({
        id: uid(),
        warehouse: i.warehouse,
        equipment: i.equipment,
        quantity: i.quantity,
        done: false,
      })),
    };
    data.events.unshift(copy);
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

// --- Actions: items ------------------------------------------------------
el.addItemForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const ev = currentEvent();
  if (!ev) return;
  const warehouse = el.warehouse.value.trim();
  const equipment = el.equipment.value.trim();
  const quantity = Math.max(1, parseInt(el.quantity.value, 10) || 1);
  if (!warehouse || !equipment) return;

  ev.items.unshift({ id: uid(), warehouse, equipment, quantity, done: false });
  save();
  renderItems();

  // Palieka sandėlį – greičiau pridėti kelis daiktus iš tos pačios vietos
  el.equipment.value = '';
  el.quantity.value = '1';
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
    item.done = !item.done;
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

// --- Redagavimo langelis -------------------------------------------------
function openEdit(item) {
  editingItemId = item.id;
  el.editWarehouse.value = item.warehouse;
  el.editEquipment.value = item.equipment;
  el.editQuantity.value = item.quantity;
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
  save();
  closeEdit();
  renderItems();
});

el.editCancel.addEventListener('click', closeEdit);
el.editModal.addEventListener('click', (e) => {
  if (e.target === el.editModal) closeEdit(); // paspaudus šalia langelio
});

// --- Grupavimas ----------------------------------------------------------
el.groupBtn.addEventListener('click', () => {
  groupByWarehouse = !groupByWarehouse;
  el.groupBtn.textContent = groupByWarehouse ? 'Grupuoti: pagal sandėlį' : 'Grupuoti: ne';
  el.groupBtn.classList.toggle('active', groupByWarehouse);
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
