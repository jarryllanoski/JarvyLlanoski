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
let _unsubs = [];
let _timer  = null;

/* ── Init ─────────────────────────────────────────────── */
function _initDb() {
  if (_db) return;
  if (typeof firebase === 'undefined' || typeof firebase.firestore === 'undefined') return;
  try {
    if (!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
    _db = firebase.firestore();
    _db.settings({ experimentalForceLongPolling: true, merge: true });
  } catch(e) { _db = null; }
}

/* ── Strip base64 images ──────────────────────────────── */
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
  _unsubs.forEach(u => u()); _unsubs = [];
  _unsubs.push(_db.collection('ws').doc(_wsId).onSnapshot(snap => {
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
    if (d.trash)             S.trash             = d.trash;
    if (d.deletedPedidoIds) S.deletedPedidoIds  = d.deletedPedidoIds;
    lsSet('dpanel', JSON.stringify(S));
    if (typeof render      === 'function') render();
    if (typeof renderChips === 'function') renderChips();
    if (typeof renderTasks === 'function') renderTasks();
  }, () => {}));

  _unsubs.push(
    _db.collection('ws').doc(_wsId).collection('pedidos').onSnapshot(snap => {
      let added = 0;
      snap.docChanges().forEach(ch => {
        if (ch.type !== 'added') return;
        const d = ch.doc.data();
        if (!d || !d.id) return;
        if (S.shipments.find(x => x.id === d.id)) return;
        if ((S.trash||[]).find(x => x.shipment && x.shipment.id === d.id)) return;
        if ((S.deletedPedidoIds||[]).includes(d.id)) return;
        if (d.printed === undefined) d.printed = false;
        S.shipments.push(d);
        added++;
      });
      if (added > 0) {
        lsSet('dpanel', JSON.stringify(S));
        if (typeof render === 'function') render();
        if (typeof renderChips === 'function') renderChips();
        const newOnes = S.shipments.slice(-added);
        newOnes.forEach(p => {
          if (typeof logActivity === 'function') logActivity('neworder', 'nuevo pedido: ' + (p.name||'Sin nombre'), p.id, '');
        });
        toast('📥 ' + added + ' nuevo' + (added > 1 ? 's' : '') + ' pedido' + (added > 1 ? 's' : '') + ' del formulario');
        _alertNewOrder(added);
      }
    }, () => {})
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
      trash:            _clean(S.trash) || [],
      deletedPedidoIds: S.deletedPedidoIds || [],
      t: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(() => {});
  }, 800);
}

/* ── Connect ──────────────────────────────────────────── */
function connectCloud(wsId) {
  wsId = (wsId || '').trim().toLowerCase().replace(/\s+/g, '-');
  const errDiv = document.getElementById('cloudError');
  const btn    = document.getElementById('cloudConnectBtn');
  const showErr = msg => {
    if (errDiv) { errDiv.textContent = msg; errDiv.style.display = 'block'; }
    if (btn)    { btn.disabled = false; btn.textContent = '☁️ Conectar'; }
    console.error(msg);
  };

  if (!wsId) { showErr('⚠️ Ingresa un código de equipo'); return; }
  if (errDiv) errDiv.style.display = 'none';
  if (btn)    { btn.disabled = true; btn.textContent = '⏳ Conectando...'; }

  _initDb();
  if (!_db) { showErr('⚠️ Firebase no disponible — recargá la página'); return; }

  const done  = { v: false };
  const timer = setTimeout(() => {
    if (done.v) return;
    done.v = true;
    showErr('⚠️ Sin respuesta de Firebase — probá con WiFi o recargá');
  }, 12000);

  _db.collection('ws').doc(wsId).get()
    .then(() => {
      if (done.v) return;
      done.v = true;
      clearTimeout(timer);
      if (btn) { btn.disabled = false; btn.textContent = '☁️ Conectar'; }
      if (errDiv) errDiv.style.display = 'none';
      _wsId = wsId; S.wsId = wsId;
      lsSet('dpanel', JSON.stringify(S));
      try { _listen(); } catch(e) { showErr('⚠️ Error: ' + e.message); return; }
      _badge(true);
      toast('☁️ Conectado: ' + wsId);
      if (typeof closeOverlay === 'function') closeOverlay('cloudConnectOverlay');
    })
    .catch(e => {
      if (done.v) return;
      done.v = true;
      clearTimeout(timer);
      const msg = e.code === 'permission-denied'
        ? '⚠️ Permiso denegado en Firebase — revisá las reglas de Firestore'
        : e.code === 'unavailable'
        ? '⚠️ Firebase no disponible — verificá tu internet'
        : '⚠️ Error [' + (e.code||'?') + ']: ' + e.message;
      showErr(msg);
    });
}

/* ── Disconnect ───────────────────────────────────────── */
function disconnectCloud() {
  clearTimeout(_timer);
  _unsubs.forEach(u => u()); _unsubs = [];
  _wsId = null;
  delete S.wsId;
  lsSet('dpanel', JSON.stringify(S));
  _badge(false);
  toast('🔌 Desconectado de la nube');
  if (typeof closeOverlay === 'function') closeOverlay('cloudConnectOverlay');
}

/* ── Expose ───────────────────────────────────────────── */
function cloudDb()   { return _db; }
function cloudWsId() { return _wsId; }

/* ── New-order alert ──────────────────────────────────── */
function _alertNewOrder(count) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[0, 660], [0.18, 880], [0.36, 1100]].forEach(([t, freq]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + t);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25);
      osc.start(ctx.currentTime + t); osc.stop(ctx.currentTime + t + 0.3);
    });
  } catch(e) {}
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    const body = count === 1 ? 'Nuevo pedido desde el formulario' : `${count} nuevos pedidos desde el formulario`;
    new Notification('📦 Pedido recibido', { body, silent: true });
  }
}

function requestNotifPermission() {
  if (typeof Notification === 'undefined') { toast('⚠️ Tu navegador no soporta notificaciones'); return; }
  if (Notification.permission === 'granted') { toast('✅ Notificaciones ya activadas'); return; }
  Notification.requestPermission().then(p => {
    toast(p === 'granted' ? '🔔 Notificaciones activadas' : '❌ Permiso denegado');
  });
}

/* ── Auto-connect ─────────────────────────────────────── */
const DEFAULT_WSID = 'jarry';
setTimeout(() => connectCloud(S.wsId || DEFAULT_WSID), 1500);
