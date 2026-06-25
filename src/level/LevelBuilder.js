// Builds (and fully tears down) the geometry for a single hole: the green,
// the surrounding walls, obstacle blocks, the cup and the flag. Returns the
// play bounds + obstacle Box3 list that the PhysicsSystem needs.

import * as THREE from 'three';
import { COLORS, BALL, HOLE } from '../core/Constants.js';

const WALL_H = 0.9;
const WALL_T = 0.6;

export class LevelBuilder {
  constructor(scene) {
    this.scene = scene;
    this.group = null;
    this._disposables = [];
    this.flagGroup = null;
  }

  build(hole) {
    this.clear();
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const { w, d } = hole.size;
    const halfW = w / 2;
    const halfD = d / 2;

    // --- Green (a checkerboard-ish two-tone fairway) ---
    const greenGeo = new THREE.PlaneGeometry(w, d);
    greenGeo.rotateX(-Math.PI / 2);
    const greenMat = new THREE.MeshStandardMaterial({
      color: COLORS.GREEN,
      roughness: 0.95,
    });
    const green = new THREE.Mesh(greenGeo, greenMat);
    green.receiveShadow = false;
    this.group.add(green);
    this._track(greenGeo, greenMat);

    // Subtle darker border ring for depth.
    const ringGeo = new THREE.RingGeometry(0, 0, 1);
    ringGeo.dispose();

    // --- Outer walls ---
    const wallMat = new THREE.MeshStandardMaterial({
      color: COLORS.WALL,
      roughness: 0.8,
    });
    this._track(null, wallMat);
    const mkWall = (sx, sz, px, pz) => {
      const g = new THREE.BoxGeometry(sx, WALL_H, sz);
      const m = new THREE.Mesh(g, wallMat);
      m.position.set(px, WALL_H / 2, pz);
      this.group.add(m);
      this._track(g, null);
    };
    mkWall(w + WALL_T * 2, WALL_T, 0, -halfD - WALL_T / 2); // far (z-)
    mkWall(w + WALL_T * 2, WALL_T, 0, halfD + WALL_T / 2); // near (z+)
    mkWall(WALL_T, d, -halfW - WALL_T / 2, 0); // left
    mkWall(WALL_T, d, halfW + WALL_T / 2, 0); // right

    // --- Obstacles ---
    const obstacleBoxes = [];
    const obsMat = new THREE.MeshStandardMaterial({
      color: COLORS.OBSTACLE,
      roughness: 0.7,
    });
    this._track(null, obsMat);
    for (const o of hole.obstacles || []) {
      const g = new THREE.BoxGeometry(o.w, WALL_H, o.d);
      const m = new THREE.Mesh(g, obsMat);
      m.position.set(o.x, WALL_H / 2, o.z);
      this.group.add(m);
      this._track(g, null);
      const box = new THREE.Box3(
        new THREE.Vector3(o.x - o.w / 2, 0, o.z - o.d / 2),
        new THREE.Vector3(o.x + o.w / 2, WALL_H, o.z + o.d / 2),
      );
      obstacleBoxes.push(box);
    }

    // --- Cup (dark disc) ---
    const cupGeo = new THREE.CircleGeometry(HOLE.RADIUS, 24);
    cupGeo.rotateX(-Math.PI / 2);
    const cupMat = new THREE.MeshBasicMaterial({ color: COLORS.HOLE });
    const cup = new THREE.Mesh(cupGeo, cupMat);
    cup.position.set(hole.cup.x, 0.02, hole.cup.z);
    this.group.add(cup);
    this._track(cupGeo, cupMat);

    // --- Flag ---
    this._buildFlag(hole.cup);

    // Inner play bounds (ball center stays inside the walls).
    const bounds = {
      minX: -halfW,
      maxX: halfW,
      minZ: -halfD,
      maxZ: halfD,
    };

    return { bounds, obstacles: obstacleBoxes };
  }

  _buildFlag(cup) {
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 3, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: COLORS.FLAG_POLE });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(cup.x, 1.5, cup.z);
    this.group.add(pole);
    this._track(poleGeo, poleMat);

    const flagGeo = new THREE.PlaneGeometry(1.2, 0.7);
    flagGeo.translate(0.6, 0, 0);
    const flagMat = new THREE.MeshStandardMaterial({
      color: COLORS.FLAG,
      side: THREE.DoubleSide,
    });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(cup.x, 2.6, cup.z);
    this.group.add(flag);
    this._track(flagGeo, flagMat);
    this.flag = flag;
  }

  // Gentle flag wave for life.
  update(t) {
    if (this.flag) {
      this.flag.rotation.y = Math.sin(t * 2.5) * 0.25;
    }
  }

  _track(geo, mat) {
    if (geo) this._disposables.push(geo);
    if (mat) this._disposables.push(mat);
  }

  clear() {
    if (this.group) {
      this.scene.remove(this.group);
      this.group = null;
    }
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
    this.flag = null;
  }
}
