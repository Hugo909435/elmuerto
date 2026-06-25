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
  GRAVITY: -32, // m/s² — drives the ball's flight through the air
  GROUND_Y: 0,
};

export const BALL = {
  RADIUS: 0.35,
  // Exponential damping: fraction of horizontal speed kept after 1s.
  FRICTION: 0.2, // rolling friction on the ground (lower = stops faster)
  AIR_DRAG: 0.6, // gentle drag while airborne
  STOP_SPEED: 0.4, // below this (on the ground) the ball is considered stopped
  MAX_LAUNCH_SPEED: 52, // horizontal speed at full power (long course)
  WALL_RESTITUTION: 0.6, // horizontal energy kept after a wall bounce
  BOUNCE_RESTITUTION: 0.5, // vertical energy kept when the ball lands
};

// Auto-arc launch: low power rolls flat, higher power lofts the ball higher.
export const SHOT = {
  LOFT_START: 0.25, // below this power the shot stays on the ground
  MAX_LAUNCH_VY: 19, // upward launch speed at full power
};

// Corridor walls are tall enough to keep the ball on the fairway; a very
// powerful arc can still fly over them to cut the dogleg corner.
export const WALL = {
  THICKNESS: 1,
  HEIGHT: 2.2,
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
  FAR: 400,
  // Third-person follow: offset added to the ball position each frame.
  // High + pulled back so the whole bending fairway reads clearly.
  FOLLOW: { x: 0, y: 30, z: 24 },
  SMOOTH: 3.2, // higher = snappier follow (exponential easing rate)
  LOOK_AHEAD: 3, // look slightly past the ball toward the hole (z-)
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

// The course. A single long TWO-LEVEL hole.
//   • The HIGH route is a straight elevated bridge (y = UPPER) running from the
//     start almost to the cup: stay on it and you reach the hole fast.
//   • Fall off the narrow bridge and you drop to the LOW floor (y = 0), a long
//     zigzag the bridge flies over — you still reach the cup, but the long way.
//
//   • tiles — grass rectangles (center x,z + size w,d + floor height y).
//   • walls — boxes (center x,z + size w,d + height h). Tall outer walls contain
//     everything; low inner walls (h below the bridge) only block the low floor.
// Overall extent: x −24..24, z −46..46 (≈48 × 92 units).
const UPPER = 3.5; // bridge height
export const COURSE = [
  {
    par: 5,
    start: { x: 0, z: 42 }, // on the bridge, near end
    cup: { x: 0, z: -42 }, // low floor, far end (in a pocket)
    tiles: [
      { x: 0, z: 0, w: 48, d: 92, y: 0 }, // low floor (whole footprint)
      { x: 0, z: 5, w: 10, d: 82, y: UPPER }, // elevated bridge (x −5..5, z −36..46)
    ],
    walls: [
      // Outer boundary (tall — contains bridge-level shots).
      { x: -24, z: 0, w: 1.5, d: 93, h: 5 },
      { x: 24, z: 0, w: 1.5, d: 93, h: 5 },
      { x: 0, z: 46, w: 49.5, d: 1.5, h: 5 },
      { x: 0, z: -46, w: 49.5, d: 1.5, h: 5 },
      // Low-floor zigzag (h below the bridge → the bridge flies over them).
      { x: -9, z: 32, w: 30, d: 1.5, h: 2.2 }, // gap on the right
      { x: 9, z: 16, w: 30, d: 1.5, h: 2.2 }, // gap on the left
      { x: -9, z: 0, w: 30, d: 1.5, h: 2.2 }, // gap on the right
      { x: 9, z: -16, w: 30, d: 1.5, h: 2.2 }, // gap on the left
      { x: -9, z: -30, w: 30, d: 1.5, h: 2.2 }, // gap on the right
      // Cup pocket (open toward +z, where both routes arrive).
      { x: -6, z: -42, w: 1, d: 9, h: 2.2 },
      { x: 6, z: -42, w: 1, d: 9, h: 2.2 },
    ],
  },
];

export const AUDIO = {
  PUTT_FREQ: 180,
  WALL_FREQ: 120,
  SINK_FREQ: 660,
};
