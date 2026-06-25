import { PetanqueGame } from './PetanqueGame.js';
import { PetanqueNet } from './PetanqueNet.js';

// Lire le code de room et le playerId depuis l'URL (passés par le lobby au redirect).
const _p = new URLSearchParams(location.search);
const code = _p.get('room');
const savedPlayerId = _p.get('pid') || (() => { try { return localStorage.getItem('emarcade-pid'); } catch { return null; } })();

const container = document.getElementById('app');
const net = new PetanqueNet();
let game = null;
let myIndex = null;
let pendingCochonnet = null;
let pendingThrows = [];

function startGame() {
  game = new PetanqueGame(container, net, myIndex);
  game.startManche();

  // Appliquer les messages réseau arrivés avant la création du jeu.
  if (pendingCochonnet) {
    game.onRemoteCochonnet(pendingCochonnet);
    pendingCochonnet = null;
  }
  for (const t of pendingThrows) game.onRemoteThrow(t);
  pendingThrows = [];

  document.getElementById('waiting-overlay').classList.add('hidden');
}

net
  .on('game-connected', (msg) => {
    myIndex = msg.playerIndex;
    if (msg.connectedCount >= msg.total && msg.total >= 2) {
      startGame();
    } else {
      document.getElementById('waiting-msg').textContent =
        `Connecté (${msg.connectedCount}/${msg.total}) — en attente de l'adversaire…`;
    }
  })
  .on('player-reconnected', (msg) => {
    if (game) return;
    if (msg.connectedCount >= 2) startGame();
    else {
      document.getElementById('waiting-msg').textContent =
        `Connecté (${msg.connectedCount}/2) — en attente de l'adversaire…`;
    }
  })
  .on('relay', (data) => {
    if (data.type === 'cochonnet') {
      if (game) game.onRemoteCochonnet(data);
      else pendingCochonnet = data;
    } else if (data.type === 'throw') {
      if (game) game.onRemoteThrow(data);
      else pendingThrows.push(data);
    }
  })
  .on('error', (msg) => {
    document.getElementById('waiting-msg').textContent =
      msg.message || 'Erreur de connexion.';
  })
  .on('disconnect', () => {
    document.getElementById('waiting-msg').textContent = 'Connexion perdue. Reconnexion…';
    if (code && savedPlayerId) {
      setTimeout(() => net.connect(code, savedPlayerId), 2000);
    }
  })
  .on('neterror', () => {
    document.getElementById('waiting-msg').textContent =
      'Impossible de joindre le serveur. Lance « npm run server ».';
  });

if (code && savedPlayerId) {
  net.connect(code, savedPlayerId);
} else {
  document.getElementById('waiting-msg').textContent =
    'Session introuvable. Passe par le lobby pour rejoindre une partie.';
}

// Lien "retour" sur le bouton gameover — revient au lobby avec les params de room si présents
document.getElementById('btn-back-lobby')?.addEventListener('click', () => {
  const p = new URLSearchParams(window.location.search);
  const room = p.get('room'), pid = p.get('pid');
  window.location.href = room && pid ? `/?room=${encodeURIComponent(room)}&pid=${encodeURIComponent(pid)}` : '/';
});
