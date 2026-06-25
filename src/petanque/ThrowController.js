// Gère l'input de lancer : drag sur l'écran pour viser (gauche/droite)
// et choisir la puissance (haut). Affiche un arc parabolique en 3D.

import * as THREE from 'three';

const MAX_H_ANGLE = Math.PI / 5.5; // ±~33° de déviation horizontale
const LAUNCH_ANGLE = 36 * Math.PI / 180;
const MIN_SPEED = 7;
const MAX_SPEED = 18;
const MIN_POWER = 0.12;      // en dessous, on ignore le tir
const MAX_DRAG_PX = 150;     // pixels pour puissance max
const GRAVITY_PREVIEW = 18;
const BALL_R_PREVIEW = 0.45;

export class ThrowController {
  constructor(domElement, throwPos, scene) {
    this.dom = domElement;
    this.throwPos = throwPos; // {x, y, z}
    this.scene = scene;

    this._enabled = false;
    this._active = false;
    this._dragStart = null;
    this._angle = 0;  // -1..1
    this._power = 0;  // 0..1

    this._arcLine = null;
    this._buildArc();

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this.dom.addEventListener('pointerdown', this._onDown);
    this.dom.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);

    this.onThrow = null; // callback({ angle, power })
  }

  enable() {
    this._enabled = true;
  }

  disable() {
    this._enabled = false;
    this._active = false;
    this._dragStart = null;
    this._hideArc();
  }

  // Calcule le vecteur vitesse initial pour des params normalisés.
  computeVelocity(angle, power) {
    const hAngle = angle * MAX_H_ANGLE;
    const speed = MIN_SPEED + power * (MAX_SPEED - MIN_SPEED);
    const cosL = Math.cos(LAUNCH_ANGLE);
    const sinL = Math.sin(LAUNCH_ANGLE);
    return new THREE.Vector3(
      speed * Math.sin(hAngle) * cosL,
      speed * sinL,
      -speed * Math.cos(hAngle) * cosL,
    );
  }

  _onDown(e) {
    if (!this._enabled) return;
    this._active = true;
    this._dragStart = { x: e.clientX, y: e.clientY };
    this._angle = 0;
    this._power = 0;
  }

  _onMove(e) {
    if (!this._active) return;
    const dx = e.clientX - this._dragStart.x;
    const dy = this._dragStart.y - e.clientY; // drag vers le haut = puissance
    this._angle = Math.max(-1, Math.min(1, dx / MAX_DRAG_PX));
    this._power = Math.max(0, Math.min(1, dy / MAX_DRAG_PX));
    this._updateArc();
    this._updatePowerBar(this._power);
  }

  _onUp() {
    if (!this._active || !this._enabled) return;
    this._active = false;
    this._hideArc();
    this._updatePowerBar(0);
    if (this._power >= MIN_POWER && this.onThrow) {
      this.onThrow({ angle: this._angle, power: this._power });
    }
  }

  _buildArc() {
    const pts = Array.from({ length: 32 }, () => new THREE.Vector3());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineDashedMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      dashSize: 0.3,
      gapSize: 0.2,
      depthWrite: false,
    });
    this._arcLine = new THREE.Line(geo, mat);
    this._arcLine.computeLineDistances();
    this._arcLine.visible = false;
    this.scene.add(this._arcLine);
  }

  _updateArc() {
    const vel = this.computeVelocity(this._angle, this._power);
    const pts = [];
    let x = this.throwPos.x, y = BALL_R_PREVIEW, z = this.throwPos.z;
    let vx = vel.x, vy = vel.y, vz = vel.z;
    const dt = 0.06;
    for (let i = 0; i < 30; i++) {
      pts.push(new THREE.Vector3(x, y, z));
      vy -= GRAVITY_PREVIEW * dt;
      x += vx * dt; y += vy * dt; z += vz * dt;
      if (y < BALL_R_PREVIEW) {
        pts.push(new THREE.Vector3(x, BALL_R_PREVIEW, z));
        break;
      }
    }
    this._arcLine.geometry.setFromPoints(pts);
    this._arcLine.geometry.attributes.position.needsUpdate = true;
    this._arcLine.computeLineDistances();
    this._arcLine.visible = true;
  }

  _hideArc() {
    if (this._arcLine) this._arcLine.visible = false;
  }

  _updatePowerBar(power) {
    const bar = document.getElementById('power-fill');
    const wrap = document.getElementById('power-wrap');
    if (!bar || !wrap) return;
    if (power <= 0) {
      wrap.classList.add('hidden');
    } else {
      wrap.classList.remove('hidden');
      bar.style.width = `${Math.round(power * 100)}%`;
    }
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this._onDown);
    this.dom.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    if (this._arcLine) {
      this.scene.remove(this._arcLine);
      this._arcLine.geometry.dispose();
      this._arcLine.material.dispose();
    }
  }
}
