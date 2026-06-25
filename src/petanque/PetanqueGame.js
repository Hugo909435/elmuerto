// Orchestrateur du jeu de pétanque.
// Gère la scène Three.js, les tours, le score et la synchronisation réseau.

import * as THREE from 'three';
import { ThrowController } from './ThrowController.js';
import { BallPhysics, BALL_R, COCK_R } from './BallPhysics.js';

// Terrain : 7 m de large × 17 m de long, centré à l'origine.
const TW = 7, TD = 17;
const BOUNDS = {
  minX: -TW / 2 + BALL_R, maxX: TW / 2 - BALL_R,
  minZ: -TD / 2 + BALL_R, maxZ: TD / 2 - BALL_R,
};

// Le joueur lance depuis z≈6.5 (avant du terrain depuis la caméra).
// Le cochonnet atterrit dans la zone z=-1 à -7, x=-2 à 2.
const THROW_POS = new THREE.Vector3(0, BALL_R, 6.5);

const WIN_SCORE = 13;
const BOULES_PER_PLAYER = 3;

const CLR = {
  PLAYER: 0x2563eb,   // bleu
  OPPONENT: 0xdc2626, // rouge
  COCHONNET: 0xf59e0b, // jaune orangé
  SAND: 0xc8a96e,
  WALL: 0x8a6a35,
  CIRCLE: 0xffffff,
};

export class PetanqueGame {
  constructor(container, net, myIndex) {
    this.container = container;
    this.net = net;
    this.myIndex = myIndex;       // 0 ou 1
    this.opponentIndex = 1 - myIndex;

    this.scores = [0, 0];         // score global par joueur
    this.totalThrows = 0;         // 0-5 dans la manche courante
    this.phase = 'setup';         // setup | throwing | moving | scoring | gameover

    this._cochonnetPos = new THREE.Vector3();
    this._cochonnetReady = false;
    this._pendingThrow = null;    // relay arrivé avant que le cochonnet soit posé

    this._clock = new THREE.Clock();
    this._init3D();

    this.physics = new BallPhysics(BOUNDS);

    // Meshes des boules : bouleMeshes[playerIndex][boulaIndex 0-2]
    this.bouleMeshes = [[], []];
    this._buildBouleMeshes();

    this._cochonnetMesh = this._buildCochonnetMesh();

    this.throwCtrl = new ThrowController(this.renderer.domElement, THROW_POS, this.scene);
    this.throwCtrl.onThrow = (p) => this._onLocalThrow(p);

    window.addEventListener('resize', () => this._onResize());
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ─── Scène ───────────────────────────────────────────────────────────────

  _init3D() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1c3524);
    this.scene.fog = new THREE.Fog(0x1c3524, 22, 45);

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 80);
    this.camera.position.set(0, 4.5, 9.8);
    this.camera.lookAt(0, 0.4, -1.5);

    const ambient = new THREE.AmbientLight(0xffe8cc, 1.0);
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.4);
    sun.position.set(6, 16, 9);
    this.scene.add(ambient, sun);

    this._buildTerrain();
  }

  _buildTerrain() {
    // Sol sableux
    const geo = new THREE.PlaneGeometry(TW, TD);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: CLR.SAND, roughness: 0.97 });
    this.scene.add(new THREE.Mesh(geo, mat));

    // Murs bas
    const wMat = new THREE.MeshStandardMaterial({ color: CLR.WALL, roughness: 0.9 });
    const wH = 0.28;
    const mkWall = (sx, sz, px, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, wH, sz), wMat);
      m.position.set(px, wH / 2, pz);
      this.scene.add(m);
    };
    const hW = TW / 2 + 0.15, hD = TD / 2;
    mkWall(0.3, TD + 0.3, -hW, 0);
    mkWall(0.3, TD + 0.3, hW, 0);
    mkWall(TW + 0.6, 0.3, 0, -hD);
    mkWall(TW + 0.6, 0.3, 0, hD);

    // Cercle de lancer
    const rGeo = new THREE.RingGeometry(0.75, 0.92, 40);
    rGeo.rotateX(-Math.PI / 2);
    const rMat = new THREE.MeshBasicMaterial({ color: CLR.CIRCLE, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(rGeo, rMat);
    ring.position.set(THROW_POS.x, 0.01, THROW_POS.z);
    this.scene.add(ring);
  }

  _buildBouleMeshes() {
    const geo = new THREE.SphereGeometry(BALL_R, 24, 16);
    const colors = [CLR.PLAYER, CLR.OPPONENT];
    for (let p = 0; p < 2; p++) {
      const mat = new THREE.MeshStandardMaterial({ color: colors[p], metalness: 0.6, roughness: 0.3 });
      for (let i = 0; i < BOULES_PER_PLAYER; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        this.scene.add(mesh);
        this.bouleMeshes[p].push(mesh);
      }
    }
  }

  _buildCochonnetMesh() {
    const geo = new THREE.SphereGeometry(COCK_R, 16, 12);
    const mat = new THREE.MeshStandardMaterial({ color: CLR.COCHONNET, roughness: 0.55, metalness: 0.05 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    this.scene.add(mesh);
    return mesh;
  }

  // ─── Déroulement ─────────────────────────────────────────────────────────

  startManche() {
    this.totalThrows = 0;
    this.physics.clear();
    for (let p = 0; p < 2; p++) {
      for (const m of this.bouleMeshes[p]) m.visible = false;
    }
    this._cochonnetReady = false;
    this._cochonnetMesh.visible = false;
    this._pendingThrow = null;

    this._updateHud();

    if (this.myIndex === 0) {
      // L'hôte choisit la position du cochonnet et la relaie.
      const cx = (Math.random() * 2 - 1) * 2.2;
      const cz = -1.5 - Math.random() * 5.5;
      this._placeCochonnet(cx, cz);
      this.net.relay({ type: 'cochonnet', x: cx, z: cz });
    }
    // L'autre joueur attend le relay cochonnet.
  }

  _placeCochonnet(x, z) {
    this._cochonnetPos.set(x, COCK_R, z);
    this._cochonnetMesh.position.copy(this._cochonnetPos);
    this._cochonnetMesh.visible = true;
    this._cochonnetReady = true;

    // Si un lancer adversaire était en attente du cochonnet, l'appliquer maintenant.
    if (this._pendingThrow) {
      this._execRemoteThrow(this._pendingThrow);
      this._pendingThrow = null;
    } else {
      this._startNextTurn();
    }
  }

  onRemoteCochonnet({ x, z }) {
    this._placeCochonnet(x, z);
  }

  _startNextTurn() {
    if (this.totalThrows >= BOULES_PER_PLAYER * 2) {
      this._computeScore();
      return;
    }
    this.phase = 'throwing';
    const isMyTurn = this._currentThrower() === this.myIndex;
    this._setTurnMsg(isMyTurn);
    if (isMyTurn) {
      this.throwCtrl.enable();
    } else {
      this.throwCtrl.disable();
    }
  }

  _currentThrower() {
    // Les tours alternent : 0, 1, 0, 1, 0, 1
    return this.totalThrows % 2;
  }

  _onLocalThrow({ angle, power }) {
    this.throwCtrl.disable();
    const vel = this.throwCtrl.computeVelocity(angle, power);
    this._launchBoule(this.myIndex, vel);
    this.net.relay({ type: 'throw', angle, power });
    this.phase = 'moving';
    this.totalThrows++;
  }

  onRemoteThrow(data) {
    if (!this._cochonnetReady) {
      // Le cochonnet n'est pas encore placé (race condition réseau) — on met en buffer.
      this._pendingThrow = data;
      return;
    }
    this._execRemoteThrow(data);
  }

  _execRemoteThrow({ angle, power }) {
    const vel = this.throwCtrl.computeVelocity(angle, power);
    this._launchBoule(this.opponentIndex, vel);
    this.phase = 'moving';
    this.totalThrows++;
  }

  _launchBoule(playerIndex, vel) {
    const boulaIndex = Math.floor(this.totalThrows / 2);
    const mesh = this.bouleMeshes[playerIndex][boulaIndex];
    mesh.visible = true;

    const startPos = new THREE.Vector3(
      THROW_POS.x + (Math.random() - 0.5) * 0.25,
      BALL_R,
      THROW_POS.z,
    );
    mesh.position.copy(startPos);
    this.physics.addBall(mesh, startPos, vel, BALL_R, playerIndex);
  }

  // ─── Score ───────────────────────────────────────────────────────────────

  _computeScore() {
    this.phase = 'scoring';
    const cx = this._cochonnetPos.x, cz = this._cochonnetPos.z;

    const dists = [[], []];
    for (const b of this.physics.balls) {
      dists[b.owner].push(this.physics.distToPoint(b, cx, cz));
    }
    dists[0].sort((a, b) => a - b);
    dists[1].sort((a, b) => a - b);

    const best0 = dists[0][0] ?? Infinity;
    const best1 = dists[1][0] ?? Infinity;

    let winner = -1, pts = 0;
    if (best0 < best1) {
      winner = 0;
      pts = dists[0].filter(d => d < best1).length;
      this.scores[0] += pts;
    } else if (best1 < best0) {
      winner = 1;
      pts = dists[1].filter(d => d < best0).length;
      this.scores[1] += pts;
    }

    this._showMancheResult(winner, pts);
    this._updateHud();

    setTimeout(() => {
      if (Math.max(...this.scores) >= WIN_SCORE) {
        this._showGameOver();
      } else {
        this.startManche();
      }
    }, 3200);
  }

  // ─── HUD / UI ────────────────────────────────────────────────────────────

  _updateHud() {
    const me = document.getElementById('score-me');
    const opp = document.getElementById('score-opp');
    if (me) me.textContent = this.scores[this.myIndex];
    if (opp) opp.textContent = this.scores[this.opponentIndex];
  }

  _setTurnMsg(isMyTurn) {
    const el = document.getElementById('hud-turn');
    if (el) el.textContent = isMyTurn ? 'Glisse vers le haut pour lancer !' : "Tour de l'adversaire…";
  }

  _showMancheResult(winner, pts) {
    const el = document.getElementById('score-banner');
    if (!el) return;
    const iWon = winner === this.myIndex;
    if (winner === -1) {
      el.textContent = 'Égalité sur cette manche !';
      el.className = 'banner neutral';
    } else {
      el.textContent = iWon
        ? `+${pts} point${pts > 1 ? 's' : ''} pour toi ! 🎉`
        : `+${pts} pour l'adversaire`;
      el.className = `banner ${iWon ? 'win' : 'lose'}`;
    }
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2800);
  }

  _showGameOver() {
    this.phase = 'gameover';
    this.throwCtrl.disable();
    const el = document.getElementById('gameover-overlay');
    if (!el) return;
    const myScore = this.scores[this.myIndex];
    const oppScore = this.scores[this.opponentIndex];
    document.getElementById('gameover-title').textContent =
      myScore >= WIN_SCORE ? '🏆 Victoire !' : '😢 Défaite';
    document.getElementById('gameover-score').textContent = `${myScore} — ${oppScore}`;
    el.classList.remove('hidden');
  }

  // ─── Boucle ──────────────────────────────────────────────────────────────

  _frame() {
    const dt = Math.min(this._clock.getDelta(), 0.05);

    if (this.phase === 'moving') {
      this.physics.update(dt);
      if (this.physics.allStopped()) {
        this._startNextTurn();
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
