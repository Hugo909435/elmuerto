// Owns the ball's velocity integration: rolling friction, wall bounces and
// hole detection. Pure simulation — it mutates the Ball's position and emits
// events; it never touches rendering or UI directly.

import * as THREE from 'three';
import { EventBus, Events } from '../core/EventBus.js';
import { BALL, HOLE } from '../core/Constants.js';

export class PhysicsSystem {
  constructor() {
    this.ball = null; // gameplay/Ball instance
    this.bounds = null; // { minX, maxX, minZ, maxZ } inner play area
    this.obstacles = []; // array of THREE.Box3 (XZ extents)
    this.cup = new THREE.Vector2(); // hole center (x, z)

    this.velocity = new THREE.Vector3();
    this.active = false; // ball is rolling

    this._tmp = new THREE.Vector3();

    EventBus.on(Events.BALL_SHOOT, ({ dir, power }) => this._launch(dir, power));
  }

  configure({ ball, bounds, obstacles, cup }) {
    this.ball = ball;
    this.bounds = bounds;
    this.obstacles = obstacles || [];
    this.cup.set(cup.x, cup.z);
    this.velocity.set(0, 0, 0);
    this.active = false;
  }

  _launch(dir, power) {
    if (!this.ball || this.active) return;
    const speed = BALL.MAX_LAUNCH_SPEED * power;
    this.velocity.set(dir.x, 0, dir.z).normalize().multiplyScalar(speed);
    this.active = true;
    EventBus.emit(Events.BALL_MOVING);
  }

  update(dt) {
    if (!this.active || !this.ball) return;

    const r = BALL.RADIUS;
    const pos = this.ball.position;

    // --- Hole capture: if close to the cup and slow enough, sink it. ---
    const dx = pos.x - this.cup.x;
    const dz = pos.z - this.cup.y;
    const distToCup = Math.hypot(dx, dz);
    const speed = this.velocity.length();
    if (distToCup < HOLE.RADIUS && speed < HOLE.SINK_SPEED) {
      this.active = false;
      this.velocity.set(0, 0, 0);
      EventBus.emit(Events.BALL_SUNK, { cup: { x: this.cup.x, z: this.cup.y } });
      return;
    }
    // A ball that rolls over the cup too fast gets a slight pull (lip).
    if (distToCup < HOLE.RADIUS * 1.4) {
      this._tmp.set(this.cup.x - pos.x, 0, this.cup.y - pos.z);
      this.velocity.addScaledVector(this._tmp, 6 * dt);
    }

    // --- Integrate position ---
    pos.x += this.velocity.x * dt;
    pos.z += this.velocity.z * dt;

    // --- Outer wall collisions (reflect + lose energy) ---
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

    // --- Obstacle (axis-aligned box) collisions ---
    for (const box of this.obstacles) {
      if (this._collideBox(pos, r, box)) hit = true;
    }

    if (hit) EventBus.emit(Events.BALL_WALL_HIT, { speed: this.velocity.length() });

    // --- Rolling friction (frame-rate independent exponential damping) ---
    const damp = Math.pow(BALL.FRICTION, dt);
    this.velocity.multiplyScalar(damp);

    // --- Stop condition ---
    if (this.velocity.length() < BALL.STOP_SPEED) {
      this.velocity.set(0, 0, 0);
      this.active = false;
      EventBus.emit(Events.BALL_STOPPED, {
        position: { x: pos.x, z: pos.z },
      });
    }
  }

  // Resolve a circle-vs-AABB collision in the XZ plane by pushing the ball out
  // along the least-penetration axis and reflecting the matching velocity.
  _collideBox(pos, r, box) {
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
