// Thin DOM layer. Reads GameState, listens to EventBus, updates HUD pills and
// shows/hides the start / win / end overlays. All buttons emit EventBus events.

import { EventBus, Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';

export class UI {
  constructor() {
    this.$ = (id) => document.getElementById(id);

    this.hud = this.$('hud');
    this.hint = this.$('hint');
    this.holeEl = this.$('hud-hole');
    this.strokesEl = this.$('hud-strokes');
    this.parEl = this.$('hud-par');

    this.startOverlay = this.$('start-overlay');
    this.winOverlay = this.$('win-overlay');
    this.endOverlay = this.$('end-overlay');
    this.muteBtn = this.$('mute-btn');

    this._wire();
    this._bindEvents();
  }

  _wire() {
    this.$('start-btn').addEventListener('click', () =>
      EventBus.emit(Events.GAME_START),
    );
    this.$('next-btn').addEventListener('click', () => {
      this._hide(this.winOverlay);
      // Single-level course: the only hole is always the last one, so the
      // win button restarts the game instead of advancing to a next hole.
      if (GameState.isLastHole) EventBus.emit(Events.GAME_RESET);
      else EventBus.emit('ui:next');
    });
    this.$('restart-btn').addEventListener('click', () => {
      this._hide(this.endOverlay);
      EventBus.emit(Events.GAME_RESET);
    });
    this.muteBtn.addEventListener('click', () => {
      EventBus.emit(Events.AUDIO_TOGGLE_MUTE);
      this.muteBtn.textContent = GameState.isMuted ? '🔇' : '🔊';
    });
  }

  _bindEvents() {
    EventBus.on(Events.GAME_START, () => {
      this._hide(this.startOverlay);
      this._show(this.hud);
      this._show(this.hint);
    });
    EventBus.on(Events.GAME_RESET, () => {
      this._hide(this.winOverlay);
      this._hide(this.endOverlay);
    });
    EventBus.on(Events.HOLE_LOADED, () => this._refreshHud());
    EventBus.on(Events.STROKE_ADDED, () => this._refreshHud());
    EventBus.on(Events.HOLE_COMPLETE, (info) => this._showWin(info));
    EventBus.on(Events.COURSE_COMPLETE, (info) => this._showEnd(info));
  }

  _refreshHud() {
    this.holeEl.textContent = String(GameState.holeIndex + 1);
    this.strokesEl.textContent = String(GameState.strokes);
    this.parEl.textContent = String(GameState.par);
  }

  _scoreLabel(strokes, par) {
    const diff = strokes - par;
    if (strokes === 1) return 'Hole in one ! 🎯';
    if (diff <= -2) return 'Eagle ! 🦅';
    if (diff === -1) return 'Birdie ! 🐦';
    if (diff === 0) return 'Par 👌';
    if (diff === 1) return 'Bogey';
    return `+${diff}`;
  }

  _showWin({ strokes, par, isLast }) {
    this.$('win-title').textContent = strokes === 1 ? '🎯 Hole in one !' : '🏆 Dans le trou !';
    this.$('win-score').textContent = this._scoreLabel(strokes, par);
    this.$('win-detail').textContent = `${strokes} coup${strokes > 1 ? 's' : ''} (par ${par})`;
    this.$('next-btn').textContent = isLast ? 'Rejouer' : 'Trou suivant';
    this._show(this.winOverlay);
  }

  _showEnd({ totalStrokes, totalPar }) {
    const diff = totalStrokes - totalPar;
    const rel =
      diff === 0 ? 'au par' : diff > 0 ? `+${diff} au-dessus du par` : `${diff} sous le par`;
    this.$('end-score').textContent = `${totalStrokes} coups au total`;
    this.$('end-detail').textContent = `Par du parcours : ${totalPar} — ${rel}`;
    this._show(this.endOverlay);
  }

  _show(el) {
    el.classList.remove('hidden');
  }
  _hide(el) {
    el.classList.add('hidden');
  }
}
