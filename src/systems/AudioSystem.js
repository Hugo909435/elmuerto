// Tiny procedural sound system using the WebAudio API — no asset files needed.
// Plays short blips for putts, wall bounces and sinking. Respects the mute state.

import { EventBus, Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { AUDIO } from '../core/Constants.js';

export class AudioSystem {
  constructor() {
    this.ctx = null;

    EventBus.on(Events.BALL_SHOOT, ({ power }) =>
      this._blip(AUDIO.PUTT_FREQ + power * 220, 0.12, 0.25),
    );
    EventBus.on(Events.BALL_WALL_HIT, ({ speed }) => {
      if (speed > 2) this._blip(AUDIO.WALL_FREQ, 0.08, 0.18);
    });
    EventBus.on(Events.BALL_SUNK, () => this._chime());
    EventBus.on(Events.AUDIO_TOGGLE_MUTE, () => {
      GameState.isMuted = !GameState.isMuted;
    });
  }

  _ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  _blip(freq, duration = 0.1, gain = 0.2, type = 'sine') {
    if (GameState.isMuted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  _chime() {
    if (GameState.isMuted) return;
    const base = AUDIO.SINK_FREQ;
    [0, 0.1, 0.2].forEach((t, i) => {
      setTimeout(() => this._blip(base * (1 + i * 0.25), 0.18, 0.22, 'triangle'), t * 1000);
    });
  }
}
