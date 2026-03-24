// ═══════════════════════════════════════════════════════════
//  GeoShare — Permission Site  |  app.js
//  Apps Script URL hardcoded — no setup needed
// ═══════════════════════════════════════════════════════════

const SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzXDUvblpb-D7lBlOa4Q786RRGi_tIwf7PtELYxwZkbCWMkI0yO7HYIVZ2FB55QOWWx/exec';

// ── DOM ──────────────────────────────────────────────────
const card       = document.getElementById('card');
const cardLabel  = document.getElementById('cardLabel');
const cardTitle  = document.getElementById('cardTitle');
const cardDesc   = document.getElementById('cardDesc');
const btnGroup   = document.getElementById('btnGroup');
const btnAllow   = document.getElementById('btnAllow');
const statusBox  = document.getElementById('statusBox');
const mapCta     = document.getElementById('mapCta');
const coordStrip = document.getElementById('coordStrip');
const dispLat    = document.getElementById('dispLat');
const dispLng    = document.getElementById('dispLng');
const dispAcc    = document.getElementById('dispAcc');

// ── Canvas particle background ───────────────────────────
(function initCanvas() {
  const c   = document.getElementById('bg');
  const ctx = c.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = c.width  = window.innerWidth;
    H = c.height = window.innerHeight;
  }

  function Particle() {
    this.x  = Math.random() * W;
    this.y  = Math.random() * H;
    this.vx = (Math.random() - .5) * .3;
    this.vy = (Math.random() - .5) * .3;
    this.r  = Math.random() * 1.5 + .3;
    this.a  = Math.random() * .5 + .1;
  }

  function init() {
    resize();
    particles = Array.from({length: 80}, () => new Particle());
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth   = 1;
    for (let x = 0; x < W; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Particles
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(57,255,143,${p.a})`;
      ctx.fill();
    });

    // Connection lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 100) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(57,255,143,${0.07 * (1 - d / 100)})`;
          ctx.lineWidth   = .5;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  init();
  draw();
})();

// ── Check existing permission on load ────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  if (!navigator.geolocation) {
    setStatus('err', '⚠️ Your browser does not support geolocation.');
    btnAllow.disabled = true;
    return;
  }
  try {
    const perm = await navigator.permissions.query({ name: 'geolocation' });
    if (perm.state === 'granted') startWatching();
    if (perm.state === 'denied')  showDenied();
    perm.onchange = () => {
      if (perm.state === 'granted') startWatching();
      if (perm.state === 'denied')  showDenied();
    };
  } catch (_) { /* permissions API not available */ }
});

// ── Request location ─────────────────────────────────────
function requestLocation() {
  btnAllow.disabled = true;
  setStatus('loading', 'Requesting GPS fix…');
  navigator.geolocation.getCurrentPosition(onSuccess, onError, {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0,
  });
}

// ── Start watch (continuous) ─────────────────────────────
let watchId = null;
function startWatching() {
  if (watchId !== null) return;
  btnAllow.disabled = true;
  setStatus('loading', 'Acquiring location…');
  watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 20000,
  });
}

// ── Success ───────────────────────────────────────────────
let firstFix = true;
function onSuccess(pos) {
  const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;

  // Update coord strip
  dispLat.textContent = lat.toFixed(6);
  dispLng.textContent = lng.toFixed(6);
  dispAcc.textContent = `±${Math.round(acc)}m`;
  coordStrip.style.opacity = '1';

  // Save to localStorage for map page
  localStorage.setItem('gs_location', JSON.stringify({
    lat, lng, acc, ts: Date.now(),
  }));

  if (firstFix) {
    firstFix = false;
    setGrantedUI(lat, lng, acc);
    postToSheet(lat, lng, acc);
  }
}

// ── Error ─────────────────────────────────────────────────
function onError(e) {
  const msgs = {
    1: 'Location permission was denied. Enable it in your browser site settings.',
    2: 'Position unavailable. Check your GPS/network.',
    3: 'Location request timed out. Please try again.',
  };
  showDenied(msgs[e.code] || 'Unknown geolocation error.');
  btnAllow.disabled = false;
}

// ── Post to Google Sheet ─────────────────────────────────
async function postToSheet(lat, lng, acc) {
  try {
    const body = {
      latitude:  lat,
      longitude: lng,
      accuracy:  acc,
      timestamp: new Date().toISOString(),
      mapsUrl:   `https://maps.google.com/?q=${lat},${lng}`,
    };
    await fetch(SCRIPT_URL, {
      method:  'POST',
      mode:    'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
  } catch (err) {
    console.warn('Sheet POST failed:', err);
  }
}

// ── UI helpers ────────────────────────────────────────────
function setGrantedUI(lat, lng, acc) {
  card.classList.remove('denied');
  cardLabel.textContent = '✓ Permission Granted';
  cardTitle.innerHTML   = 'Location <br><em>Active & Live</em>';
  cardDesc.textContent  = `Your GPS is active. You're pinned on the live map. Accuracy: ±${Math.round(acc)}m.`;
  btnGroup.style.display = 'none';
  setStatus('ok', `📍 Lat: ${lat.toFixed(6)}  |  Lng: ${lng.toFixed(6)}\nSynced to Google Sheet ✓`);
  mapCta.style.display = 'inline-flex';
}

function showDenied(msg) {
  const m = msg || 'Location access was blocked.';
  card.classList.add('denied');
  cardLabel.textContent = '✗ Access Denied';
  cardTitle.innerHTML   = 'Location <br><em>Blocked</em>';
  cardDesc.textContent  = 'To fix: click the 🔒 lock icon in your browser address bar → Permissions → Allow Location.';
  setStatus('err', m);
  btnAllow.disabled = false;
}

function setStatus(type, msg) {
  statusBox.className     = `status-box ${type}`;
  statusBox.style.display = 'block';
  if (type === 'loading') {
    statusBox.innerHTML = `<span class="spin"></span> ${msg}`;
  } else {
    statusBox.textContent = msg;
  }
}

// ── Soft deny ─────────────────────────────────────────────
function softDeny() {
  card.classList.add('denied');
  cardLabel.textContent = 'Maybe Later';
  cardTitle.innerHTML   = 'No worries, <br><em>come back soon</em>';
  cardDesc.textContent  = 'Location sharing is entirely optional. Click Allow whenever you\'re ready.';
  btnGroup.innerHTML    = `<button class="btn-primary" onclick="location.reload()">← Try Again</button>`;
}
