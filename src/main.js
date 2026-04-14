import './style.css';

// Google Apps Script Web App URL (Deploy → Web app → /exec)
// Example: https://script.google.com/macros/s/AKfycb.../exec
const SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbzs1j0fLrxgAZyNiYwlSHu9_Yt9hIgRmtdyJ8tObVKnTK7qd2vlitruF7VJfLD9S5C57w/exec';

/** Рабочий день: первый слот и минута после последнего слота (end exclusive) */
const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 20 * 60;
const SLOT_STEP = 30;

const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const ROOM_TITLE = 'Переговорная';
const ROOM_ORG = 'Офис';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateKey(key) {
  const [y, m, day] = key.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function formatSlotLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function getSlotsForDay() {
  const slots = [];
  for (let t = DAY_START_MIN; t < DAY_END_MIN; t += SLOT_STEP) {
    slots.push(t);
  }
  return slots;
}

function assertApiConfigured() {
  if (!SHEETS_API_URL) {
    alert(
      'Не задан URL Google Apps Script. Откройте src/main.js и вставьте ссылку в SHEETS_API_URL.',
    );
    return false;
  }
  return true;
}

async function apiListBookings() {
  if (!assertApiConfigured()) return [];
  const res = await fetch(`${SHEETS_API_URL}?action=list`, { method: 'GET' });
  if (!res.ok) throw new Error(`API list failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.bookings) ? data.bookings : [];
}

async function apiCreateBooking(booking) {
  if (!assertApiConfigured()) return { ok: false, error: 'not_configured' };
  // Важно: не используем application/json, иначе браузер сделает CORS preflight (OPTIONS),
  // а Google Apps Script Web App обычно не отдаёт нужные заголовки для preflight.
  const body = new URLSearchParams({
    id: String(booking.id ?? ''),
    date: String(booking.date ?? ''),
    startMin: String(booking.startMin ?? ''),
    endMin: String(booking.endMin ?? ''),
    label: String(booking.label ?? ''),
  });

  const res = await fetch(`${SHEETS_API_URL}?action=create`, {
    method: 'POST',
    body,
  });
  if (!res.ok) throw new Error(`API create failed: ${res.status}`);
  return await res.json();
}

async function refreshBookings() {
  state.loading = true;
  render();
  try {
    state.bookings = await apiListBookings();
  } finally {
    state.loading = false;
    render();
  }
}

function bookingsForDate(bookings, dateKey) {
  return bookings.filter((b) => b.date === dateKey);
}

/** Пересечение [a0,a1) и [b0,b1) */
function rangesOverlap(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1;
}

function bookingRange(b) {
  return [b.startMin, b.endMin];
}

function slotIndexForMinute(slots, min) {
  return slots.indexOf(min);
}

function clearSelection(state) {
  state.selStart = null;
  state.selEnd = null;
}

function selectionRangeInclusive(state, slots) {
  if (state.selStart == null) return null;
  const end = state.selEnd ?? state.selStart;
  let i0 = slotIndexForMinute(slots, state.selStart);
  let i1 = slotIndexForMinute(slots, end);
  if (i0 < 0 || i1 < 0) return null;
  if (i1 < i0) [i0, i1] = [i1, i0];
  return { i0, i1 };
}

function rangeFree(bookings, dateKey, startMin, endMin) {
  const day = bookingsForDate(bookings, dateKey);
  for (const b of day) {
    const [b0, b1] = bookingRange(b);
    if (rangesOverlap(startMin, endMin, b0, b1)) return false;
  }
  return true;
}

function minuteInBooking(min, b) {
  return min >= b.startMin && min < b.endMin;
}

function bookingAtSlotMinute(bookings, dateKey, slotStart) {
  const day = bookingsForDate(bookings, dateKey);
  for (const b of day) {
    if (minuteInBooking(slotStart, b)) return b;
  }
  return null;
}

function formatDayTitle(date) {
  const wd = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четвер', 'Пятница', 'Суббота'];
  const w = wd[date.getDay()];
  const mon = MONTHS[date.getMonth()].toLowerCase();
  return `${w}, ${date.getDate()} ${mon}`;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d, delta) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

/** Понедельник = 0 … Воскресенье = 6 */
function weekdayMon0(date) {
  return (date.getDay() + 6) % 7;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function calendarCells(viewMonth) {
  const first = startOfMonth(viewMonth);
  const lead = weekdayMon0(first);
  const year = first.getFullYear();
  const month = first.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push({ type: 'empty' });
  for (let day = 1; day <= lastDay; day++) {
    cells.push({ type: 'day', day, date: new Date(year, month, day) });
  }
  while (cells.length % 7 !== 0) cells.push({ type: 'empty' });
  while (cells.length < 42) cells.push({ type: 'empty' });
  return cells;
}

/** Даты в месяце, где есть хотя бы одна бронь (для метки в календаре) */
function datesWithBookingsInMonth(bookings, viewMonth) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const last = new Date(year, month + 1, 0).getDate();
  const set = new Set();
  for (let day = 1; day <= last; day++) {
    const key = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    if (bookingsForDate(bookings, key).length > 0) set.add(key);
  }
  return set;
}

const state = {
  viewMonth: new Date(),
  selectedDate: new Date(),
  bookings: [],
  selStart: null,
  selEnd: null,
  modalOpen: false,
  loading: false,
};

const app = document.getElementById('app');

function render() {
  const slots = getSlotsForDay();
  const dateKey = formatDateKey(state.selectedDate);
  const sel = selectionRangeInclusive(state, slots);

  const bookedDays = datesWithBookingsInMonth(state.bookings, state.viewMonth);
  const nToday = bookingsForDate(state.bookings, dateKey).length;

  const headerHtml = `
    <header class="header">
      <div class="header-top">
        <div class="header-brand">
          <h1>${ROOM_TITLE}</h1>
          <p class="header-tagline">${ROOM_ORG}</p>
        </div>
        <div class="header-avatar" aria-hidden="true">П</div>
      </div>
    </header>
    <div class="shell">
      <div class="booking-layout">
        <aside class="panel panel-calendar card-elevated" aria-label="Календарь">
          <p class="panel-eyebrow">Шаг 1</p>
          <h2 class="panel-title">Выберите день</h2>
          <div class="calendar-nav">
            <button type="button" class="cal-nav-btn" id="cal-prev" aria-label="Предыдущий месяц">‹</button>
            <h3 class="calendar-month">${MONTHS[state.viewMonth.getMonth()]} <span class="calendar-year">${state.viewMonth.getFullYear()}</span></h3>
            <button type="button" class="cal-nav-btn" id="cal-next" aria-label="Следующий месяц">›</button>
          </div>
          <div class="calendar-weekdays">
            ${WEEKDAYS_SHORT.map((d) => `<div>${d}</div>`).join('')}
          </div>
          <div class="calendar-grid" id="cal-grid"></div>
          <p class="panel-foot">Точка под числом — в этот день есть брони</p>
        </aside>
        <div class="panel panel-slots card-elevated" aria-label="Время">
          <div class="slots-head">
            <p class="panel-eyebrow">Шаг 2</p>
            <h2 class="panel-title slots-day-line">${formatDayTitle(state.selectedDate)}</h2>
            <p class="slots-meta">${nToday > 0 ? `Забронировано интервалов: ${nToday}` : 'На этот день пока нет броней'}</p>
            <p class="slots-range-hint">Слоты по ${SLOT_STEP} мин · ${formatSlotLabel(DAY_START_MIN)}–${formatSlotLabel(DAY_END_MIN)}</p>
          </div>
          <div class="slots-scroll">
            <div class="slots-grid" id="slots-grid"></div>
          </div>
          <div class="legend">
            <span><i class="l-free"></i>Свободно</span>
            <span><i class="l-busy"></i>Занято</span>
            <span><i class="l-sel"></i>Выбор</span>
          </div>
          <div class="slots-actions">
            <p class="hint">Сначала нажмите время начала, затем время окончания (все слоты подряд). Повторный клик сбрасывает выбор.</p>
            <button type="button" class="btn-primary" id="btn-book" ${!sel ? 'disabled' : ''}>
              Забронировать выбранное
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  app.innerHTML = headerHtml;

  const grid = document.getElementById('cal-grid');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const cell of calendarCells(state.viewMonth)) {
    if (cell.type === 'empty') {
      const el = document.createElement('div');
      el.className = 'calendar-cell empty';
      grid.appendChild(el);
      continue;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'calendar-cell';
    btn.innerHTML = `<span class="cal-day-num">${cell.day}</span>`;
    const d = cell.date;
    const d0 = new Date(d);
    d0.setHours(0, 0, 0, 0);
    const selected = isSameDay(d, state.selectedDate);
    const isToday = isSameDay(d, new Date());
    const key = formatDateKey(d);
    if (bookedDays.has(key)) btn.classList.add('has-booking');

    if (d0 < today) {
      btn.classList.add('past');
      btn.disabled = true;
    } else {
      btn.classList.add('available');
      if (isToday) btn.classList.add('is-today');
      if (selected) btn.classList.add('selected');
      btn.addEventListener('click', () => {
        state.selectedDate = new Date(d);
        clearSelection(state);
        render();
      });
    }
    grid.appendChild(btn);
  }

  const slotsEl = document.getElementById('slots-grid');
  for (let i = 0; i < slots.length; i++) {
    const startMin = slots[i];
    const b = bookingAtSlotMinute(state.bookings, dateKey, startMin);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot-btn';

    if (b) {
      const isFirst =
        !minuteInBooking(startMin - SLOT_STEP, b) || startMin === b.startMin;
      btn.classList.add('busy');
      btn.disabled = true;
      btn.innerHTML = `<span>${formatSlotLabel(startMin)}</span>${
        isFirst ? `<span class="slot-label" title="${escapeAttr(b.label)}">${escapeHtml(b.label)}</span>` : ''
      }`;
    } else {
      btn.innerHTML = `<span>${formatSlotLabel(startMin)}</span>`;
      if (sel && i >= sel.i0 && i <= sel.i1) {
        btn.classList.add('in-range');
        if (i === sel.i1) btn.classList.add('range-end');
      }
      btn.addEventListener('click', () => onSlotClick(slots, i, startMin));
    }
    slotsEl.appendChild(btn);
  }

  document.getElementById('cal-prev').addEventListener('click', () => {
    state.viewMonth = addMonths(state.viewMonth, -1);
    render();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    state.viewMonth = addMonths(state.viewMonth, 1);
    render();
  });
  document.getElementById('btn-book').addEventListener('click', () => openModal(slots));

  if (state.modalOpen) renderModal(slots);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function onSlotClick(slots, index, startMin) {
  const dateKey = formatDateKey(state.selectedDate);

  if (state.selStart != null && state.selEnd != null) {
    clearSelection(state);
  }

  if (state.selStart == null) {
    if (!rangeFree(state.bookings, dateKey, startMin, startMin + SLOT_STEP)) return;
    state.selStart = startMin;
    state.selEnd = null;
    render();
    return;
  }

  if (state.selEnd == null && startMin === state.selStart) {
    state.selEnd = startMin;
    render();
    return;
  }

  if (state.selEnd == null) {
    let i0 = slotIndexForMinute(slots, state.selStart);
    let i1 = index;
    if (i1 < i0) [i0, i1] = [i1, i0];

    const rangeStart = slots[i0];
    const rangeEnd = slots[i1] + SLOT_STEP;

    for (let j = i0; j <= i1; j++) {
      const sm = slots[j];
      if (bookingAtSlotMinute(state.bookings, dateKey, sm)) {
        clearSelection(state);
        render();
        return;
      }
    }

    if (!rangeFree(state.bookings, dateKey, rangeStart, rangeEnd)) {
      clearSelection(state);
      render();
      return;
    }

    state.selStart = rangeStart;
    state.selEnd = slots[i1];
    render();
  }
}

function openModal(slots) {
  const sel = selectionRangeInclusive(state, slots);
  if (!sel) return;
  state.modalOpen = true;
  render();
}

function closeModal() {
  state.modalOpen = false;
  render();
}

function renderModal(slots) {
  const sel = selectionRangeInclusive(state, slots);
  if (!sel) {
    state.modalOpen = false;
    return;
  }
  const i0 = sel.i0;
  const i1 = sel.i1;
  const startMin = slots[i0];
  const endMin = slots[i1] + SLOT_STEP;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h3 id="modal-title">Подпись брони</h3>
      <p>Интервал: ${formatSlotLabel(startMin)} — ${formatSlotLabel(endMin)} · ${formatDateKey(state.selectedDate)}</p>
      <label for="book-label" class="visually-hidden">Кому бронируется</label>
      <input id="book-label" type="text" placeholder="ФИО или отметка" maxlength="120" autocomplete="name" />
      <div class="modal-actions">
        <button type="button" id="modal-cancel">Отмена</button>
        <button type="button" class="confirm" id="modal-save">Сохранить</button>
      </div>
    </div>
  `;
  app.appendChild(overlay);

  const input = overlay.querySelector('#book-label');
  input.focus();

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  overlay.querySelector('#modal-cancel').addEventListener('click', closeModal);
  overlay.querySelector('#modal-save').addEventListener('click', async () => {
    const label = input.value.trim() || 'Без подписи';
    const dateKey = formatDateKey(state.selectedDate);
    if (!rangeFree(state.bookings, dateKey, startMin, endMin)) {
      alert('Этот интервал уже занят. Обновите страницу.');
      try {
        state.bookings = await apiListBookings();
      } catch {
        state.bookings = [];
      }
      closeModal();
      clearSelection(state);
      render();
      return;
    }
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `b-${Date.now()}`;
    const newBooking = { id, date: dateKey, startMin, endMin, label };
    try {
      const result = await apiCreateBooking(newBooking);
      if (!result?.ok) {
        alert(result?.error || 'Не удалось сохранить бронь.');
        await refreshBookings();
        closeModal();
        clearSelection(state);
        return;
      }
      state.bookings = Array.isArray(result.bookings) ? result.bookings : state.bookings;
      clearSelection(state);
      state.modalOpen = false;
      render();
    } catch {
      alert('Ошибка сети при сохранении. Попробуйте ещё раз.');
    }
  });
}

// скрытый label для a11y
const vis = document.createElement('style');
vis.textContent = `.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}`;
document.head.appendChild(vis);

render();
refreshBookings();
