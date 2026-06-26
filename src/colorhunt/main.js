import { CameraManager } from './camera.js';
import { Game } from './game.js';
import { rgbToCss, hexToRgb } from './color.js';

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
  // Indicateur photo prise
  mpCapturedBar:  $('mp-captured-bar'),
  mpCapturedMsg:  $('mp-captured-msg'),
  // Règles + prêt
  mpRulesOverlay: $('mp-rules-overlay'),
  mpReadyBtn:     $('mp-ready-btn'),
  mpReadyList:    $('mp-ready-list'),
  // Score inter-manche
  mpRoundScoreOverlay: $('mp-round-score-overlay'),
  mrsList:             $('mrs-list'),
  mrsRound:            $('mrs-round'),
  mrsCountdown:        $('mrs-countdown'),
  // Color reveal
  colorRevealOverlay: $('color-reveal-overlay'),
  revealSwatch:       $('reveal-swatch'),
  revealColorName:    $('reveal-color-name'),
  revealCountdown:    $('reveal-countdown'),
  // Overlays
  mpWaitOverlay:       $('mp-wait-overlay'),
  mpWaitMsg:           $('mp-wait-msg'),
  scoreRevealOverlay:  $('score-reveal-overlay'),
  revealTitle:         $('reveal-title'),
  revealList:          $('reveal-list'),
  revealGlobal:        $('reveal-global'),
  revealGlobalList:    $('reveal-global-list'),
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
    hide(els.mpRulesOverlay);
    show(els.errorOverlay);
    return;
  }
  hide(els.mpRulesOverlay);
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
  // Afficher directement les règles + bouton prêt (pas d'écran intermédiaire)
  hide(els.mpReadyList);
  show(els.mpRulesOverlay);

  els.mpReadyBtn.addEventListener('click', soloStartGame);

  els.retryBtn.addEventListener('click', () => {
    hide(els.errorOverlay);
    els.mpReadyBtn.disabled = false;
    els.mpReadyBtn.textContent = 'Je suis prêt !';
    show(els.mpRulesOverlay);
  });

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

let mpWs             = null;
let mpCameraReady    = false;
let mpTargets        = [];
let mpInternalRound  = 0;
let mpInternalScores = [];
let mpMyPhotos       = [];          // photos locales (petites, 100×100)
let mpPlayersPhotos  = {};          // { [pid]: [photo1, ...] } des autres via relay
let mpRoundScoresAll = {};          // { [pid]: score } de la manche en cours
let mpReadySet       = new Set();   // pids qui ont cliqué Prêt
let mpPlayers        = [];
let mpDoneThisRound  = new Set();
let mpCaptured       = false;
let mpRoundWatchdog  = null;

function mpSend(payload) {
  if (mpWs && mpWs.readyState === WebSocket.OPEN) mpWs.send(JSON.stringify(payload));
}

// -- Capture petite photo (100×100, pour relay + inter-manche) --

function captureSmallPhoto() {
  const vw = camera.video.videoWidth;
  const vh = camera.video.videoHeight;
  if (!vw || !vh) return null;
  const c = document.createElement('canvas');
  c.width = 100; c.height = 100;
  const side = Math.min(vw, vh);
  c.getContext('2d').drawImage(camera.video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, 100, 100);
  return c.toDataURL('image/jpeg', 0.5);
}

// -- Règles / prêt --

function mpUpdateReadyUI() {
  if (!els.mpReadyList) return;
  els.mpReadyList.innerHTML = '';
  mpPlayers.forEach(p => {
    const ready = mpReadySet.has(p.id);
    const chip = document.createElement('div');
    chip.className = 'mp-ready-chip';
    chip.innerHTML = `<span class="mp-ready-icon">${ready ? '✅' : '⏳'}</span><span class="mp-rname">${escapeHtml(p.name.substring(0, 8))}</span>`;
    els.mpReadyList.appendChild(chip);
  });
}

function mpCheckAllReady() {
  if (mpReadySet.size < mpPlayers.length) return;
  hide(els.mpRulesOverlay);
  mpStartInternalRound(0);
}

// -- Score inter-manche --

function mpShowRoundScore(roundIdx, isLast, onDone) {
  const sorted = [...mpPlayers].sort((a, b) => (mpRoundScoresAll[b.id] ?? 0) - (mpRoundScoresAll[a.id] ?? 0));
  els.mrsRound.textContent = roundIdx + 1;
  els.mrsList.innerHTML = '';
  sorted.forEach(p => {
    const isMe  = p.id === mpPlayerId;
    const pts   = mpRoundScoresAll[p.id] ?? 0;
    const photo = isMe
      ? (mpMyPhotos[mpMyPhotos.length - 1] || null)
      : ((mpPlayersPhotos[p.id] || [])[roundIdx] || null);
    const photoEl = photo
      ? `<img class="mrs-photo" src="${photo}" alt="">`
      : `<div class="mrs-photo-ph"></div>`;
    const entry = document.createElement('div');
    entry.className = 'mrs-entry';
    entry.innerHTML = `${photoEl}
      <span class="mrs-name">${escapeHtml(p.name)}${isMe ? ' <span class="mrs-me">(toi)</span>' : ''}</span>
      <span class="mrs-pts">+${pts} pts</span>`;
    els.mrsList.appendChild(entry);
  });
  const label = isLast ? 'Résultats dans' : 'Manche suivante dans';
  let secs = 5;
  els.mrsCountdown.textContent = `${label} ${secs}…`;
  show(els.mpRoundScoreOverlay);
  const iv = setInterval(() => {
    secs--;
    if (secs <= 0) {
      clearInterval(iv);
      hide(els.mpRoundScoreOverlay);
      onDone();
    } else {
      els.mrsCountdown.textContent = `${label} ${secs}…`;
    }
  }, 1000);
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
  const rgb   = hexToRgb(t.hex);
  const cname = t.name;

  els.colorRevealOverlay.style.background = t.hex;
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
  mpRoundScoresAll = {};
  mpResetDots();
  hide(els.mpCapturedBar);

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
    startTimer(() => {
      mpDoCapture();
      // Si certains joueurs n'ont toujours pas répondu 6s après la fin du chrono, on force l'avancement
      mpRoundWatchdog = setTimeout(() => {
        mpPlayers.forEach(p => {
          if (!mpDoneThisRound.has(p.id)) {
            mpRoundScoresAll[p.id] = mpRoundScoresAll[p.id] ?? 0;
            mpDoneThisRound.add(p.id);
          }
        });
        mpCheckAllDone();
      }, 3000);
    });
  });
}

function mpDoCapture() {
  if (mpCaptured) return;
  mpCaptured = true;

  const elapsed = elapsedSeconds();
  hide(els.shutter);
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

  const rgb    = camera.sampleCenter() || [128, 128, 128];
  const result = game.evaluate(rgb, elapsed);
  mpInternalScores.push(result.points);
  mpRoundScoresAll[mpPlayerId] = result.points;

  const photo = captureSmallPhoto();
  if (photo) mpMyPhotos.push(photo);

  els.mpCapturedMsg.textContent = `📷 Photo prise — attente 1/${mpPlayers.length}`;
  show(els.mpCapturedBar);

  mpSetPlayerDone(mpPlayerId);
  mpDoneThisRound.add(mpPlayerId);

  mpSend({ type: 'relay', data: { type: 'ch-done', round: mpInternalRound, score: result.points, photo: photo || undefined } });
  mpCheckAllDone();
}

function mpCheckAllDone() {
  els.mpCapturedMsg.textContent = `📷 Photo prise — attente ${mpDoneThisRound.size}/${mpPlayers.length}`;
  if (mpDoneThisRound.size < mpPlayers.length) return;

  if (mpRoundWatchdog) { clearTimeout(mpRoundWatchdog); mpRoundWatchdog = null; }
  mpDoneThisRound = new Set();
  stopTimer();
  hide(els.mpCapturedBar);
  hide(els.hud);

  const currentIdx = mpInternalRound;
  const isLast     = (currentIdx + 1) >= mpTargets.length;

  mpShowRoundScore(currentIdx, isLast, () => {
    mpInternalRound = currentIdx + 1;
    if (isLast) {
      const total = mpInternalScores.reduce((a, b) => a + b, 0);
      mpSend({ type: 'game-score', score: total, roundBreakdown: mpInternalScores });
      els.mpWaitMsg.textContent = 'Calcul des résultats…';
      show(els.mpWaitOverlay);
    } else {
      mpStartInternalRound(mpInternalRound);
    }
  });
}

// -- Reveal progressif des scores --

const MEDALS = ['🥇', '🥈', '🥉'];

function mpShowScoreReveal(msg) {
  hide(els.mpWaitOverlay);
  hide(els.mpCapturedBar);
  hide(els.playersBar);
  hide(els.hud);

  const scores      = msg.roundScores || {};
  const totalScores = msg.totalScores || {};
  const breakdowns  = msg.roundBreakdowns || {};
  const players     = mpPlayers.length ? mpPlayers : (msg.players || []);

  if (msg.round && msg.totalRounds) {
    els.revealTitle.textContent = `🏆 Manche ${msg.round} / ${msg.totalRounds}`;
  }

  // Tri décroissant : 1er en haut
  const sorted = [...players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));

  els.revealList.innerHTML = '';
  sorted.forEach((p, rank) => {
    const isMe = p.id === mpPlayerId;
    const pts  = scores[p.id] ?? 0;
    const bd   = breakdowns[p.id] || null;

    const bdHtml = bd && bd.length
      ? `<div class="rp-breakdown">${bd.map((v, i) => `M${i + 1}: ${v}`).join(' · ')}</div>`
      : '';

    const photos = isMe ? mpMyPhotos : (mpPlayersPhotos[p.id] || []);
    const photosHtml = photos.length
      ? `<div class="rp-photos">${photos.map(src => `<img class="rp-photo-thumb" src="${src}" alt="">`).join('')}</div>`
      : '';

    const entry = document.createElement('div');
    entry.className = 'rp-entry' + (rank === 0 ? ' winner' : '');
    entry.innerHTML = `
      <div class="rp-header">
        <span class="rp-rank">${MEDALS[rank] ?? (rank + 1) + '.'}</span>
        <span class="rp-name">${escapeHtml(p.name)}${isMe ? ' <span class="rp-me">(toi)</span>' : ''}</span>
        <span class="rp-score">${pts} pts</span>
      </div>
      ${bdHtml}${photosHtml}
    `;
    els.revealList.appendChild(entry);
  });

  // Classement global (totalScores)
  const hasTotal = Object.keys(totalScores).length > 0;
  if (hasTotal) {
    const sortedTotal = [...players].sort((a, b) => (totalScores[b.id] ?? 0) - (totalScores[a.id] ?? 0));
    els.revealGlobalList.innerHTML = '';
    sortedTotal.forEach((p, i) => {
      const isMe = p.id === mpPlayerId;
      const entry = document.createElement('div');
      entry.className = 'rg-entry';
      entry.innerHTML = `
        <span class="rg-rank">${MEDALS[i] ?? (i + 1) + '.'}</span>
        <span class="rg-name">${escapeHtml(p.name)}${isMe ? ' <span class="rp-me">(toi)</span>' : ''}</span>
        <span class="rg-score">${totalScores[p.id] ?? 0} pts</span>
      `;
      els.revealGlobalList.appendChild(entry);
    });
    show(els.revealGlobal);
  } else {
    hide(els.revealGlobal);
  }

  hide(els.revealContinueBtn);
  show(els.scoreRevealOverlay);

  // Apparition progressive 1er → dernier
  const entries = els.revealList.querySelectorAll('.rp-entry');
  entries.forEach((entry, i) => {
    setTimeout(() => {
      entry.classList.add('visible');
      if (i === entries.length - 1) {
        setTimeout(() => show(els.revealContinueBtn), 900);
      }
    }, 800 + i * 900);
  });

  els.revealContinueBtn.textContent = msg.hasMore ? 'Manche suivante →' : 'Retour au lobby →';
}

els.revealContinueBtn.addEventListener('click', () => {
  mpMyPhotos = [];
  mpPlayersPhotos = {};
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
      mpTargets        = msg.targets;
      mpPlayers        = msg.players || [];
      mpInternalRound  = 0;
      mpInternalScores = [];
      mpMyPhotos       = [];
      mpPlayersPhotos  = {};
      mpRoundScoresAll = {};
      mpReadySet       = new Set();
      mpBuildPlayersBar(mpPlayers);
      hide(els.mpWaitOverlay);
      // Afficher les règles, chaque joueur doit cliquer Prêt
      mpUpdateReadyUI();
      show(els.mpRulesOverlay);
      break;

    case 'relay':
      if (msg.data) {
        const d = msg.data;
        if (d.type === 'ch-ready') {
          mpReadySet.add(msg.from);
          mpUpdateReadyUI();
          mpCheckAllReady();
        } else if (d.type === 'ch-done' && d.round === mpInternalRound) {
          mpSetPlayerDone(msg.from);
          mpDoneThisRound.add(msg.from);
          if (d.score !== undefined) mpRoundScoresAll[msg.from] = d.score;
          if (d.photo) {
            if (!mpPlayersPhotos[msg.from]) mpPlayersPhotos[msg.from] = [];
            mpPlayersPhotos[msg.from].push(d.photo);
          }
          mpCheckAllDone();
        }
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
  show(els.mpWaitOverlay);
  els.mpWaitMsg.textContent = 'Connexion en cours…';

  els.shutter.addEventListener('click', mpDoCapture);

  els.mpReadyBtn.addEventListener('click', () => {
    els.mpReadyBtn.disabled = true;
    els.mpReadyBtn.textContent = '✅ Prêt !';
    mpReadySet.add(mpPlayerId);
    mpUpdateReadyUI();
    mpSend({ type: 'relay', data: { type: 'ch-ready' } });
    mpCheckAllReady();
  });

  els.retryBtn.addEventListener('click', () => {
    hide(els.errorOverlay);
    show(els.mpWaitOverlay);
    mpConnect();
  });

  mpConnect();
}
