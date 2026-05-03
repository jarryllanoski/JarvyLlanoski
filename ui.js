// ui.js — Helpers de UI: $(), toast, goPage, openOverlay/closeOverlay, loadCfgUI

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const $ = id => document.getElementById(id);

/* TOAST */
function toast(m) {
  const e = $('toastEl');
  e.textContent = m;
  e.classList.add('show');
  clearTimeout(e._t);
  e._t = setTimeout(() => e.classList.remove('show'), 2600);
}

/* TABS */
function goPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  $('page-' + id).classList.add('active');
  ['envios', 'compartir', 'configurar'].forEach((n, i) => {
    if (n === id) document.querySelectorAll('.tab')[i].classList.add('active');
  });
  if (id === 'configurar') loadCfgUI();
  if (id === 'compartir') renderTokenList();
}

/* OVERLAYS */
function openOverlay(id) { $(id).classList.add('open'); }
function closeOverlay(id) { $(id).classList.remove('open'); }
document.querySelectorAll('.overlay').forEach(el =>
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); })
);

/* CONFIG UI */
function loadCfgUI() {
  $('cfgName').value = S.config.name || '';
  $('cfgPhone').value = S.config.phone || '';
  $('cfgCity').value = S.config.city || '';
  updateAutoStatusBadge();

  // DISPATCH DAYS
  const days = [{n:'Lun',v:1},{n:'Mar',v:2},{n:'Mié',v:3},{n:'Jue',v:4},{n:'Vie',v:5},{n:'Sáb',v:6},{n:'Dom',v:0}];
  $('dispatchDays').innerHTML = days.map(d => `
    <button class="day-btn ${(S.dispatch.days || []).includes(d.v) ? 'active' : ''}"
      onclick="toggleDispatchDay(${d.v})">${d.n}</button>`).join('');
  // HOUR SELECT
  const hours = [];
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 30) {
    const hh = h.toString().padStart(2, '0');
    const mm = m.toString().padStart(2, '0');
    const ap = h < 12 ? 'a.m.' : 'p.m.';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    hours.push({val:`${hh}:${mm}`, label:`${h12}:${mm} ${ap}`});
  }
  $('dispatchCutHour').innerHTML = hours.map(h =>
    `<option value="${h.val}" ${S.dispatch.cutHour === h.val ? 'selected' : ''}>${h.label}</option>`
  ).join('');
  $('dispatchAnticip').value = S.dispatch.anticipation || 0;

  // LABELS — fixed (non-deletable) + custom
  let labHTML = '';
  FIXED_LABELS.forEach((l) => {
    const msgs = S.msgTemplates[l] || ['', ''];
    const has = (msgs[0] && msgs[0].trim()) || (msgs[1] && msgs[1].trim());
    labHTML += `<div class="cfl-item">
      <span class="cfl-icon">${FIXED_LABEL_ICONS[l] || '🏷️'}</span>
      <span class="cfl-name">${l}</span>
      <span class="cfl-fixed-badge">Fija</span>
      ${has ? `<div class="cfl-has-msg"></div>` : ''}
      <div class="cfl-actions">
        <button class="cfl-btn cfl-btn-msg" onclick="openLabelEdit('${l}',null)">💬</button>
      </div>
    </div>`;
  });
  // Custom only (not fixed)
  const customLabels = S.labels.filter(l => !FIXED_LABELS.includes(l));
  customLabels.forEach((l) => {
    const i = S.labels.indexOf(l);
    const msgs = S.msgTemplates[l] || ['', ''];
    const has = (msgs[0] && msgs[0].trim()) || (msgs[1] && msgs[1].trim());
    labHTML += `<div class="cfl-item">
      <span class="cfl-drag">⠿</span>
      <span class="cfl-icon">🏷️</span>
      <span class="cfl-name">${l}</span>
      ${has ? `<div class="cfl-has-msg"></div>` : ''}
      <div class="cfl-actions">
        <button class="cfl-btn cfl-btn-edit" onclick="openLabelEdit('${l}',${i})">✏️</button>
        <button class="cfl-btn cfl-btn-msg" onclick="openLabelEdit('${l}',${i})">💬</button>
        <button class="cfl-btn cfl-btn-del" onclick="confirmDelItem('label',${i})">🗑️</button>
      </div>
    </div>`;
  });
  $('labelsList').innerHTML = labHTML;

  // COURIERS — fixed + custom, with active toggle + type toggle
  $('couriersList').innerHTML = S.couriers.map((c, i) => {
    const isActive = S.courierActive[c] !== false;
    const isFixed  = FIXED_COURIERS.includes(c);
    const ctype    = (S.courierTypes || {})[c] || 'delivery';
    return `<div class="cfl-item">
      <div class="courier-toggle ${isActive ? 'on' : ''}" onclick="toggleCourierActive('${c.replace(/'/g, "\\'")}')">
        <div class="courier-toggle-dot"></div>
      </div>
      <span class="cfl-icon">🚚</span>
      <span class="cfl-name" style="${isActive ? '' : 'opacity:.35'}">${c}</span>
      <span onclick="toggleCourierType('${c.replace(/'/g, "\\'")}',${i})" title="Tipo: ${ctype === 'agencia' ? 'Agencia (retiro)' : 'Delivery (domicilio)'}" style="font-size:9px;font-weight:700;cursor:pointer;padding:1px 6px;border-radius:4px;border:1px solid ${ctype === 'agencia' ? 'rgba(163,113,247,.5)' : 'rgba(56,139,253,.4)'};color:${ctype === 'agencia' ? 'var(--purple)' : 'var(--blue)'};background:${ctype === 'agencia' ? 'rgba(163,113,247,.08)' : 'rgba(56,139,253,.08)'};flex-shrink:0">${ctype === 'agencia' ? '🏢 AGENCIA' : '🏠 DELIVERY'}</span>
      ${isFixed ? `<span class="cfl-fixed-badge">Fijo</span>` : ''}
      ${!isActive ? `<span style="font-size:9px;color:var(--text2);background:var(--bg2);padding:1px 6px;border-radius:8px;border:1px solid var(--bd)">Oculto</span>` : ''}
      <div class="cfl-actions">
        ${!isFixed ? `<button class="cfl-btn cfl-btn-edit" onclick="openCourierEdit(${i})">✏️</button>` : ''}
        ${!isFixed ? `<button class="cfl-btn cfl-btn-del" onclick="confirmDelItem('courier',${i})">🗑️</button>` : ''}
      </div>
    </div>`;
  }).join('');

  // EXTRA FIELDS
  $('extraFieldsList').innerHTML = S.extraFields.map((f, i) => {
    const nm = f.name || f; const req = !!f.required; const vis = f.visible !== false;
    return `<div class="cfl-item">
      <span class="cfl-icon">📝</span>
      <span class="cfl-name">${nm}</span>
      <div style="display:flex;gap:3px;margin-right:4px;flex-shrink:0">
        <span onclick="toggleExtraFlag(${i},'required')" title="${req ? 'Obligatorio (toca para hacer opcional)' : 'Opcional (toca para hacer obligatorio)'}" style="font-size:9px;font-weight:700;cursor:pointer;padding:2px 5px;border-radius:4px;border:1px solid ${req ? 'rgba(247,129,102,.5)' : 'var(--bd)'};color:${req ? 'var(--red)' : 'var(--text2)'};background:${req ? 'rgba(247,129,102,.08)' : 'transparent'}">*REQ</span>
        <span onclick="toggleExtraFlag(${i},'visible')" title="${vis ? 'Visible (toca para ocultar)' : 'Oculto (toca para mostrar)'}" style="font-size:9px;font-weight:700;cursor:pointer;padding:2px 5px;border-radius:4px;border:1px solid ${vis ? 'rgba(46,160,67,.5)' : 'var(--bd)'};color:${vis ? 'var(--green)' : 'var(--text2)'};background:${vis ? 'rgba(46,160,67,.08)' : 'transparent'}">👁 VIS</span>
      </div>
      <div class="cfl-actions">
        <button class="cfl-btn cfl-btn-edit" onclick="openExtraEdit(${i})" title="Editar">✏️</button>
        <button class="cfl-btn cfl-btn-del" onclick="confirmDelItem('extra',${i})" title="Eliminar">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

/* TOKEN LIST (stub — tokens remain local-only) */
function renderTokenList() {
  const el = $('tokenList'); if (!el) return;
  const tokens = S.formTokens || [];
  if (!tokens.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text2);text-align:center;padding:16px 0">Sin tokens generados</div>';
    return;
  }
  el.innerHTML = tokens.slice(0, 15).map((t, i) => {
    const used = t.used;
    const expired = t.expiresAt && new Date() > new Date(t.expiresAt);
    const dot = used ? '🔴' : expired ? '🟡' : '🟢';
    const status = used ? 'Usado' : expired ? 'Expirado' : 'Activo';
    const sub = (t.singleUse ? 'Un uso' : 'Multi-uso') + (t.expiresAt ? ' · Vence ' + new Date(t.expiresAt).toLocaleDateString('es-PE') : '');
    return `<div style="background:var(--bg3);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;margin-bottom:1px">${t.label || 'Sin etiqueta'} <span style="font-size:10px;color:var(--text2)">${dot} ${status}</span></div>
        <div style="font-size:10px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sub}</div>
      </div>
      <button onclick="copyTokenUrl(${i})" title="Copiar link" style="width:30px;height:30px;border-radius:6px;border:1px solid var(--bd);background:var(--bg2);color:var(--text2);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0">📋</button>
      <button onclick="delToken(${i})" title="Eliminar" style="width:30px;height:30px;border-radius:6px;border:1px solid rgba(247,129,102,.3);background:rgba(247,129,102,.08);color:var(--red);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0">🗑️</button>
    </div>`;
  }).join('');
}
