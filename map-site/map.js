// ═══════════════════════════════════════════════════════════
//  GeoShare — Map Site  |  map.js
//  Real-time Leaflet map using device GPS
//  Apps Script URL hardcoded
// ═══════════════════════════════════════════════════════════

const SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzXDUvblpb-D7lBlOa4Q786RRGi_tIwf7PtELYxwZkbCWMkI0yO7HYIVZ2FB55QOWWx/exec';

// ── DOM refs ────────────────────────────────────────────
const overlay   = document.getElementById('permOverlay');
const livePill  = document.getElementById('livePill');
const brandDot  = document.getElementById('brandDot');
const valLat    = document.getElementById('valLat');
const valLng    = document.getElementById('valLng');
const accTag    = document.getElementById('accTag');
const bpTime    = document.getElementById('bpTime');
const toast     = document.getElementById('toast');
const btnRC     = document.getElementById('btnRecenter');
const btnCopy   = document.getElementById('btnCopyLink');

// ── Build Leaflet map ────────────────────────────────────
const map = L.map('map', { zoomControl: true, attributionControl: false });

// Dark CartoDB tile
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  subdomains: 'abcd', maxZoom: 20,
}).addTo(map);

map.setView([20.5937, 78.9629], 5); // India default

// ── Custom marker icon ───────────────────────────────────
const myIcon = L.divIcon({
  className: 'geo-marker-wrap',
  html: '<div class="geo-marker-dot"></div>',
  iconSize:   [16, 16],
  iconAnchor: [8, 8],
  popupAnchor:[0, -14],
});

// ── State ────────────────────────────────────────────────
let marker       = null;
let accCircle    = null;
let watchId      = null;
let hasPosition  = false;
let firstFly     = true;
let lastPos      = null;

// ── On load ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Try reading from localStorage (set by permission page)
  const stored = localStorage.getItem('gs_location');
  if (stored) {
    try {
      const d = JSON.parse(stored);
      if (Date.now() - d.ts < 10 * 60 * 1000) { // < 10 min old
        applyPosition(d.lat, d.lng, d.acc);
        overlay.classList.add('gone');
      }
    } catch (_) {}
  }

  // Always try to get fresh location
  startWatching();
});

// ── Geolocation watcher ──────────────────────────────────
function startWatching() {
  if (!navigator.geolocation) {
    showToast('⚠️ Geolocation not supported');
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    pos => {
      overlay.classList.add('gone');
      const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
      applyPosition(lat, lng, acc);
      // Update sheet every ~30s
      if (!lastPos || Math.abs(lat - lastPos.lat) > 0.0001 || Math.abs(lng - lastPos.lng) > 0.0001) {
        lastPos = { lat, lng };
        postToSheet(lat, lng, acc);
      }
    },
    err => {
      if (!hasPosition) bpTime.textContent = 'GPS unavailable — showing last known location';
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
}

// ── Apply position to map ────────────────────────────────
function applyPosition(lat, lng, acc) {
  hasPosition = true;
  const ll    = [lat, lng];

  // Fly to location (first time)
  if (firstFly) {
    firstFly = false;
    map.flyTo(ll, 16, { duration: 1.8, easeLinearity: 0.2 });
  } else if (marker) {
    marker.setLatLng(ll);
  }

  // Marker
  if (!marker) {
    marker = L.marker(ll, { icon: myIcon, zIndexOffset: 999 }).addTo(map);
    marker.bindPopup('', { className: '' });
  } else {
    marker.setLatLng(ll);
  }

  // Update popup
  marker.setPopupContent(`
    <div class="lf-popup-inner">
      <strong>📍 MY LOCATION</strong>
      <div><b>Lat:</b> ${lat.toFixed(7)}</div>
      <div><b>Lng:</b> ${lng.toFixed(7)}</div>
      <div><b>Acc:</b> ±${Math.round(acc)} m</div>
      <div style="margin-top:6px;font-size:11px;color:rgba(238,242,255,.38)">${fmtTime(new Date())}</div>
    </div>
  `);

  // Accuracy circle
  if (!accCircle) {
    accCircle = L.circle(ll, {
      radius: acc, color: '#39ff8f',
      fillColor: '#39ff8f', fillOpacity: 0.06,
      weight: 1.2, opacity: 0.3,
    }).addTo(map);
  } else {
    accCircle.setLatLng(ll).setRadius(acc);
  }

  // Save to localStorage
  localStorage.setItem('gs_location', JSON.stringify({ lat, lng, acc, ts: Date.now() }));

  // UI updates
  valLat.textContent = lat.toFixed(6);
  valLng.textContent = lng.toFixed(6);
  accTag.textContent = `±${Math.round(acc)} m accuracy`;
  bpTime.textContent = `Updated ${fmtTime(new Date())}`;
  livePill.classList.add('on');
  brandDot.classList.add('active');
}

// ── Post updated position to sheet ──────────────────────
async function postToSheet(lat, lng, acc) {
  try {
    await fetch(SCRIPT_URL, {
      method:  'POST',
      mode:    'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude:  lat,
        longitude: lng,
        accuracy:  acc,
        timestamp: new Date().toISOString(),
        mapsUrl:   `https://maps.google.com/?q=${lat},${lng}`,
        source:    'map-page',
      }),
    });
  } catch (_) {}
}

// ── Recenter button ──────────────────────────────────────
btnRC.addEventListener('click', () => {
  if (marker) {
    map.flyTo(marker.getLatLng(), 17, { duration: 1 });
    showToast('📍 Recentered');
  } else {
    showToast('⏳ Waiting for GPS…');
  }
});

// ── Copy share link ──────────────────────────────────────
btnCopy.addEventListener('click', () => {
  if (marker) {
    const { lat, lng } = marker.getLatLng();
    const link = `https://maps.google.com/?q=${lat},${lng}`;
    navigator.clipboard.writeText(link)
      .then(() => showToast('✅ Google Maps link copied!'))
      .catch(() => { prompt('Copy this link:', link); });
  } else {
    showToast('⏳ No position yet');
  }
});

// ── Skip overlay → request directly ─────────────────────
function skipOverlay() {
  overlay.classList.add('gone');
  startWatching();
}

// ── Toast helper ─────────────────────────────────────────
let _tt = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(_tt);
  _tt = setTimeout(() => toast.classList.remove('show'), 2800);
}

// ── Time formatter ────────────────────────────────────────
function fmtTime(d) {
  return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}
