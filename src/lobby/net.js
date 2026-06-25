// Petit client WebSocket pour le lobby.
// Gère la connexion et expose des événements simples au contrôleur d'UI.

// En dev : serveur Node local sur le port 8080.
// En prod : adapter à ton hébergement (même hôte en wss).
const WS_URL = import.meta.env.DEV
  ? `ws://${location.hostname}:8080`
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

export class LobbyClient {
  constructor() {
    this.socket = null;
    this.handlers = new Map();
    this.queue = [];
  }

  on(type, fn) {
    this.handlers.set(type, fn);
    return this;
  }

  _emit(type, data) {
    const fn = this.handlers.get(type);
    if (fn) fn(data);
  }

  connect() {
    if (this.socket && this.socket.readyState <= 1) return;
    this.socket = new WebSocket(WS_URL);

    this.socket.addEventListener('open', () => {
      this._emit('open');
      // Vider la file d'attente des messages envoyés avant ouverture
      this.queue.forEach((m) => this.socket.send(m));
      this.queue = [];
    });

    this.socket.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this._emit(msg.type, msg);
    });

    this.socket.addEventListener('close', () => this._emit('close'));
    this.socket.addEventListener('error', () => this._emit('neterror'));
  }

  send(payload) {
    const data = JSON.stringify(payload);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    } else {
      this.queue.push(data);
      this.connect();
    }
  }

  create(name) {
    this.send({ type: 'create', name });
  }

  join(code, name) {
    this.send({ type: 'join', code, name });
  }

  start() {
    this.send({ type: 'start' });
  }

  spin() {
    this.send({ type: 'spin' });
  }

  leave() {
    this.send({ type: 'leave' });
  }
}
