// Third-person follow camera. Each frame it eases toward a position offset from
// the ball and looks slightly past it toward the hole, so a lofted shot reads
// like a real 3D golf flight. Keeps a fixed orientation (no spin) so the aim
// drag mapping stays consistent.

import * as THREE from 'three';
import { CAMERA } from '../core/Constants.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this._wantPos = new THREE.Vector3();
    this._wantLook = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._ready = false;
  }

  _desired(p) {
    this._wantPos.set(p.x + CAMERA.FOLLOW.x, CAMERA.FOLLOW.y, p.z + CAMERA.FOLLOW.z);
    this._wantLook.set(p.x, 0, p.z - CAMERA.LOOK_AHEAD);
  }

  // Jump straight to the framing for a position (used when a hole loads).
  snapTo(p) {
    this._desired(p);
    this.camera.position.copy(this._wantPos);
    this._look.copy(this._wantLook);
    this.camera.lookAt(this._look);
    this._ready = true;
  }

  update(dt, p) {
    if (!this._ready) return this.snapTo(p);
    this._desired(p);
    const k = 1 - Math.exp(-CAMERA.SMOOTH * dt); // frame-rate independent easing
    this.camera.position.lerp(this._wantPos, k);
    this._look.lerp(this._wantLook, k);
    this.camera.lookAt(this._look);
  }
}
