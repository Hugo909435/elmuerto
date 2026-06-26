// Serveur de salons (lobby) pour parties privées.
// WebSocket simple : créer une partie -> code à 4 lettres, rejoindre par code,
// liste des joueurs en temps réel, lancement par l'hôte.
// Gère aussi le relay de messages in-game et la reconnexion après redirect.

import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8080;

/** @type {Map<string, Room>} */
const rooms = new Map();

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const GAMES = [
  { id: 'minigolf',   label: 'Mini Golf',  emoji: '⛳', url: 'minigolf.html' },
  { id: 'racing',     label: 'Course',     emoji: '🏎️', url: 'racing.html' },
  { id: 'colorhunt',  label: 'Color Hunt', emoji: '🎨', url: 'colorhunt.html' },
  { id: 'sprint',     label: 'Sprint',     emoji: '🏃', url: 'sprint.html' },
  { id: 'tanks',      label: 'Tanks',      emoji: '💥', url: 'tanks.html' },
  { id: 'chickenrun', label: 'Chicken Run', emoji: '🐔', url: 'chickenrun.html' },
  { id: 'sumo',       label: 'Sumo',       emoji: '🤼', url: 'sumo.html' },
  { id: 'charge',     label: 'Chargé',     emoji: '⚡', url: 'charge.html' },
  { id: 'synchro',    label: 'Synchro',    emoji: '🔗', url: 'synchro.html' },
];

const SEGMENT_COLORS = ['#4ade80', '#38bdf8', '#22a85a', '#0ea5e9', '#a78bfa', '#f59e0b'];

const COLOR_PALETTE = [
  { name: 'Blanc',            hex: '#FFFFFF' },
  { name: 'Noir',             hex: '#000000' },
  { name: 'Gris Clair',       hex: '#D9D9D9' },
  { name: 'Gris Foncé',       hex: '#555555' },
  { name: 'Rouge',            hex: '#FF0000' },
  { name: 'Rouge Bordeaux',   hex: '#7B1E3A' },
  { name: 'Rouge Brique',     hex: '#B5533C' },
  { name: 'Rose',             hex: '#FFC0CB' },
  { name: 'Rose Fuchsia',     hex: '#FF4FA3' },
  { name: 'Orange',           hex: '#FFA500' },
  { name: 'Orange Brûlé',    hex: '#CC5500' },
  { name: 'Jaune',            hex: '#FFFF00' },
  { name: 'Jaune Moutarde',   hex: '#D4A017' },
  { name: 'Beige',            hex: '#F5F5DC' },
  { name: 'Crème',            hex: '#FFFDD0' },
  { name: 'Marron',           hex: '#8B4513' },
  { name: 'Marron Chocolat',  hex: '#5A3825' },
  { name: 'Taupe',            hex: '#8B7D6B' },
  { name: 'Bleu Ciel',        hex: '#90D5FF' },
  { name: 'Bleu Foncé',       hex: '#111184' },
  { name: 'Bleu Marine',      hex: '#001F54' },
  { name: 'Bleu Turquoise',   hex: '#40E0D0' },
  { name: 'Bleu Pétrole',    hex: '#1F6F78' },
  { name: 'Vert',             hex: '#00A651' },
  { name: 'Vert Clair',       hex: '#90EE90' },
  { name: 'Vert Foncé',       hex: '#1E5631' },
  { name: 'Vert Olive',       hex: '#708238' },
  { name: 'Vert Menthe',      hex: '#98FF98' },
  { name: 'Vert Kaki',        hex: '#8F9779' },
  { name: 'Violet',           hex: '#8000FF' },
  { name: 'Violet Lavande',   hex: '#B57EDC' },
  { name: 'Lilas',            hex: '#C8A2C8' },
  { name: 'Mauve',            hex: '#A060A0' },
  { name: 'Cyan',             hex: '#00FFFF' },
  { name: 'Aqua',             hex: '#7FFFD4' },
  { name: 'Turquoise Clair',  hex: '#AFEEEE' },
  { name: 'Corail',           hex: '#FF7F50' },
  { name: 'Saumon',           hex: '#FA8072' },
  { name: 'Pêche',           hex: '#FFDAB9' },
  { name: 'Or',               hex: '#D4AF37' },
  { name: 'Argent',           hex: '#C0C0C0' },
  { name: 'Bronze',           hex: '#CD7F32' },
  { name: 'Ivoire',           hex: '#FFFFF0' },
  { name: 'Bordeaux Sombre',  hex: '#5E0B15' },
  { name: 'Prune',            hex: '#701C3A' },
  { name: 'Terracotta',       hex: '#C96A4A' },
  { name: 'Sable',            hex: '#CDB79E' },
  { name: 'Ardoise',          hex: '#708090' },
  { name: 'Indigo',           hex: '#4B0082' },
  { name: 'Anis',             hex: '#DFFF00' },
];

function buildWheel() {
  const slices = [];
  const reps = Math.max(2, Math.ceil(6 / GAMES.length));
  for (let r = 0; r < reps; r++) {
    for (const g of GAMES) {
      slices.push({ ...g, color: SEGMENT_COLORS[slices.length % SEGMENT_COLORS.length] });
    }
  }
  return slices;
}

function makeCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  } while (rooms.has(code));
  return code;
}

function makeId() { return Math.random().toString(36).slice(2, 10); }

function sanitizeName(name) {
  return (typeof name === 'string' ? name : '').trim().slice(0, 16) || 'Joueur';
}

// Comme broadcast, mais saute un joueur (utile pour relayer une position à
// tous *les autres* membres du salon).
function broadcastExcept(room, exceptId, payload) {
  const msg = JSON.stringify(payload);
  for (const p of room.players.values()) {
    if (p.id !== exceptId && p.socket.readyState === p.socket.OPEN) p.socket.send(msg);
  }
}

// Vue publique enrichie pour la phase « course » (salle d'attente + résultats).
function racePlayers(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    isHost: p.id === room.hostId,
    connected: !!p.connected,
    slot: p.slot ?? null,
    finished: !!p.finished,
    finishTime: p.finishTime || 0,
  }));
}

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

function publicPlayers(room) {
  return [...room.players.values()].map(p => ({
    id: p.id,
    name: p.name,
    isHost: p.id === room.hostId,
    team: room.teamsMap ? (room.teamsMap[p.id] ?? null) : null,
  }));
}

function broadcast(room, payload) {
  const msg = JSON.stringify(payload);
  for (const p of room.players.values()) {
    if (p.socket && p.socket.readyState === p.socket.OPEN) p.socket.send(msg);
  }
}

// Mélange en place (Fisher-Yates) — utilisé pour l'ordre aléatoire des circuits.
function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Construit le top départ d'une manche : (ré)attribue les places et diffuse
// race-start avec le circuit courant et le numéro de manche du Grand Prix.
function startRaceRound(room) {
  const conn = [...room.players.values()].filter((p) => p.connected);
  conn.forEach((p, i) => { p.slot = i; p.finished = false; p.finishTime = 0; });
  room.raceMapIndex = room.raceOrder[room.raceSeq];
  room.phase = 'racing';
  broadcast(room, {
    type: 'race-start',
    mapIndex: room.raceMapIndex,
    round: room.raceSeq + 1,
    total: room.raceOrder.length,
    players: conn.map((p) => ({ id: p.id, name: p.name, slot: p.slot })),
  });
}

function assignRandomTeams(room) {
  const ids = [...room.players.keys()];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  room.teamsMap = {};
  ids.forEach((id, i) => { room.teamsMap[id] = (i % 2) + 1; });
}

function broadcastRoulette(room) {
  room.spinnerId = room.hostId;
  room.wheel = buildWheel();
  room.spun = false;
  room.colorTarget = null;
  room.colorTargets = null;
  room.gameConnectedSet = new Set();
  room.pendingScores = {};
  broadcast(room, {
    type: 'roulette',
    wheel: room.wheel,
    games: GAMES,
    spinnerId: room.spinnerId,
    players: publicPlayers(room),
    scores: room.scores ?? {},
    teamsMap: room.teamsMap ?? null,
    currentRound: room.currentRound,
    totalRounds: room.config ? room.config.rounds : 0,
  });
}

const wss = new WebSocketServer({ port: PORT });
console.log(`Serveur de lobby en écoute sur ws://localhost:${PORT}`);

wss.on('connection', (socket) => {
  let currentRoom = null;
  let playerId = null;

  function leaveRoom() {
    if (!currentRoom) return;
    const room = currentRoom;
    currentRoom = null;

    if (room.started) {
      const player = room.players.get(playerId);
      if (player) player.socket = null;

      clearTimeout(room._cleanupTimer);
      const allGone = [...room.players.values()].every(p => !p.socket);
      if (allGone) {
        room._cleanupTimer = setTimeout(() => rooms.delete(room.code), 120_000);
      }
      return;
    }

    room.players.delete(playerId);
    if (room.players.size === 0) { rooms.delete(room.code); return; }
    if (room.hostId === playerId) room.hostId = room.players.keys().next().value;
    broadcast(room, { type: 'players', players: publicPlayers(room) });
  }

  // Déconnexion de la socket. Tant que la partie n'a pas démarré, on retire le
  // joueur tout de suite (comportement du lobby). Une fois la partie lancée, la
  // navigation entre pages (lobby -> racing.html) ferme la socket : on garde
  // alors le joueur en « hors-ligne » et on laisse un délai de grâce pour qu'il
  // se reconnecte (race-hello) sans détruire le salon.
  function handleClose() {
    if (!currentRoom) return;
    const room = currentRoom;
    if (!room.started) {
      leaveRoom();
      return;
    }
    const player = room.players.get(playerId);
    if (player) player.connected = false;
    currentRoom = null;
    if (room.phase) {
      broadcast(room, { type: 'race-roster', players: racePlayers(room), hostId: room.hostId });
    }
    const anyConnected = [...room.players.values()].some((p) => p.connected);
    if (!anyConnected && !room.graceTimer) {
      room.graceTimer = setTimeout(() => rooms.delete(room.code), 90000);
    }
  }

  socket.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch {
      return send(socket, { type: 'error', message: 'Message invalide.' });
    }

    switch (msg.type) {

      case 'create': {
        if (currentRoom) leaveRoom();
        const code = makeCode();
        playerId = makeId();
        const player = { id: playerId, name: sanitizeName(msg.name), socket, connected: true };
        const room = {
          code,
          hostId: playerId,
          players: new Map([[playerId, player]]),
          started: false,
        };
        rooms.set(code, room);
        currentRoom = room;
        send(socket, { type: 'created', code, playerId, players: publicPlayers(room) });
        break;
      }

      case 'join': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) return send(socket, { type: 'error', message: 'Partie introuvable.' });
        if (room.started) return send(socket, { type: 'error', message: 'La partie a déjà commencé.' });
        if (room.players.size >= 8) return send(socket, { type: 'error', message: 'La partie est pleine.' });
        if (currentRoom) leaveRoom();
        playerId = makeId();
        const player = { id: playerId, name: sanitizeName(msg.name), socket, connected: true };
        room.players.set(playerId, player);
        currentRoom = room;
        send(socket, { type: 'joined', code: room.code, playerId, players: publicPlayers(room) });
        broadcast(room, { type: 'players', players: publicPlayers(room) });
        break;
      }

      case 'start': {
        if (!currentRoom || currentRoom.hostId !== playerId) {
          return send(socket, { type: 'error', message: "Seul l'hôte peut lancer." });
        }
        const room = currentRoom;
        room.started = true;
        room.config = {
          rounds: Math.max(1, Math.min(20, parseInt(msg.rounds) || 5)),
          teams: !!msg.teams,
          teamMode: msg.teamMode === 'manual' ? 'manual' : 'random',
        };
        room.scores = {};
        room.currentRound = 0;
        room.pendingScores = {};
        room.gameConnectedSet = new Set();
        for (const id of room.players.keys()) room.scores[id] = 0;

        if (room.config.teams && room.config.teamMode === 'manual') {
          room.teamsMap = {};
          broadcast(room, { type: 'team-pick-start', players: publicPlayers(room), config: room.config });
        } else {
          if (room.config.teams) assignRandomTeams(room);
          broadcastRoulette(room);
        }
        break;
      }

      case 'team-pick': {
        const room = currentRoom;
        if (!room || !room.started) return;
        room.teamsMap[playerId] = msg.team === 2 ? 2 : 1;
        broadcast(room, { type: 'team-picks', picks: room.teamsMap, players: publicPlayers(room) });
        break;
      }

      case 'teams-confirm': {
        const room = currentRoom;
        if (!room || !room.started || room.hostId !== playerId) return;
        broadcastRoulette(room);
        break;
      }

      case 'spin': {
        const room = currentRoom;
        if (!room || !room.started) return;
        if (room.spinnerId !== playerId) {
          return send(socket, { type: 'error', message: "Ce n'est pas à toi de choisir le jeu." });
        }
        if (room.spun) return;
        room.spun = true;
        room.currentRound += 1;
        room.colorTarget = null;
        room.colorTargets = null;
        room.pendingScores = {};
        room.gameConnectedSet = new Set();

        let chosenGame = msg.gameId ? GAMES.find(g => g.id === msg.gameId) : null;
        if (!chosenGame) {
          room.resultIndex = Math.floor(Math.random() * room.wheel.length);
          chosenGame = room.wheel[room.resultIndex];
        } else {
          room.resultIndex = room.wheel.findIndex(g => g.id === chosenGame.id);
          if (room.resultIndex < 0) room.resultIndex = 0;
        }

        broadcast(room, {
          type: 'spin-result',
          resultIndex: room.resultIndex,
          gameId: chosenGame.id,
          gameUrl: chosenGame.url,
          gameLabel: chosenGame.label,
          gameEmoji: chosenGame.emoji,
        });
        break;
      }

      case 'game-connect': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room || !room.started) {
          return send(socket, { type: 'error', message: 'Partie introuvable.' });
        }
        const savedId = msg.playerId;
        const player = savedId ? room.players.get(savedId) : null;
        if (!player) {
          return send(socket, { type: 'error', message: 'Joueur inconnu dans cette partie.' });
        }

        clearTimeout(room._cleanupTimer);
        room._cleanupTimer = null;
        player.socket = socket;
        playerId = savedId;
        currentRoom = room;

        if (!room.gameConnectedSet) room.gameConnectedSet = new Set();
        room.gameConnectedSet.add(playerId);

        const connectedPlayers = [...room.players.values()].filter(
          p => p.socket && p.socket.readyState === p.socket.OPEN
        );

        send(socket, {
          type: 'game-connected',
          playerIndex: [...room.players.keys()].indexOf(playerId),
          playerId,
          connectedCount: room.gameConnectedSet.size,
          total: room.players.size,
          players: publicPlayers(room),
          scores: room.scores ?? {},
        });

        for (const p of room.players.values()) {
          if (p.id !== playerId && p.socket && p.socket.readyState === p.socket.OPEN) {
            p.socket.send(JSON.stringify({ type: 'player-reconnected', playerId, connectedCount: room.gameConnectedSet.size }));
          }
        }

        // Color Hunt : générer 5 cibles et broadcaster quand tous connectés.
        // Si déjà générées (joueur en retard), envoyer individuellement.
        const game = room.wheel ? room.wheel[room.resultIndex] : null;
        if (game && game.id === 'colorhunt') {
          if (room.colorTargets) {
            // Cibles déjà générées : envoyer uniquement à ce joueur
            send(socket, {
              type: 'color-targets',
              targets: room.colorTargets,
              round: room.currentRound,
              totalRounds: room.config ? room.config.rounds : 1,
              players: publicPlayers(room),
              scores: room.scores ?? {},
            });
          } else if (room.gameConnectedSet.size >= room.players.size) {
            // Tous connectés : tirer 5 couleurs sans répétition depuis la palette
            const CH_ROUNDS = 5;
            const shuffled = [...COLOR_PALETTE];
            for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            const targets = shuffled.slice(0, CH_ROUNDS).map(({ name, hex }) => ({ name, hex }));
            room.colorTargets = targets;
            broadcast(room, {
              type: 'color-targets',
              targets: room.colorTargets,
              round: room.currentRound,
              totalRounds: room.config ? room.config.rounds : 1,
              players: publicPlayers(room),
              scores: room.scores ?? {},
            });
          } else {
            send(socket, {
              type: 'color-waiting',
              connectedCount: room.gameConnectedSet.size,
              total: room.players.size,
            });
          }
        }
        break;
      }

      case 'game-score': {
        const room = currentRoom;
        if (!room || !room.started) return;
        const score = Math.max(0, Math.min(10000, parseInt(msg.score) || 0));
        if (!room.pendingScores) room.pendingScores = {};
        room.pendingScores[playerId] = score;
        if (Array.isArray(msg.roundBreakdown)) {
          if (!room.pendingBreakdowns) room.pendingBreakdowns = {};
          room.pendingBreakdowns[playerId] = msg.roundBreakdown
            .slice(0, 10)
            .map(n => Math.max(0, Math.min(100, parseInt(n) || 0)));
        }
        room.scores[playerId] = (room.scores[playerId] ?? 0) + score;

        const connectedNow = new Set(
          [...room.players.values()]
            .filter(p => p.socket && p.socket.readyState === p.socket.OPEN)
            .map(p => p.id)
        );

        broadcast(room, {
          type: 'score-waiting',
          submitted: Object.keys(room.pendingScores).length,
          total: connectedNow.size,
        });

        const allIn = [...connectedNow].every(id => room.pendingScores[id] !== undefined);
        if (allIn) {
          // Track who won this round
          const maxScore = Math.max(...Object.values(room.pendingScores));
          if (maxScore > 0) {
            const winners = Object.entries(room.pendingScores)
              .filter(([, s]) => s === maxScore)
              .map(([id]) => id);
            const currentGame = room.wheel ? room.wheel[room.resultIndex] : null;
            if (currentGame) {
              if (!room.gameWins) room.gameWins = {};
              for (const wid of winners) {
                if (!room.gameWins[wid]) room.gameWins[wid] = [];
                room.gameWins[wid].push({ gameId: currentGame.id, gameLabel: currentGame.label, gameEmoji: currentGame.emoji });
              }
            }
          }

          const hasMore = room.currentRound < room.config.rounds;
          broadcast(room, {
            type: 'round-complete',
            roundScores: { ...room.pendingScores },
            roundBreakdowns: room.pendingBreakdowns ? { ...room.pendingBreakdowns } : null,
            totalScores: { ...room.scores },
            hasMore,
            round: room.currentRound,
            totalRounds: room.config.rounds,
            players: publicPlayers(room),
            teamsMap: room.teamsMap ?? null,
          });
          room.pendingScores = {};
          room.pendingBreakdowns = {};
        }
        break;
      }

      case 'return-lobby': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room || !room.started) {
          return send(socket, { type: 'error', message: 'Partie introuvable.' });
        }
        const savedId = msg.playerId;
        const player = savedId ? room.players.get(savedId) : null;
        if (!player) {
          return send(socket, { type: 'error', message: 'Joueur inconnu.' });
        }

        clearTimeout(room._cleanupTimer);
        room._cleanupTimer = null;
        player.socket = socket;
        playerId = savedId;
        currentRoom = room;

        if (!room.returnedPlayers) room.returnedPlayers = new Set();
        room.returnedPlayers.add(playerId);

        const connectedBack = [...room.players.values()].filter(
          p => p.socket && p.socket.readyState === p.socket.OPEN
        );
        const allBack = connectedBack.every(p => room.returnedPlayers.has(p.id));

        if (allBack) {
          room.returnedPlayers = new Set();
          if (room.currentRound >= room.config.rounds) {
            // Tournoi terminé
            broadcast(room, {
              type: 'tournament-end',
              totalScores: { ...room.scores },
              players: publicPlayers(room),
              teamsMap: room.teamsMap ?? null,
              totalRounds: room.config.rounds,
              gameWins: room.gameWins ?? {},
            });
          } else {
            broadcastRoulette(room);
          }
        } else {
          broadcast(room, {
            type: 'waiting-return',
            returned: room.returnedPlayers.size,
            total: room.players.size,
          });
        }
        break;
      }

      case 'relay': {
        if (!currentRoom) return;
        const out = JSON.stringify({ type: 'relay', from: playerId, data: msg.data });
        for (const p of currentRoom.players.values()) {
          if (p.id !== playerId && p.socket && p.socket.readyState === p.socket.OPEN) {
            p.socket.send(out);
          }
        }
        break;
      }

      // ---- Phase « course » multijoueur (page racing.html) ----

      // Le joueur arrive sur la page de course : on le ré-associe à son salon
      // grâce au playerId transmis dans l'URL (sinon on l'ajoute comme nouveau
      // participant). On annule tout délai de grâce en cours.
      case 'race-hello': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) return send(socket, { type: 'race-gone' });
        if (room.graceTimer) {
          clearTimeout(room.graceTimer);
          room.graceTimer = null;
        }
        if (currentRoom && currentRoom !== room) leaveRoom();

        let player = msg.pid ? room.players.get(msg.pid) : null;
        if (player) {
          player.socket = socket;
          player.connected = true;
          if (msg.name) player.name = sanitizeName(msg.name);
        } else {
          playerId = makeId();
          player = { id: playerId, name: sanitizeName(msg.name), socket, connected: true };
          room.players.set(playerId, player);
        }
        playerId = player.id;
        currentRoom = room;
        if (!room.phase) room.phase = 'waiting';
        if (room.raceMapIndex == null) room.raceMapIndex = 0;
        // Si l'hôte désigné n'est pas (ou plus) connecté, le premier arrivé
        // récupère la main pour pouvoir lancer la course.
        const host = room.players.get(room.hostId);
        if (!host || !host.connected) room.hostId = player.id;

        send(socket, {
          type: 'race-welcome',
          you: player.id,
          hostId: room.hostId,
          mapIndex: room.raceMapIndex,
          phase: room.phase,
          players: racePlayers(room),
        });
        broadcast(room, { type: 'race-roster', players: racePlayers(room), hostId: room.hostId });
        break;
      }

      // L'hôte change le circuit choisi dans la salle d'attente.
      case 'race-setmap': {
        const room = currentRoom;
        if (!room || room.hostId !== playerId) return;
        room.raceMapIndex = msg.mapIndex | 0;
        broadcast(room, { type: 'race-map', mapIndex: room.raceMapIndex });
        break;
      }

      // L'hôte lance la course : on attribue une place (slot) à chaque joueur
      // connecté et on diffuse le top départ. Chaque client lance son propre
      // décompte 3-2-1 à la réception.
      // L'hôte lance un Grand Prix : on tire un ordre aléatoire de tous les
      // circuits et on démarre la première manche. Les manches suivantes sont
      // enchaînées via « race-next ».
      case 'race-go': {
        const room = currentRoom;
        if (!room || room.hostId !== playerId) return;
        const n = Math.max(1, (msg.maps | 0) || 1);
        if (msg.single) {
          // Circuit unique choisi par l'hôte : une seule manche sur cette carte.
          const idx = Math.max(0, Math.min(n - 1, msg.mapIndex | 0));
          room.raceOrder = [idx];
        } else {
          // Grand Prix : tous les circuits dans un ordre aléatoire.
          room.raceOrder = shuffleInPlace([...Array(n).keys()]);
        }
        room.raceSeq = 0;
        startRaceRound(room);
        break;
      }

      // L'hôte passe au circuit suivant du Grand Prix en cours.
      case 'race-next': {
        const room = currentRoom;
        if (!room || room.hostId !== playerId) return;
        if (!room.raceOrder || room.raceSeq >= room.raceOrder.length - 1) return;
        room.raceSeq++;
        startRaceRound(room);
        break;
      }

      // Position d'un joueur, relayée telle quelle aux autres membres.
      case 'race-state': {
        const room = currentRoom;
        if (!room || room.phase !== 'racing') return;
        broadcastExcept(room, playerId, { type: 'race-peer', id: playerId, s: msg.s });
        break;
      }

      // Un joueur franchit la ligne d'arrivée.
      case 'race-finish': {
        const room = currentRoom;
        if (!room) return;
        const p = room.players.get(playerId);
        if (p) {
          p.finished = true;
          p.finishTime = msg.time;
        }
        broadcast(room, { type: 'race-finished', id: playerId, time: msg.time });
        break;
      }

      // L'hôte renvoie tout le monde vers la salle d'attente / choix du circuit.
      case 'race-tomenu': {
        const room = currentRoom;
        if (!room || room.hostId !== playerId) return;
        room.phase = 'waiting';
        broadcast(room, { type: 'race-tolobby', mapIndex: room.raceMapIndex, hostId: room.hostId });
        break;
      }

      case 'leave': {
        leaveRoom();
        break;
      }

      default:
        send(socket, { type: 'error', message: 'Action inconnue.' });
    }
  });

  socket.on('close', () => handleClose());
  socket.on('error', () => handleClose());
});
