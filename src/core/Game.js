// Main orchestrator: sets up renderer/scene/camera, instantiates all systems,
// wires the high-level game flow through the EventBus, and runs the render loop
// via renderer.setAnimationLoop (pauses on hidden tab, handles resize).

import * as THREE from 'three';
import { EventBus, Events } from './EventBus.js';
import { GameState } from './GameState.js';
import { CAMERA, COLORS, BALL } from './Constants.js';

import { InputSystem } from '../systems/InputSystem.js';
import { PhysicsSystem } from '../systems/PhysicsSystem.js';
import { AudioSystem } from '../systems/AudioSystem.js';
import { Ball } from '../gameplay/Ball.js';
import { AimController } from '../gameplay/AimController.js';
import { LevelBuilder } from '../level/LevelBuilder.js';
import { UI } from '../ui/UI.js';

export class Game {
  constructor(container) {
    this.container = container;
    this.clock = new THREE.Clock();
    this._init();
  }

  _init() {
    // --- Renderer ---
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);

    // --- Scene ---
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.SKY);
    this.scene.fog = new THREE.Fog(COLORS.SKY, 45, 90);

    // --- Camera ---
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.FOV,
      window.innerWidth / window.innerHeight,
      CAMERA.NEAR,
      CAMERA.FAR,
    );
    this.camera.position.set(CAMERA.OFFSET.x, CAMERA.OFFSET.y, CAMERA.OFFSET.z);
    this.camera.lookAt(CAMERA.LOOK_AT.x, CAMERA.LOOK_AT.y, CAMERA.LOOK_AT.z);

    // --- Lights ---
    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(8, 20, 10);
    this.scene.add(ambient, dir);

    // --- Systems ---
    this.input = new InputSystem(this.renderer.domElement, this.camera);
    this.physics = new PhysicsSystem();
    this.audio = new AudioSystem();
    this.level = new LevelBuilder(this.scene);
    this.ball = new Ball(this.scene);
    this.aim = new AimController(this.scene);
    this.aim.setBall(this.ball);
    this.ui = new UI();

    this._wireFlow();

    window.addEventListener('resize', () => this._onResize());

    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ---------- High-level game flow ----------
  _wireFlow() {
    EventBus.on(Events.GAME_START, () => {
      GameState.reset();
      this._loadHole();
    });

    EventBus.on(Events.GAME_RESET, () => {
      GameState.reset();
      this._loadHole();
    });

    EventBus.on('ui:next', () => {
      if (GameState.isLastHole) {
        EventBus.emit(Events.COURSE_COMPLETE, {
          totalStrokes: GameState.totalStrokes,
          totalPar: GameState.totalPar,
        });
        GameState.phase = 'complete';
      } else {
        GameState.nextHole();
        this._loadHole();
      }
    });

    // A shot was launched → it counts as a stroke.
    EventBus.on(Events.BALL_SHOOT, () => {
      GameState.addStroke();
      GameState.phase = 'rolling';
      EventBus.emit(Events.STROKE_ADDED);
    });

    EventBus.on(Events.BALL_MOVING, () => {
      GameState.ballMoving = true;
    });

    EventBus.on(Events.BALL_STOPPED, () => {
      GameState.ballMoving = false;
      if (GameState.phase === 'rolling') GameState.phase = 'aiming';
    });

    EventBus.on(Events.BALL_SUNK, ({ cup }) => {
      GameState.ballMoving = false;
      GameState.completeHole();
      this.ball.startSink(cup);
    });
  }

  _loadHole() {
    const hole = GameState.currentHole;
    const { bounds, obstacles } = this.level.build(hole);
    this.ball.setPosition(hole.start.x, hole.start.z);
    this.physics.configure({ ball: this.ball, bounds, obstacles, cup: hole.cup });
    GameState.startHole();
    EventBus.emit(Events.HOLE_LOADED);
  }

  // ---------- Per-frame ----------
  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;

    this.aim.update(dt);
    this.physics.update(dt);
    this.ball.rollVisual(dt, this.physics.velocity);
    this.level.update(t);

    // Drive the sink animation; once finished, reveal the win overlay.
    if (this.ball.isSinking) {
      const stillSinking = this.ball.updateSink(dt);
      if (!stillSinking && GameState.phase === 'sunk') {
        EventBus.emit(Events.HOLE_COMPLETE, {
          strokes: GameState.strokes,
          par: GameState.par,
          isLast: GameState.isLastHole,
        });
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
