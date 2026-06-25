// Owns the ball's velocity integration in full 3D: gravity, flight through the
// air, landing on whichever floor is under the ball (low ground OR an elevated
// bridge), ground bounces, rolling friction, wall bounces and hole detection.
// Pure simulation — it mutates the Ball's position and emits events.

import * as THREE from 'three';
import { EventBus, Events } from '../core/EventBus.js';
import { BALL, HOLE, WORLD, SHOT } from '../core/Constants.js';

const EPS = 1e-3;

export class PhysicsSystem {
  constructor() {
    this.ball = null; // gameplay/Ball instance
    this.bounds = null; // { minX, maxX, minZ, maxZ } safety clamp
    this.obstacles = []; // array of THREE.Box3 (box.max.y = wall height)
    this.platforms = []; // elevated floor tiles { minX, maxX, minZ, maxZ, y }
    this.cup = new THREE.Vector2(); // hole center (x, z)

    this.velocity = new THREE.Vector3();
    this.active = false; // ball is in motion

    this._tmp = new THREE.Vector3();

    EventBus.on(Events.BALL_SHOOT, ({ dir, power }) => this._launch(dir, power));
  }

  configure({ ball, bounds, obstacles, platforms, cup }) {
    this.ball = ball;
    this.bounds = bounds;
    this.obstacles = obstacles || [];
    this.platforms = platforms || [];
    this.cup.set(cup.x, cup.z);
    this.velocity.set(0, 0, 0);
    this.active = false;
  }

  // Height of the floor under (x, z). The base floor is 0; an elevated platform
  // only counts if the ball is already at/above its top (refY), so the ball
  // lands ON a bridge when dropping onto it but never snaps up from underneath.
  groundHeight(x, z, refY) {
    let g = 0;
    for (const p of this.platforms) {
      if (p.y <= refY + 0.05 && x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) {
        if (p.y > g) g = p.y;
      }
    }
    return g;
  }

  _launch(dir, power) {
    if (!this.ball || this.active) return;
    const hSpeed = BALL.MAX_LAUNCH_SPEED * power;
    // Auto-arc: below LOFT_START the ball just rolls; above it, more power
    // adds more vertical lift → a higher, longer arc.
    const loft = Math.max(0, (power - SHOT.LOFT_START) / (1 - SHOT.LOFT_START));
    const vy = loft * SHOT.MAX_LAUNCH_VY;
    this._tmp.set(dir.x, 0, dir.z).normalize().multiplyScalar(hSpeed);
    this.velocity.set(this._tmp.x, vy, this._tmp.z);
    this.active = true;
    EventBus.emit(Events.BALL_MOVING);
  }

  update(dt) {
    if (!this.active || !this.ball) return;

    const r = BALL.RADIUS;
    const pos = this.ball.position;
    const prevBottom = pos.y - r; // ball underside before this step

    // --- Gravity + integrate ---
    this.velocity.y += WORLD.GRAVITY * dt;
    pos.x += this.velocity.x * dt;
    pos.y += this.velocity.y * dt;
    pos.z += this.velocity.z * dt;

    // --- Floor under the ball (low ground or a bridge it's resting on) ---
    const floor = this.groundHeight(pos.x, pos.z, prevBottom) + r;

    // --- Ground collision (land / bounce) ---
    let bounced = false;
    if (pos.y <= floor) {
      pos.y = floor;
      if (this.velocity.y < 0) {
        const impact = -this.velocity.y;
        if (impact > 2) {
          this.velocity.y = impact * BALL.BOUNCE_RESTITUTION; // bounce back up
          bounced = true;
        } else {
          this.velocity.y = 0; // settle onto the surface
        }
      }
    }
    const grounded = pos.y <= floor + EPS;

    // --- Hole capture (on the ground, slow, near the cup) ---
    if (grounded && this.velocity.y <= EPS) {
      const dx = pos.x - this.cup.x;
      const dz = pos.z - this.cup.y;
      const distToCup = Math.hypot(dx, dz);
      const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      if (distToCup < HOLE.RADIUS && hSpeed < HOLE.SINK_SPEED) {
        this.active = false;
        this.velocity.set(0, 0, 0);
        EventBus.emit(Events.BALL_SUNK, { cup: { x: this.cup.x, z: this.cup.y } });
        return;
      }
      if (distToCup < HOLE.RADIUS * 1.4) {
        this._tmp.set(this.cup.x - pos.x, 0, this.cup.y - pos.z);
        this.velocity.addScaledVector(this._tmp, 6 * dt);
      }
    }

    // --- Outer bounds: clamp in XZ at any height so the ball can't leave. ---
    const b = this.bounds;
    let hit = false;
    if (pos.x - r < b.minX) {
      pos.x = b.minX + r;
      this.velocity.x = Math.abs(this.velocity.x) * BALL.WALL_RESTITUTION;
      hit = true;
    } else if (pos.x + r > b.maxX) {
      pos.x = b.maxX - r;
      this.velocity.x = -Math.abs(this.velocity.x) * BALL.WALL_RESTITUTION;
      hit = true;
    }
    if (pos.z - r < b.minZ) {
      pos.z = b.minZ + r;
      this.velocity.z = Math.abs(this.velocity.z) * BALL.WALL_RESTITUTION;
      hit = true;
    } else if (pos.z + r > b.maxZ) {
      pos.z = b.maxZ - r;
      this.velocity.z = -Math.abs(this.velocity.z) * BALL.WALL_RESTITUTION;
      hit = true;
    }

    // --- Walls (height-aware: a high enough arc flies over them) ---
    for (const box of this.obstacles) {
      if (this._collideBox(pos, r, box)) hit = true;
    }

    if (hit || bounced) EventBus.emit(Events.BALL_WALL_HIT, { speed: this.velocity.length() });

    // --- Damping: rolling friction on a surface, gentle drag in the air. ---
    const damp = Math.pow(grounded ? BALL.FRICTION : BALL.AIR_DRAG, dt);
    this.velocity.x *= damp;
    this.velocity.z *= damp;

    // --- Stop condition (only once truly settled on a surface). ---
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (grounded && Math.abs(this.velocity.y) < 0.5 && hSpeed < BALL.STOP_SPEED) {
      this.velocity.set(0, 0, 0);
      this.active = false;
      EventBus.emit(Events.BALL_STOPPED, { position: { x: pos.x, z: pos.z } });
    }
  }

  // Resolve a circle-vs-AABB collision in the XZ plane by pushing the ball out
  // along the least-penetration axis and reflecting the matching velocity.
  // A ball whose underside is above the wall top simply passes over it.
  _collideBox(pos, r, box) {
    if (pos.y - r > box.max.y) return false;

    const minX = box.min.x - r;
    const maxX = box.max.x + r;
    const minZ = box.min.z - r;
    const maxZ = box.max.z + r;
    if (pos.x < minX || pos.x > maxX || pos.z < minZ || pos.z > maxZ) return false;

    const penLeft = pos.x - minX;
    const penRight = maxX - pos.x;
    const penNear = pos.z - minZ;
    const penFar = maxZ - pos.z;
    const minPen = Math.min(penLeft, penRight, penNear, penFar);

    if (minPen === penLeft) {
      pos.x = minX;
      this.velocity.x = -Math.abs(this.velocity.x) * BALL.WALL_RESTITUTION;
    } else if (minPen === penRight) {
      pos.x = maxX;
      this.velocity.x = Math.abs(this.velocity.x) * BALL.WALL_RESTITUTION;
    } else if (minPen === penNear) {
      pos.z = minZ;
      this.velocity.z = -Math.abs(this.velocity.z) * BALL.WALL_RESTITUTION;
    } else {
      pos.z = maxZ;
      this.velocity.z = Math.abs(this.velocity.z) * BALL.WALL_RESTITUTION;
    }
    return true;
  }
}
