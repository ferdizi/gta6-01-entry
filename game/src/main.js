// Laguna Azul — main. One job: own the game loop, the camera, driving and
// on-foot switching, the menus, the save hooks, and the debug handle.
import * as THREE from 'three';
import { buildWorld, groundHeightAt } from './world.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { makeCar, updateCarPhysics, findNearestStealableCar, spawnParkedCars, carSpeedKmh } from './vehicles.js';
import { TrafficManager } from './traffic.js';
import { PedestrianManager } from './pedestrians.js';
import { PoliceManager } from './police.js';
import { MissionManager } from './missions.js';
import { CombatManager } from './combat.js';
import { HUD } from './hud.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { applyShot, parseShot } from './shots.js';
import { makeRng, clamp, dist2D, angleLerp } from './rng.js';

const VERSION = 'laguna-azul-2.0.0';

export class Game {
  constructor() {
    this.started = false;
    this.paused = false;
    this.frozen = false;
    this.cameraOrbit = false;
    this.cameraMode = 'foot';
    this.cameraChase = false;
    this.cameraYaw = 0;
    this.cameraPitch = 0.32;
    this.playSeconds = 0;
    this.elapsed = 0;
    this.state = {
      cash: 0,
      health: 100,
      ammo: 60,
      missionIndex: 0,
      missionsDone: 0,
      totalEarned: 0,
      bestSpeed: 0,
      muted: false,
    };
    this.player = {
      x: -14, z: 66, y: 0, heading: 0, speed: 0,
      inCar: false, health: 100, onRam: null,
    };
    this.playerCar = null;
    this.nearMissCooldown = 0;
    this.lastDamageAt = 0;
    this.gameOver = false;
    this._lastSaveAt = 0;
  }

  init() {
    const container = document.getElementById('game-container');
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xff9e5e);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(-60, 30, 120);

    this.world = buildWorld(this.scene);
    this.input = new Input(this.renderer.domElement);
    this.audio = new AudioEngine();
    this.hud = new HUD();
    this.traffic = new TrafficManager(this.scene, this.world, 14);
    this.peds = new PedestrianManager(this.scene, this.world, 26);
    this.police = new PoliceManager(this.scene, this.world);
    this.missions = new MissionManager(this.scene, this.world);
    this.combat = new CombatManager(this.scene, this.world);
    this.parkedCars = spawnParkedCars(this.scene, makeRng('laguna-parked-v2'));

    // the player's own ride: a sunset-orange sport coupe by the marina
    this.playerCar = makeCar(this.scene, {
      x: -20, z: 60, heading: Math.PI / 2, isPlayer: true, kind: 'sport', color: 0xff7a3c,
    });
    this.playerCar.parked = true;

    this._buildPlayerMesh();
    this._wireMenu();
    this._wireResize();

    // restore a previous session when one exists
    const saved = loadGame();
    if (saved) {
      this.state.cash = saved.cash ?? 0;
      this.state.health = saved.health ?? 100;
      this.state.ammo = saved.ammo ?? 60;
      this.state.missionIndex = saved.missionIndex ?? 0;
      this.state.muted = !!saved.muted;
      this.player.x = saved.playerX ?? -14;
      this.player.z = saved.playerZ ?? 66;
      this.player.heading = saved.playerHeading ?? 0;
      this.world.setTimeOfDay(saved.timeOfDay ?? 17.6);
      if (this.state.muted) this.audio.setMuted(true);
      document.getElementById('btn-continue').style.display = 'inline-block';
    }

    this.missions.onMissionComplete = (mission, reward) => {
      this.state.cash += reward;
      this.state.totalEarned += reward;
      this.state.missionsDone += 1;
      this.audio.cash();
      this.audio.missionComplete();
      this.hud.showToast(`Mission complete: ${mission.title} — +$${reward.toLocaleString('en-US')}`);
      this._save();
    };
    this.missions.onAllComplete = () => {
      this.audio.missionComplete();
      this.hud.showToast('All 10 missions complete! Laguna Azul is yours, Rio.');
      this._save();
    };
    this.missions.onToast = (text) => this.hud.showToast(text);

    this.player.onRam = (cruiser) => {
      this._damagePlayer(5, 'rammed by Azul PD');
      this.audio.crash();
    };

    // debug handle for state probes (screenshots, play-tests, support)
    window.__laguna = {
      version: VERSION,
      game: this,
      state: this.state,
      player: this.player,
      playerCar: this.playerCar,
      police: this.police,
      missions: this.missions,
      world: this.world,
      combat: this.combat,
    };

    // deterministic screenshot staging (?shot=...) runs after first render
    const { shot } = parseShot();
    if (shot) {
      this._shotPending = shot;
    }
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _buildPlayerMesh() {
    const group = new THREE.Group();
    const box = new THREE.BoxGeometry(1, 1, 1);
    const jacket = new THREE.MeshStandardMaterial({ color: 0xff7a3c, roughness: 0.85 });
    const jeans = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.8 });
    function part(w, h, d, x, y, z, material) {
      const mesh = new THREE.Mesh(box, material);
      mesh.scale.set(w, h, d);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    }
    part(0.52, 0.64, 0.32, 0, 1.2, 0, jacket);
    part(0.44, 0.56, 0.3, 0, 0.62, 0, jeans);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), skin);
    head.position.set(0, 1.68, 0);
    head.castShadow = true;
    group.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x1d4e89, roughness: 0.8 }));
    cap.position.set(0, 1.83, 0);
    group.add(cap);
    this.playerLegL = part(0.18, 0.52, 0.2, -0.12, 0.28, 0, jeans);
    this.playerLegR = part(0.18, 0.52, 0.2, 0.12, 0.28, 0, jeans);
    this.playerArmL = part(0.13, 0.52, 0.15, -0.34, 1.2, 0, jacket);
    this.playerArmR = part(0.13, 0.52, 0.15, 0.34, 1.2, 0, jacket);
    this.playerMesh = group;
    this.playerMesh.position.set(this.player.x, 0, this.player.z);
    this.scene.add(group);
  }

  _wireMenu() {
    const menu = document.getElementById('menu-overlay');
    const btnStart = document.getElementById('btn-start');
    const btnContinue = document.getElementById('btn-continue');
    const btnNew = document.getElementById('btn-new');
    const btnMute = document.getElementById('btn-mute');
    const gameOverEl = document.getElementById('gameover-overlay');
    const btnRespawn = document.getElementById('btn-respawn');
    btnStart.addEventListener('click', () => this._startNewGame());
    btnContinue.addEventListener('click', () => this._startContinue());
    btnNew.addEventListener('click', () => {
      clearSave();
      this._startNewGame();
    });
    btnMute.addEventListener('click', () => {
      this.state.muted = !this.state.muted;
      this.audio.setMuted(this.state.muted);
      btnMute.textContent = this.state.muted ? 'SOUND: OFF' : 'SOUND: ON';
    });
    btnRespawn.addEventListener('click', () => {
      gameOverEl.classList.remove('visible');
      this._respawn();
    });
    this._menuEl = menu;
    this._gameOverEl = gameOverEl;
    // keyboard start from the menu
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Enter' && !this.started) this._startNewGame();
    });
  }

  _wireResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  showMenu() {
    this._menuEl.classList.add('visible');
    this.cameraOrbit = true;
  }

  hideMenu() {
    this._menuEl.classList.remove('visible');
    this.cameraOrbit = false;
  }

  _startNewGame() {
    this.audio.ensure();
    this.audio.startMusic();
    this.audio.startEngineLoop();
    this.hideMenu();
    this.started = true;
    this.player.x = -14;
    this.player.z = 66;
    this.player.heading = Math.PI * 0.15;
    this.state.cash = 0;
    this.state.health = 100;
    this.state.ammo = 60;
    this.playSeconds = 0;
    this.cameraYaw = this.player.heading;
    this.missions.reset();
    this.missions.start(0, this.missionApi());
    this.hud.showToast('Welcome to Laguna Azul, Rio. Steal a car — mission 1.');
  }

  _startContinue() {
    this.audio.ensure();
    this.audio.startMusic();
    this.audio.startEngineLoop();
    this.hideMenu();
    this.started = true;
    this.cameraYaw = this.player.heading;
    this.missions.start(this.state.missionIndex || 0, this.missionApi());
    this.hud.showToast('Welcome back, Rio. Mission ' + (this.state.missionIndex + 1) + ' awaits.');
  }

  _respawn() {
    this.gameOver = false;
    this.state.health = 100;
    this.player.health = 100;
    this.state.cash = Math.floor(this.state.cash / 2);
    this.player.x = -14;
    this.player.z = 90;
    this.player.heading = 0;
    this.exitCar(true);
    this.police.clearWanted();
    this.combat.clear();
    this.world.setTimeOfDay(17.6);
    this.hud.showToast('Patched up at the marina clinic. Half your cash went to the bill.');
  }

  _damagePlayer(amount, why) {
    this.state.health = Math.max(0, this.state.health - amount);
    this.player.health = this.state.health;
    this.lastDamageAt = this.elapsed;
    if (this.state.health <= 0 && !this.gameOver) {
      this.gameOver = true;
      this._gameOverEl.classList.add('visible');
      this.audio.missionFail();
    }
  }

  _save() {
    this._lastSaveAt = this.elapsed;
    saveGame({
      cash: this.state.cash,
      missionIndex: this.missions.index,
      missionsDone: this.state.missionsDone,
      health: this.state.health,
      ammo: this.state.ammo,
      totalEarned: this.state.totalEarned,
      bestSpeed: this.state.bestSpeed,
      playerX: this.player.x,
      playerZ: this.player.z,
      playerHeading: this.player.heading,
      inCar: this.player.inCar,
      carColor: this.playerCar?.color,
      timeOfDay: this.world.getTimeOfDay(),
      muted: this.state.muted,
    });
  }

  missionApi() {
    return {
      player: {
        x: this.player.x,
        z: this.player.z,
        heading: this.player.heading,
        inCar: this.player.inCar,
        speedKmh: this.player.inCar ? carSpeedKmh(this.playerCar) : 0,
      },
      police: this.police,
      combat: this.combat,
      world: this.world,
    };
  }

  enterCar(car, silent = false) {
    this.playerCar = car;
    car.isPlayer = true;
    car.parked = false;
    this.player.inCar = true;
    this.playerMesh.visible = false;
    this.cameraMode = 'car';
    this.audio.setEngine(carSpeedKmh(car), true);
    if (!silent) {
      if (car._wasParked) {
        this.police.addHeat(20);
        this.hud.showToast('Car stolen! Azul PD is on to you.');
        this.audio.horn();
      } else {
        this.hud.showToast('You took the wheel.');
      }
    }
  }

  exitCar(silent = false) {
    if (!this.player.inCar) return;
    const car = this.playerCar;
    car.isPlayer = false;
    car.parked = true;
    car.speed = 0;
    this.player.inCar = false;
    this.player.x = car.x + Math.cos(car.heading) * 2.4;
    this.player.z = car.z - Math.sin(car.heading) * 2.4;
    this.player.heading = car.heading;
    this.player.y = groundHeightAt(this.player.x, this.player.z);
    this.playerMesh.visible = true;
    this.cameraMode = 'foot';
    if (!silent) this.hud.showToast('On foot. Press E near a car to steal it.');
  }

  _tryEnterCar() {
    const candidates = [...this.parkedCars, ...this.traffic.cars, this.playerCar].filter(Boolean);
    const car = findNearestStealableCar(candidates, this.player.x, this.player.z, 5);
    if (!car) return;
    car._wasParked = car.parked;
    if (this.traffic.cars.includes(car)) {
      this.traffic.cars = this.traffic.cars.filter((c) => c !== car);
    }
    this.enterCar(car);
  }

  _updatePlayerOnFoot(dt) {
    const input = this.input;
    const speed = input.sprint ? 7 : 4;
    const moveX = input.steerAxis();
    const moveZ = input.throttleAxis();
    const camYaw = this.cameraYaw;
    const forwardX = Math.sin(camYaw);
    const forwardZ = Math.cos(camYaw);
    const rightX = Math.cos(camYaw);
    const rightZ = -Math.sin(camYaw);
    let mx = forwardX * moveZ + rightX * moveX;
    let mz = forwardZ * moveZ + rightZ * moveX;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len;
      mz /= len;
      this.player.x += mx * speed * dt;
      this.player.z += mz * speed * dt;
      const targetHeading = Math.atan2(mx, mz);
      this.player.heading = angleLerp(this.player.heading, targetHeading, Math.min(1, dt * 12));
      this.player.speed = speed;
    } else {
      this.player.speed = 0;
    }
    const pos = this.world.resolveCollision({ x: this.player.x, z: this.player.z }, 0.6);
    this.player.x = pos.x;
    this.player.z = pos.z;
    this.player.y = groundHeightAt(this.player.x, this.player.z);
    // wading in the shallows is slow; the lagoon bed is deep water
    if (this.world.isInWater(this.player.x, this.player.z)) {
      this.player.y = this.world.isInShallows(this.player.x, this.player.z) ? -0.3 : -1.2;
    }
    this.playerMesh.position.set(this.player.x, this.player.y, this.player.z);
    this.playerMesh.rotation.y = this.player.heading;
    const swing = Math.sin(this.elapsed * 11) * (this.player.speed > 0 ? 0.5 : 0);
    this.playerLegL.rotation.x = swing;
    this.playerLegR.rotation.x = -swing;
    this.playerArmL.rotation.x = -swing * 0.7;
    this.playerArmR.rotation.x = swing * 0.7;

    if (input.interact) this._tryEnterCar();
    if (input.consumeMousePress() && !this.gameOver) this._shoot();
    if (input.reload && this.state.ammo < 60) {
      this.state.ammo = 60;
      this.hud.showToast('Reloaded.');
    }
  }

  _shoot() {
    if (this.state.ammo <= 0) {
      this.hud.showToast('Out of ammo — press R to reload.');
      return;
    }
    this.state.ammo -= 1;
    const dir = { x: Math.sin(this.player.heading), z: Math.cos(this.player.heading) };
    const result = this.combat.playerShoot(
      { x: this.player.x, y: this.player.y, z: this.player.z },
      dir,
      this.audio,
    );
    this.police.addHeat(8);
    this.peds.scare(this.player.x, this.player.z, 20);
    if (result?.killed) {
      this.state.cash += 50;
      this.hud.showToast('Rival down — +$50');
    }
  }

  _updateCamera(dt) {
    const cam = this.camera;
    if (this.cameraOrbit) {
      const a = this.elapsed * 0.05;
      cam.position.set(Math.cos(a) * 210, 65, Math.sin(a) * 210);
      cam.lookAt(60, 0, 0);
      return;
    }
    const mouse = this.input.takeMouseDelta();
    if (this.input.pointerLocked) {
      this.cameraYaw -= mouse.dx * 0.0032;
      this.cameraPitch = clamp(this.cameraPitch + mouse.dy * 0.002, 0.08, 0.9);
    }
    if (this.player.inCar && this.playerCar) {
      const car = this.playerCar;
      const back = 11.5;
      const height = 4.6;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const side = this.cameraSide || 0;
      const rx = Math.cos(car.heading);
      const rz = -Math.sin(car.heading);
      const tx = car.x - fx * back + rx * side;
      const tz = car.z - fz * back + rz * side;
      const ty = car.group.position.y + height;
      if (this._snapCamera) {
        cam.position.set(tx, ty, tz);
        this._snapCamera = false;
      } else {
        cam.position.x += (tx - cam.position.x) * Math.min(1, dt * 6);
        cam.position.y += (ty - cam.position.y) * Math.min(1, dt * 6);
        cam.position.z += (tz - cam.position.z) * Math.min(1, dt * 6);
      }
      cam.lookAt(car.x + fx * 9, car.group.position.y + 1.4, car.z + fz * 9);
    } else {
      const yaw = this.player.inCar ? this.player.heading : this.cameraYaw;
      const dist = 7.5;
      const height = 3.1 + this.cameraPitch * 4;
      const tx = this.player.x - Math.sin(yaw) * dist;
      const tz = this.player.z - Math.cos(yaw) * dist;
      const ty = this.player.y + height;
      if (this._snapCamera) {
        cam.position.set(tx, ty, tz);
        this._snapCamera = false;
      } else {
        cam.position.x += (tx - cam.position.x) * Math.min(1, dt * 8);
        cam.position.y += (ty - cam.position.y) * Math.min(1, dt * 8);
        cam.position.z += (tz - cam.position.z) * Math.min(1, dt * 8);
      }
      cam.lookAt(
        this.player.x + Math.sin(yaw) * 4,
        this.player.y + 1.4,
        this.player.z + Math.cos(yaw) * 4,
      );
    }
  }

  _loop() {
    requestAnimationFrame(this._loop);
    // clamp delta-time: a hitch never fast-forwards the simulation
    const now = performance.now();
    const rawDt = this._lastNow ? (now - this._lastNow) / 1000 : 0.016;
    this._lastNow = now;
    const dt = clamp(rawDt, 0, 0.05);
    this.elapsed += dt;

    if (this._shotPending) {
      const shot = this._shotPending;
      this._shotPending = null;
      applyShot(this, shot);
      this._snapCamera = true;
      this._syncPlayerMesh();
    }

    const playing = this.started && !this.paused && !this.gameOver;
    if (this.started && !this.gameOver && this.input.pause) {
      this.paused = !this.paused;
      this.hud.showToast(this.paused ? 'Paused — press P to resume' : 'Resumed');
    }
    if (playing && !this.frozen) {
      this.playSeconds += dt;
    }
    if (this.input.mute) {
      this.state.muted = !this.state.muted;
      this.audio.setMuted(this.state.muted);
    }

    if (playing && !this.frozen) {
      if (this.player.inCar) {
        if (this.input.interact) this.exitCar();
        if (this.input.horn) this.audio.horn();
        updateCarPhysics(this.playerCar, this.input, dt, this.world, this.audio);
        this.audio.setEngine(carSpeedKmh(this.playerCar), true);
        this.player.x = this.playerCar.x;
        this.player.z = this.playerCar.z;
        this.player.heading = this.playerCar.heading;
        this.player.y = this.playerCar.group.position.y;
        this.state.bestSpeed = Math.max(this.state.bestSpeed, carSpeedKmh(this.playerCar));
        // near-miss bonus: fast pass within 3 m of a traffic car
        this.nearMissCooldown -= dt;
        const near = this.traffic.nearestTo(this.player.x, this.player.z, 3.2);
        if (near && carSpeedKmh(this.playerCar) > 60 && this.nearMissCooldown <= 0) {
          this.nearMissCooldown = 4;
          this.state.cash += 50;
          this.audio.nearMiss();
          this.hud.showToast('Near miss! +$50');
        }
      } else {
        this._updatePlayerOnFoot(dt);
        this.audio.setEngine(0, false);
      }

      this.traffic.update(dt, this.player.inCar ? this.playerCar : null, this.player);
      this.peds.update(dt, this.player);
      this.police.update(dt, this.player, this.audio);
      this.combat.update(dt, { x: this.player.x, y: this.player.y, z: this.player.z },
        (amount) => this._damagePlayer(amount, 'shot'), this.peds);
      this.missions.update(dt, this.missionApi());

      // slow health regen once the heat is off and no recent damage
      if (this.police.level === 0 && this.elapsed - this.lastDamageAt > 10 && this.state.health < 100) {
        this.state.health = Math.min(100, this.state.health + 1.2 * dt);
        this.player.health = this.state.health;
      }
      // autosave every 30 s of play
      if (this.elapsed - this._lastSaveAt > 30) this._save();
    }

    this.world.update(dt, this.elapsed);
    this._updateCamera(dt);

    if (this.started || this._shotPending === null) {
      const mission = this.missions.current;
      this.hud.update({
        wanted: this.police.level,
        cash: this.state.cash,
        health: this.state.health,
        speedKmh: this.player.inCar ? carSpeedKmh(this.playerCar) : 0,
        inCar: this.player.inCar,
        objective: this.missions.objectiveText(this.missionApi()),
        missionTitle: mission ? `MISSION ${mission.id} — ${mission.title}` : 'FREE ROAM',
        missionTarget: mission ? mission.target : null,
        ammo: this.state.ammo,
        playSeconds: this.playSeconds,
        playerX: this.player.x,
        playerZ: this.player.z,
        playerHeading: this.player.heading,
        police: this.police.cruisers,
        traffic: this.traffic.cars,
      });
    }

    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }

  _syncPlayerMesh() {
    this.playerMesh.position.set(this.player.x, this.player.y, this.player.z);
    this.playerMesh.rotation.y = this.player.heading;
    this.playerMesh.visible = !this.player.inCar;
    if (this.playerCar) {
      this.playerCar.group.position.set(this.playerCar.x, groundHeightAt(this.playerCar.x, this.playerCar.z) + 0.05, this.playerCar.z);
      this.playerCar.group.rotation.y = this.playerCar.heading;
    }
  }
}

const game = new Game();
window.addEventListener('DOMContentLoaded', () => game.init());
export { game };
