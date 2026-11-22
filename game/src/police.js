// Laguna Azul — the Azul PD. One job: turn the wanted level into responding
// police: cruisers that chase, roadblocks at 3+ stars, and a helicopter with a
// searchlight at 4+ stars. The marina shallows break their line of sight.
import * as THREE from 'three';
import { makeRng, range, clamp, dist2D } from './rng.js';
import { makeCar, createCarMesh } from './vehicles.js';
import { groundHeightAt, isInShallows } from './world.js';

const MAX_WANTED = 5;

export class PoliceManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.wanted = 0;
    this.heat = 0;
    this.cruisers = [];
    this.roadblocks = [];
    this.heli = null;
    this.heliLight = null;
    this.heliAngle = 0;
    this.spawnTimer = 0;
    this.roadblockTimer = 0;
    this.lostTimer = 0;
    this.rng = makeRng('laguna-azul-pd-v2');
    this.sirenOn = false;
  }

  addHeat(amount) {
    this.heat = clamp(this.heat + amount, 0, 100);
    const level = Math.min(MAX_WANTED, Math.floor(this.heat / 20) + (this.heat > 0 ? 0 : 0));
    this.wanted = this.heat <= 0 ? 0 : Math.max(1, Math.min(MAX_WANTED, Math.ceil(this.heat / 20)));
    if (this.wanted > 0) this.lostTimer = 0;
    return this.wanted;
  }

  setWanted(level) {
    this.wanted = clamp(level, 0, MAX_WANTED);
    this.heat = this.wanted * 20;
    this.lostTimer = 0;
  }

  clearWanted() {
    this.wanted = 0;
    this.heat = 0;
    this._despawnAll();
  }

  get level() {
    return this.wanted;
  }

  _despawnAll() {
    for (const cruiser of this.cruisers) this.scene.remove(cruiser.group);
    this.cruisers = [];
    this._clearRoadblocks();
    if (this.heli) {
      this.scene.remove(this.heli);
      this.heli = null;
      this.heliLight = null;
    }
    this.sirenOn = false;
  }

  _clearRoadblocks() {
    for (const block of this.roadblocks) {
      for (const mesh of block.meshes) this.scene.remove(mesh);
    }
    this.roadblocks = [];
  }

  _spawnCruiser(playerX, playerZ, playerHeading) {
    const behind = playerHeading + Math.PI;
    const dist = range(this.rng, 28, 48);
    const x = playerX + Math.sin(behind + range(this.rng, -0.4, 0.4)) * dist;
    const z = playerZ + Math.cos(behind + range(this.rng, -0.4, 0.4)) * dist;
    const car = makeCar(this.scene, {
      x: clamp(x, -255, 315),
      z: clamp(z, -175, 175),
      heading: playerHeading,
      isPolice: true,
      color: 0x1a1d22,
    });
    car.topSpeed = 56;
    car.accel = 26;
    car.chase = true;
    // Azul PD livery: white doors + light bar
    const barMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x2244ff, emissiveIntensity: 1.2 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.5), barMat);
    bar.position.set(0, 1.7, 0);
    car.group.add(bar);
    car.lightBar = bar;
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.4 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.06), doorMat);
    door.position.set(0, 0.7, car.width / 2 + 0.02);
    car.group.add(door);
    const door2 = door.clone();
    door2.position.z = -car.width / 2 - 0.02;
    car.group.add(door2);
    this.cruisers.push(car);
    return car;
  }

  _spawnRoadblock(playerX, playerZ, playerHeading) {
    // two cruisers parked across the road ahead of the player + barriers
    const ahead = 42;
    const cx = playerX + Math.sin(playerHeading) * ahead;
    const cz = playerZ + Math.cos(playerHeading) * ahead;
    const meshes = [];
    const blockMat = new THREE.MeshStandardMaterial({ color: 0xd23c2e, roughness: 0.6 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    for (const side of [-1, 1]) {
      const car = makeCar(this.scene, {
        x: cx + Math.cos(playerHeading) * side * 3.4,
        z: cz - Math.sin(playerHeading) * side * 3.4,
        heading: playerHeading + Math.PI / 2,
        isPolice: true,
        color: 0x1a1d22,
      });
      car.parked = true;
      car.roadblock = true;
      meshes.push(car.group);
      this.cruisers.push(car);
    }
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(7, 1, 0.4), blockMat);
    barrier.position.set(cx, groundHeightAt(cx, cz) + 0.8, cz);
    barrier.rotation.y = playerHeading + Math.PI / 2;
    barrier.castShadow = true;
    this.scene.add(barrier);
    meshes.push(barrier);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.25, 0.42), stripeMat);
    stripe.position.copy(barrier.position);
    stripe.position.y += 0.2;
    stripe.rotation.y = barrier.rotation.y;
    this.scene.add(stripe);
    meshes.push(stripe);
    this.roadblocks.push({ x: cx, z: cz, meshes, ttl: 40 });
  }

  _spawnHelicopter(playerX, playerZ) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x22303e, roughness: 0.5, metalness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.6, 2.2), bodyMat);
    body.castShadow = true;
    group.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 0.5), bodyMat);
    tail.position.set(-3.6, 0.4, 0);
    group.add(tail);
    const rotorMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.6 });
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), rotorMat);
    rotor.position.set(0, 1.1, 0);
    group.add(rotor);
    group.userData.rotor = rotor;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.4, 2.25), new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 }));
    stripe.position.set(0, 0.2, 0);
    group.add(stripe);
    group.position.set(playerX - 20, 42, playerZ - 20);
    this.scene.add(group);
    this.heli = group;
    this.heliLight = new THREE.SpotLight(0xfff2b0, 1200, 90, 0.32, 0.45, 1.1);
    this.heliLight.position.set(0, -1, 0);
    this.heliLight.target.position.set(0, -42, 0);
    group.add(this.heliLight);
    group.add(this.heliLight.target);
  }

  update(dt, player, audio) {
    const px = player.x;
    const pz = player.z;
    const inShallows = isInShallows(px, pz);
    const inWater = this.world.isInWater(px, pz);

    // heat decays; fast in the marina shallows where the PD loses line of sight
    if (this.wanted > 0) {
      const decay = inShallows ? 6 : inWater ? 2.5 : 0.55;
      this.heat -= decay * dt;
      if (this.heat <= 0) {
        this.wanted = 0;
        this.heat = 0;
        this._despawnAll();
      } else {
        this.wanted = Math.max(1, Math.min(MAX_WANTED, Math.ceil(this.heat / 20)));
      }
    }

    const wantCruisers = this.wanted === 0 ? 0 : Math.min(this.wanted + 2, 7);
    this.spawnTimer -= dt;
    if (this.cruisers.length < wantCruisers && this.spawnTimer <= 0) {
      this._spawnCruiser(px, pz, player.heading);
      this.spawnTimer = 1.2;
    }
    if (this.cruisers.length > wantCruisers) {
      const extra = this.cruisers.pop();
      this.scene.remove(extra.group);
    }

    // roadblocks at 3+ stars, refreshed ahead of the player
    this.roadblockTimer -= dt;
    if (this.wanted >= 3 && this.roadblockTimer <= 0 && this.roadblocks.length < 2) {
      this._spawnRoadblock(px, pz, player.heading);
      this.roadblockTimer = 14;
    }
    for (const block of this.roadblocks) block.ttl -= dt;
    this.roadblocks = this.roadblocks.filter((block) => {
      if (block.ttl <= 0) {
        for (const mesh of block.meshes) this.scene.remove(mesh);
        return false;
      }
      return true;
    });

    // helicopter + searchlight at 4+ stars
    if (this.wanted >= 4 && !this.heli) this._spawnHelicopter(px, pz);
    if (this.wanted < 4 && this.heli) {
      this.scene.remove(this.heli);
      this.heli = null;
      this.heliLight = null;
    }

    // siren follows wanted level
    if (this.wanted >= 2 && audio) {
      audio.startSiren();
      this.sirenOn = true;
    } else if (this.wanted < 2 && this.sirenOn && audio) {
      audio.stopSiren();
      this.sirenOn = false;
    }

    // cruiser chase AI: steer at the player, ram speed, lose the player in shallows
    const lost = inShallows && this.wanted > 0;
    for (const cruiser of this.cruisers) {
      if (cruiser.roadblock) continue;
      if (cruiser.lightBar) {
        cruiser.lightBar.material.emissive.setHex(Math.floor(performance.now() / 350) % 2 === 0 ? 0x2244ff : 0xff2222);
      }
      const dx = px - cruiser.x;
      const dz = pz - cruiser.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      let targetHeading;
      if (lost) {
        targetHeading = cruiser.heading + Math.sin(performance.now() / 1000 + cruiser.id) * 0.6;
        cruiser.speed = Math.max(4, cruiser.speed - 8 * dt);
      } else {
        targetHeading = Math.atan2(dx, dz);
        const desired = dist > 60 ? cruiser.topSpeed : dist > 18 ? cruiser.topSpeed * 0.85 : 22;
        cruiser.speed += clamp(desired - cruiser.speed, -22 * dt, 14 * dt);
      }
      let diff = targetHeading - cruiser.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cruiser.heading += clamp(diff, -2.4 * dt, 2.4 * dt);
      cruiser.x += Math.sin(cruiser.heading) * cruiser.speed * dt;
      cruiser.z += Math.cos(cruiser.heading) * cruiser.speed * dt;
      const pos = this.world.resolveCollision({ x: cruiser.x, z: cruiser.z }, 2.4);
      cruiser.x = pos.x;
      cruiser.z = pos.z;
      const y = groundHeightAt(cruiser.x, cruiser.z);
      cruiser.group.position.set(cruiser.x, y + 0.05, cruiser.z);
      cruiser.group.rotation.y = cruiser.heading;
      // ramming the player
      if (dist < 3.4 && player.onRam) player.onRam(cruiser);
    }

    // helicopter follows overhead, searchlight pinned on the player
    if (this.heli) {
      this.heliAngle += dt * 0.55;
      const hx = px + Math.cos(this.heliAngle) * 16;
      const hz = pz + Math.sin(this.heliAngle) * 16;
      this.heli.position.x += (hx - this.heli.position.x) * Math.min(1, dt * 1.4);
      this.heli.position.z += (hz - this.heli.position.z) * Math.min(1, dt * 1.4);
      this.heli.position.y = 40 + Math.sin(performance.now() / 900) * 2;
      this.heli.rotation.y = Math.atan2(px - this.heli.position.x, pz - this.heli.position.z);
      this.heli.userData.rotor.rotation.y += dt * 22;
      this.heliLight.target.position.set(px - this.heli.position.x, -40, pz - this.heli.position.z);
      this.heliLight.target.updateMatrixWorld();
    }
  }

  nearestCruiserDistance(px, pz) {
    let best = Infinity;
    for (const c of this.cruisers) best = Math.min(best, dist2D(c.x, c.z, px, pz));
    return best;
  }
}
