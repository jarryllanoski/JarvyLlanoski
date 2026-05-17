// cloud.js — Firebase Firestore real-time sync

const FB_CONFIG = {
  apiKey:            'AIzaSyDXCDMYukwtQk79ide6XVnwzxcLEpHSMl4',
  authDomain:        'jarvyllanoski.firebaseapp.com',
  projectId:         'jarvyllanoski',
  storageBucket:     'jarvyllanoski.firebasestorage.app',
  messagingSenderId: '565153672407',
  appId:             '1:565153672407:web:534f9c687ee65a6d51d492'
};

let _db     = null;
let _wsId   = null;
let _unsub  = null;
let _timer  = null;

/* ── Init ─────────────────────────────────────────────── */
function _initDb() {
  if (_db) return;
  if (typeof firebase === 'undefined') {
    toast('⚠️ Firebase SDK no cargó — verificá tu internet y recargá');
    return;
  }
  if (typeof firebase.firestore === 'undefined') {
    toast('⚠️ Firestore no disponible — recargá la página');
    return;
  }
  try {
    if (!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
    _db = firebase.firestore();
    _db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  } catch(e) {
    toast('⚠️ Firebase error: ' + e.message);
    _db = null;
  }
}

/* ── Strip base64 images (too large for Firestore) ────── */
function _clean(v) {
  if (typeof v === 'string') return v.startsWith('data:') ? null : v;
  if (Array.isArray(v))      return v.map(_clean);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k in v) o[k] = _clean(v[k]);
    return o;
  }
  return v;
}

/* ── Badge ────────────────────────────────────────────── */
function _badge(on) {
  ['cloudBadge','cloudStatusDot'].forEach(id => {
    const b = document.getElementById(id); if (!b) return;
    if (on) {
      b.textContent = '🟢 ' + (_wsId || 'Nube');
      Object.assign(b.style, { color:'var(--green)', borderColor:'rgba(46,160,67,.4)', background:'rgba(46,160,67,.08)' });
    } else {
      b.textContent = '⬜ Sin nube';
      Object.assign(b.style, { color:'var(--text2)', borderColor:'var(--bd)', background:'var(--bg2)' });
    }
  });
  const cv = document.getElementById('cloudConnectedView');
  const dv = document.getElementById('cloudDisconnectedView');
  const ci = document.getElementById('cloudConnectedInfo');
  if (cv) cv.style.display = on ? 'block' : 'none';
  if (dv) dv.style.display = on ? 'none' : 'block';
  if (ci && on) ci.textContent = '🟢 Conectado: ' + (_wsId || '');
}

/* ── Listen ───────────────────────────────────────────── */
function _listen() {
  if (_unsub) { _unsub(); _unsub = null; }
  _unsub = _db.collection('ws').doc(_wsId).onSnapshot(snap => {
    if (!snap.exists) return;
    if (snap.metadata.hasPendingWrites) return;
    const d = snap.data();
    if (!d) return;

    if (d.s) {
      d.s.forEach(cs => {
        const local = S.shipments.find(x => x.id === cs.id);
        if (local) {
          cs.docGuia        = local.docGuia;
          cs.docEmbalado    = local.docEmbalado;
          cs.docComprobante = local.docComprobante;
        }
      });
      S.shipments = d.s;
    }
    if (d.labels)        S.labels        = d.labels;
    if (d.couriers)      S.couriers      = d.couriers;
    if (d.courierActive) S.courierActive = d.courierActive;
    if (d.courierTypes)  S.courierTypes  = d.courierTypes;
    if (d.extraFields)   S.extraFields   = d.extraFields;
    if (d.msgTemplates)  S.msgTemplates  = d.msgTemplates;
    if (d.employees)     S.employees     = d.employees;
    if (d.tasks)         S.tasks         = d.tasks;
    if (d.config)        S.config        = d.config;
    if (d.suppliers)     S.suppliers     = d.suppliers;
    if (d.dispatch)      S.dispatch      = d.dispatch;

    lsSet('dpanel', JSON.stringify(S));
    if (typeof render      === 'function') render();
    if (typeof renderChips === 'function') renderChips();
    if (typeof renderTasks === 'function') renderTasks();
  }, err => {
    console.warn('Cloud sync error:', err);
    toast('⚠️ Nube: ' + err.message);
  });

  // Listen for new form submissions
  _unsubs.push(
    _db.collection('ws').doc(_wsId).collection('pedidos').onSnapshot(snap => {
      let added = 0;
      snap.docChanges().forEach(ch => {
        if (ch.type !== 'added') return;
        const d = ch.doc.data();
        if (!d || !d.id) return;
        if (S.shipments.find(x => x.id === d.id)) return;
        S.shipments.push(d);
        added++;
      });
      if (added > 0) {
        lsSet('dpanel', JSON.stringify(S));
        if (typeof render === 'function') render();
        if (typeof renderChips === 'function') renderChips();
        toast('📥 ' + added + ' nuevo' + (added > 1 ? 's' : '') + ' pedido' + (added > 1 ? 's' : '') + ' del formulario');
      }
    })
  );
}

/* ── Push (debounced 800ms) ───────────────────────────── */
function cloudSync() {
  if (!_db || !_wsId) return;
  clearTimeout(_timer);
  _timer = setTimeout(() => {
    _db.collection('ws').doc(_wsId).set({
      s:             _clean(S.shipments),
      labels:        S.labels,
      couriers:      S.couriers,
      courierActive: S.courierActive,
      courierTypes:  S.courierTypes  || {},
      extraFields:   S.extraFields,
      msgTemplates:  S.msgTemplates,
      employees:     S.employees  || [],
      tasks:         S.tasks      || [],
      config:        S.config,
      suppliers:     S.suppliers  || [],
      dispatch:      S.dispatch   || {},
      t: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(e => toast('⚠️ Error sync: ' + e.message));
  }, 800);
}

/* ── Public ───────────────────────────────────────────── */
function connectCloud(wsId) {
  wsId = (wsId || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!wsId) { toast('⚠️ Ingresa un código de equipo'); return; }
  toast('⏳ Conectando...');
  try { _initDb(); } catch(e) { toast('⚠️ Error: ' + e.message); return; }
  if (!_db) return;
  _wsId = wsId;
  S.wsId = wsId;
  lsSet('dpanel', JSON.stringify(S));
  try { _listen(); } catch(e) { toast('⚠️ Listener error: ' + e.message); return; }
  _badge(true);
  toast('☁️ Conectado: ' + wsId);
  if (typeof closeOverlay === 'function') closeOverlay('cloudConnectOverlay');
}

function disconnectCloud() {
  clearTimeout(_timer);
  if (_unsub) { _unsub(); _unsub = null; }
  _wsId = null;
  delete S.wsId;
  lsSet('dpanel', JSON.stringify(S));
  _badge(false);
  toast('🔌 Desconectado de la nube');
  if (typeof closeOverlay === 'function') closeOverlay('cloudConnectOverlay');
}

/* ── Auto-reconnect ───────────────────────────────────── */
if (S.wsId) {
  setTimeout(() => connectCloud(S.wsId), 400);
} else {
  _badge(false);
}
