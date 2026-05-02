// cloud.js — Sincronización Firebase Firestore (subcollecciones)

(function () {
  'use strict';

  const FB_KEY = 'dpanel_fb';

  // Credenciales SIEMPRE desde localStorage — nunca hardcodeadas
  let _cfg = {};
  try { _cfg = JSON.parse(localStorage.getItem(FB_KEY) || '{}'); } catch (e) { _cfg = {}; }

  let _db = null;
  let _unsubs = [];
  let _pushTimer = null;

  let _deviceId = localStorage.getItem('dpanel_device');
  if (!_deviceId) {
    _deviceId = 'dev_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('dpanel_device', _deviceId);
  }

  /* ── Badge ─────────────────────────────────────────────────────── */
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

  /* ── Credenciales solo desde localStorage ────────────────────── */
  function resolveFirebaseConfig() {
    if (_cfg.apiKey && _cfg.projectId) return { apiKey: _cfg.apiKey, projectId: _cfg.projectId };
    return null;
  }

  /* ── Strips / restaura imágenes ──────────────────────────────── */
  function stripShipmentImages(s) {
    const sh = Object.assign({}, s);
    if (sh.docGuia        && sh.docGuia.d)        sh.docGuia        = { t: sh.docGuia.t,        n: sh.docGuia.n,        _hasImg: true };
    if (sh.docEmbalado    && sh.docEmbalado.d)    sh.docEmbalado    = { t: sh.docEmbalado.t,    n: sh.docEmbalado.n,    _hasImg: true };
    if (sh.docComprobante && sh.docComprobante.d) sh.docComprobante = { t: sh.docComprobante.t, n: sh.docComprobante.n, _hasImg: true };
    return sh;
  }

  function restoreShipmentImages(remote, local) {
    if (!local) return remote;
    const s = Object.assign({}, remote);
    if (s.docGuia        && s.docGuia._hasImg        && local.docGuia        && local.docGuia.d)        s.docGuia        = local.docGuia;
    if (s.docEmbalado    && s.docEmbalado._hasImg    && local.docEmbalado    && local.docEmbalado.d)    s.docEmbalado    = local.docEmbalado;
    if (s.docComprobante && s.docComprobante._hasImg && local.docComprobante && local.docComprobante.d) s.docComprobante = local.docComprobante;
    return s;
  }

  /* ── Log ─────────────────────────────────────────────────────── */
  function cloudLog(msg) { console.log('[cloud] ' + msg); }

  /* ── Batch push completo: config + todos los pedidos ─────────── */
  async function doPush() {
    if (!_db || !_cfg.workspaceId || !_cfg.enabled) return;
    updateBadge('syncing');
    try {
      const S = window.S;
      const wsRef = _db.collection('workspaces').doc(_cfg.workspaceId);
      const shipments = S.shipments || [];
      const now = new Date().toISOString();

      const configData = {
        config:        S.config,
        couriers:      S.couriers,
        courierActive: S.courierActive,
        courierTypes:  S.courierTypes,
        extraFields:   S.extraFields,
        labels:        S.labels,
        msgTemplates:  S.msgTemplates,
        dispatch:      S.dispatch,
        statusPin:     S.statusPin,
        suppliers:     S.suppliers,
        formTokens:    S.formTokens || [],
        _updatedAt:    now,
        _updatedBy:    _deviceId,
      };

      const batches = [_db.batch()];
      let opCount = 1;
      batches[0].set(wsRef.collection('config').doc('main'), configData);

      for (const s of shipments) {
        if (opCount >= 499) { batches.push(_db.batch()); opCount = 0; }
        const stripped = stripShipmentImages(Object.assign({}, s));
        stripped._updatedAt = now;
        stripped._updatedBy = _deviceId;
        batches[batches.length - 1].set(wsRef.collection('pedidos').doc(s.id), stripped);
        opCount++;
      }

      cloudLog('Guardando en Firestore (' + (shipments.length + 1) + ' docs)');
      for (const batch of batches) await batch.commit();
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

  /* ── Eliminar un pedido de Firestore ─────────────────────────── */
  async function deleteShipment(id) {
    if (!_db || !_cfg.workspaceId || !_cfg.enabled) return;
    cloudLog('Guardando en Firestore (eliminar pedido ' + id + ')');
    try {
      await _db.collection('workspaces').doc(_cfg.workspaceId).collection('pedidos').doc(id).delete();
    } catch (e) {
      console.error('[cloud] delete error:', e);
    }
  }

  /* ── Listener config ──────────────────────────────────────────── */
  function listenConfig() {
    const ref = _db.collection('workspaces').doc(_cfg.workspaceId).collection('config').doc('main');
    cloudLog('onSnapshot activo (config)');
    const unsub = ref.onSnapshot(snap => {
      if (!snap.exists) return;
      const d = snap.data();
      if (d._updatedBy === _deviceId) return;
      cloudLog('onSnapshot activo — config desde otro dispositivo');
      const S = window.S;
      ['config','couriers','courierActive','courierTypes','extraFields','labels','msgTemplates','dispatch','statusPin','suppliers','formTokens'].forEach(k => {
        if (d[k] !== undefined) S[k] = d[k];
      });
      try { localStorage.setItem('dpanel', JSON.stringify(S)); } catch (e) {}
      if (window.loadCfgUI) window.loadCfgUI();
      if (window.render) window.render();
      if (window.updateStats) window.updateStats();
      updateBadge('ok');
      if (window.toast) window.toast('☁️ Configuración actualizada desde otro dispositivo');
    }, err => { console.error('[cloud] config listener:', err); updateBadge('error'); });
    _unsubs.push(unsub);
  }

  /* ── Listener pedidos ─────────────────────────────────────────── */
  function listenShipments() {
    const ref = _db.collection('workspaces').doc(_cfg.workspaceId).collection('pedidos');
    cloudLog('onSnapshot activo (pedidos)');
    const unsub = ref.onSnapshot(snapshot => {
      const changes = snapshot.docChanges().filter(c => c.doc.data()._updatedBy !== _deviceId);
      if (!changes.length) return;
      cloudLog('onSnapshot activo — ' + changes.length + ' pedido(s) desde otro dispositivo');
      changes.forEach(change => {
        const remote = change.doc.data();
        if (change.type === 'removed') {
          window.S.shipments = window.S.shipments.filter(s => s.id !== remote.id);
        } else {
          const local = window.S.shipments.find(s => s.id === remote.id);
          const merged = restoreShipmentImages(remote, local);
          if (local) {
            Object.assign(local, merged);
          } else {
            window.S.shipments.unshift(merged);
          }
        }
      });
      try { localStorage.setItem('dpanel', JSON.stringify(window.S)); } catch (e) {}
      if (window.render) window.render();
      if (window.updateStats) window.updateStats();
      updateBadge('ok');
      if (window.toast) window.toast('☁️ Pedidos actualizados desde otro dispositivo');
    }, err => { console.error('[cloud] shipments listener:', err); updateBadge('error'); });
    _unsubs.push(unsub);
  }

  /* ── Listener submissions del formulario público ─────────────── */
  function listenSubmissions() {
    const ref = _db.collection('workspaces').doc(_cfg.workspaceId)
      .collection('submissions').where('processed', '==', false);
    cloudLog('onSnapshot activo (submissions)');
    const unsub = ref.onSnapshot(snapshot => {
      const newOnes = [];
      snapshot.docChanges().forEach(change => {
        if (change.type !== 'added') return;
        const sub = change.doc.data();
        const docRef = change.doc.ref;
        if ((window.S.shipments || []).find(s => s.id === sub.id)) {
          docRef.update({ processed: true }).catch(() => {});
          return;
        }
        // eslint-disable-next-line no-unused-vars
        const { processed, source, ...shipment } = sub;
        newOnes.push({ shipment, docRef });
      });
      if (!newOnes.length) return;
      newOnes.forEach(({ shipment, docRef }) => {
        window.S.shipments.unshift(shipment);
        docRef.update({ processed: true }).catch(() => {});
        // Mirror to pedidos subcollection
        const stripped = stripShipmentImages(Object.assign({}, shipment));
        stripped._updatedAt = new Date().toISOString();
        stripped._updatedBy = _deviceId;
        _db.collection('workspaces').doc(_cfg.workspaceId).collection('pedidos').doc(shipment.id).set(stripped).catch(() => {});
      });
      try { localStorage.setItem('dpanel', JSON.stringify(window.S)); } catch (e) {}
      if (window.render) window.render();
      if (window.updateStats) window.updateStats();
      const names = newOnes.map(({ shipment: s }) => s.name).join(', ');
      const msg = newOnes.length === 1
        ? `📥 Nuevo pedido del formulario: ${names}`
        : `📥 ${newOnes.length} nuevos pedidos: ${names}`;
      if (window.toast) window.toast(msg);
    }, err => { console.error('[cloud] submissions listener:', err); });
    _unsubs.push(unsub);
  }

  /* ── Inicializar Firebase ─────────────────────────────────────── */
  async function init(cfg) {
    _cfg = Object.assign({}, _cfg, cfg);
    try { localStorage.setItem(FB_KEY, JSON.stringify(_cfg)); } catch (e) {}

    if (!_cfg.workspaceId || !_cfg.enabled) {
      updateBadge('off');
      return;
    }

    if (!_cfg.apiKey || !_cfg.projectId) {
      updateBadge('error');
      if (window.toast) window.toast('❌ Ingresa el API Key y Project ID en ⚙️ Configuración');
      return;
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp({
          apiKey:     _cfg.apiKey,
          projectId:  _cfg.projectId,
          authDomain: _cfg.projectId + '.firebaseapp.com',
        });
      }
      _db = firebase.firestore();

      cloudLog('Leyendo desde Firestore');

      const wsRef = _db.collection('workspaces').doc(_cfg.workspaceId);
      const [configSnap, shipmentsSnap] = await Promise.all([
        wsRef.collection('config').doc('main').get(),
        wsRef.collection('pedidos').get(),
      ]);

      const S = window.S;

      if (configSnap.exists) {
        const d = configSnap.data();
        ['config','couriers','courierActive','courierTypes','extraFields','labels','msgTemplates','dispatch','statusPin','suppliers','formTokens'].forEach(k => {
          if (d[k] !== undefined) S[k] = d[k];
        });
      }

      if (!shipmentsSnap.empty) {
        S.shipments = shipmentsSnap.docs.map(doc => {
          const r = doc.data();
          const local = S.shipments.find(s => s.id === r.id);
          return restoreShipmentImages(r, local);
        });
        S.shipments.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1));
      } else if (!configSnap.exists) {
        cloudLog('Guardando en Firestore (migración inicial)');
        await doPush();
        if (window.toast) window.toast('☁️ Datos migrados a la nube exitosamente');
      }

      try { localStorage.setItem('dpanel', JSON.stringify(S)); } catch (e) {}
      if (window.render) window.render();
      if (window.updateStats) window.updateStats();
      if (window.loadCfgUI) window.loadCfgUI();

      listenConfig();
      listenShipments();
      listenSubmissions();
      updateBadge('ok');

    } catch (e) {
      console.error('[cloud] init error:', e);
      updateBadge('error');
      if (window.toast) window.toast('❌ Error nube: ' + e.message);
    }
  }

  function disconnect() {
    _unsubs.forEach(u => u());
    _unsubs = [];
    clearTimeout(_pushTimer);
    _cfg.enabled = false;
    _db = null;
    try { localStorage.setItem(FB_KEY, JSON.stringify(_cfg)); } catch (e) {}
    updateBadge('off');
  }

  function getConfig() {
    return Object.assign({}, _cfg);
  }

  window._cloud = { init, disconnect, push: schedulePush, deleteShipment, getConfig, updateBadge };

  // Auto-iniciar si ya estaba configurado con credenciales en localStorage
  if (_cfg.enabled && _cfg.workspaceId && _cfg.apiKey && _cfg.projectId) {
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
