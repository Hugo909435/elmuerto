// Single source of truth for all mutable game state.
// Systems read from here; events mutate it.

import { COURSE } from './Constants.js';

class GameStateClass {
  constructor() {
    this.reset();
  }

  reset() {
    this.phase = 'menu'; // menu | aiming | rolling | sunk | complete
    this.holeIndex = 0;
    this.strokes = 0; // strokes on the current hole
    this.totalStrokes = 0; // across the whole course
    this.totalPar = 0;
    this.isMuted = false;
    this.ballMoving = false;
  }

  get currentHole() {
    return COURSE[this.holeIndex];
  }

  get holeCount() {
    return COURSE.length;
  }

  get par() {
    return this.currentHole.par;
  }

  get isLastHole() {
    return this.holeIndex >= COURSE.length - 1;
  }

  startHole() {
    this.strokes = 0;
    this.ballMoving = false;
    this.phase = 'aiming';
  }

  addStroke() {
    this.strokes += 1;
    this.totalStrokes += 1;
  }

  completeHole() {
    this.totalPar += this.par;
    this.phase = 'sunk';
  }

  nextHole() {
    this.holeIndex += 1;
    this.startHole();
  }
}

export const GameState = new GameStateClass();
