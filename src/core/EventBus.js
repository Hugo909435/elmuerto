// Singleton pub/sub bus. ALL inter-module communication flows through here.
// Event names use the `domain:action` convention.

class EventBusClass {
  constructor() {
    this._listeners = new Map();
  }

  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(cb);
    return () => this.off(event, cb);
  }

  once(event, cb) {
    const wrapped = (payload) => {
      this.off(event, wrapped);
      cb(payload);
    };
    return this.on(event, wrapped);
  }

  off(event, cb) {
    const set = this._listeners.get(event);
    if (set) set.delete(cb);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    // Copy to allow listeners to unsubscribe during emit.
    for (const cb of [...set]) cb(payload);
  }

  clear() {
    this._listeners.clear();
  }
}

export const EventBus = new EventBusClass();

// Canonical list of all game events.
export const Events = {
  GAME_START: 'game:start',
  GAME_RESET: 'game:reset',
  HOLE_LOADED: 'hole:loaded',
  HOLE_COMPLETE: 'hole:complete',
  COURSE_COMPLETE: 'course:complete',

  BALL_AIM_START: 'ball:aimStart',
  BALL_AIM_UPDATE: 'ball:aimUpdate',
  BALL_AIM_CANCEL: 'ball:aimCancel',
  BALL_SHOOT: 'ball:shoot',
  BALL_MOVING: 'ball:moving',
  BALL_STOPPED: 'ball:stopped',
  BALL_SUNK: 'ball:sunk',
  BALL_WALL_HIT: 'ball:wallHit',

  STROKE_ADDED: 'stroke:added',

  POINTER_DOWN: 'input:pointerDown',
  POINTER_MOVE: 'input:pointerMove',
  POINTER_UP: 'input:pointerUp',
  KEY_DOWN: 'input:keyDown',
  KEY_UP: 'input:keyUp',

  AUDIO_TOGGLE_MUTE: 'audio:toggleMute',
};
