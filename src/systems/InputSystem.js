// Translates raw DOM pointer / keyboard events into EventBus events and,
// crucially, projects screen pointer coordinates onto the ground plane so
// the rest of the game works purely in world space.
//
// Works identically for mouse (desktop) and touch (mobile) via Pointer Events.

import * as THREE from 'three';
import { EventBus, Events } from '../core/EventBus.js';
import { WORLD } from '../core/Constants.js';

export class InputSystem {
  constructor(domElement, camera) {
    this.dom = domElement;
    this.camera = camera;

    this._raycaster = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WORLD.GROUND_Y);
    this._ndc = new THREE.Vector2();
    this._hit = new THREE.Vector3();
    this._activePointer = null;

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);

    this.dom.addEventListener('pointerdown', this._onDown);
    this.dom.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  // Project a pointer event onto the ground plane → world Vector3, or null.
  _toWorld(e) {
    const rect = this.dom.getBoundingClientRect();
    this._ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const hit = this._raycaster.ray.intersectPlane(this._plane, this._hit);
    return hit ? this._hit.clone() : null;
  }

  _onDown(e) {
    if (this._activePointer !== null) return;
    const world = this._toWorld(e);
    if (!world) return;
    this._activePointer = e.pointerId;
    EventBus.emit(Events.POINTER_DOWN, { world });
  }

  _onMove(e) {
    if (this._activePointer !== e.pointerId) return;
    const world = this._toWorld(e);
    if (!world) return;
    EventBus.emit(Events.POINTER_MOVE, { world });
  }

  _onUp(e) {
    if (this._activePointer !== e.pointerId) return;
    this._activePointer = null;
    const world = this._toWorld(e);
    EventBus.emit(Events.POINTER_UP, { world });
  }

  _onKeyDown(e) {
    if (e.repeat) return;
    EventBus.emit(Events.KEY_DOWN, { code: e.code });
  }

  _onKeyUp(e) {
    EventBus.emit(Events.KEY_UP, { code: e.code });
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this._onDown);
    this.dom.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
