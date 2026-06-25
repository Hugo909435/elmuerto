// Contrôleur d'UI du lobby : créer / rejoindre une partie privée,
// salle d'attente avec liste des joueurs et lancement par l'hôte.

import { LobbyClient } from './net.js';
import { Roulette } from './roulette.js';

const $ = (id) => document.getElementById(id);

// Vues
const homeView = $('view-home');
const joinView = $('view-join');
const roomView = $('view-room');
const rouletteView = $('view-roulette');

// Roue des jeux
const rouletteMsg = $('roulette-msg');
const spinBtn = $('spin-btn');
const roulette = new Roulette($('wheel'));

// Champs
const nameCreate = $('name-create');
const nameJoin = $('name-join');
const codeJoin = $('code-join');

// Salle d'attente
const roomCodeEl = $('room-code');
const playerListEl = $('player-list');
const startBtn = $('start-btn');
const waitMsg = $('wait-msg');

let state = { playerId: null, code: null, isHost: false, wheel: null };

const net = new LobbyClient();

function showView(view) {
  [homeView, joinView, roomView, rouletteView].forEach((v) =>
    v.classList.toggle('hidden', v !== view)
  );
}

function setError(msg) {
  const el = $('error-banner');
  if (!msg) {
    el.classList.add('hidden');
    return;
  }
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function rememberName(name) {
  try {
    localStorage.setItem('emarcade-name', name);
  } catch {}
}

function loadName() {
  try {
    return localStorage.getItem('emarcade-name') || '';
  } catch {
    return '';
  }
}

function renderPlayers(players) {
  playerListEl.innerHTML = '';
  players.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'player';
    const isMe = p.id === state.playerId;
    li.innerHTML = `
      <span class="dot"></span>
      <span class="pname">${escapeHtml(p.name)}${isMe ? ' (toi)' : ''}</span>
      ${p.isHost ? '<span class="badge">Hôte</span>' : ''}
    `;
    playerListEl.appendChild(li);
  });

  const me = players.find((p) => p.id === state.playerId);
  state.isHost = !!(me && me.isHost);
  startBtn.classList.toggle('hidden', !state.isHost);
  waitMsg.classList.toggle('hidden', state.isHost);
}

function enterRoom(code) {
  state.code = code;
  roomCodeEl.textContent = code;
  showView(roomView);
}

function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ----- Événements réseau -----
net
  .on('created', (m) => {
    state.playerId = m.playerId;
    enterRoom(m.code);
    renderPlayers(m.players);
  })
  .on('joined', (m) => {
    state.playerId = m.playerId;
    enterRoom(m.code);
    renderPlayers(m.players);
  })
  .on('players', (m) => renderPlayers(m.players))
  .on('roulette', (m) => {
    // La partie démarre : on affiche la roue. Seul le joueur tiré au sort
    // pourra la faire tourner ; les autres la regardent.
    state.wheel = m.wheel;
    showView(rouletteView);
    roulette.setSegments(m.wheel);

    const amSpinner = m.spinnerId === state.playerId;
    spinBtn.classList.toggle('hidden', !amSpinner);
    spinBtn.disabled = false;
    if (amSpinner) {
      rouletteMsg.textContent = "C'est à toi ! Fais tourner la roue 🎯";
    } else {
      const spinner = m.players.find((p) => p.id === m.spinnerId);
      rouletteMsg.textContent = `${spinner ? spinner.name : 'Un joueur'} va faire tourner la roue…`;
    }
  })
  .on('spin-result', (m) => {
    // Résultat imposé par le serveur : identique pour tous les clients.
    spinBtn.classList.add('hidden');
    rouletteMsg.textContent = 'La roue tourne…';
    roulette.spinTo(m.resultIndex).then(() => {
      const game = state.wheel[m.resultIndex];
      rouletteMsg.textContent = `${game.emoji || ''} ${game.label} ! On y va…`;
      setTimeout(() => {
        // On passe l'identité (room + playerId + pseudo) pour que le mini-jeu
        // puisse se reconnecter au même salon et faire jouer tout le monde
        // ensemble (cf. multijoueur de la course).
        const nm = loadName();
        window.location.href =
          `${game.url}?room=${encodeURIComponent(state.code)}` +
          `&pid=${encodeURIComponent(state.playerId)}` +
          `&name=${encodeURIComponent(nm)}`;
      }, 1200);
    });
  })
  .on('error', (m) => setError(m.message || 'Erreur.'))
  .on('neterror', () =>
    setError('Connexion au serveur impossible. Lance « npm run server ».')
  )
  .on('close', () => setError('Déconnecté du serveur.'));

// ----- Actions UI -----
$('btn-show-create').addEventListener('click', () => {
  net.connect();
  const name = nameCreate.value.trim();
  rememberName(name);
  net.create(name);
});

$('btn-show-join').addEventListener('click', () => {
  setError('');
  showView(joinView);
});

$('btn-back-home').addEventListener('click', () => showView(homeView));

$('btn-join').addEventListener('click', () => {
  const code = codeJoin.value.trim().toUpperCase();
  if (code.length < 4) return setError('Entre un code de partie valide.');
  const name = nameJoin.value.trim();
  rememberName(name);
  net.connect();
  net.join(code, name);
});

startBtn.addEventListener('click', () => net.start());

spinBtn.addEventListener('click', () => {
  spinBtn.disabled = true; // évite les doubles clics
  net.spin();
});

$('btn-leave').addEventListener('click', () => {
  net.leave();
  state = { playerId: null, code: null, isHost: false };
  showView(homeView);
});

$('btn-copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(state.code);
    const b = $('btn-copy-code');
    const old = b.textContent;
    b.textContent = 'Copié ✓';
    setTimeout(() => (b.textContent = old), 1500);
  } catch {}
});

// Code en majuscules automatiquement
codeJoin.addEventListener('input', () => {
  codeJoin.value = codeJoin.value.toUpperCase();
});

// Pré-remplir le pseudo mémorisé
const saved = loadName();
nameCreate.value = saved;
nameJoin.value = saved;
