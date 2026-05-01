// cloud.js — Sincronización Firebase Firestore
// Las credenciales se leen de window.FIREBASE_CONFIG (definido en index.html).
// Por dispositivo solo se guarda el workspaceId y el estado enabled.

(function () {
  'use strict';

  const FB_KEY = 'dpanel_fb';
  let _cfg = {};
  try {
    const raw = JSON.parse(localStorage.getItem(FB_KEY) || '{}');
    _cfg = { workspaceId: raw.workspaceId || '', enabled: !!raw.enabled };
  } catch (e) { _cfg = {}; }

  let _db = null;
  let _unsub = null;
  let _unsubSubs = null;
  let _pushTimer = null;
  let _ignoreNext = false;

  let _deviceId = localStorage.getItem('dpanel_device');
  if (!_deviceId) {
    _deviceId = 'dev_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('dpanel_device', _deviceId);
  }

  /* ── Badge de estado ───────────────────────────────────────────── */
  function updateBadge(state) {
    const el = document.getElementById('cloudBadge');
    if (!el) return;
    const map = {
      off:     ['⬜ Sin nube',    'var(--text2)', 'var(--bg2)',              'var(--bd)'],
      ok:      ['🟢 Nube activa', 'var(--green)', 'rgba(46,160,67,.12)',    'rgba(46,160,67,.3)'],
      syncing: ['🔄 Sync...',     'var(--blue)',  'rgba(56,139,253,.12)',   'rgba(56,139,253,.3)'],
      error:   ['🔴 Error nube',  'var(--red)',   'rgba(247,129,102,.12)', 'rgba(247,129,102,.3)'],
    };
    const [text, color, bg, border] = map[state] || map.off;
    el.textContent = text;
    Object.assign(el.style, { color, background: bg, borderColor: border });
    if (typeof window.updateCloudStatusDot === 'function') window.updateCloudStatusDot();
  }

  /* ── Eliminar imágenes base64 antes de subir (límite 1 MB) ──── */
  function stripImages(state) {
    const s = JSON.parse(JSON.stringify(state));
    s.shipments = (s.shipments || []).map(sh => {
      if (sh.docGuia        && sh.docGuia.d)        sh.docGuia        = { t: sh.docGuia.t,        n: sh.docGuia.n,        _hasImg: true };
      if (sh.docEmbalado    && sh.docEmbalado.d)    sh.docEmbalado    = { t: sh.docEmbalado.t,    n: sh.docEmbalado.n,    _hasImg: true };
      if (sh.docComprobante && sh.docComprobante.d) sh.docComprobante = { t: sh.docComprobante.t, n: sh.docComprobante.n, _hasImg: true };
      return sh;
    });
    s.suppliers = (s.suppliers || []).map(sup => {
      if (sup.cotiz && sup.cotiz.d) sup.cotiz = { t: sup.cotiz.t, n: sup.cotiz.n, _hasImg: true };
      return sup;
    });
    s.trash = [];
    return s;
  }

  /* ── Al recibir datos remotos, restaurar imágenes locales ──────── */
  function restoreLocalImages(remoteState) {
    const local = window.S || {};
    (remoteState.shipments || []).forEach(rsh => {
      const lsh = (local.shipments || []).find(x => x.id === rsh.id);
      if (!lsh) return;
      if (rsh.docGuia        && rsh.docGuia._hasImg        && lsh.docGuia        && lsh.docGuia.d)        rsh.docGuia        = lsh.docGuia;
      if (rsh.docEmbalado    && rsh.docEmbalado._hasImg    && lsh.docEmbalado    && lsh.docEmbalado.d)    rsh.docEmbalado    = lsh.docEmbalado;
      if (rsh.docComprobante && rsh.docComprobante._hasImg && lsh.docComprobante && lsh.docComprobante.d) rsh.docComprobante = lsh.docComprobante;
    });
    (remoteState.suppliers || []).forEach(rsup => {
      const lsup = (local.suppliers || []).find(x => x.id === rsup.id);
      if (lsup && rsup.cotiz && rsup.cotiz._hasImg && lsup.cotiz && lsup.cotiz.d) rsup.cotiz = lsup.cotiz;
    });
    remoteState.trash = local.trash || [];
    return remoteState;
  }

  /* ── Escribir en Firestore ──────────────────────────────────────── */
  async function doPush() {
    if (!_db || !_cfg.workspaceId || !_cfg.enabled) return;
    updateBadge('syncing');
    try {
      const data = stripImages(window.S);
      data._updatedAt = new Date().toISOString();
      data._updatedBy = _deviceId;
      _ignoreNext = true;
      await _db.collection('workspaces').doc(_cfg.workspaceId).set(data);
      updateBadge('ok');
    } catch (e) {
      console.error('[cloud] push error:', e);
      updateBadge('error');
    }
  }

  function schedulePush() {
    if (!_cfg.enabled) return;
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(doPush, 800);
  }

  /* ── Listener principal ─────────────────────────────────────────── */
  function startListener() {
    if (_unsub) { _unsub(); _unsub = null; }
    if (!_db || !_cfg.workspaceId) return;

    _unsub = _db.collection('workspaces').doc(_cfg.workspaceId).onSnapshot(snap => {
      if (!snap.exists) return;
      if (_ignoreNext) { _ignoreNext = false; return; }
      const remote = snap.data();
      if (remote._updatedBy === _deviceId) return;

      const merged = restoreLocalImages(remote);
      Object.assign(window.S, merged);
      try { localStorage.setItem('dpanel', JSON.stringify(window.S)); } catch (e) {}
      if (window.render) window.render();
      if (window.updateStats) window.updateStats();
      updateBadge('ok');
      if (window.toast) window.toast('☁️ Datos actualizados desde otro dispositivo');
    }, err => {
      console.error('[cloud] listener:', err);
      updateBadge('error');
    });
  }

  /* ── Listener de submissions del formulario público ─────────────── */
  function startSubmissionsListener() {
    if (_unsubSubs) { _unsubSubs(); _unsubSubs = null; }
    if (!_db || !_cfg.workspaceId) return;

    _unsubSubs = _db.collection('workspaces').doc(_cfg.workspaceId)
      .collection('submissions')
      .where('processed', '==', false)
      .onSnapshot(snapshot => {
        const newOnes = [];
        snapshot.docChanges().forEach(change => {
          if (change.type !== 'added') return;
          const sub = change.doc.data();
          const ref = change.doc.ref;
          if ((window.S.shipments || []).find(s => s.id === sub.id)) {
            ref.update({ processed: true }).catch(() => {});
            return;
          }
          const { processed, source, ...shipment } = sub;
          newOnes.push({ shipment, ref });
        });
        if (!newOnes.length) return;
        newOnes.forEach(({ shipment, ref }) => {
          window.S.shipments.unshift(shipment);
          ref.update({ processed: true }).catch(() => {});
        });
        try { localStorage.setItem('dpanel', JSON.stringify(window.S)); } catch (e) {}
        if (window.render) window.render();
        if (window.updateStats) window.updateStats();
        const names = newOnes.map(({ shipment: s }) => s.name).join(', ');
        const msg = newOnes.length === 1
          ? `📥 Nuevo pedido del formulario: ${names}`
          : `📥 ${newOnes.length} nuevos pedidos: ${names}`;
        if (window.toast) window.toast(msg);
      }, err => {
        console.error('[cloud] submissions listener:', err);
      });
  }

  /* ── Inicializar Firebase ───────────────────────────────────────── */
  async function init(cfg) {
    _cfg = Object.assign({}, _cfg, cfg);
    try { localStorage.setItem(FB_KEY, JSON.stringify({ workspaceId: _cfg.workspaceId, enabled: _cfg.enabled })); } catch (e) {}

    if (!_cfg.workspaceId || !_cfg.enabled) {
      updateBadge('off');
      return;
    }

    const fbConfig = window.FIREBASE_CONFIG;
    if (!fbConfig || !fbConfig.apiKey || !fbConfig.projectId) {
      console.error('[cloud] FIREBASE_CONFIG no está definido en index.html');
      updateBadge('error');
      if (window.toast) window.toast('❌ Completa FIREBASE_CONFIG en el código fuente');
      return;
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp({
          apiKey:     fbConfig.apiKey,
          projectId:  fbConfig.projectId,
          authDomain: fbConfig.projectId + '.firebaseapp.com',
        });
      }
      _db = firebase.firestore();

      const snap = await _db.collection('workspaces').doc(_cfg.workspaceId).get();
      if (!snap.exists) {
        updateBadge('syncing');
        await doPush();
        if (window.toast) window.toast('☁️ Datos migrados a la nube exitosamente');
      } else {
        const merged = restoreLocalImages(snap.data());
        Object.assign(window.S, merged);
        try { localStorage.setItem('dpanel', JSON.stringify(window.S)); } catch (e) {}
        if (window.render) window.render();
        if (window.updateStats) window.updateStats();
      }

      startListener();
      startSubmissionsListener();
      updateBadge('ok');
    } catch (e) {
      console.error('[cloud] init error:', e);
      updateBadge('error');
      if (window.toast) window.toast('❌ Error nube: ' + e.message);
    }
  }

  function disconnect() {
    if (_unsub) { _unsub(); _unsub = null; }
    if (_unsubSubs) { _unsubSubs(); _unsubSubs = null; }
    if (_pushTimer) { clearTimeout(_pushTimer); }
    _cfg.enabled = false;
    _db = null;
    try { localStorage.setItem(FB_KEY, JSON.stringify({ workspaceId: _cfg.workspaceId, enabled: false })); } catch (e) {}
    updateBadge('off');
  }

  function getConfig() {
    return Object.assign({}, _cfg, window.FIREBASE_CONFIG || {});
  }

  window._cloud = { init, disconnect, push: schedulePush, getConfig, updateBadge };

  // Auto-iniciar si ya había workspace guardado en este dispositivo
  if (_cfg.enabled && _cfg.workspaceId) {
    const tryInit = (n) => {
      if (typeof firebase !== 'undefined') {
        init(_cfg);
      } else if (n > 0) {
        setTimeout(() => tryInit(n - 1), 500);
      } else {
        updateBadge('error');
      }
    };
    document.addEventListener('DOMContentLoaded', () => tryInit(20));
  }
})();
