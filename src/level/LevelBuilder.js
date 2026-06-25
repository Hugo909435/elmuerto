// Builds (and fully tears down) the geometry for a single hole made of grass
// tiles at varying heights (low floor + elevated bridge) plus walls. Returns:
//   • bounds    — a safety bounding box for the physics XZ clamp,
//   • obstacles — wall Box3 list to collide against,
//   • platforms — the elevated tiles, so the physics knows the floor height.

import * as THREE from 'three';
import { COLORS, HOLE } from '../core/Constants.js';

export class LevelBuilder {
  constructor(scene) {
    this.scene = scene;
    this.group = null;
    this._disposables = [];
    this.flag = null;
  }

  build(hole) {
    this.clear();
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // --- Grass tiles (low floor + elevated bridge) ---
    const lowMat = new THREE.MeshStandardMaterial({ color: COLORS.GREEN_DARK, roughness: 0.95 });
    const highMat = new THREE.MeshStandardMaterial({ color: COLORS.GREEN, roughness: 0.95 });
    const skirtMat = new THREE.MeshStandardMaterial({ color: COLORS.WALL, roughness: 0.85 });
    this._track(null, lowMat);
    this._track(null, highMat);
    this._track(null, skirtMat);

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    const platforms = [];

    for (const t of hole.tiles) {
      const y = t.y || 0;
      const g = new THREE.PlaneGeometry(t.w, t.d);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, y > 0 ? highMat : lowMat);
      m.position.set(t.x, y, t.z);
      this.group.add(m);
      this._track(g, null);

      if (y > 0) {
        // Thin skirt so the bridge reads as a raised slab, and record it as a
        // walkable platform for the physics.
        const sg = new THREE.BoxGeometry(t.w, 0.5, t.d);
        const sm = new THREE.Mesh(sg, skirtMat);
        sm.position.set(t.x, y - 0.25, t.z);
        this.group.add(sm);
        this._track(sg, null);
        platforms.push({
          minX: t.x - t.w / 2,
          maxX: t.x + t.w / 2,
          minZ: t.z - t.d / 2,
          maxZ: t.z + t.d / 2,
          y,
        });
      } else {
        minX = Math.min(minX, t.x - t.w / 2);
        maxX = Math.max(maxX, t.x + t.w / 2);
        minZ = Math.min(minZ, t.z - t.d / 2);
        maxZ = Math.max(maxZ, t.z + t.d / 2);
      }
    }

    // --- Walls (each with its own height) ---
    const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.WALL, roughness: 0.8 });
    this._track(null, wallMat);
    const wallBoxes = [];
    for (const w of hole.walls || []) {
      const h = w.h || 2.2;
      const g = new THREE.BoxGeometry(w.w, h, w.d);
      const m = new THREE.Mesh(g, wallMat);
      m.position.set(w.x, h / 2, w.z);
      this.group.add(m);
      this._track(g, null);
      // box.max.y carries the wall height so the physics can let high arcs over.
      wallBoxes.push(
        new THREE.Box3(
          new THREE.Vector3(w.x - w.w / 2, 0, w.z - w.d / 2),
          new THREE.Vector3(w.x + w.w / 2, h, w.z + w.d / 2),
        ),
      );
    }

    // --- Cup + flag ---
    const cupGeo = new THREE.CircleGeometry(HOLE.RADIUS, 24);
    cupGeo.rotateX(-Math.PI / 2);
    const cupMat = new THREE.MeshBasicMaterial({ color: COLORS.HOLE });
    const cup = new THREE.Mesh(cupGeo, cupMat);
    cup.position.set(hole.cup.x, 0.02, hole.cup.z);
    this.group.add(cup);
    this._track(cupGeo, cupMat);
    this._buildFlag(hole.cup);

    // Safety bounds: the low-floor bbox, expanded so it never fights the walls.
    const m = 2;
    const bounds = { minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m };

    return { bounds, obstacles: wallBoxes, platforms };
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
