// Client WebSocket pour la pétanque.
// Reconnecte à la room lobby après redirect, puis relaye les événements de jeu.

// Passe toujours par /ws (proxy Vite en dev, tunnel cloudflared compris)
const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

export class PetanqueNet {
  constructor() {
    this.socket = null;
    this._handlers = new Map();
  }

  on(type, fn) {
    this._handlers.set(type, fn);
    return this;
  }

  _emit(type, data) {
    const fn = this._handlers.get(type);
    if (fn) fn(data);
  }

  connect(code, playerId) {
    this.socket = new WebSocket(WS_URL);

    this.socket.addEventListener('open', () => {
      this.socket.send(JSON.stringify({ type: 'game-connect', code, playerId }));
    });

    this.socket.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'relay') {
        this._emit('relay', msg.data);
      } else {
        this._emit(msg.type, msg);
      }
    });

    this.socket.addEventListener('close', () => this._emit('disconnect'));
    this.socket.addEventListener('error', () => this._emit('neterror'));
  }

  relay(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'relay', data }));
    }
  }
}
