import { LobbyClient } from './net.js';

const $ = (id) => document.getElementById(id);

const views = {
  home:       $('view-home'),
  join:       $('view-join'),
  room:       $('view-room'),
  config:     $('view-config'),
  teamPick:   $('view-teamPick'),
  waitReturn: $('view-waitReturn'),
  tournament: $('view-tournament'),
  roulette:   $('view-roulette'),
};

const rouletteMsg = $('roulette-msg');

const nameCreate = $('name-create');
const nameJoin   = $('name-join');
const codeJoin   = $('code-join');

const roomCodeEl  = $('room-code');
const playerListEl = $('player-list');
const startBtn    = $('start-btn');
const waitMsg     = $('wait-msg');

let state = { playerId: null, code: null, isHost: false, wheel: null };
let configState = { rounds: 5, teams: false, teamMode: 'random' };

const net = new LobbyClient();

function showView(view) {
  Object.values(views).forEach(v => v.classList.toggle('hidden', v !== view));
}

function setError(msg) {
  const el = $('error-banner');
  if (!msg) { el.classList.add('hidden'); return; }
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function savePid(pid, code) {
  try { localStorage.setItem('emarcade-pid', pid); localStorage.setItem('emarcade-room', code); } catch {}
}

function loadPid() {
  try { return localStorage.getItem('emarcade-pid'); } catch { return null; }
}

function rememberName(name) { try { localStorage.setItem('emarcade-name', name); } catch {} }
function loadName() { try { return localStorage.getItem('emarcade-name') || ''; } catch { return ''; } }

function renderPlayers(players) {
  playerListEl.innerHTML = '';
  players.forEach(p => {
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
  const me = players.find(p => p.id === state.playerId);
  state.isHost = !!(me && me.isHost);
  startBtn.classList.toggle('hidden', !state.isHost);
  waitMsg.classList.toggle('hidden', state.isHost);
}

function enterRoom(code) {
  state.code = code;
  roomCodeEl.textContent = code;
  showView(views.room);
}

// ----- Config UI -----

function updateRoundsDisplay() {
  $('rounds-val').textContent = configState.rounds;
}
$('rounds-dec').addEventListener('click', () => {
  if (configState.rounds > 1) { configState.rounds--; updateRoundsDisplay(); }
});
$('rounds-inc').addEventListener('click', () => {
  if (configState.rounds < 10) { configState.rounds++; updateRoundsDisplay(); }
});

$('mode-solo').addEventListener('click', () => {
  configState.teams = false;
  $('mode-solo').classList.add('active');
  $('mode-teams').classList.remove('active');
  $('config-teammode-row').classList.add('hidden');
});

$('mode-teams').addEventListener('click', () => {
  configState.teams = true;
  $('mode-teams').classList.add('active');
  $('mode-solo').classList.remove('active');
  $('config-teammode-row').classList.remove('hidden');
});

$('tm-random').addEventListener('click', () => {
  configState.teamMode = 'random';
  $('tm-random').classList.add('active');
  $('tm-manual').classList.remove('active');
});

$('tm-manual').addEventListener('click', () => {
  configState.teamMode = 'manual';
  $('tm-manual').classList.add('active');
  $('tm-random').classList.remove('active');
});

$('config-confirm-btn').addEventListener('click', () => {
  net.send({ type: 'start', rounds: configState.rounds, teams: configState.teams, teamMode: configState.teamMode });
});

// ----- Team pick UI -----

function renderTeamPick(players, picks) {
  const m1 = $('team-1-members');
  const m2 = $('team-2-members');
  const mu = $('team-unassigned');
  m1.innerHTML = '';
  m2.innerHTML = '';
  if (mu) mu.innerHTML = '';

  players.forEach(p => {
    const div = document.createElement('div');
    div.className = 'team-member' + (p.id === state.playerId ? ' is-me' : '');
    div.textContent = p.name + (p.id === state.playerId ? ' (toi)' : '');
    const team = picks[p.id];
    if (team === 2) m2.appendChild(div);
    else if (team === 1) m1.appendChild(div);
    else if (mu) mu.appendChild(div);
  });

  const myTeam = picks[state.playerId];
  document.querySelectorAll('.join-team-btn').forEach(btn => {
    const t = parseInt(btn.dataset.team);
    const isPicked = myTeam === t;
    btn.textContent = isPicked ? '✓ Mon équipe' : 'Rejoindre';
    btn.classList.toggle('my-pick', isPicked);
  });
}

document.querySelectorAll('.join-team-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    net.send({ type: 'team-pick', team: parseInt(btn.dataset.team) });
  });
});

$('teams-confirm-btn').addEventListener('click', () => {
  net.send({ type: 'teams-confirm' });
});

// ----- Scoreboard -----

const MEDALS = ['🥇', '🥈', '🥉'];

function renderScoreboard(players, scores, teamsMap) {
  const list = $('scoreboard-list');
  if (!list) return;
  const sorted = [...players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  list.innerHTML = '';
  sorted.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'score-entry';
    const team = teamsMap ? teamsMap[p.id] : null;
    const teamBadge = team ? `<span class="score-team-badge t${team}">${team === 1 ? '🔴' : '🔵'}</span>` : '';
    div.innerHTML = `
      <span class="score-rank">${MEDALS[i] || (i + 1) + '.'}</span>
      <span class="score-name">${escapeHtml(p.name)}</span>
      ${teamBadge}
      <span class="score-pts">${scores[p.id] ?? 0} pts</span>
    `;
    list.appendChild(div);
  });
}

function renderTournamentScores(players, scores, teamsMap) {
  const el = $('tournament-scores');
  if (!el) return;
  const sorted = [...players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  el.innerHTML = '';
  sorted.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'score-entry';
    const team = teamsMap ? teamsMap[p.id] : null;
    const teamBadge = team ? `<span class="score-team-badge t${team}">${team === 1 ? '🔴' : '🔵'}</span>` : '';
    div.innerHTML = `
      <span class="score-rank">${MEDALS[i] || (i + 1) + '.'}</span>
      <span class="score-name">${escapeHtml(p.name)}</span>
      ${teamBadge}
      <span class="score-pts">${scores[p.id] ?? 0} pts</span>
    `;
    el.appendChild(div);
  });
}

// ----- Événements réseau -----
net
  .on('created', m => {
    state.playerId = m.playerId;
    savePid(m.playerId, m.code);
    enterRoom(m.code);
    renderPlayers(m.players);
  })
  .on('joined', m => {
    state.playerId = m.playerId;
    savePid(m.playerId, m.code);
    enterRoom(m.code);
    renderPlayers(m.players);
  })
  .on('players', m => renderPlayers(m.players))

  .on('team-pick-start', m => {
    showView(views.teamPick);
    renderTeamPick(m.players, {});
    $('teams-confirm-btn').classList.toggle('hidden', !state.isHost);
    $('teams-wait').classList.toggle('hidden', state.isHost);
  })
  .on('team-picks', m => {
    renderTeamPick(m.players, m.picks);
  })

  .on('roulette', m => {
    state.wheel = m.wheel;
    showView(views.roulette);

    // Round counter
    const roundEl = $('round-counter');
    if (m.totalRounds > 0) {
      roundEl.textContent = `Manche ${m.currentRound + 1} / ${m.totalRounds}`;
      roundEl.classList.remove('hidden');
    } else {
      roundEl.classList.add('hidden');
    }

    // Scores (dès la 2e manche)
    const sb = $('scoreboard');
    const hasScores = m.scores && Object.values(m.scores).some(v => v > 0);
    if (hasScores) {
      renderScoreboard(m.players, m.scores, m.teamsMap);
      sb.classList.remove('hidden');
    } else {
      sb.classList.add('hidden');
    }

    // Sélecteur de jeu — utilise m.games (liste propre du serveur)
    const amPicker = m.spinnerId === state.playerId;
    const grid = $('game-picker-grid');
    grid.innerHTML = '';
    const gameList = m.games || m.wheel.filter((g, i, a) => a.findIndex(x => x.id === g.id) === i);
    gameList.forEach(g => {
      const btn = document.createElement('button');
      btn.className = 'gcard' + (amPicker ? '' : ' disabled');
      btn.innerHTML = `<span class="gcard-emoji">${g.emoji || '🎮'}</span><span class="gcard-name">${escapeHtml(g.label)}</span>`;
      if (amPicker) {
        const gameId = g.id;
        btn.addEventListener('click', () => {
          grid.querySelectorAll('.gcard').forEach(c => c.classList.add('disabled'));
          btn.classList.add('picked');
          net.send({ type: 'spin', gameId });
        });
      }
      grid.appendChild(btn);
    });

    if (amPicker) {
      rouletteMsg.textContent = '🎮 À toi de choisir le mini-jeu !';
    } else {
      const picker = m.players.find(p => p.id === m.spinnerId);
      rouletteMsg.textContent = `${picker ? escapeHtml(picker.name) : 'L\'hôte'} choisit le mini-jeu…`;
    }
  })
<<<<<<< HEAD

  .on('spin-result', m => {
    // Désactiver toutes les cartes
    document.querySelectorAll('.gcard').forEach(c => c.classList.add('disabled'));

    const game = m.gameUrl
      ? { url: m.gameUrl, emoji: m.gameEmoji, label: m.gameLabel }
      : state.wheel[m.resultIndex];

    rouletteMsg.textContent = `${game.emoji || ''} ${game.label} ! On y va…`;
    setTimeout(() => {
      const pid = state.playerId || loadPid();
      window.location.href = `${game.url}?room=${encodeURIComponent(state.code)}&pid=${encodeURIComponent(pid)}`;
    }, 900);
=======
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
>>>>>>> 7409af55c593a31c2d69fb7cbca1dc6c8b846511
  })

  .on('waiting-return', m => {
    $('wait-return-msg').textContent = `${m.returned} / ${m.total} joueurs de retour…`;
  })

  .on('tournament-end', m => {
    showView(views.tournament);
    const sub = m.totalRounds === 1 ? '1 manche' : `${m.totalRounds} manches`;
    $('tournament-sub').textContent = `Classement final — ${sub}`;
    renderTournamentScores(m.players, m.totalScores, m.teamsMap);
  })

  .on('error', m => setError(m.message || 'Erreur.'))
  .on('neterror', () => setError('Connexion au serveur impossible. Lance « npm run server ».'))
  .on('close', () => setError('Déconnecté du serveur.'));

// ----- Actions UI -----

$('btn-show-create').addEventListener('click', () => {
  net.connect();
  const name = nameCreate.value.trim();
  rememberName(name);
  net.create(name);
});

$('btn-show-join').addEventListener('click', () => { setError(''); showView(views.join); });
$('btn-back-home').addEventListener('click', () => showView(views.home));

$('btn-join').addEventListener('click', () => {
  const code = codeJoin.value.trim().toUpperCase();
  if (code.length < 4) return setError('Entre un code de partie valide.');
  const name = nameJoin.value.trim();
  rememberName(name);
  net.connect();
  net.join(code, name);
});

startBtn.addEventListener('click', () => {
  // Montrer l'écran config au lieu d'envoyer start tout de suite
  $('config-host-form').classList.toggle('hidden', !state.isHost);
  $('config-wait').classList.toggle('hidden', state.isHost);
  showView(views.config);
});

$('btn-leave-config').addEventListener('click', () => showView(views.room));
$('btn-leave-team').addEventListener('click', () => { net.leave(); state = { playerId: null, code: null, isHost: false }; showView(views.home); });

$('btn-leave').addEventListener('click', () => {
  net.leave();
  state = { playerId: null, code: null, isHost: false };
  showView(views.home);
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

$('tournament-replay-btn').addEventListener('click', () => {
  // Réinitialiser et aller à l'accueil
  state = { playerId: null, code: null, isHost: false };
  showView(views.home);
});

codeJoin.addEventListener('input', () => { codeJoin.value = codeJoin.value.toUpperCase(); });

// ----- Retour depuis un mini-jeu (?room=CODE) -----
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');
const pidFromUrl = urlParams.get('pid') || loadPid();

if (roomFromUrl && pidFromUrl) {
  state.playerId = pidFromUrl;
  state.code = roomFromUrl;
  showView(views.waitReturn);
  $('wait-return-msg').textContent = 'Reconnexion en cours…';
  net.connect();
  net.send({ type: 'return-lobby', code: roomFromUrl, playerId: pidFromUrl });
  // Nettoyer l'URL sans rechargement
  history.replaceState({}, '', '/');
}

// Pré-remplir le pseudo mémorisé
const saved = loadName();
nameCreate.value = saved;
nameJoin.value = saved;
