// Game state & round flow. Holds the target color, the running score and the
// per-round results. Pure logic — no DOM, no camera (those live in main.js).

import { rgbToLab, deltaE2000, randomTarget, scoreFromDeltaE } from './color.js';

export class Game {
  constructor(totalRounds = 5) {
    this.totalRounds = totalRounds;
    this.reset();
  }

  reset() {
    this.round = 0;
    this.totalScore = 0;
    this.results = [];
    this.target = null;
    this.phase = 'idle'; // idle | aiming | result | ended
  }

  nextRound() {
    this.round += 1;
    this.target = randomTarget();
    this.phase = 'aiming';
    return this.target;
  }

  // Evaluate a captured [r,g,b] against the current target.
  evaluate(capturedRgb) {
    const targetLab = rgbToLab(...this.target.rgb);
    const capturedLab = rgbToLab(...capturedRgb);
    const dE = deltaE2000(targetLab, capturedLab);
    const { points, rating } = scoreFromDeltaE(dE);

    this.totalScore += points;
    const result = {
      round: this.round,
      target: this.target.rgb,
      captured: capturedRgb,
      deltaE: dE,
      points,
      rating,
    };
    this.results.push(result);
    this.phase = this.round >= this.totalRounds ? 'ended' : 'result';
    return result;
  }

  get isLastRound() {
    return this.round >= this.totalRounds;
  }

  get averageAccuracy() {
    if (!this.results.length) return 0;
    return Math.round(this.totalScore / this.results.length);
  }
}
