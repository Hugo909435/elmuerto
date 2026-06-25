// Physique des boules : vol parabolique, atterrissage, roulement avec friction,
// collisions élastiques sphère-sphère et sphère-mur.

import * as THREE from 'three';

export const BALL_R = 0.45;
export const COCK_R = 0.18;

const GRAVITY = 18;       // m/s² (légèrement exagéré pour le fun)
const FRICTION = 0.07;    // fraction de vitesse conservée par seconde
const STOP_SPEED = 0.28;
const WALL_REST = 0.42;   // restitution mur
const BALL_REST = 0.80;   // restitution boule-boule

export class BallPhysics {
  constructor(bounds) {
    // bounds : {minX, maxX, minZ, maxZ} — zone de jeu (centre de boule)
    this.bounds = bounds;
    this.balls = []; // {mesh, pos:Vector3, vel:Vector3, radius, inFlight, stopped, owner}
  }

  addBall(mesh, startPos, startVel, radius, owner) {
    const entry = {
      mesh,
      pos: startPos.clone(),
      vel: startVel.clone(),
      radius,
      inFlight: true,
      stopped: false,
      owner,
    };
    this.balls.push(entry);
    return entry;
  }

  clear() {
    this.balls = [];
  }

  update(dt) {
    for (const b of this.balls) {
      if (b.stopped) continue;

      if (b.inFlight) {
        // Vol parabolique.
        b.vel.y -= GRAVITY * dt;
        b.pos.x += b.vel.x * dt;
        b.pos.y += b.vel.y * dt;
        b.pos.z += b.vel.z * dt;

        if (b.pos.y <= b.radius) {
          b.pos.y = b.radius;
          b.vel.y = 0;
          // Perte d'énergie à l'atterrissage.
          b.vel.x *= 0.52;
          b.vel.z *= 0.52;
          b.inFlight = false;
        }
      } else {
        // Roulement avec friction exponentielle.
        const damp = Math.pow(FRICTION, dt);
        b.vel.x *= damp;
        b.vel.z *= damp;
        b.pos.x += b.vel.x * dt;
        b.pos.z += b.vel.z * dt;

        // Murs.
        const bd = this.bounds;
        if (b.pos.x - b.radius < bd.minX) {
          b.pos.x = bd.minX + b.radius;
          b.vel.x = Math.abs(b.vel.x) * WALL_REST;
        } else if (b.pos.x + b.radius > bd.maxX) {
          b.pos.x = bd.maxX - b.radius;
          b.vel.x = -Math.abs(b.vel.x) * WALL_REST;
        }
        if (b.pos.z - b.radius < bd.minZ) {
          b.pos.z = bd.minZ + b.radius;
          b.vel.z = Math.abs(b.vel.z) * WALL_REST;
        } else if (b.pos.z + b.radius > bd.maxZ) {
          b.pos.z = bd.maxZ - b.radius;
          b.vel.z = -Math.abs(b.vel.z) * WALL_REST;
        }

        if (Math.hypot(b.vel.x, b.vel.z) < STOP_SPEED) {
          b.vel.set(0, 0, 0);
          b.stopped = true;
        }
      }

      b.mesh.position.copy(b.pos);
    }

    this._resolveCollisions();
  }

  _resolveCollisions() {
    const balls = this.balls;
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        if (a.inFlight && b.inFlight) continue;

        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const dist = Math.hypot(dx, dz);
        const minDist = a.radius + b.radius;
        if (dist >= minDist || dist < 1e-6) continue;

        const nx = dx / dist, nz = dz / dist;
        const overlap = minDist - dist;

        // Séparation (pondérée si une balle est arrêtée).
        const wa = b.stopped ? 1 : 0.5;
        const wb = a.stopped ? 1 : 0.5;
        a.pos.x -= nx * overlap * wa;
        a.pos.z -= nz * overlap * wa;
        b.pos.x += nx * overlap * wb;
        b.pos.z += nz * overlap * wb;

        // Échange de vitesses sur la normale (collision élastique 1D, masses égales).
        const relVx = b.vel.x - a.vel.x;
        const relVz = b.vel.z - a.vel.z;
        const dot = relVx * nx + relVz * nz;
        if (dot < 0) {
          const imp = dot * BALL_REST;
          a.vel.x += imp * nx;
          a.vel.z += imp * nz;
          b.vel.x -= imp * nx;
          b.vel.z -= imp * nz;
          a.stopped = false;
          b.stopped = false;
          a.inFlight = false;
          b.inFlight = false;
          a.pos.y = a.radius;
          b.pos.y = b.radius;
        }

        a.mesh.position.copy(a.pos);
        b.mesh.position.copy(b.pos);
      }
    }
  }

  allStopped() {
    return this.balls.every(b => b.stopped);
  }

  distToPoint(ball, px, pz) {
    return Math.hypot(ball.pos.x - px, ball.pos.z - pz);
  }
}
