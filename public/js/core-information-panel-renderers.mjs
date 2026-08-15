// Shared DOM-only renderers for the legacy panel manager and Phase 2 workspace.
// The renderer and helper bodies are the legacy implementations moved verbatim so
// both the legacy `/` client and the Phase 2 workspace render identically.
// Callers inject the two side-effects (command send, image dialog) so this module
// never reaches into session or GMCP state.

export function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return hours + 'h ' + remMinutes + 'm';
  }
  if (minutes > 0) return minutes + 'm ' + secs + 's';
  return secs + 's';
}

function formatStatusTitle(title, name) {
  if (!title) return title;
  const displayName = name || '';
  return String(title).replace(/\$N/g, displayName).replace(/\s+/g, ' ').trim();
}

export function formatInt(n) {
  return typeof n === 'number' ? n.toLocaleString('en-US') : n;
}

function skyBoundarySeconds(value, scale) {
  if (Array.isArray(value)) {
    return (Number(value[0]) || 0) * scale.hour + (Number(value[1]) || 0) * scale.minute;
  }
  if (value && typeof value === 'object') {
    return (Number(value.hour) || 0) * scale.hour + (Number(value.minute) || 0) * scale.minute;
  }
  return 0;
}

function skyStageForSecond(daySecond, almanac, scale) {
  const sunrise = skyBoundarySeconds(almanac && almanac.sunrise, scale);
  const morning = skyBoundarySeconds(almanac && almanac.morning, scale);
  const twilight = skyBoundarySeconds(almanac && almanac.twilight, scale);
  const sunset = skyBoundarySeconds(almanac && almanac.sunset, scale);

  if (daySecond >= sunrise && daySecond < morning) return 'dawn';
  if (daySecond >= morning && daySecond < twilight) return 'day';
  if (daySecond >= twilight && daySecond < sunset) return 'twilight';
  return 'night';
}

function skyCurrentState(data) {
  const scale = {
    second: Number(data && data.scale && data.scale.second) || 1,
    minute: Number(data && data.scale && data.scale.minute) || 20,
    hour: Number(data && data.scale && data.scale.hour) || 1200,
    day: Number(data && data.scale && data.scale.day) || 24000,
  };
  // Legacy stamps `_receivedAt`; the Phase 2 session read model stamps
  // `receivedAt`. Accept either so the clock advances from either caller.
  const receivedAt = Number(data && (data._receivedAt ?? data.receivedAt)) || Date.now();
  const elapsed = Math.max(0, Math.floor((Date.now() - receivedAt) / 1000));
  const gameNow = Math.max(0, (Number(data && data.game_now) || 0) + elapsed);
  const daySecond = ((gameNow % scale.day) + scale.day) % scale.day;
  const hour = Math.floor(daySecond / scale.hour);
  const minute = Math.floor((daySecond % scale.hour) / scale.minute);
  const second = Math.floor((daySecond % scale.minute) / scale.second);
  const stage = skyStageForSecond(daySecond, data && data.almanac, scale);
  const daySinceBeginning = Math.floor(gameNow / scale.day) + 1;

  return { scale, gameNow, daySecond, hour, minute, second, stage, daySinceBeginning };
}

function skyClockLabel(sky) {
  return String(sky.hour).padStart(2, '0') + ':' + String(sky.minute).padStart(2, '0');
}

export function skyRecomputeMoon(moon, sky) {
  const phaseHours = Number(moon && moon.phase_hours) || 0;
  const cycleDays = Number(moon && moon.cycle_days) || 1;
  const phase = phaseHours > 0
    ? (Math.trunc(sky.gameNow / (phaseHours * 3600)) % 8) + 1
    : (Math.trunc(sky.daySinceBeginning / cycleDays) % 8) + 1;
  const names = ['new', 'waxing crescent', 'half', 'waxing gibbous', 'full', 'waning gibbous', 'half', 'waning crescent'];
  return {
    ...moon,
    phase,
    phase_name: names[phase - 1],
  };
}

function skyMoonColor(moon) {
  const id = String(moon && moon.id || '').toLowerCase();
  if (id === 'dailos') return '#d46cff';
  if (id === 'markas') return '#ff5f57';
  if (id === 'tekal') return '#7ee787';
  return '#c9d1d9';
}

function skySurfaceBody(data) {
  const body = data && data.surface_body;
  if (!body || !body.id) return null;
  return {
    id: String(body.id || ''),
    name: body.name || body.id || 'World',
    description: body.description || '',
    color: body.color || '#d8dee9',
  };
}

export function vitalBarColor(pct) {
  if (pct > 60) return '#3fb950';
  if (pct > 30) return '#d29922';
  return '#f85149';
}

function inverseVitalBarColor(pct) {
  if (pct > 60) return '#f85149';
  if (pct > 30) return '#d29922';
  return '#3fb950';
}

export function heatVitalBarColor(pct) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  if (clamped <= 50) {
    const t = clamped / 50;
    return interpolateColor('#3fb950', '#d29922', t);
  }
  const t = (clamped - 50) / 50;
  return interpolateColor('#d29922', '#f85149', t);
}

function interpolateColor(from, to, t) {
  const a = parseHexColor(from);
  const b = parseHexColor(to);
  const mix = (idx) => Math.round(a[idx] + (b[idx] - a[idx]) * t);
  return '#' + [mix(0), mix(1), mix(2)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function parseHexColor(value) {
  return [1, 3, 5].map((idx) => parseInt(value.slice(idx, idx + 2), 16));
}

function divineGodLabel(god) {
  switch (String(god || '').toLowerCase()) {
    case 'mitra': return 'Mitra';
    case 'gaea': return 'Gaea';
    case 'set': return 'Set';
    default: return 'None';
  }
}

function divineModifierLabel(value) {
  const n = Number(value) || 0;
  if (n > 0) return '+' + n + '% charge';
  if (n < 0) return n + '% charge';
  return 'No charge modifier';
}

function divinePressureLabel(god, pct, leader) {
  const normalizedGod = String(god || '').toLowerCase();
  const normalizedLeader = String(leader || '').toLowerCase();

  if (pct <= 0) return 'silent';
  if (normalizedGod && normalizedGod === normalizedLeader) return 'ascendant';
  if (pct >= 85) return 'dominant';
  if (pct >= 60) return 'surging';
  if (pct >= 35) return 'rising';
  return 'stirring';
}

function vitalBarClass(value) {
  const suffix = String(value || 'bar').toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'bar';
  return 'vitals-' + suffix;
}

export function renderVitalBar(bodyEl, label, cur, max, opts = {}) {
  const rowClass = vitalBarClass(opts.id || label);
  let row = bodyEl.querySelector('.' + rowClass);
  const rawPct = max > 0 ? Math.round((cur / max) * 100) : 0;
  const pct = Math.max(0, Math.min(100, rawPct));
  if (!row) {
    row = document.createElement('div');
    row.className = 'vitals-row ' + rowClass;
    row.innerHTML =
      '<div class="vitals-label"><span class="vitals-label-name"></span><span class="vitals-val"></span></div>' +
      '<div class="vitals-bar"><div class="vitals-bar-fill"></div></div>';
    bodyEl.appendChild(row);
  }
  if (opts.guild) row.classList.add('vitals-guild');
  if (opts.reverse) row.classList.add('vitals-reverse');
  else row.classList.remove('vitals-reverse');
  Array.from(row.classList).forEach((className) => {
    if (className.indexOf('vitals-kind-') === 0) row.classList.remove(className);
  });
  if (opts.kind) row.classList.add('vitals-kind-' + opts.kind);
  row.querySelector('.vitals-label-name').textContent = label;
  row.querySelector('.vitals-val').textContent = opts.display || (cur + ' / ' + max);
  if (opts.title) row.title = opts.title;
  else row.removeAttribute('title');
  const fill = row.querySelector('.vitals-bar-fill');
  fill.style.width = pct + '%';
  if (opts.colorMode === 'heat') {
    fill.style.backgroundColor = heatVitalBarColor(pct);
  }
  else fill.style.backgroundColor = opts.colorMode === 'inverse'
    ? inverseVitalBarColor(pct)
    : vitalBarColor(pct);
}

function removeVitalBar(bodyEl, label, opts = {}) {
  const row = bodyEl.querySelector('.' + vitalBarClass(opts.id || label));
  if (row) row.remove();
}

const GUILD_VITAL_SEVERITIES = { ok: true, warn: true, danger: true };

function guildVitalSeverityClass(item) {
  const sev = item && item.severity;
  return GUILD_VITAL_SEVERITIES[sev] ? ' vitals-sev-' + sev : '';
}

// Pure HTML builder for the non-meter GuildVitals v2 kinds (boolean, flags,
// state, counter, cooldown). Returns null for meter kinds, which render via
// renderVitalBar. Exported for tests.
export function guildVitalItemHtml(item) {
  const kind = item && item.kind ? String(item.kind) : 'meter';
  const label = escHtml(String((item && item.label) || ''));
  const sev = guildVitalSeverityClass(item);
  switch (kind) {
    case 'boolean':
      return '<div class="vitals-inline"><span class="vitals-label-name">' +
        label + '</span><span class="vitals-led' +
        (item.on ? ' on' : '') + sev + '"></span></div>';
    case 'flags': {
      const flags = Array.isArray(item.flags) ? item.flags : [];
      let pips = '';
      flags.forEach((flag) => {
        if (!flag || typeof flag !== 'object') return;
        pips += '<span class="vitals-flag' + (flag.on ? ' on' : '') + '"' +
          (flag.tip ? ' title="' + escHtml(String(flag.tip)) + '"' : '') +
          '>' + escHtml(String(flag.label || '')) + '</span>';
      });
      return '<div class="vitals-inline"><span class="vitals-label-name">' +
        label + '</span><span class="vitals-flags">' + pips +
        '</span></div>';
    }
    case 'state': {
      const display = String(item.display || item.value || '-');
      return '<div class="vitals-inline"><span class="vitals-label-name">' +
        label + '</span><span class="vitals-state-badge' + sev + '">' +
        escHtml(display) + '</span></div>';
    }
    case 'counter': {
      const max = Math.max(1, Math.min(12, Number(item.max) || 0));
      const cur = Math.max(0, Math.min(max, Number(item.cur) || 0));
      let pips = '';
      for (let i = 0; i < max; i++) {
        pips += '<span class="vitals-pip' +
          (i < cur ? ' filled' + sev : '') + '"></span>';
      }
      return '<div class="vitals-inline"><span class="vitals-label-name">' +
        label + '</span><span class="vitals-val">' + cur + ' / ' + max +
        '</span></div><div class="vitals-pips">' + pips + '</div>';
    }
    case 'cooldown': {
      const remaining = Math.max(0, Number(item.remaining) || 0);
      const max = Number(item.max) || 0;
      let html = '<div class="vitals-inline"><span class="vitals-label-name">' +
        label + '</span><span class="vitals-val">' +
        escHtml(formatDuration(remaining)) + '</span></div>';
      if (max > 0) {
        const pct = Math.max(0, Math.min(100, Math.round((remaining * 100) / max)));
        html += '<div class="vitals-cd-bar"><div class="vitals-cd-fill" style="width:' +
          pct + '%"></div></div>';
      }
      return html;
    }
    default:
      return null;
  }
}

// GuildVitals renderer: accepts both the v2 typed items list and the legacy
// v1 bars list (kind "warning" maps to a reverse meter). Rows keep their
// identity by id so they update in place; items are grouped under per-guild
// headers when more than one guild is present, and DOM order is enforced by
// re-appending rows each render (appendChild moves existing nodes).
function renderGuildVitalItems(bodyEl, items) {
  const seen = {};
  const groups = [];
  const groupIndex = {};

  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || !item.id || !item.label) return;
    const guild = item.guild ? String(item.guild) : '';
    if (!(guild in groupIndex)) {
      groupIndex[guild] = groups.length;
      groups.push({ guild, items: [] });
    }
    groups[groupIndex[guild]].items.push(item);
  });
  const showHeaders = groups.length > 1;

  groups.forEach((group) => {
    if (showHeaders && group.guild) {
      const hdrClass = vitalBarClass('guild-hdr-' + group.guild);
      let hdr = bodyEl.querySelector('.' + hdrClass);
      if (!hdr) {
        hdr = document.createElement('div');
        hdr.className = 'vitals-guild-header vitals-guild ' + hdrClass;
      }
      hdr.textContent = group.guild;
      bodyEl.appendChild(hdr);
      seen[hdrClass] = true;
    }

    group.items.forEach((item) => {
      const kind = item.kind ? String(item.kind) : 'meter';
      const id = 'guild-' + item.id;
      const rowClass = vitalBarClass(id);
      const title = item.tip ? String(item.tip)
        : (group.guild ? group.guild + ': ' + item.label : String(item.label));

      if (kind === 'meter' || kind === 'meter_reverse' || kind === 'warning') {
        const cur = Number(item.cur);
        const max = Number(item.max);
        if (!Number.isFinite(cur) || !Number.isFinite(max) || max <= 0) return;
        const reverse = kind !== 'meter';
        renderVitalBar(bodyEl, String(item.label), cur, max, {
          id,
          guild: true,
          kind: reverse ? 'meter_reverse' : '',
          title,
          colorMode: item.id === 'street_samurai.heat' ? 'heat'
            : (reverse ? 'inverse' : ''),
          reverse,
        });
        const meterRow = bodyEl.querySelector('.' + rowClass);
        if (meterRow) bodyEl.appendChild(meterRow);
        seen[rowClass] = true;
        return;
      }

      const html = guildVitalItemHtml(item);
      if (html === null) return;
      let row = bodyEl.querySelector('.' + rowClass);
      if (!row) {
        row = document.createElement('div');
        row.className = 'vitals-row vitals-guild ' + rowClass;
      }
      Array.from(row.classList).forEach((className) => {
        if (className.indexOf('vitals-kind-') === 0) row.classList.remove(className);
      });
      row.classList.add('vitals-kind-' + kind);
      if (title) row.title = title;
      // Only rewrite when the markup changed, so the 2s tick doesn't churn.
      if (!row.dataset || row.dataset.gvHtml !== html) {
        row.innerHTML = html;
        if (row.dataset) row.dataset.gvHtml = html;
      }
      bodyEl.appendChild(row);
      seen[rowClass] = true;
    });
  });

  bodyEl.querySelectorAll('.vitals-guild').forEach((row) => {
    const known = Array.from(row.classList).some((className) => seen[className]);
    if (!known) row.remove();
  });
}

// Phase 2 supplies live avatar charge/active vitals alongside the avatar frame;
// the legacy client passes the avatar object only, so the meter is additive and
// leaves legacy output unchanged.
function avatarChargeMeter(vitals) {
  if (!vitals) return '';
  const charge = Number(vitals.avatar_charge);
  const max = Number(vitals.avatar_charge_max);
  const active = Number(vitals.avatar_active_remaining ?? vitals.avatar_active);
  if (Number.isFinite(charge) && max > 0) {
    const pct = Math.max(0, Math.min(100, (charge / max) * 100));
    return '<div class="avatar-meter" role="progressbar" aria-label="Avatar charge"' +
      ' aria-valuemin="0" aria-valuemax="' + max + '" aria-valuenow="' + charge + '">' +
      '<div class="avatar-meter-fill" style="width:' + pct + '%"></div>' +
      '<span>' + charge + ' / ' + max + '</span></div>';
  }
  if (active > 0) return '<div class="avatar-meter" role="status">Active ' + Math.ceil(active) + 's</div>';
  return '';
}

export function createInformationPanelRenderers({ sendCommand, openImageDialog } = {}) {
  const command = sendCommand || (() => {});
  const openImage = openImageDialog || (() => {});
  return {
    sky(bodyEl, data) {
      if (!data || data.game_now === undefined || data.game_now === null) {
        bodyEl.innerHTML = '<div class="placeholder">Waiting for sky...</div>';
        return;
      }

      const sky = skyCurrentState(data);
      const almanac = data.almanac || {};
      const sunrise = skyBoundarySeconds(almanac.sunrise, sky.scale);
      const sunset = skyBoundarySeconds(almanac.sunset, sky.scale);
      const daylight = Math.max(1, sunset - sunrise);
      const sunProgress = Math.max(0, Math.min(1, (sky.daySecond - sunrise) / daylight));
      const sunVisible = sky.stage !== 'night';
      const sunX = 8 + sunProgress * 84;
      const sunY = 78 - Math.sin(sunProgress * Math.PI) * 62;
      const moons = Array.isArray(data.moons)
        ? data.moons.map((moon) => skyRecomputeMoon(moon, sky))
        : [];
      const surfaceBody = skySurfaceBody(data);
      const showMoons = sky.stage === 'night' || sky.stage === 'twilight';
      let html = '<div class="sky-panel sky-stage-' + escHtml(sky.stage) + '">';
      html += '<div class="sky-canvas">';
      html += '<div class="sky-stars"></div>';
      if (surfaceBody) {
        const bodyVisible = sky.stage === 'night' || sky.stage === 'twilight';
        const bodyTop = bodyVisible ? 17 : 28;
        const bodyOpacity = bodyVisible ? 0.88 : 0.38;
        const bodyTitle = surfaceBody.name + (surfaceBody.description ? ': ' + surfaceBody.description : '');
        html += '<div class="sky-world-body" title="' + escHtml(bodyTitle) + '" style="top:' + bodyTop + '%;opacity:' + bodyOpacity + ';--world-color:' + escHtml(surfaceBody.color) + '">' +
          '<span></span></div>';
      }
      if (sunVisible) {
        html += '<div class="sky-sun" style="left:' + sunX.toFixed(2) + '%;top:' + sunY.toFixed(2) + '%"></div>';
      }
      if (showMoons && moons.length) {
        html += '<div class="sky-moons">';
        moons.forEach((moon, index) => {
          const phase = Math.max(1, Math.min(8, Number(moon.phase) || 1));
          const color = skyMoonColor(moon);
          const left = 18 + index * 28;
          const top = 20 + (index % 2) * 13;
          const label = (moon.name || moon.id || 'Moon') + ': ' + (moon.phase_name || '');
          html += '<div class="sky-moon sky-moon-phase-' + phase + '" title="' + escHtml(label) + '" style="left:' + left + '%;top:' + top + '%;--moon-color:' + escHtml(color) + '">' +
            '<span></span></div>';
        });
        html += '</div>';
      }
      html += '</div>';
      html += '<div class="sky-footer"><span>' + escHtml(sky.stage.toUpperCase()) + '</span><span>' + skyClockLabel(sky) + '</span></div>';
      if (surfaceBody || moons.length) {
        html += '<div class="sky-moon-strip">';
        if (surfaceBody) {
          html += '<span><i style="background:' + escHtml(surfaceBody.color) + '"></i>' +
            escHtml(surfaceBody.name) + '</span>';
        }
        moons.forEach((moon) => {
          html += '<span><i style="background:' + escHtml(skyMoonColor(moon)) + '"></i>' +
            escHtml(moon.name || moon.id || 'Moon') + ' ' + escHtml(moon.phase_name || '') + '</span>';
        });
        html += '</div>';
      }
      html += '</div>';
      bodyEl.innerHTML = html;
    },

    avatar(bodyEl, data) {
      const hasAvatar = !!(data && data.url);
      const src = hasAvatar ? data.url : '/assets/avatar-ghost.svg';
      const alt = (data && data.name) ? data.name : 'Avatar';
      const defaultClass = hasAvatar ? '' : ' avatar-default';
      const loadingClass = (data && data.loading) ? ' avatar-loading' : '';
      const zoomableClass = hasAvatar ? ' avatar-panel-image-zoomable' : '';
      let html = '<div class="avatar-panel-wrap">';
      html += '<img class="avatar-panel-image' + defaultClass + loadingClass + zoomableClass + '" src="' + escHtml(src) + '" alt="' + escHtml(alt) + '" draggable="false">';
      if (data && data.name) {
        html += '<div class="avatar-panel-name">' + escHtml(data.name) + '</div>';
      }
      html += avatarChargeMeter(data && data.vitals);
      html += '</div>';
      bodyEl.innerHTML = html;

      if (hasAvatar) {
        const img = bodyEl.querySelector('.avatar-panel-image');
        if (img) {
          img.addEventListener('click', function() {
            openImage(data.url, alt);
          });
        }
      }
    },

    vitals(bodyEl, data) {
      if (!data) return;
      if (bodyEl.querySelector('.placeholder')) bodyEl.innerHTML = '';
      renderVitalBar(bodyEl, 'HP', data.hp, data.maxhp);
      const hasSpellpoints = Object.prototype.hasOwnProperty.call(data, 'sp') &&
        Object.prototype.hasOwnProperty.call(data, 'maxsp');
      if (hasSpellpoints) renderVitalBar(bodyEl, 'SP', data.sp, data.maxsp);
      else removeVitalBar(bodyEl, 'SP');
      const hasMove = Object.prototype.hasOwnProperty.call(data, 'fp') &&
        Object.prototype.hasOwnProperty.call(data, 'maxfp');
      if (hasMove) renderVitalBar(bodyEl, 'Move', data.fp, data.maxfp);
      else removeVitalBar(bodyEl, 'Move');
      if (Object.prototype.hasOwnProperty.call(data, 'level_pct')) {
        const pct = Math.max(0, Math.min(100, Number(data.level_pct) || 0));
        renderVitalBar(bodyEl, 'Level', pct, 100, { display: pct + '%' });
      } else {
        removeVitalBar(bodyEl, 'Level');
      }
      const hasCarry = Object.prototype.hasOwnProperty.call(data, 'carry') &&
        Object.prototype.hasOwnProperty.call(data, 'maxcarry');
      if (hasCarry) {
        const label = data.encumberance_label ? String(data.encumberance_label) : '';
        const title = label ? 'Encumberance: ' + label : '';
        renderVitalBar(bodyEl, 'Carry', data.carry, data.maxcarry, {
          title,
          colorMode: 'inverse',
        });
      } else {
        removeVitalBar(bodyEl, 'Carry');
      }
      bodyEl.querySelectorAll('.vitals-guild').forEach((row) => row.remove());
    },

    guildVitals(bodyEl, data) {
      // v2 servers send "items" (typed indicators); v1 servers send "bars"
      // (plain meters, kind "warning" for danger-when-full). Both render.
      const items = data && Array.isArray(data.items) ? data.items
        : (data && Array.isArray(data.bars) ? data.bars : []);
      if (!items.length) {
        bodyEl.innerHTML = '<div class="placeholder">No guild vitals</div>';
        return;
      }
      if (bodyEl.querySelector('.placeholder')) bodyEl.innerHTML = '';
      renderGuildVitalItems(bodyEl, items);
    },

    omens(bodyEl, data) {
      if (!data) {
        bodyEl.innerHTML = '<div class="placeholder">Waiting for omens...</div>';
        return;
      }

      const scale = data.pressure_scale || {};
      const holy = data.holy_hour || {};
      const eclipse = data.eclipse || {};
      const patron = data.patron ? divineGodLabel(data.patron) : 'None';
      const leader = data.leader ? divineGodLabel(data.leader) : 'No ascendant';
      const rank = data.rank_label || 'None';
      const summary = data.summary || 'The omens are quiet.';
      const gods = ['mitra', 'gaea', 'set'];
      let html = '<div class="omens-panel">';

      html += '<div class="omens-summary">' + escHtml(summary) + '</div>';
      html += '<div class="omens-status-grid">';
      html += '<div><span>Patron</span><strong class="omens-god-' + escHtml(String(data.patron || 'none').toLowerCase()) + '">' + escHtml(patron) + '</strong></div>';
      html += '<div><span>Standing</span><strong>' + escHtml(rank) + '</strong></div>';
      html += '<div><span>Charge</span><strong>' + escHtml(divineModifierLabel(data.modifier_pct)) + '</strong></div>';
      html += '<div><span>Ascendant</span><strong class="omens-god-' + escHtml(String(data.leader || 'none').toLowerCase()) + '">' + escHtml(leader) + '</strong></div>';
      html += '</div>';

      html += '<div class="omens-pressure">';
      for (const god of gods) {
        const pct = Math.max(0, Math.min(100, Number(scale[god]) || 0));
        const pressureLabel = divinePressureLabel(god, pct, data.leader);
        html += '<div class="omens-pressure-row omens-god-' + god + '">' +
          '<div class="omens-pressure-label"><span>' + divineGodLabel(god) + '</span><span>' + pressureLabel + '</span></div>' +
          '<div class="omens-pressure-bar"><div style="width:' + pct + '%"></div></div>' +
          '</div>';
      }
      html += '</div>';

      html += '<div class="omens-flags">';
      if (holy && holy.god) {
        html += '<span class="omens-chip omens-god-' + escHtml(String(holy.god).toLowerCase()) + '">Holy Hour: ' +
          escHtml(divineGodLabel(holy.god)) + '</span>';
      }
      if (eclipse && eclipse.active) {
        html += '<span class="omens-chip omens-eclipse">Set Eclipse: ' +
          escHtml(formatDuration(eclipse.seconds_left)) + '</span>';
      }
      if (!holy.god && !(eclipse && eclipse.active)) {
        html += '<span class="omens-muted">No active divine event.</span>';
      }
      html += '</div>';
      html += '</div>';
      bodyEl.innerHTML = html;
    },

    stats(bodyEl, data) {
      if (!data || !data.current) return;
      const cur = data.current;
      const base = data.base || {};
      const statNames = [
        ['STR', 'str', 'realstr'],
        ['INT', 'int', 'realint'],
        ['WIS', 'wis', 'realwis'],
        ['DEX', 'dex', 'realdex'],
        ['CON', 'con', 'realcon'],
        ['CHR', 'chr', 'realchr'],
      ];
      let html = '<table class="stats-table">';
      for (const [label, key, baseKey] of statNames) {
        const c = cur[key] || 0;
        const b = base[baseKey] !== undefined ? base[baseKey] : c;
        let cls = '';
        if (c > b) cls = ' class="stat-up"';
        else if (c < b) cls = ' class="stat-down"';
        html += '<tr><td>' + label + '</td><td' + cls + '>' + c + '</td><td style="color:#484f58">' + b + '</td></tr>';
      }
      html += '</table>';
      bodyEl.innerHTML = html;
    },

    status(bodyEl, data) {
      if (!data) return;
      const displayName = data.fullname || data.name;
      const fields = [
        ['Name', displayName],
        ['Race', data.race],
        ['Class', data.class],
        ['Level', data.level],
        ['XP', typeof data.xp === 'number'
          ? formatInt(data.xp) + (typeof data.nl === 'number' && data.nl > 0
            ? ' (' + formatInt(data.nl) + ' to next)'
            : '')
          : data.xp],
        ['Align', data.align],
        ['Title', formatStatusTitle(data.title, displayName)],
        ['Gender', data.gender],
      ];
      let html = '';
      for (const [k, v] of fields) {
        if (v !== undefined && v !== null && v !== '' && v !== 'None') {
          html += '<div class="status-row"><span class="status-key">' + escHtml(k) + '</span><span>' + escHtml(v) + '</span></div>';
        }
      }
      const badges = [];
      if (data.dead === 'Yes') badges.push('<span class="status-badge badge-dead">Dead</span>');
      if (data.drunk && data.drunk !== 'Sober' && data.drunk !== 'None') badges.push('<span class="status-badge badge-drunk">Drunk</span>');
      if (data.invis === 'Yes') badges.push('<span class="status-badge badge-invis">Invis</span>');
      if (data.sit === 'Yes') badges.push('<span class="status-badge badge-sitting">Sitting</span>');
      if (data.viking === 'Yes') badges.push('<span class="status-badge badge-viking">Viking</span>');
      if (badges.length) html += '<div class="status-badges">' + badges.join('') + '</div>';
      bodyEl.innerHTML = html;
    },

    worth(bodyEl, data) {
      if (!data) return;
      const gold = formatInt(data.gold || 0);
      const bank = formatInt(data.bank || 0);
      bodyEl.innerHTML =
        '<div class="status-row"><span class="status-key">Gold</span><span>' + gold + '</span></div>' +
        '<div class="status-row"><span class="status-key">Bank</span><span>' + bank + '</span></div>';
    },

    xpmon(bodyEl, data) {
      const active = !!(data && data.active);
      const button = (cmd, label, kind) =>
        '<button type="button" class="xpmon-btn xpmon-btn-' + kind + '" data-command="' +
        escHtml(cmd) + '">' + escHtml(label) + '</button>';

      if (!active) {
        bodyEl.innerHTML = '<div class="xpmon-panel xpmon-panel-off">' +
          '<div class="placeholder">XP monitor is off</div>' +
          '<div class="xpmon-actions">' + button('xpmon on', 'On', 'primary') + '</div>' +
          '</div>';
      } else {
        const xp = formatInt(Number(data.xp) || 0);
        const gold = formatInt(Number(data.gold) || 0);
        const elapsedSeconds = Number(data.elapsed_seconds) || 0;
        const xpPerHour = formatInt(Number(data.xp_per_hour) || 0);
        const goldPerHour = formatInt(Number(data.gold_per_hour) || 0);

        bodyEl.innerHTML = '<div class="xpmon-panel">' +
          '<div class="xpmon-total xpmon-xp"><span>' + xp + '</span><small>XP gained</small></div>' +
          '<div class="xpmon-total xpmon-gold"><span>' + gold + '</span><small>Gold gained</small></div>' +
          '<div class="status-row"><span class="status-key">Elapsed</span><span>' +
            escHtml(formatDuration(elapsedSeconds)) + '</span></div>' +
          '<div class="status-row"><span class="status-key">XP/hour</span><span>' +
            escHtml(xpPerHour) + '</span></div>' +
          '<div class="status-row"><span class="status-key">Gold/hour</span><span>' +
            escHtml(goldPerHour) + '</span></div>' +
          '<div class="xpmon-actions">' +
            button('xpmon reset', 'Reset', 'secondary') +
            button('xpmon off', 'Off', 'danger') +
          '</div>' +
          '</div>';
      }

      if (typeof bodyEl.querySelectorAll === 'function') {
        bodyEl.querySelectorAll('.xpmon-btn').forEach((btn) => {
          btn.addEventListener('click', () => command(btn.dataset.command));
        });
      }
    },

    buffs(bodyEl, data) {
      if (!Array.isArray(data) || data.length === 0) {
        bodyEl.innerHTML = '<div class="placeholder">No active buffs</div>';
        return;
      }

      let html = '<div class="buff-list">';
      for (const item of data) {
        const kind = item.kind === 'debuff' ? 'debuff' : (item.kind === 'unknown' ? 'unknown' : 'buff');
        const duration = Number(item.duration) || 0;
        const expiresAt = Number(item.expiresAt) || 0;
        const remaining = duration > 0 && expiresAt > 0
          ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
          : (Number(item.remaining) || 0);
        const pct = duration > 0
          ? Math.max(0, Math.min(100, Math.round((remaining / duration) * 100)))
          : 100;
        const titleParts = [];
        if (item.desc) titleParts.push(item.desc);
        if (duration > 0) titleParts.push(formatDuration(remaining) + ' remaining');
        const desc = titleParts.length ? ' title="' + escHtml(titleParts.join(' - ')) + '"' : '';
        html += '<div class="buff-entry buff-entry-' + kind + '" style="--buff-pct:' + pct + '%"' + desc + '>';
        html += '<span class="buff-entry-fill"></span>';
        html += '<span class="buff-entry-name">' + escHtml(item.name) + '</span>';
        if (duration > 0) {
          html += '<span class="buff-entry-time">' + escHtml(formatDuration(remaining)) + '</span>';
        }
        if (kind === 'debuff') {
          html += '<span class="buff-entry-kind">Debuff</span>';
        }
        html += '</div>';
      }
      html += '</div>';
      bodyEl.innerHTML = html;
    },

    group(bodyEl, data) {
      if (!data || data === '' || (typeof data === 'object' && (!data.members || data.members.length === 0))) {
        bodyEl.innerHTML = '<div class="placeholder">Not in a group</div>';
        return;
      }
      let html = '<div class="group-header">';
      html += '<strong>' + escHtml(data.groupname || 'Group') + '</strong>';
      if (data.leader) html += ' &middot; Leader: ' + escHtml(data.leader);
      if (data.count) html += ' &middot; ' + data.count + ' members';
      html += '</div>';

      if (Array.isArray(data.members)) {
        for (const m of data.members) {
          const info = m.info || {};
          const here = info.here === 'Yes';
          html += '<div class="group-member' + (here ? '' : ' group-member-away') + '">';
          html += '<span class="group-member-name">' + escHtml(m.name) + '</span>';
          html += ' <span style="color:#484f58">Lv' + (info.lvl || '?') + '</span>';
          const hpPct = info.maxhp > 0 ? Math.round((info.hp / info.maxhp) * 100) : 0;
          html += '<div class="group-mini-bar"><div class="group-mini-bar-fill" style="width:' + hpPct + '%;background:' + vitalBarColor(hpPct) + '"></div></div>';
          html += '</div>';
        }
      }
      bodyEl.innerHTML = html;
    },
  };
}
