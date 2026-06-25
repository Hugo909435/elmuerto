// Entry point: wires the DOM to the CameraManager and the Game, runs the live
// center-color sampling loop and drives the start → aim → result → end flow.

import { CameraManager } from './camera.js';
import { Game } from './game.js';
import { rgbToCss } from './color.js';

const $ = (id) => document.getElementById(id);

const els = {
  hud: $('hud'),
  shutter: $('shutter'),
  liveChip: $('live-chip'),
  targetSwatch: $('target-swatch'),
  targetName: $('target-name'),
  hudScore: $('hud-score'),
  hudRound: $('hud-round'),
  hudTotal: $('hud-total'),

  startOverlay: $('start-overlay'),
  startBtn: $('start-btn'),

  resultOverlay: $('result-overlay'),
  resultPhoto: $('result-photo'),
  resTarget: $('res-target'),
  resCaptured: $('res-captured'),
  resRating: $('res-rating'),
  resPoints: $('res-points'),
  resDe: $('res-de'),
  nextBtn: $('next-btn'),

  endOverlay: $('end-overlay'),
  endScore: $('end-score'),
  endDetail: $('end-detail'),
  replayBtn: $('replay-btn'),

  errorOverlay: $('error-overlay'),
  errorMsg: $('error-msg'),
  retryBtn: $('retry-btn'),
};

const camera = new CameraManager($('cam'));
const game = new Game(5);

const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

// ---------- Live sampling loop ----------
let rafId = null;
function liveLoop() {
  if (game.phase === 'aiming') {
    const rgb = camera.sampleCenter();
    if (rgb) els.liveChip.style.background = rgbToCss(rgb);
  }
  rafId = requestAnimationFrame(liveLoop);
}

// ---------- Flow ----------
async function startGame() {
  try {
    await camera.start();
  } catch (e) {
    els.errorMsg.textContent =
      e && e.name === 'NotAllowedError'
        ? "Accès à la caméra refusé."
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
  beginRound();

  if (!rafId) liveLoop();
}

function beginRound() {
  const target = game.nextRound();
  els.targetSwatch.style.background = rgbToCss(target.rgb);
  els.targetName.textContent = target.name;
  els.hudRound.textContent = String(game.round);
  els.hudScore.textContent = String(game.totalScore);
  els.shutter.disabled = false;
  hide(els.resultOverlay);
}

function capture() {
  if (game.phase !== 'aiming') return;
  const rgb = camera.sampleCenter();
  if (!rgb) return;

  els.shutter.disabled = true;
  camera.capturePhoto(els.resultPhoto);
  const result = game.evaluate(rgb);

  els.resTarget.style.background = rgbToCss(result.target);
  els.resCaptured.style.background = rgbToCss(result.captured);
  els.resRating.textContent = result.rating;
  els.resPoints.textContent = `+${result.points} pts`;
  els.resDe.textContent = `Écart de couleur ΔE = ${result.deltaE.toFixed(1)}`;
  els.hudScore.textContent = String(game.totalScore);

  els.nextBtn.textContent = game.isLastRound ? 'Voir le score' : 'Manche suivante';
  show(els.resultOverlay);
}

function nextRound() {
  hide(els.resultOverlay);
  if (game.phase === 'ended') {
    endGame();
  } else {
    beginRound();
  }
}

function endGame() {
  const max = game.totalRounds * 100;
  els.endScore.textContent = `${game.totalScore} / ${max}`;
  els.endDetail.textContent = `Précision moyenne : ${game.averageAccuracy} / 100`;
  show(els.endOverlay);
}

function replay() {
  hide(els.endOverlay);
  game.reset();
  els.hudScore.textContent = '0';
  beginRound();
}

// ---------- Events ----------
els.startBtn.addEventListener('click', startGame);
els.retryBtn.addEventListener('click', startGame);
els.shutter.addEventListener('click', capture);
els.nextBtn.addEventListener('click', nextRound);
els.replayBtn.addEventListener('click', replay);

// Pause the loop when the tab is hidden to save battery.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  } else if (!document.hidden && !rafId && game.phase !== 'idle') {
    liveLoop();
  }
});
