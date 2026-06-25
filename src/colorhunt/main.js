import { CameraManager } from './camera.js';
import { Game } from './game.js';
import { rgbToCss, hslToRgb, colorName } from './color.js';

const $ = (id) => document.getElementById(id);

// ---- DOM ----
const els = {
  hud:               $('hud'),
  shutter:           $('shutter'),
  liveChip:          $('live-chip'),
  targetSwatch:      $('target-swatch'),
  targetName:        $('target-name'),
  hudTimer:          $('hud-timer'),
  hudRound:          $('hud-round'),
  hudTotal:          $('hud-total'),
  timerBarWrap:      $('timer-bar-wrap'),
  timerBar:          $('timer-bar'),
  playersBar:        $('players-bar'),
  // Aperçu 5 couleurs
  colorPreviewOverlay: $('color-preview-overlay'),
  previewSwatches:     $('preview-swatches'),
  previewSecs:         $('preview-secs'),
  // Color reveal
  colorRevealOverlay: $('color-reveal-overlay'),
  revealSwatch:       $('reveal-swatch'),
  revealColorName:    $('reveal-color-name'),
  revealCountdown:    $('reveal-countdown'),
  // Overlays
  startOverlay:        $('start-overlay'),
  mpWaitOverlay:       $('mp-wait-overlay'),
  mpWaitMsg:           $('mp-wait-msg'),
  mpScoreWaitOverlay:  $('mp-score-wait-overlay'),
  mpScorePhoto:        $('mp-score-photo'),
  mpScoreWaitMsg:      $('mp-score-wait-msg'),
  scoreRevealOverlay:  $('score-reveal-overlay'),
  revealList:          $('reveal-list'),
  revealContinueBtn:   $('reveal-continue-btn'),
  // Solo
  resultOverlay: $('result-overlay'),
  resultPhoto:   $('result-photo'),
  resTarget:     $('res-target'),
  resCaptured:   $('res-captured'),
  resRating:     $('res-rating'),
  resPoints:     $('res-points'),
  resDe:         $('res-de'),
  nextBtn:       $('next-btn'),
  endOverlay:    $('end-overlay'),
  endScore:      $('end-score'),
  endDetail:     $('end-detail'),
  replayBtn:     $('replay-btn'),
  errorOverlay:  $('error-overlay'),
  errorMsg:      $('error-msg'),
  retryBtn:      $('retry-btn'),
};

const camera = new CameraManager($('cam'));
const game   = new Game(5);

const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ---- URL params ----
const urlParams  = new URLSearchParams(window.location.search);
const mpRoomCode = urlParams.get('room');
const mpPlayerId = urlParams.get('pid') || (() => {
  try { return localStorage.getItem('emarcade-pid'); } catch { return null; }
})();
const isMP = !!(mpRoomCode && mpPlayerId);

// ---- Live sampling (RAF) ----
let rafId = null;

function liveLoop() {
  if (game.phase === 'aiming') {
    const rgb = camera.sampleCenter();
    if (rgb) els.liveChip.style.background = rgbToCss(rgb);
  }
  rafId = requestAnimationFrame(liveLoop);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && rafId) { cancelAnimationFrame(rafId); rafId = null; }
  else if (!document.hidden && !rafId && game.phase === 'aiming') liveLoop();
});

// ---- Timer ----
const ROUND_TIME   = 30;
let timerLeft      = ROUND_TIME;
let timerInterval  = null;
let roundStartedAt = null;

function startTimer(onExpire) {
  timerLeft = ROUND_TIME;
  roundStartedAt = Date.now();
  els.timerBar.style.transition = 'none';
  els.timerBar.style.width = '100%';
  els.timerBar.style.background = '#4ade80';
  els.hudTimer.textContent = ROUND_TIME;
  show(els.timerBarWrap);
  void els.timerBar.offsetWidth;
  els.timerBar.style.transition = 'width 1s linear, background 0.5s ease';

  timerInterval = setInterval(() => {
    timerLeft = Math.max(0, timerLeft - 1);
    const frac = timerLeft / ROUND_TIME;
    els.timerBar.style.width = (frac * 100) + '%';
    els.hudTimer.textContent = timerLeft;
    if (timerLeft <= 10) els.timerBar.style.background = '#f87171';
    if (timerLeft <= 0) { stopTimer(); onExpire(); }
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  hide(els.timerBarWrap);
}

function elapsedSeconds() {
  if (!roundStartedAt) return ROUND_TIME;
  return Math.min(ROUND_TIME, (Date.now() - roundStartedAt) / 1000);
}

// =========================================================
// SOLO
// =========================================================

async function soloStartGame() {
  try {
    await camera.start();
  } catch (e) {
    els.errorMsg.textContent = e?.name === 'NotAllowedError'
      ? 'Accès à la caméra refusé.'
      : "Impossible d'accéder à la caméra.";
    hide(els.startOverlay);
    show(els.errorOverlay);
    return;
  }
  hide(els.startOverlay);
  hide(els.errorOverlay);
  game.reset();
  els.hudTotal.textContent = String(game.totalRounds);
  show(els.hud);
  show(els.shutter);
  soloBeginRound();
  if (!rafId) liveLoop();
}

function soloBeginRound() {
  const target = game.nextRound();
  els.targetSwatch.style.background = rgbToCss(target.rgb);
  els.targetName.textContent = target.name;
  els.hudRound.textContent = String(game.round);
  els.hudTimer.textContent = String(game.totalScore);
  els.shutter.disabled = false;
  hide(els.resultOverlay);
}

function soloCapture() {
  if (game.phase !== 'aiming') return;
  const rgb = camera.sampleCenter();
  if (!rgb) return;
  els.shutter.disabled = true;
  const result = game.evaluate(rgb);
  camera.capturePhoto(els.resultPhoto);
  els.resTarget.style.background   = rgbToCss(result.target);
  els.resCaptured.style.background = rgbToCss(result.captured);
  els.resRating.textContent        = result.rating;
  els.resPoints.textContent        = `+${result.points} pts`;
  els.resDe.textContent            = `ΔE = ${result.deltaE.toFixed(1)}`;
  els.nextBtn.textContent = game.isLastRound ? 'Voir le score' : 'Manche suivante';
  show(els.resultOverlay);
}

function soloNextRound() {
  hide(els.resultOverlay);
  if (game.phase === 'ended') {
    const max = game.totalRounds * 100;
    els.endScore.textContent  = `${game.totalScore} / ${max}`;
    els.endDetail.textContent = `Précision moyenne : ${game.averageAccuracy} / 100`;
    show(els.endOverlay);
  } else {
    soloBeginRound();
  }
}

if (!isMP) {
  els.startBtn.addEventListener('click', soloStartGame);
  els.retryBtn.addEventListener('click', soloStartGame);
  els.nextBtn.addEventListener('click', soloNextRound);
  els.replayBtn.addEventListener('click', () => {
    hide(els.endOverlay);
    game.reset();
    els.hudTimer.textContent = '0';
    soloBeginRound();
  });
  els.shutter.addEventListener('click', soloCapture);
}

// =========================================================
// MULTI
// =========================================================

let mpWs            = null;
let mpCameraReady   = false;
let mpTargets       = [];
let mpInternalRound = 0;
let mpInternalScores = [];
let mpPlayers       = [];
let mpDoneThisRound = new Set();
let mpCaptured      = false;

function mpSend(payload) {
  if (mpWs && mpWs.readyState === WebSocket.OPEN) mpWs.send(JSON.stringify(payload));
}

// -- Barre joueurs --

function mpBuildPlayersBar(players) {
  els.playersBar.innerHTML = '';
  players.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'player-chip';
    const initial = (p.name || '?').charAt(0).toUpperCase();
    chip.innerHTML = `
      <div class="player-avatar">${initial}</div>
      <div class="player-pname">${escapeHtml(p.name.substring(0, 6))}</div>
      <div class="player-dot" data-dot="${p.id}"></div>
    `;
    els.playersBar.appendChild(chip);
  });
  show(els.playersBar);
}

function mpSetPlayerDone(pid) {
  const dot = els.playersBar.querySelector(`[data-dot="${pid}"]`);
  if (dot) dot.classList.add('done');
}

function mpResetDots() {
  els.playersBar.querySelectorAll('.player-dot').forEach(d => d.classList.remove('done'));
}

// -- Aperçu des 5 couleurs avant le début --

function mpShowColorPreview(targets, onDone) {
  els.previewSwatches.innerHTML = '';
  targets.forEach((t, i) => {
    const rgb   = hslToRgb(t.hue, t.sat, t.light);
    const cname = colorName(t.hue, t.sat, t.light);
    const chip  = document.createElement('div');
    chip.className = 'preview-chip';
    chip.innerHTML = `
      <div class="pc-swatch" style="background:rgb(${rgb[0]},${rgb[1]},${rgb[2]})"></div>
      <div class="pc-num">M${i + 1}</div>
      <div class="pc-name">${escapeHtml(cname)}</div>
    `;
    els.previewSwatches.appendChild(chip);
  });
  show(els.colorPreviewOverlay);

  let secs = 5;
  els.previewSecs.textContent = secs;
  const iv = setInterval(() => {
    secs--;
    els.previewSecs.textContent = secs;
    if (secs <= 0) {
      clearInterval(iv);
      hide(els.colorPreviewOverlay);
      onDone();
    }
  }, 1000);
}

// -- Reveal + countdown --

function mpRunCountdown(steps, msEach, onDone) {
  let i = 0;
  const next = () => {
    if (i >= steps.length) { onDone(); return; }
    const span = document.createElement('span');
    span.className = 'pop-anim';
    span.textContent = steps[i++];
    els.revealCountdown.innerHTML = '';
    els.revealCountdown.appendChild(span);
    setTimeout(next, msEach);
  };
  next();
}

function mpShowColorReveal(t, onDone) {
  const rgb   = hslToRgb(t.hue, t.sat, t.light);
  const cname = colorName(t.hue, t.sat, t.light);

  els.colorRevealOverlay.style.background = `hsl(${t.hue}, ${t.sat * 100}%, ${t.light * 100}%)`;
  els.revealSwatch.style.background = rgbToCss(rgb);
  els.revealColorName.textContent   = cname;
  els.revealCountdown.innerHTML     = '';
  show(els.colorRevealOverlay);

  setTimeout(() => {
    mpRunCountdown(['3', '2', '1', 'GO !'], 800, () => {
      hide(els.colorRevealOverlay);
      onDone(rgb, cname);
    });
  }, 1500);
}

// -- Round logic --

async function mpEnsureCamera() {
  if (mpCameraReady) return true;
  try {
    await camera.start();
    mpCameraReady = true;
    return true;
  } catch (e) {
    els.errorMsg.textContent = e?.name === 'NotAllowedError'
      ? 'Accès à la caméra refusé.'
      : "Impossible d'accéder à la caméra.";
    hide(els.mpWaitOverlay);
    show(els.errorOverlay);
    return false;
  }
}

async function mpStartInternalRound(idx) {
  mpCaptured = false;
  mpDoneThisRound = new Set();
  mpResetDots();
  hide(els.mpScoreWaitOverlay);

  const t = mpTargets[idx];
  mpShowColorReveal(t, async (rgb, cname) => {
    if (!await mpEnsureCamera()) return;

    game.target = { rgb, name: cname };
    game.phase  = 'aiming';
    game.round  = idx + 1;

    els.targetSwatch.style.background = rgbToCss(rgb);
    els.targetName.textContent = cname;
    els.hudRound.textContent = String(idx + 1);
    els.hudTotal.textContent = String(mpTargets.length);

    show(els.hud);
    show(els.shutter);
    els.shutter.disabled = false;

    if (!rafId) liveLoop();
    startTimer(() => mpDoCapture());
  });
}

function mpDoCapture() {
  if (mpCaptured) return;
  mpCaptured = true;

  const elapsed = elapsedSeconds();
  stopTimer();
  hide(els.shutter);
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

  const rgb    = camera.sampleCenter() || [128, 128, 128];
  const result = game.evaluate(rgb, elapsed);
  mpInternalScores.push(result.points);

  // Photo dans l'overlay d'attente
  camera.capturePhoto(els.mpScorePhoto);
  els.mpScoreWaitMsg.textContent = `En attente des autres… (1/${mpPlayers.length})`;
  show(els.mpScoreWaitOverlay);

  // Me marquer done
  mpSetPlayerDone(mpPlayerId);
  mpDoneThisRound.add(mpPlayerId);

  // Relay avec numéro de round pour éviter les chevauchements
  mpSend({ type: 'relay', data: { type: 'ch-done', round: mpInternalRound } });

  mpCheckAllDone();
}

function mpCheckAllDone() {
  els.mpScoreWaitMsg.textContent = `En attente des autres… (${mpDoneThisRound.size}/${mpPlayers.length})`;
  if (mpDoneThisRound.size < mpPlayers.length) return;

  mpDoneThisRound = new Set(); // évite double-déclenchement

  setTimeout(() => {
    hide(els.mpScoreWaitOverlay);
    const next = mpInternalRound + 1;
    mpInternalRound = next;

    if (next >= mpTargets.length) {
      // Tous les rounds internes finis → envoyer score au serveur
      const total = mpInternalScores.reduce((a, b) => a + b, 0);
      mpSend({ type: 'game-score', score: total });
      els.mpWaitMsg.textContent = 'Calcul des résultats…';
      show(els.mpWaitOverlay);
    } else {
      mpStartInternalRound(next);
    }
  }, 600);
}

// -- Reveal progressif des scores --

const MEDALS = ['🥇', '🥈', '🥉'];

function mpShowScoreReveal(msg) {
  hide(els.mpWaitOverlay);
  hide(els.mpScoreWaitOverlay);
  hide(els.playersBar);
  hide(els.hud);

  const scores  = msg.roundScores || {};
  const players = mpPlayers.length ? mpPlayers : (msg.players || []);

  // Tri croissant : pire d'abord (révélé en 1er), meilleur en dernier (le winner)
  const sorted = [...players].sort((a, b) => (scores[a.id] ?? 0) - (scores[b.id] ?? 0));
  const total  = sorted.length;

  els.revealList.innerHTML = '';
  sorted.forEach((p, idxFromWorst) => {
    const rankFromBest = total - 1 - idxFromWorst;
    const entry = document.createElement('div');
    entry.className = 'rp-entry' + (rankFromBest === 0 ? ' winner' : '');
    entry.innerHTML = `
      <span class="rp-rank">${MEDALS[rankFromBest] ?? (rankFromBest + 1) + '.'}</span>
      <span class="rp-name">${escapeHtml(p.name)}${p.id === mpPlayerId ? ' (toi)' : ''}</span>
      <span class="rp-score">${scores[p.id] ?? 0} pts</span>
    `;
    els.revealList.appendChild(entry);
  });

  hide(els.revealContinueBtn);
  show(els.scoreRevealOverlay);

  // Apparition progressive : pire en haut → winner en bas, 1 par 1
  const entries = els.revealList.querySelectorAll('.rp-entry');
  entries.forEach((entry, i) => {
    setTimeout(() => {
      entry.classList.add('visible');
      if (i === entries.length - 1) {
        setTimeout(() => show(els.revealContinueBtn), 900);
      }
    }, 1000 + i * 1200);
  });

  els.revealContinueBtn.textContent = msg.hasMore ? 'Manche suivante →' : 'Retour au lobby →';
}

els.revealContinueBtn.addEventListener('click', () => {
  window.location.href = `/?room=${encodeURIComponent(mpRoomCode)}&pid=${encodeURIComponent(mpPlayerId)}`;
});

// -- Messages WS --

function mpHandleMsg(msg) {
  switch (msg.type) {
    case 'game-connected':
    case 'color-waiting':
      els.mpWaitMsg.textContent = `${msg.connectedCount ?? '?'} / ${msg.total ?? '?'} joueurs connectés…`;
      break;

    case 'player-reconnected':
      els.mpWaitMsg.textContent = `${msg.connectedCount} / … connectés…`;
      break;

    case 'color-targets':
      mpTargets = msg.targets;
      mpPlayers = msg.players || [];
      mpInternalRound  = 0;
      mpInternalScores = [];
      mpBuildPlayersBar(mpPlayers);
      hide(els.mpWaitOverlay);
      // Aperçu des 5 couleurs pendant 5s, puis on commence
      mpShowColorPreview(mpTargets, () => mpStartInternalRound(0));
      break;

    case 'relay':
      if (msg.data && msg.data.type === 'ch-done' && msg.data.round === mpInternalRound) {
        mpSetPlayerDone(msg.from);
        mpDoneThisRound.add(msg.from);
        mpCheckAllDone();
      }
      break;

    case 'score-waiting':
      if (!els.mpWaitOverlay.classList.contains('hidden')) {
        els.mpWaitMsg.textContent = `Calcul… ${msg.submitted}/${msg.total} scores reçus`;
      }
      break;

    case 'round-complete':
      mpShowScoreReveal(msg);
      break;
  }
}

// -- Connexion WS --

function mpConnect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  mpWs = new WebSocket(`${proto}://${location.host}/ws`);
  mpWs.addEventListener('open', () => {
    mpWs.send(JSON.stringify({ type: 'game-connect', code: mpRoomCode, playerId: mpPlayerId }));
  });
  mpWs.addEventListener('message', e => {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    mpHandleMsg(msg);
  });
  mpWs.addEventListener('error', () => {
    els.mpWaitMsg.textContent = 'Erreur de connexion au serveur.';
  });
}

// ---- Init ----

if (isMP) {
  hide(els.startOverlay);
  show(els.mpWaitOverlay);
  els.mpWaitMsg.textContent = 'Connexion en cours…';

  // SHUTTER : capture en mode MP
  els.shutter.addEventListener('click', mpDoCapture);

  els.retryBtn.addEventListener('click', () => {
    hide(els.errorOverlay);
    show(els.mpWaitOverlay);
    mpConnect();
  });

  mpConnect();
}
