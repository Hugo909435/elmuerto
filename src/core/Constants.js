// All tunable values, balance numbers, colors and layout live here.
// Never hardcode magic numbers in game logic.

function _readSafeInsets() {
  const s = getComputedStyle(document.documentElement);
  return {
    top: parseInt(s.getPropertyValue('--ogp-safe-top-inset')) || 0,
    bottom: parseInt(s.getPropertyValue('--ogp-safe-bottom-inset')) || 0,
  };
}
const _insets = _readSafeInsets();

export const SAFE_ZONE = {
  TOP_PX: Math.max(75, _insets.top),
  BOTTOM_PX: _insets.bottom,
  TOP_PERCENT: 8,
};

export const WORLD = {
  GRAVITY: -20, // used only for the sinking animation
  GROUND_Y: 0,
};

export const BALL = {
  RADIUS: 0.35,
  // Exponential ground damping: speed retained per second (rolling friction).
  FRICTION: 0.12, // fraction of speed kept after 1s (lower = stops faster)
  STOP_SPEED: 0.35, // below this the ball is considered stopped
  MAX_LAUNCH_SPEED: 26, // speed at full power
  WALL_RESTITUTION: 0.7, // energy kept after a wall bounce
};

export const AIM = {
  // Drag distance (in world units) that maps to full power.
  MAX_DRAG_WORLD: 9,
  MIN_POWER: 0.04, // below this a release does nothing
  KEY_ROTATE_SPEED: 2.2, // rad/s when aiming with arrow keys
  KEY_POWER_SPEED: 0.9, // power/s when charging with arrow keys
};

export const HOLE = {
  RADIUS: 0.55, // cup radius
  SINK_SPEED: 9, // ball must be slower than this to drop in
};

export const CAMERA = {
  FOV: 55,
  NEAR: 0.1,
  FAR: 200,
  // Offset from the course center, looking down at an angle.
  OFFSET: { x: 0, y: 24, z: 18 },
  LOOK_AT: { x: 0, y: 0, z: -2 },
};

export const COLORS = {
  SKY: 0x0b1f12,
  GREEN: 0x2e8b4f,
  GREEN_DARK: 0x256e40,
  WALL: 0x6b4a2b,
  WALL_TOP: 0x8a6238,
  BALL: 0xffffff,
  HOLE: 0x05140a,
  FLAG_POLE: 0xeeeeee,
  FLAG: 0xe23b3b,
  AIM: 0xffe27a,
  AIM_MAX: 0xff5a5a,
  OBSTACLE: 0x3a3f47,
};

// Each hole: green size, ball start, cup position, optional box obstacles, par.
export const COURSE = [
  {
    size: { w: 16, d: 26 },
    start: { x: 0, z: 9 },
    cup: { x: 0, z: -9 },
    par: 2,
    obstacles: [],
  },
  {
    size: { w: 16, d: 28 },
    start: { x: -5, z: 10 },
    cup: { x: 5, z: -10 },
    par: 3,
    obstacles: [{ x: 0, z: 0, w: 6, d: 1.4 }],
  },
  {
    size: { w: 18, d: 28 },
    start: { x: -6, z: 10 },
    cup: { x: 6, z: -10 },
    par: 4,
    obstacles: [
      { x: -2.5, z: 2, w: 1.4, d: 9 },
      { x: 3, z: -3, w: 1.4, d: 9 },
    ],
  },
];

export const AUDIO = {
  PUTT_FREQ: 180,
  WALL_FREQ: 120,
  SINK_FREQ: 660,
};
