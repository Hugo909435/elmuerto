// Owns the aiming UX. Two input paths, both producing the same { dir, power }:
//   • Pointer drag (mouse/touch): slingshot — drag away from the target, the
//     ball launches in the OPPOSITE direction with power ∝ drag length.
//   • Keyboard fallback: arrows rotate the aim and adjust power, Space shoots.
//
// Draws a ground arrow whose length/color reflects power. Only acts while the
// ball is stopped (phase === 'aiming').

import * as THREE from 'three';
import { EventBus, Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';
import { AIM, COLORS, BALL } from '../core/Constants.js';

export class AimController {
  constructor(scene) {
    this.scene = scene;
    this.ball = null;

    this.dragging = false;
    this._dragStart = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1); // current aim direction
    this.power = 0; // 0..1

    // Keyboard charge state.
    this._keys = new Set();
    this._charging = false;

    this._buildIndicator();

    EventBus.on(Events.POINTER_DOWN, (p) => this._onDown(p));
    EventBus.on(Events.POINTER_MOVE, (p) => this._onMove(p));
    EventBus.on(Events.POINTER_UP, (p) => this._onUp(p));
    EventBus.on(Events.KEY_DOWN, ({ code }) => this._onKeyDown(code));
    EventBus.on(Events.KEY_UP, ({ code }) => this._onKeyUp(code));
    EventBus.on(Events.BALL_MOVING, () => this._hideIndicator());
    EventBus.on(Events.HOLE_LOADED, () => {
      this.dir.set(0, 0, -1);
      this.power = 0;
      this.dragging = false;
      this._charging = false;
      this._hideIndicator();
    });
  }

  setBall(ball) {
    this.ball = ball;
  }

  _canAim() {
    return GameState.phase === 'aiming' && this.ball && !GameState.ballMoving;
  }

  // ---------- Pointer (slingshot) ----------
  _onDown({ world }) {
    if (!this._canAim()) return;
    this.dragging = true;
    this._dragStart.copy(this.ball.position);
    EventBus.emit(Events.BALL_AIM_START);
  }

  _onMove({ world }) {
    if (!this.dragging) return;
    // Vector from pointer to ball → shoot direction (slingshot pull-back).
    const dx = this._dragStart.x - world.x;
    const dz = this._dragStart.z - world.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) {
      this.power = 0;
      this._hideIndicator();
      return;
    }
    this.dir.set(dx / len, 0, dz / len);
    this.power = Math.min(len / AIM.MAX_DRAG_WORLD, 1);
    this._updateIndicator();
  }

  _onUp() {
    if (!this.dragging) return;
    this.dragging = false;
    this._shoot();
  }

  // ---------- Keyboard ----------
  _onKeyDown(code) {
    if (!this._canAim()) return;
    this._keys.add(code);
    if (code === 'Space' || code === 'Enter') {
      this._charging = true;
    }
  }

  _onKeyUp(code) {
    this._keys.delete(code);
    if ((code === 'Space' || code === 'Enter') && this._charging) {
      this._charging = false;
      this._shoot();
    }
  }

  // Called every frame from Game so keyboard aiming is smooth & frame-rate based.
  update(dt) {
    if (!this._canAim()) return;
    let changed = false;
    if (this._keys.has('ArrowLeft') || this._keys.has('KeyA')) {
      this.dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), AIM.KEY_ROTATE_SPEED * dt);
      changed = true;
    }
    if (this._keys.has('ArrowRight') || this._keys.has('KeyD')) {
      this.dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -AIM.KEY_ROTATE_SPEED * dt);
      changed = true;
    }
    if (this._charging) {
      // Ping-pong the power while space is held.
      this.power += AIM.KEY_POWER_SPEED * dt * (this._chargeDir || 1);
      if (this.power >= 1) {
        this.power = 1;
        this._chargeDir = -1;
      } else if (this.power <= 0) {
        this.power = 0;
        this._chargeDir = 1;
      }
      changed = true;
    } else if (changed && this.power < AIM.MIN_POWER) {
      // Show a default preview length while only rotating.
      this.power = 0.5;
    }
    if (changed) this._updateIndicator();
  }

  _shoot() {
    if (this.power < AIM.MIN_POWER) {
      this.power = 0;
      this._hideIndicator();
      return;
    }
    const dir = this.dir.clone();
    const power = this.power;
    this.power = 0;
    this._chargeDir = 1;
    this._hideIndicator();
    EventBus.emit(Events.BALL_SHOOT, { dir, power });
  }

  // ---------- Indicator visuals ----------
  _buildIndicator() {
    this.group = new THREE.Group();
    this.group.visible = false;

    const shaftGeo = new THREE.PlaneGeometry(0.18, 1);
    shaftGeo.translate(0, 0.5, 0); // anchor at base
    shaftGeo.rotateX(-Math.PI / 2);
    this._shaftMat = new THREE.MeshBasicMaterial({
      color: COLORS.AIM,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.shaft = new THREE.Mesh(shaftGeo, this._shaftMat);

    const headGeo = new THREE.ConeGeometry(0.45, 0.9, 3);
    headGeo.rotateX(Math.PI / 2);
    this.head = new THREE.Mesh(headGeo, this._shaftMat);

    this.group.add(this.shaft);
    this.group.add(this.head);
    this.scene.add(this.group);
  }

  _updateIndicator() {
    if (!this.ball || this.power <= 0) {
      this._hideIndicator();
      return;
    }
    const p = this.ball.position;
    this.group.position.set(p.x, 0.05, p.z);
    const angle = Math.atan2(this.dir.x, this.dir.z);
    this.group.rotation.y = angle;

    const maxLen = 10;
    const len = 1 + this.power * maxLen;
    this.shaft.scale.set(1, 1, len - 0.8);
    this.head.position.set(0, 0, len - 0.45);

    // Color shifts from yellow → red as power approaches max.
    this._shaftMat.color.lerpColors(
      new THREE.Color(COLORS.AIM),
      new THREE.Color(COLORS.AIM_MAX),
      this.power,
    );
    this.group.visible = true;
  }

  _hideIndicator() {
    if (this.group) this.group.visible = false;
  }

  dispose() {
    if (!this.group) return;
    this.scene.remove(this.group);
    this.shaft.geometry.dispose();
    this.head.geometry.dispose();
    this._shaftMat.dispose();
  }
}
