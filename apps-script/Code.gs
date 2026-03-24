// ═══════════════════════════════════════════════════════════
//  GeoShare — Google Apps Script  |  Code.gs
//
//  This script is already deployed at:
//  https://script.google.com/macros/s/AKfycbzXDUvblpb-D7lBlOa4Q786RRGi_tIwf7PtELYxwZkbCWMkI0yO7HYIVZ2FB55QOWWx/exec
//
//  HOW IT WORKS:
//  • POST /exec  → saves a location row to the sheet
//  • GET  /exec?action=latest → returns latest location as JSON
//  • GET  /exec?action=all    → returns last 100 rows as JSON
//  • GET  /exec?action=stats  → returns row count + last update
// ═══════════════════════════════════════════════════════════

const SHEET_NAME = 'GeoShare Log';
const MAX_ROWS   = 500;

// ── Column definitions ─────────────────────────────────
const COLS = {
  TIMESTAMP : 1,
  LATITUDE  : 2,
  LONGITUDE : 3,
  ACCURACY  : 4,
  MAPS_LINK : 5,
  SOURCE    : 6,
};

// ══════════════════════════════════════════════════════════
//  GET handler
// ══════════════════════════════════════════════════════════
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'ping';

  if (action === 'latest') return getLatest();
  if (action === 'all')    return getAll();
  if (action === 'stats')  return getStats();

  // Ping / health check
  return ok({
    status:    'running',
    service:   'GeoShare Location Logger',
    timestamp: new Date().toISOString(),
    endpoints: {
      save:   'POST /exec  body:{latitude,longitude,accuracy,timestamp,mapsUrl,source}',
      latest: 'GET  /exec?action=latest',
      all:    'GET  /exec?action=all',
      stats:  'GET  /exec?action=stats',
    },
  });
}

// ══════════════════════════════════════════════════════════
//  POST handler — save location
// ══════════════════════════════════════════════════════════
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { latitude, longitude, accuracy, timestamp, mapsUrl, source } = body;

    if (latitude == null || longitude == null) {
      return err('Missing latitude or longitude');
    }

    const sheet = getSheet();
    const ts    = timestamp || new Date().toISOString();
    const link  = mapsUrl || `https://maps.google.com/?q=${latitude},${longitude}`;
    const src   = source  || 'web';

    sheet.appendRow([ts, +latitude, +longitude, accuracy ? Math.round(+accuracy) : '—', link, src]);

    formatLastRow(sheet);
    autoTrim(sheet);

    return ok({
      saved:     true,
      row:       sheet.getLastRow() - 1,
      latitude:  +latitude,
      longitude: +longitude,
      mapsUrl:   link,
    });

  } catch (ex) {
    return err(ex.toString());
  }
}

// ══════════════════════════════════════════════════════════
//  GET actions
// ══════════════════════════════════════════════════════════
function getLatest() {
  const sheet = getSheet();
  const last  = sheet.getLastRow();
  if (last < 2) return ok({ found: false, message: 'No rows yet' });

  const r = sheet.getRange(last, 1, 1, 6).getValues()[0];
  return ok({
    found:     true,
    timestamp: r[0],
    latitude:  r[1],
    longitude: r[2],
    accuracy:  r[3],
    mapsUrl:   r[4],
    source:    r[5],
  });
}

function getAll() {
  const sheet = getSheet();
  const last  = sheet.getLastRow();
  if (last < 2) return ok({ count: 0, data: [] });

  const start = Math.max(2, last - 99);
  const num   = last - start + 1;
  const rows  = sheet.getRange(start, 1, num, 6).getValues();
  const data  = rows.map(r => ({
    timestamp: r[0],
    latitude:  r[1],
    longitude: r[2],
    accuracy:  r[3],
    mapsUrl:   r[4],
    source:    r[5],
  })).reverse();

  return ok({ count: data.length, data });
}

function getStats() {
  const sheet = getSheet();
  const total = Math.max(0, sheet.getLastRow() - 1);
  let lastTs  = '—';

  if (total > 0) {
    lastTs = sheet.getRange(sheet.getLastRow(), 1).getValue();
  }

  return ok({
    totalRows:   total,
    lastUpdated: lastTs,
    sheetName:   SHEET_NAME,
  });
}

// ══════════════════════════════════════════════════════════
//  Sheet helpers
// ══════════════════════════════════════════════════════════
function getSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    initSheet(sheet);
  } else if (sheet.getLastRow() === 0) {
    initSheet(sheet);
  }
  return sheet;
}

function initSheet(sheet) {
  // Headers
  const headers = ['Timestamp', 'Latitude', 'Longitude', 'Accuracy (m)', 'Google Maps Link', 'Source'];
  sheet.appendRow(headers);

  // Header style
  const hdr = sheet.getRange(1, 1, 1, headers.length);
  hdr.setBackground('#04070d');
  hdr.setFontColor('#39ff8f');
  hdr.setFontWeight('bold');
  hdr.setFontSize(11);
  hdr.setFontFamily('Courier New');

  // Column widths
  sheet.setColumnWidth(1, 210);
  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 300);
  sheet.setColumnWidth(6, 100);

  // Freeze header
  sheet.setFrozenRows(1);

  // Row height
  sheet.setRowHeight(1, 32);

  // Tab color
  sheet.setTabColor('#39ff8f');

  // Border on header
  hdr.setBorder(false, false, true, false, false, false, '#39ff8f', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

function formatLastRow(sheet) {
  const row   = sheet.getLastRow();
  const range = sheet.getRange(row, 1, 1, 6);
  const bg    = row % 2 === 0 ? '#0d1420' : '#080e1a';
  range.setBackground(bg);
  range.setFontColor('#c8d0e8');
  range.setFontSize(10);
  sheet.setRowHeight(row, 26);

  // Make Maps link clickable
  const cell = sheet.getRange(row, 5);
  const url  = cell.getValue();
  if (url && String(url).startsWith('http')) {
    cell.setFormula(`=HYPERLINK("${url}","📍 Open Map")`);
    cell.setFontColor('#00cfff');
  }

  // Latitude / longitude — 8 decimal places
  sheet.getRange(row, 2).setNumberFormat('0.00000000');
  sheet.getRange(row, 3).setNumberFormat('0.00000000');
}

function autoTrim(sheet) {
  const last = sheet.getLastRow();
  if (last > MAX_ROWS + 1) {
    const excess = last - MAX_ROWS - 1;
    sheet.deleteRows(2, excess);
  }
}

// ══════════════════════════════════════════════════════════
//  Response helpers
// ══════════════════════════════════════════════════════════
function ok(obj) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, ...obj }))
    .setMimeType(ContentService.MimeType.JSON);
}

function err(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ══════════════════════════════════════════════════════════
//  Optional: scheduled auto-cleanup trigger
//  Set up via Apps Script → Triggers → daily, runs cleanOld()
// ══════════════════════════════════════════════════════════
function cleanOld() {
  const sheet = getSheet();
  autoTrim(sheet);
}
