// The golf ball: a simple mesh plus a sinking animation when it drops in the cup.

import * as THREE from 'three';
import { EventBus, Events } from '../core/EventBus.js';
import { BALL, COLORS, WORLD } from '../core/Constants.js';

export class Ball {
  constructor(scene) {
    this.scene = scene;
    this.geometry = new THREE.SphereGeometry(BALL.RADIUS, 24, 16);
    this.material = new THREE.MeshStandardMaterial({
      color: COLORS.BALL,
      roughness: 0.45,
      metalness: 0.0,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = false;
    scene.add(this.mesh);

    // Fake drop shadow: a flat disc on the turf, directly under the ball. It
    // shrinks and fades as the ball climbs, so the player can read its height.
    const shGeo = new THREE.CircleGeometry(BALL.RADIUS * 1.15, 20);
    shGeo.rotateX(-Math.PI / 2);
    this._shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    this.shadow = new THREE.Mesh(shGeo, this._shadowMat);
    scene.add(this.shadow);

    this._sinking = null; // active sink animation state
  }

  get position() {
    return this.mesh.position;
  }

  setPosition(x, z, groundY = 0) {
    this.mesh.position.set(x, groundY + BALL.RADIUS, z);
    this.mesh.visible = true;
    this._sinking = null;
  }

  // Keep the drop shadow under the ball, scaled by its height off the turf.
  syncShadow() {
    const p = this.mesh.position;
    this.shadow.visible = this.mesh.visible;
    if (!this.mesh.visible) return;
    this.shadow.position.set(p.x, 0.015, p.z);
    const height = Math.max(0, p.y - BALL.RADIUS);
    const s = Math.max(0.4, 1 - height * 0.05);
    this.shadow.scale.setScalar(s);
    this._shadowMat.opacity = 0.3 * s;
  }

  // Roll-look: spin the ball based on how far it travelled this frame.
  rollVisual(dt, velocity) {
    if (!velocity || this._sinking) return;
    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed < 0.001) return;
    const axis = new THREE.Vector3(velocity.z, 0, -velocity.x).normalize();
    this.mesh.rotateOnWorldAxis(axis, (speed * dt) / BALL.RADIUS);
  }

  // Begin the drop-into-cup animation toward the given XZ cup center.
  startSink(cup) {
    this._sinking = {
      t: 0,
      from: this.mesh.position.clone(),
      cupX: cup.x,
      cupZ: cup.z,
    };
  }

  // Returns true while still animating, false once finished.
  updateSink(dt) {
    if (!this._sinking) return false;
    const s = this._sinking;
    s.t += dt;
    const k = Math.min(s.t / 0.45, 1);
    // Ease toward cup center horizontally, then drop below ground.
    this.mesh.position.x = THREE.MathUtils.lerp(s.from.x, s.cupX, Math.min(k * 1.6, 1));
    this.mesh.position.z = THREE.MathUtils.lerp(s.from.z, s.cupZ, Math.min(k * 1.6, 1));
    this.mesh.position.y = THREE.MathUtils.lerp(BALL.RADIUS, -BALL.RADIUS * 1.6, k);
    if (k >= 1) {
      this.mesh.visible = false;
      this._sinking = null;
      return false;
    }
    return true;
  }

  get isSinking() {
    return this._sinking !== null;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.shadow);
    this.geometry.dispose();
    this.material.dispose();
    this.shadow.geometry.dispose();
    this._shadowMat.dispose();
  }
}
