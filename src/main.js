// Entry point: create the Game once the DOM is ready.

import { Game } from './core/Game.js';

const container = document.getElementById('app');
new Game(container);
