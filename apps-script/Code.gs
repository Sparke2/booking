const SHEET_NAME = 'bookings';

function doGet(e) {
  const action = String(e?.parameter?.action || 'list');
  if (action === 'list') return jsonOutput({ ok: true, bookings: listBookings_() });
  return jsonOutput({ ok: false, error: 'unknown_action' });
}

function doPost(e) {
  const action = String(e?.parameter?.action || '');
  if (action !== 'create') return jsonOutput({ ok: false, error: 'unknown_action' });

  // Принимаем и JSON (если где-то ещё используется), и form-urlencoded (без CORS preflight).
  let body = {};
  const raw = String(e?.postData?.contents || '');
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch (err) {
      // form-urlencoded приходит в e.parameter
      body = e?.parameter || {};
    }
  } else {
    body = e?.parameter || {};
  }

  const booking = normalizeBooking_(body);
  if (!booking) return jsonOutput({ ok: false, error: 'bad_booking' });

  const existing = listBookings_();
  if (hasOverlap_(existing, booking)) {
    return jsonOutput({ ok: false, error: 'overlap', bookings: existing });
  }

  appendBooking_(booking);
  return jsonOutput({ ok: true, bookings: listBookings_() });
}

function normalizeBooking_(b) {
  const id = String(b?.id || '').trim();
  const date = String(b?.date || '').trim(); // YYYY-MM-DD
  const startMin = Number(b?.startMin);
  const endMin = Number(b?.endMin);
  const label = String(b?.label || '').trim() || 'Без подписи';

  if (!id) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return null;
  if (!(startMin >= 0 && endMin > startMin)) return null;
  if (label.length > 120) return null;

  return { id, date, startMin, endMin, label };
}

function hasOverlap_(bookings, nb) {
  const a0 = nb.startMin;
  const a1 = nb.endMin;
  for (const b of bookings) {
    if (b.date !== nb.date) continue;
    const b0 = Number(b.startMin);
    const b1 = Number(b.endMin);
    if (a0 < b1 && b0 < a1) return true;
  }
  return false;
}

function getSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['id', 'date', 'startMin', 'endMin', 'label', 'createdAt']);
  }
  return sh;
}

function listBookings_() {
  const sh = getSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length <= 1) return [];

  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const id = String(row[0] || '').trim();
    const date = String(row[1] || '').trim();
    const startMin = Number(row[2]);
    const endMin = Number(row[3]);
    const label = String(row[4] || '').trim();
    if (!id || !date || !Number.isFinite(startMin) || !Number.isFinite(endMin)) continue;
    out.push({ id, date, startMin, endMin, label });
  }
  return out;
}

function appendBooking_(b) {
  const sh = getSheet_();
  sh.appendRow([b.id, b.date, b.startMin, b.endMin, b.label, new Date().toISOString()]);
}

function jsonOutput(obj) {
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

