// activity.js — Log de actividad, badge de campanita, banner en tiempo real

const MAX_ACTS = 50;

/* ── Relativo de tiempo ─────────────────────────────────── */
function _actTsRel(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)    return 'ahora';
  if (diff < 3600000)  return Math.round(diff / 60000) + 'm';
  if (diff < 86400000) return Math.round(diff / 3600000) + 'h';
  return Math.round(diff / 86400000) + 'd';
}

const _ACT_ICON  = { status:'🏷️', task:'📋', login:'👤', neworder:'📥' };
const _ACT_COLOR = { status:'#388bfd', task:'#a371f7', login:'#3fb950', neworder:'#e3b341' };

/* ── Registrar acción ───────────────────────────────────── */
function logActivity(type, detail, shipmentId, taskId) {
  if (!S.activityLog) S.activityLog = [];
  const entry = {
    id:  'act_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
    type,
    user:       S.activeUser || 'Jefe',
    detail,
    shipmentId: shipmentId || '',
    taskId:     taskId     || '',
    ts:         new Date().toISOString()
  };
  S.activityLog.unshift(entry);
  if (S.activityLog.length > MAX_ACTS) S.activityLog.length = MAX_ACTS;
  _updateBellBadge();
  _showActivityBanner(entry);
}

/* ── Badge ──────────────────────────────────────────────── */
function _updateBellBadge() {
  const badge = $('bellBadge'); if (!badge) return;
  if (!S.activityLog || !S.activityLog.length) { badge.style.display = 'none'; return; }
  const lastRead = S.lastReadActivityAt || '';
  const unread   = S.activityLog.filter(a => a.ts > lastRead).length;
  if (unread > 0) {
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

/* ── Overlay de actividad ───────────────────────────────── */
function openActivityLog() {
  S.lastReadActivityAt = new Date().toISOString();
  if (typeof lsSet === 'function') lsSet('dpanel', JSON.stringify(S));
  _updateBellBadge();
  renderActivityLog();
  if (typeof openOverlay === 'function') openOverlay('activityOverlay');
}

function renderActivityLog() {
  const el = $('activityList'); if (!el) return;
  const log = S.activityLog || [];
  if (!log.length) {
    el.innerHTML = `<div style="text-align:center;padding:40px 16px;color:var(--text2);font-size:13px">Sin actividad registrada aún</div>`;
    return;
  }
  el.innerHTML = log.map(a => {
    const col = _ACT_COLOR[a.type] || 'var(--text2)';
    const ico = _ACT_ICON[a.type]  || '⚡';
    const rel = _actTsRel(a.ts);
    const navFn = a.shipmentId
      ? `goPage('envios');closeOverlay('activityOverlay');setTimeout(()=>openForm('${a.shipmentId}'),200)`
      : a.taskId
      ? `goPage('tareas');closeOverlay('activityOverlay');setTimeout(()=>openTaskForm('${a.taskId}'),200)`
      : '';
    return `<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--bd)">
      <div style="width:36px;height:36px;border-radius:50%;background:${col}22;border:1px solid ${col}55;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${ico}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700;color:var(--text)">${a.user}</div>
        <div style="font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.detail}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:11px;color:var(--text2)">${rel}</div>
        ${navFn ? `<div onclick="${navFn}" style="font-size:11px;color:var(--blue);font-weight:700;cursor:pointer;margin-top:2px">Ver →</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ── Banner de notificación ─────────────────────────────── */
let _bannerTimer = null;

function _showActivityBanner(entry) {
  const banner = $('activityBanner'); if (!banner) return;
  const txt    = $('activityBannerTxt');
  const link   = $('activityBannerLink');
  if (txt) txt.textContent = entry.user + ' · ' + entry.detail;
  if (link) {
    if (entry.shipmentId) {
      link.onclick = () => {
        goPage('envios'); hideBanner();
        setTimeout(() => openForm(entry.shipmentId), 200);
      };
      link.style.display = 'inline';
    } else if (entry.taskId) {
      link.onclick = () => {
        goPage('tareas'); hideBanner();
        setTimeout(() => openTaskForm(entry.taskId), 200);
      };
      link.style.display = 'inline';
    } else {
      link.style.display = 'none';
    }
  }
  banner.style.display = 'flex';
  clearTimeout(_bannerTimer);
  _bannerTimer = setTimeout(hideBanner, 5000);
}

function hideBanner() {
  const b = $('activityBanner'); if (b) b.style.display = 'none';
  clearTimeout(_bannerTimer);
}

/* ── Init ───────────────────────────────────────────────── */
function initActivity() {
  if (!S.activityLog)       S.activityLog       = [];
  if (!S.lastReadActivityAt) S.lastReadActivityAt = '';
  _updateBellBadge();
}
