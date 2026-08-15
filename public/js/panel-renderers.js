import { state } from './state.js';
import {
  createInformationPanelRenderers,
  escHtml,
  formatInt,
  renderVitalBar,
  vitalBarColor,
  heatVitalBarColor,
  guildVitalItemHtml,
  skyRecomputeMoon,
} from './core-information-panel-renderers.mjs';

// Re-exported so existing renderer tests keep importing them from this module.
export { escHtml, renderVitalBar, vitalBarColor, heatVitalBarColor, guildVitalItemHtml, skyRecomputeMoon };
import { gmcp } from './gmcp.js';
import { renderMap } from './map-renderer.js';
import { wireMapPan } from './map-pan.js';
import { browseSource } from './map-data-v2.js';
import { getLiveMapSource } from './live-map-source.js';
import { sendCommandText, sendRawCommand } from './input.js';
import { initSpeedwalk, startSpeedwalk } from './map-speedwalk.js';
import { parseAnsiText, styleToElement } from './ansi.js';
import { sparklinePoints } from './lag-core.mjs';
import {
  imagePreviewActionLabel,
  imagePreviewLabel,
  isImageFileUrl,
  openImagePreviewPane,
} from './image-preview.js';
import { buildCombatView } from './combat-visual-core.mjs';
import {
  NPC_FALLBACK_IMAGE,
  PLAYER_FALLBACK_IMAGE,
  applyNpcImageFallback,
  isNpcEnemy,
} from './image-fallbacks.js';

// Click-to-walk: clicking a mapped room on the LIVE map speedwalks there
// over the active live map source. Steps are verified by the next authoritative
// room GMCP frame for that source. Wired once per panel body;
// renderMap replaces innerHTML each render, so the listener lives on bodyEl
// and resolves the clicked tile at event time. The browse pane (areaMap) is
// read-only and gets no wiring.
function wireSpeedwalk(bodyEl) {
  // initSpeedwalk registers GMCP listeners only on its first call, but always
  // refreshes its callbacks. Rebind the rerender target whenever a map pane is
  // recreated so status/timeout updates never render into a detached body.
  initSpeedwalk({
    send: sendRawCommand,
    rerender: () => renderMap(bodyEl, getLiveMapSource()),
    source: getLiveMapSource,
  });
  if (bodyEl.dataset && bodyEl.dataset.speedwalkWired) return;
  if (bodyEl.dataset) bodyEl.dataset.speedwalkWired = '1';
  bodyEl.addEventListener('click', (ev) => {
    const tile = ev.target && ev.target.closest
      ? ev.target.closest('.map-tile-room[data-room-id]') : null;
    if (!tile) return;
    startSpeedwalk(tile.dataset.roomId, getLiveMapSource());
  });
}
import { fishingManager } from './fishing-manager.js';
import { roomPlaylistManager } from './room-playlist-manager.js';

let roomImageModal = null;
let roomImageModalKeyHandler = null;
const URL_PATTERN = /https?:\/\/[^\s<>"'\x00-\x1f\x7f]+/gi;

function trimLeadingFragments(fragments, charCount) {
  let remaining = Math.max(0, charCount);
  const trimmed = [];
  for (const fragment of fragments) {
    if (!fragment || !fragment.text) continue;
    if (remaining >= fragment.text.length) {
      remaining -= fragment.text.length;
      continue;
    }
    if (remaining > 0) {
      trimmed.push({ ...fragment, text: fragment.text.slice(remaining) });
      remaining = 0;
      continue;
    }
    trimmed.push(fragment);
  }
  return trimmed;
}

function trimTrailingUrlPunctuation(urlText) {
  let end = urlText.length;
  while (end > 0 && /[.,!?;:)\]}>]$/.test(urlText.slice(end - 1, end))) {
    end--;
  }
  return {
    url: urlText.slice(0, end),
    trailing: urlText.slice(end),
  };
}

function appendStyledText(container, text, style) {
  if (!text) return;
  const node = styleToElement(text, style || {});
  if (node) container.appendChild(node);
}

function createChatImagePreviewButton(url) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chat-image-preview-trigger image-preview-trigger';
  button.title = 'Open image preview';
  button.textContent = imagePreviewActionLabel(url);
  button.addEventListener('click', function(event) {
    event.preventDefault();
    event.stopPropagation();
    openImagePreviewPane(url, { title: imagePreviewLabel(url) });
  });
  return button;
}

function normalizeImagePreviewText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRenderedImageLabelOnly(text, renderedImages) {
  if (!renderedImages || !renderedImages.labels.size) return false;
  const value = normalizeImagePreviewText(text);
  return value ? renderedImages.labels.has(value) : false;
}

function appendFragmentWithImagePreviews(container, text, style, href = null, renderedImages = null) {
  if (href && isImageFileUrl(href)) {
    const label = imagePreviewLabel(href);
    if (!renderedImages || (!renderedImages.urls.has(href) && !renderedImages.labels.has(label))) {
      container.appendChild(createChatImagePreviewButton(href));
      if (renderedImages) {
        renderedImages.urls.add(href);
        renderedImages.labels.add(label);
      }
    }
    return;
  }

  const value = String(text || '');
  if (isRenderedImageLabelOnly(value, renderedImages)) return;
  let lastIndex = 0;
  let match;

  URL_PATTERN.lastIndex = 0;
  while ((match = URL_PATTERN.exec(value)) !== null) {
    const matched = match[0];
    const start = match.index;
    const trimmed = trimTrailingUrlPunctuation(matched);

    if (!trimmed.url) continue;
    if (start > lastIndex) {
      appendStyledText(container, value.slice(lastIndex, start), style);
    }

    if (isImageFileUrl(trimmed.url)) {
      const label = imagePreviewLabel(trimmed.url);
      if (!renderedImages || (!renderedImages.urls.has(trimmed.url) && !renderedImages.labels.has(label))) {
        container.appendChild(createChatImagePreviewButton(trimmed.url));
        if (renderedImages) {
          renderedImages.urls.add(trimmed.url);
          renderedImages.labels.add(label);
        }
      }
    } else {
      appendStyledText(container, trimmed.url, style);
    }
    if (trimmed.trailing) {
      appendStyledText(container, trimmed.trailing, style);
    }

    lastIndex = start + matched.length;
  }

  if (lastIndex < value.length) {
    appendStyledText(container, value.slice(lastIndex), style);
  }
}

export function channelColor(channel) {
  let hash = 0;
  for (let i = 0; i < channel.length; i++) hash = ((hash << 5) - hash + channel.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return 'hsl(' + hue + ', 60%, 65%)';
}

function closeRoomImageModal() {
  if (!roomImageModal) return;
  if (roomImageModalKeyHandler) {
    document.removeEventListener('keydown', roomImageModalKeyHandler);
    roomImageModalKeyHandler = null;
  }
  roomImageModal.remove();
  roomImageModal = null;
}

function openRoomImageModal(src, altText) {
  closeRoomImageModal();

  const overlay = document.createElement('div');
  overlay.className = 'dw-modal-overlay room-image-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'dw-modal room-image-modal';

  const header = document.createElement('div');
  header.className = 'dw-modal-header';

  const title = document.createElement('span');
  title.className = 'dw-modal-title';
  title.textContent = altText || 'Room Image';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'dw-modal-close';
  closeBtn.innerHTML = '&#x2715;';
  closeBtn.addEventListener('click', closeRoomImageModal);

  const body = document.createElement('div');
  body.className = 'dw-modal-body room-image-modal-body';

  const img = document.createElement('img');
  img.className = 'room-image-modal-img';
  img.src = src;
  img.alt = altText || 'Room Image';
  img.draggable = false;

  header.appendChild(title);
  header.appendChild(closeBtn);
  body.appendChild(img);
  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);

  overlay.addEventListener('click', function(event) {
    if (event.target === overlay) {
      closeRoomImageModal();
    }
  });

  roomImageModalKeyHandler = function(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeRoomImageModal();
    }
  };
  document.addEventListener('keydown', roomImageModalKeyHandler);

  document.body.appendChild(overlay);
  roomImageModal = overlay;
}

// --- Cyberware detail modal ------------------------------------------------
// Opened by clicking an installed implant in the cyberware panel. Details
// (look description + cyberscan report) arrive via Darkwind.Cyberware.Details;
// item art arrives via Darkwind.Cyberware.Image once generation completes.
let cyberModal = null;
let cyberModalKeyHandler = null;
let cyberModalItemId = null;

function closeCyberwareModal() {
  if (!cyberModal) return;
  if (cyberModalKeyHandler) {
    document.removeEventListener('keydown', cyberModalKeyHandler);
    cyberModalKeyHandler = null;
  }
  cyberModal.remove();
  cyberModal = null;
  cyberModalItemId = null;
}

function openCyberwareModal(item) {
  closeCyberwareModal();
  cyberModalItemId = item.id;

  const overlay = document.createElement('div');
  overlay.className = 'dw-modal-overlay cyber-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'dw-modal cyber-modal';

  const header = document.createElement('div');
  header.className = 'dw-modal-header';

  const title = document.createElement('span');
  title.className = 'dw-modal-title';
  title.textContent = item.name || 'Implant';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'dw-modal-close';
  closeBtn.innerHTML = '&#x2715;';
  closeBtn.addEventListener('click', closeCyberwareModal);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'dw-modal-body cyber-modal-body';

  const imgWrap = document.createElement('div');
  imgWrap.className = 'cyber-modal-image-wrap';
  const img = document.createElement('img');
  img.className = 'cyber-modal-img';
  img.alt = item.name || 'Implant';
  img.draggable = false;
  img.addEventListener('load', () => imgWrap.classList.add('loaded'));
  const imgNote = document.createElement('div');
  imgNote.className = 'cyber-modal-image-note';
  imgNote.textContent = 'Rendering schematic…';
  imgWrap.appendChild(img);
  imgWrap.appendChild(imgNote);

  const desc = document.createElement('div');
  desc.className = 'cyber-modal-desc';
  desc.textContent = 'Querying implant…';

  const scan = document.createElement('pre');
  scan.className = 'cyber-modal-scan';

  body.appendChild(imgWrap);
  body.appendChild(desc);
  body.appendChild(scan);
  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeCyberwareModal();
  });
  cyberModalKeyHandler = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCyberwareModal();
    }
  };
  document.addEventListener('keydown', cyberModalKeyHandler);

  document.body.appendChild(overlay);
  cyberModal = overlay;
}

export function updateCyberwareModalDetails(data) {
  if (!cyberModal || !data || data.id !== cyberModalItemId) return;
  const titleEl = cyberModal.querySelector('.dw-modal-title');
  const desc = cyberModal.querySelector('.cyber-modal-desc');
  const scan = cyberModal.querySelector('.cyber-modal-scan');
  const imgNote = cyberModal.querySelector('.cyber-modal-image-note');

  if (data.error) {
    if (desc) desc.textContent = data.error;
    if (scan) scan.textContent = '';
    if (imgNote) imgNote.textContent = '';
    return;
  }

  if (titleEl && data.name) titleEl.textContent = data.name;
  if (desc) {
    desc.textContent = String(data.description || '').trim()
      || 'No description available.';
  }
  if (scan) scan.textContent = String(data.scan || '').trim();
  if (data.image) {
    updateCyberwareModalImage(data.id, data.image);
  } else if (!data.image_pending && imgNote) {
    imgNote.textContent = 'No schematic available.';
  }
}

export function updateCyberwareModalImage(id, url) {
  if (!cyberModal || !url || id !== cyberModalItemId) return;
  const img = cyberModal.querySelector('.cyber-modal-img');
  const imgNote = cyberModal.querySelector('.cyber-modal-image-note');
  if (!img) return;
  img.src = url;
  if (imgNote) imgNote.textContent = '';
}

const COMBAT_RESULT_LABELS = {
  hit: 'Hit',
  critical: 'Critical',
  miss: 'Miss',
  dodge: 'Dodged',
  absorb: 'Absorbed',
};

const COMBAT_PERSPECTIVE_LABELS = {
  outgoing: {
    hit: 'Your hit',
    critical: 'Your critical hit',
    miss: 'You missed',
    dodge: 'Target dodged',
    absorb: 'Target absorbed',
  },
  incoming: {
    hit: 'Incoming hit',
    critical: 'Incoming critical hit',
    miss: 'Enemy missed',
    dodge: 'You dodged',
    absorb: 'You absorbed it',
  },
  observed: {
    hit: 'Observed hit',
    critical: 'Observed critical hit',
    miss: 'Observed miss',
    dodge: 'Observed dodge',
    absorb: 'Observed absorb',
  },
};

function combatHealthHtml(side, name, health) {
  const safeName = escHtml(name || (side === 'player' ? 'You' : 'Target'));
  if (!health || !health.known) {
    const unknownLabel = health && health.status === 'unavailable'
      ? 'Unavailable'
      : 'Synchronizing';
    return '<div class="combat-health combat-health-unknown" role="progressbar" ' +
      'aria-label="' + safeName + ' health" aria-valuetext="' + unknownLabel + '">' +
      '<div class="combat-health-track"><div class="combat-health-fill"></div></div>' +
      '<div class="combat-health-values"><span>HP</span><span>' + unknownLabel + '</span></div></div>';
  }
  const current = Math.round(health.current);
  const maximum = Math.round(health.max);
  const percent = Math.max(0, Math.min(100, Math.round(health.percent)));
  return '<div class="combat-health combat-health-' + side + '" role="progressbar" ' +
    'aria-label="' + safeName + ' health" aria-valuemin="0" aria-valuemax="' + maximum +
    '" aria-valuenow="' + current + '" aria-valuetext="' + current + ' of ' + maximum + '">' +
    '<div class="combat-health-track"><div class="combat-health-fill" style="width:' + percent + '%"></div>' +
    '<span class="combat-health-percent">' + percent + '%</span></div>' +
    '<div class="combat-health-values"><span>HP</span><span>' +
    formatInt(current) + ' / ' + formatInt(maximum) + '</span></div></div>';
}

function combatArtHtml(side, combatant, loadedImages, failedImages, event, impactSide) {
  const hasGeneratedImage = !!combatant.image;
  const generatedImageFailed = hasGeneratedImage && failedImages.has(combatant.image);
  const usesNpcFallbackImage = combatant.image === NPC_FALLBACK_IMAGE;
  const isNpcFallback = side === 'target' && combatant.isNpc &&
    (!hasGeneratedImage || generatedImageFailed || usesNpcFallbackImage);
  const fallbackImage = side === 'target' && combatant.isNpc
    ? NPC_FALLBACK_IMAGE
    : PLAYER_FALLBACK_IMAGE;
  const image = isNpcFallback ? fallbackImage :
    (hasGeneratedImage ? combatant.image : fallbackImage);
  const loadedClass = loadedImages.has(image) ? ' is-loaded' : '';
  const failedClass = failedImages.has(image) ? ' is-error' : '';
  const classes = 'combat-art combat-art-' + side +
    (isNpcFallback ? ' is-fallback' :
      (hasGeneratedImage ? ' has-image' : ' is-placeholder')) +
    loadedClass + failedClass;
  let html = '<div class="' + classes + '"><img src="' + escHtml(image) +
    '" data-combat-image="' + escHtml(image) + '"' +
    (combatant.isNpc ? ' data-combat-fallback="' + NPC_FALLBACK_IMAGE + '"' : '') +
    ' alt="" draggable="false">';
  if (event && impactSide === side) {
    html += '<div class="combat-impact-badge" aria-hidden="true">' +
      escHtml(COMBAT_RESULT_LABELS[event.result] || event.result) + '</div>';
    if (Object.prototype.hasOwnProperty.call(event, 'damage')) {
      html += '<div class="combat-damage-number combat-damage-' + side +
        '" aria-hidden="true">' + formatInt(event.damage) + '</div>';
    }
  }
  return html + '</div>';
}

function combatEventLabel(event) {
  if (!event) return 'Awaiting the next exchange';
  const perspectiveLabels = COMBAT_PERSPECTIVE_LABELS[event.perspective];
  let label = (perspectiveLabels && perspectiveLabels[event.result])
    || COMBAT_RESULT_LABELS[event.result]
    || 'Exchange';
  if (Object.prototype.hasOwnProperty.call(event, 'damage')) {
    label += ' \u2022 ' + formatInt(event.damage) + ' damage';
  } else if (event.result === 'absorb' && Object.prototype.hasOwnProperty.call(event, 'absorbed')) {
    label += ' \u2022 ' + formatInt(event.absorbed) + ' absorbed';
  }
  return label;
}

function renderCombatVisual(bodyEl, data) {
  const view = buildCombatView(data.model, {
    enemy: data.enemy,
    vitals: data.vitals,
    avatar: data.avatar,
  });
  const event = view.event;
  const loadedImages = bodyEl._combatLoadedImages instanceof Set
    ? bodyEl._combatLoadedImages
    : new Set();
  const failedImages = bodyEl._combatFailedImages instanceof Set
    ? bodyEl._combatFailedImages
    : new Set();
  bodyEl._combatLoadedImages = loadedImages;
  bodyEl._combatFailedImages = failedImages;
  const resultClass = event ? ' combat-result-' + event.result : '';
  const perspectiveClass = event && event.perspective
    ? ' combat-perspective-' + event.perspective.replace(/[^a-z0-9_-]/g, '')
    : '';
  const motionClass = view.reducedMotion ? ' combat-visual-reduced' : '';
  const effectiveClass = view.effective
    ? ' combat-visual-effective'
    : ' combat-visual-syncing';
  // Perspective is the recipient-safe source of truth. Keep the actor IDs for
  // observed combat, but never let an older/mixed server omit the player-side
  // impact treatment from an explicitly incoming event.
  const incomingEvent = !!(event && event.perspective === 'incoming');
  const outgoingEvent = !!(event && event.perspective === 'outgoing');
  const playerImpact = event && (incomingEvent || event.targetId === view.player.id);
  const targetImpact = event && (outgoingEvent || event.targetId === view.target.id);
  const playerActor = event && (outgoingEvent || event.actorId === view.player.id);
  const targetActor = event && (incomingEvent || event.actorId === view.target.id);
  const impactSideClass = playerImpact
    ? ' combat-impact-player'
    : (targetImpact ? ' combat-impact-opponent' : '');
  const impactSide = playerImpact ? 'player' : (targetImpact ? 'target' : '');
  const playerClass = (playerImpact ? ' is-impact-target' : '') +
    (playerActor ? ' is-event-actor' : '');
  const targetClass = (targetImpact ? ' is-impact-target' : '') +
    (targetActor ? ' is-event-actor' : '');
  const eventLabel = combatEventLabel(event);
  let announcement = '';
  let announcementKey = '';
  if (event) {
    announcement = event.summary || eventLabel;
    announcementKey = view.epoch + ':' + view.encounterId + ':event:' + event.seq;
  } else if (view.summary && (!view.active || !view.history.length)) {
    announcement = view.summary;
    announcementKey = view.epoch + ':' + view.encounterId + ':state:' + view.stateSeq;
  }
  if (!announcementKey || bodyEl._combatAnnouncementKey === announcementKey) {
    announcement = '';
  } else {
    bodyEl._combatAnnouncementKey = announcementKey;
  }
  let html = '<div class="combat-visual' + resultClass + perspectiveClass + impactSideClass +
    effectiveClass + motionClass +
    '" role="region" aria-label="Visual combat" data-encounter-id="' + escHtml(view.encounterId) + '">';

  html += '<div class="combat-stage">';
  html += '<article class="combatant-card combatant-player' + playerClass + '">';
  html += '<div class="combatant-name"><span>' + escHtml(view.player.name) + '</span></div>';
  html += combatArtHtml('player', view.player, loadedImages, failedImages, event, impactSide);
  html += combatHealthHtml('player', view.player.name, view.player.health);
  html += '</article>';
  html += '<div class="combat-versus" aria-hidden="true"><span>VS</span></div>';
  html += '<article class="combatant-card combatant-target' + targetClass + '">';
  html += '<div class="combatant-name"><span>' + escHtml(view.target.name) + '</span></div>';
  html += combatArtHtml('target', view.target, loadedImages, failedImages, event, impactSide);
  html += combatHealthHtml('target', view.target.name, view.target.health);
  if (view.target.condition) {
    html += '<div class="combat-target-condition">' + escHtml(view.target.condition) + '</div>';
  }
  html += '</article>';

  html += '</div>';

  html += '<div class="combat-current-event combat-current-' +
    escHtml(event ? event.result : 'waiting') + '"><span class="combat-event-glyph" aria-hidden="true"></span>' +
    '<span class="combat-event-copy"><strong>' + escHtml(eventLabel) + '</strong>';
  if (event && event.summary) {
    html += '<span class="combat-event-summary">' + escHtml(event.summary) + '</span>';
  }
  html += '</span></div>';

  if (view.threats.length || view.hiddenThreatCount) {
    html += '<div class="combat-threats" aria-label="Additional combat threats"><span class="combat-section-label">Threats</span>';
    for (const threat of view.threats) {
      html += '<span class="combat-threat-chip">' + escHtml(threat.name) + '</span>';
    }
    if (view.hiddenThreatCount) {
      html += '<span class="combat-threat-chip combat-threat-more">+' +
        view.hiddenThreatCount + '</span>';
    }
    html += '</div>';
  }

  if (view.history.length) {
    html += '<ol class="combat-event-history" aria-label="Recent combat events">';
    for (const historyEvent of view.history.slice(-5).reverse()) {
      html += '<li class="combat-history-' + escHtml(historyEvent.result) + '"><span>' +
        escHtml(COMBAT_RESULT_LABELS[historyEvent.result] || historyEvent.result) + '</span><span>' +
        escHtml(historyEvent.summary || combatEventLabel(historyEvent)) + '</span></li>';
    }
    if (view.overflow.omitted) {
      html += '<li class="combat-history-overflow"><span>Combined</span><span>+' +
        formatInt(view.overflow.omitted) + ' exchanges</span></li>';
    }
    html += '</ol>';
  }

  if (!view.active && view.outcome) {
    html += '<div class="combat-outcome combat-outcome-' + escHtml(view.outcome) + '">' +
      escHtml(view.summary || view.outcome) + '</div>';
  } else if (!view.effective) {
    html += '<div class="combat-sync-state">' +
      'Visual combat is synchronizing; text fallback remains active</div>';
  }
  html += '<div class="sr-only combat-live-region" role="status" aria-live="polite" aria-atomic="true">' +
    escHtml(announcement) + '</div>';
  html += '</div>';

  bodyEl.innerHTML = html;
  bodyEl._enemyState = null;
  if (typeof bodyEl.querySelectorAll === 'function') {
    for (const img of bodyEl.querySelectorAll('.combat-art img')) {
      const wrap = img.parentElement;
      const imageKey = () => img.getAttribute('data-combat-image') || img.src || '';
      const markLoaded = () => {
        const key = imageKey();
        if (key) {
          loadedImages.add(key);
          failedImages.delete(key);
        }
        if (wrap && wrap.classList) {
          wrap.classList.remove('is-error');
          wrap.classList.add('is-loaded');
        }
      };
      const markFailed = () => {
        const key = imageKey();
        const fallback = img.getAttribute('data-combat-fallback') || '';
        if (fallback && key !== fallback) {
          if (key) failedImages.add(key);
          img.setAttribute('data-combat-image', fallback);
          if (wrap && wrap.classList) wrap.classList.remove('is-error');
          img.src = fallback;
          return;
        }
        if (key) failedImages.add(key);
        if (wrap && wrap.classList) wrap.classList.add('is-error');
      };
      img.addEventListener('load', markLoaded);
      img.addEventListener('error', markFailed);
      if (img.complete && img.naturalWidth > 0) markLoaded();
    }
  }
}

export const panelRenderers = {
  roomPlaylist(bodyEl, data) {
    roomPlaylistManager.attachPanel(bodyEl, data);
  },

  fishing(bodyEl) {
    fishingManager.render(bodyEl);
  },

  roomImage(bodyEl, data) {
    let alt;
    let loadingClass;
    let img;

    if (!data || !data.url) {
      bodyEl.innerHTML = '<div class="room-image-placeholder">Generating room image...</div>';
      return;
    }

    loadingClass = data.loading ? ' room-image-loading' : '';
    alt = data.name ? escHtml(data.name) : 'Room';
    bodyEl.innerHTML =
      '<div class="room-image-wrap">' +
        '<img class="room-image-img' + loadingClass + '" src="' + escHtml(data.url) + '" alt="' + alt + '" draggable="false">' +
      '</div>';

    img = bodyEl.querySelector('.room-image-img');
    if (!img) return;

    img.addEventListener('click', function() {
      openRoomImageModal(data.url, data.name || 'Room');
    });
  },

  room(bodyEl, data) {
    if (!data || !data.name) return;
    let html = '<div class="room-name">' + escHtml(data.name) + '</div>';
    if (data.area) html += '<div class="room-area">' + escHtml(data.area) + '</div>';
    if (data.environment) html += '<div class="room-env">' + escHtml(data.environment) + '</div>';

    const exits = (data.exits && typeof data.exits === 'object') ? data.exits : {};
    const exitStates = (data.exit_states && typeof data.exit_states === 'object') ? data.exit_states : {};
    const compassDirs = ['northwest','north','northeast','west',null,'east','southwest','south','southeast'];
    const dirLabels = { northwest:'NW', north:'N', northeast:'NE', west:'W', east:'E', southwest:'SW', south:'S', southeast:'SE', up:'U', down:'D' };

    html += '<div class="exit-compass">';
    for (const dir of compassDirs) {
      if (dir === null) {
        html += '<div class="exit-rose-center" aria-hidden="true">' +
          '<span class="exit-rose-ring"></span>' +
          '<span class="exit-rose-needle exit-rose-needle-ns"></span>' +
          '<span class="exit-rose-needle exit-rose-needle-ew"></span>' +
          '<span class="exit-rose-dot"></span>' +
          '</div>';
      } else if (exitStates[dir]) {
        html += '<div class="exit-btn inactive" title="' + escHtml(dir + ': ' + exitStates[dir]) + '">' + dirLabels[dir] + '</div>';
      } else if (exits[dir] !== undefined) {
        html += '<button class="exit-btn exit-dir-' + dir + '" data-dir="' + dir + '" title="' + escHtml(dir) + '">' + dirLabels[dir] + '</button>';
      } else {
        html += '<div class="exit-btn inactive"></div>';
      }
    }
    html += '</div>';

    if (exits.up !== undefined || exits.down !== undefined) {
      html += '<div class="exit-ud">';
      html += exitStates.up
        ? '<div class="exit-btn inactive" title="' + escHtml('up: ' + exitStates.up) + '">U</div>'
        : exits.up !== undefined
        ? '<button class="exit-btn" data-dir="up">U</button>'
        : '<div class="exit-btn inactive"></div>';
      html += exitStates.down
        ? '<div class="exit-btn inactive" title="' + escHtml('down: ' + exitStates.down) + '">D</div>'
        : exits.down !== undefined
        ? '<button class="exit-btn" data-dir="down">D</button>'
        : '<div class="exit-btn inactive"></div>';
      html += '</div>';
    }

    if (Array.isArray(data.players) && data.players.length) {
      html += '<div class="room-players">Players: ';
      html += data.players.map(p => '<span>' + escHtml(p.fullname || p.name) + '</span>').join(', ');
      html += '</div>';
    }

    bodyEl.innerHTML = html;

    bodyEl.querySelectorAll('.exit-btn[data-dir]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
        sendCommandText(btn.dataset.dir);
      });
    });
  },


  enemy(bodyEl, data) {
    if (data && data.combatVisual && data.model) {
      renderCombatVisual(bodyEl, data);
      return;
    }

    if (!data || !data.enemy_name || data.enemy_name === 'None' || data.enemy_name === '') {
      bodyEl.innerHTML = '<div class="panel-inactive placeholder">No target</div>';
      bodyEl._enemyState = null;
      return;
    }

    const prev = bodyEl._enemyState || {};
    const sameEnemy = prev.name === data.enemy_name;
    const sameImage = prev.image === (data.enemy_image || '');
    const npcEnemy = isNpcEnemy(data);
    const sameNpcType = prev.isNpc === npcEnemy;

    // Fast path: same enemy + same image — just update bars in place
    if (sameEnemy && sameImage && sameNpcType) {
      renderVitalBar(bodyEl, 'HP', data.enemy_curhp, data.enemy_maxhp || 100);
      if (data.enemy_maxsp > 0) {
        renderVitalBar(bodyEl, 'SP', data.enemy_cursp, data.enemy_maxsp);
      }
      const hpStr = bodyEl.querySelector('.enemy-hp-string');
      if (hpStr && data.enemy_hp_string && data.enemy_hp_string !== 'None') {
        hpStr.textContent = data.enemy_hp_string;
      }
      return;
    }

    // Full rebuild
    bodyEl.innerHTML = '';
    bodyEl._enemyState = {
      name: data.enemy_name,
      image: data.enemy_image || '',
      isNpc: npcEnemy,
    };

    const row = document.createElement('div');
    row.className = 'enemy-row';

    // Left: image
    if (data.enemy_image || npcEnemy) {
      const imgWrap = document.createElement('div');
      imgWrap.className = 'enemy-image';
      const img = document.createElement('img');
      img.src = data.enemy_image || NPC_FALLBACK_IMAGE;
      img.alt = data.enemy_name;
      img.draggable = false;
      img.addEventListener('load', () => imgWrap.classList.add('enemy-image-loaded'));
      img.addEventListener('error', () => {
        if (npcEnemy && applyNpcImageFallback(img)) {
          imgWrap.classList.remove('enemy-image-error');
          return;
        }
        imgWrap.classList.add('enemy-image-error');
      });
      imgWrap.appendChild(img);
      row.appendChild(imgWrap);
    }

    // Right: name, hp string, vitals
    const info = document.createElement('div');
    info.className = 'enemy-info';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'enemy-name';
    nameDiv.textContent = data.enemy_name;
    info.appendChild(nameDiv);

    if (data.enemy_hp_string && data.enemy_hp_string !== 'None') {
      const hpStr = document.createElement('div');
      hpStr.className = 'enemy-hp-string';
      hpStr.textContent = data.enemy_hp_string;
      info.appendChild(hpStr);
    }

    renderVitalBar(info, 'HP', data.enemy_curhp, data.enemy_maxhp || 100);
    if (data.enemy_maxsp > 0) {
      renderVitalBar(info, 'SP', data.enemy_cursp, data.enemy_maxsp);
    }

    row.appendChild(info);
    bodyEl.appendChild(row);
  },

  chat(bodyEl, data) {
    const messages = Array.isArray(data)
      ? data
      : (data && Array.isArray(data.messages) ? data.messages : []);
    const channels = data && !Array.isArray(data) && Array.isArray(data.channels) ? data.channels : [];
    const players = data && !Array.isArray(data) && Array.isArray(data.players) ? data.players : [];
    const activeChannels = data && !Array.isArray(data) && Array.isArray(data.activeChannels)
      ? data.activeChannels
      : [];

    if (!data || (messages.length === 0 && channels.length === 0 && players.length === 0 && activeChannels.length === 0)) {
      bodyEl.innerHTML = '<div class="placeholder">No messages</div>';
      return;
    }

    const placeholder = bodyEl.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    let meta = bodyEl.querySelector('.chat-meta');
    if (channels.length || players.length || activeChannels.length) {
      if (!meta) {
        meta = document.createElement('div');
        meta.className = 'chat-meta';
        bodyEl.insertBefore(meta, bodyEl.firstChild);
      }
      const channelChips = channels.slice(0, 12).map((channel) => {
        const name = channel.caption || channel.name || channel.command || '';
        if (!name) return '';
        return '<span class="chat-chip">' + escHtml(name) + '</span>';
      }).filter(Boolean).join('');
      const activeChips = activeChannels.map((channel) =>
        '<span class="chat-chip chat-chip-active">' + escHtml(channel) + '</span>'
      ).join('');
      const playerCount = players.length
        ? '<span class="chat-chip">' + players.length + ' online</span>'
        : '';
      meta.innerHTML = channelChips + activeChips + playerCount;
    } else if (meta) {
      meta.remove();
    }

    let log = bodyEl.querySelector('.chat-log');
    const wasAtBottom = log ? (log.scrollHeight - log.scrollTop - log.clientHeight) < 5 : true;

    if (!log) {
      log = document.createElement('div');
      log.className = 'chat-log';
      if (!meta) bodyEl.innerHTML = '';
      bodyEl.appendChild(log);
    }

    if (messages.length >= 200 && log.childNodes.length >= messages.length) {
      log.innerHTML = '';
    }

    const existing = log.childNodes.length;
    const toRender = messages.slice(existing);

    for (const msg of toRender) {
      const entry = document.createElement('div');
      entry.className = 'chat-entry';
      const ch = channelColor(msg.channel || '');
      const talker = msg.talker ? msg.talker.charAt(0).toUpperCase() + msg.talker.slice(1) : '';
      // Strip redundant prefix from text — the panel already shows channel and talker
      let fragments = parseAnsiText(msg.text || '');
      let text = fragments.map((fragment) => fragment.text).join('');
      // Patterns: "[Channel] Name: text", "[Channel] (Role) Name: text", "Name shouts: text"
      const talkerEsc = (msg.talker || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (talkerEsc) {
        // Strip everything up to and including "TalkerName: " or "TalkerName shouts: "
        const re = new RegExp('^(\\[\\S+\\]\\s+)?(\\(\\w+\\)\\s+)?' + talkerEsc + '(\\s+\\w+)?:\\s*', 'i');
        const match = text.match(re);
        if (match) {
          fragments = trimLeadingFragments(fragments, match[0].length);
          text = text.slice(match[0].length);
        }
      }
      const channelEl = document.createElement('span');
      channelEl.className = 'chat-channel';
      channelEl.style.color = ch;
      channelEl.textContent = '[' + (msg.channel || '') + ']';
      entry.appendChild(channelEl);
      entry.appendChild(document.createTextNode(' '));

      const talkerEl = document.createElement('span');
      talkerEl.className = 'chat-talker';
      talkerEl.textContent = talker + ':';
      entry.appendChild(talkerEl);
      entry.appendChild(document.createTextNode(' '));

      const renderedImages = {
        urls: new Set(),
        labels: new Set(),
      };
      for (let i = 0; i < fragments.length; i++) {
        const fragment = fragments[i];
        if (fragment.href && isImageFileUrl(fragment.href)) {
          while (i + 1 < fragments.length && fragments[i + 1].href === fragment.href) i++;
          appendFragmentWithImagePreviews(entry, fragment.text, fragment.style || {}, fragment.href, renderedImages);
          continue;
        }
        appendFragmentWithImagePreviews(entry, fragment.text, fragment.style || {}, fragment.href, renderedImages);
      }
      log.appendChild(entry);
    }

    while (log.childNodes.length > messages.length) log.removeChild(log.lastChild);
    while (log.childNodes.length > 200) log.removeChild(log.firstChild);

    if (wasAtBottom) log.scrollTop = log.scrollHeight;
  },

  map(bodyEl, _data) {
    renderMap(bodyEl, getLiveMapSource());
    wireSpeedwalk(bodyEl);
    wireMapPan(bodyEl, {
      rerender: () => renderMap(bodyEl, getLiveMapSource()),
    });
  },

  areaMap(bodyEl, _data) {
    renderMap(bodyEl, browseSource);
  },

  connection(bodyEl, data) {
    if (!data || !data.diagnosis) {
      bodyEl.innerHTML = '<div class="placeholder">Collecting connection samples...</div>';
      return;
    }

    const d = data.diagnosis;
    const inputs = data.inputs || {};
    const mud = inputs.mud;
    const http = inputs.http;
    const server = inputs.server;
    const local = inputs.local;

    const axisRow = (label, axis, stat) => {
      const reason = axis.reasons && axis.reasons.length ? axis.reasons[0] : '';
      return '<div class="lag-axis">'
        + '<span class="lag-dot lag-dot-' + escHtml(axis.status) + '"></span>'
        + '<span class="lag-axis-name">' + escHtml(label) + '</span>'
        + '<span class="lag-axis-stat">' + escHtml(stat) + '</span>'
        + (reason ? '<div class="lag-axis-reason">' + escHtml(reason) + '</div>' : '')
        + '</div>';
    };

    const networkStat = mud
      ? mud.median + 'ms game / ' + (http ? http.median + 'ms web' : '-- web')
        + (mud.lossPct ? ' / ' + mud.lossPct + '% loss' : '')
      : 'collecting...';
    const serverStat = server && (server.window_s || 0) > 0
      ? 'drift ' + server.hb_drift_avg_ms + 'ms avg, ' + server.hb_drift_max_ms + 'ms max'
      : (inputs.serverSupported ? 'collecting...' : 'not reported');
    const localStat = local
      ? 'tab drift ' + local.driftP90 + 'ms'
        + ((inputs.reconnectsRecent || 0) ? ' / ' + inputs.reconnectsRecent + ' reconnect(s)' : '')
      : 'collecting...';

    let html = '<div class="lag-panel">';
    html += '<div class="lag-verdict lag-verdict-' + escHtml(d.verdict) + '">' + escHtml(d.headline) + '</div>';
    html += axisRow('Network', d.network, networkStat);
    html += axisRow('Game server', d.server, serverStat);
    html += axisRow('Your device', d.local, localStat);

    // Dual sparkline: game RTT (accent) vs web RTT (muted), last 60s.
    const t = data.t || 0;
    const W = 280;
    const H = 46;
    const mudLine = sparklinePoints(data.mudSamples || [], t, { width: W, height: H });
    const httpLine = sparklinePoints(data.httpSamples || [], t,
      { width: W, height: H, floorMax: mudLine.maxRtt });
    const poly = (line, cls) => line.segments
      .filter((seg) => seg.length > 1)
      .map((seg) => '<polyline class="' + cls + '" points="'
        + seg.map((p) => p.x + ',' + p.y).join(' ') + '"/>')
      .join('');
    html += '<div class="lag-spark-wrap">'
      + '<svg class="lag-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">'
      + poly(httpLine, 'lag-spark-http') + poly(mudLine, 'lag-spark-mud')
      + '</svg>'
      + '<div class="lag-spark-legend">'
      + '<span><i class="lag-leg-mud"></i>game</span>'
      + '<span><i class="lag-leg-http"></i>web</span>'
      + '<span class="lag-spark-max">max ' + Math.round(mudLine.maxRtt) + 'ms</span>'
      + '</div></div>';

    // Full check controls + result.
    const fc = data.fullCheck;
    html += '<div class="lag-check-row">';
    html += '<button type="button" class="lag-check-btn"' + (fc && fc.running ? ' disabled' : '') + '>'
      + (fc && fc.running ? 'Checking...' : 'Run full check') + '</button>';
    if (fc && !fc.running) {
      if (fc.internetRtt !== null) {
        html += '<span class="lag-check-result">internet ' + fc.internetRtt + 'ms</span>';
      } else if (fc.internetError) {
        html += '<span class="lag-check-result lag-check-warn">internet check failed</span>';
      }
    }
    html += '</div>';
    html += '</div>';

    bodyEl.innerHTML = html;
    const checkBtn = bodyEl.querySelector('.lag-check-btn');
    if (checkBtn) {
      checkBtn.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('dw:lag-run-check'));
      });
    }
  },
};

// The legacy manager retains its existing table, but character information
// panels render through the same DOM-only functions mounted by Phase 2.
Object.assign(panelRenderers, createInformationPanelRenderers({
  sendCommand: sendCommandText,
  openImageDialog: openRoomImageModal,
  requestCyberwareDetails: (item) => {
    openCyberwareModal(item);
    gmcp.send('Darkwind.Cyberware.Details', { id: item.id });
  },
}));
