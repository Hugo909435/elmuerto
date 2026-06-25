// Serveur de salons (lobby) pour parties privées.
// WebSocket simple : créer une partie -> code à 4 lettres, rejoindre par code,
// liste des joueurs en temps réel, lancement par l'hôte.

import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8080;

/** @type {Map<string, Room>} */
const rooms = new Map();

/**
 * @typedef {Object} Player
 * @property {string} id
 * @property {string} name
 * @property {import('ws').WebSocket} socket
 *
 * @typedef {Object} Room
 * @property {string} code
 * @property {string} hostId
 * @property {Map<string, Player>} players
 * @property {boolean} started
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I,O,0,1 ambigus

// Mini-jeux disponibles sur la roue.
const GAMES = [
  { id: 'minigolf', label: 'Mini Golf', emoji: '⛳', url: 'minigolf.html' },
  { id: 'racing', label: 'Course', emoji: '🏎️', url: 'racing.html' },
];

// Construit les segments de la roue : on répète les jeux pour une roue
// plus garnie, en alternant les couleurs.
const SEGMENT_COLORS = ['#4ade80', '#38bdf8', '#22a85a', '#0ea5e9', '#a78bfa', '#f59e0b'];
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
    for (let i = 0; i < 4; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
  } while (rooms.has(code));
  return code;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function publicPlayers(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    isHost: p.id === room.hostId,
  }));
}

function broadcast(room, payload) {
  const msg = JSON.stringify(payload);
  for (const p of room.players.values()) {
    if (p.socket.readyState === p.socket.OPEN) p.socket.send(msg);
  }
}

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

function sanitizeName(name) {
  return (typeof name === 'string' ? name : '').trim().slice(0, 16) || 'Joueur';
}

const wss = new WebSocketServer({ port: PORT });
console.log(`Serveur de lobby en écoute sur ws://localhost:${PORT}`);

wss.on('connection', (socket) => {
  // État par connexion
  let currentRoom = null;
  let playerId = null;

  function leaveRoom() {
    if (!currentRoom) return;
    const room = currentRoom;
    room.players.delete(playerId);
    currentRoom = null;

    if (room.players.size === 0) {
      rooms.delete(room.code);
      return;
    }
    // Réassigner l'hôte si l'hôte est parti
    if (room.hostId === playerId) {
      room.hostId = room.players.keys().next().value;
    }
    broadcast(room, { type: 'players', players: publicPlayers(room) });
  }

  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(socket, { type: 'error', message: 'Message invalide.' });
    }

    switch (msg.type) {
      case 'create': {
        if (currentRoom) leaveRoom();
        const code = makeCode();
        playerId = makeId();
        const player = { id: playerId, name: sanitizeName(msg.name), socket };
        const room = {
          code,
          hostId: playerId,
          players: new Map([[playerId, player]]),
          started: false,
        };
        rooms.set(code, room);
        currentRoom = room;
        send(socket, {
          type: 'created',
          code,
          playerId,
          players: publicPlayers(room),
        });
        break;
      }

      case 'join': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) {
          return send(socket, { type: 'error', message: 'Partie introuvable.' });
        }
        if (room.started) {
          return send(socket, { type: 'error', message: 'La partie a déjà commencé.' });
        }
        if (room.players.size >= 8) {
          return send(socket, { type: 'error', message: 'La partie est pleine.' });
        }
        if (currentRoom) leaveRoom();
        playerId = makeId();
        const player = { id: playerId, name: sanitizeName(msg.name), socket };
        room.players.set(playerId, player);
        currentRoom = room;
        send(socket, {
          type: 'joined',
          code: room.code,
          playerId,
          players: publicPlayers(room),
        });
        broadcast(room, { type: 'players', players: publicPlayers(room) });
        break;
      }

      case 'start': {
        if (!currentRoom) return;
        if (currentRoom.hostId !== playerId) {
          return send(socket, { type: 'error', message: "Seul l'hôte peut lancer." });
        }
        const room = currentRoom;
        room.started = true;
        // Un joueur tiré au sort aura le droit de faire tourner la roue.
        const ids = [...room.players.keys()];
        room.spinnerId = ids[Math.floor(Math.random() * ids.length)];
        room.wheel = buildWheel();
        room.spun = false;
        broadcast(room, {
          type: 'roulette',
          wheel: room.wheel,
          spinnerId: room.spinnerId,
          players: publicPlayers(room),
        });
        break;
      }

      case 'spin': {
        const room = currentRoom;
        if (!room || !room.started) return;
        if (room.spinnerId !== playerId) {
          return send(socket, {
            type: 'error',
            message: "Ce n'est pas à toi de lancer la roue.",
          });
        }
        if (room.spun) return; // un seul lancer
        room.spun = true;
        // Le serveur décide du résultat : tous les clients verront la même roue.
        room.resultIndex = Math.floor(Math.random() * room.wheel.length);
        broadcast(room, { type: 'spin-result', resultIndex: room.resultIndex });
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

  socket.on('close', () => leaveRoom());
  socket.on('error', () => leaveRoom());
});
