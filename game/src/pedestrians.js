// Laguna Azul — pedestrians. One job: fill the sidewalks with walkers who
// stroll, cross at corners, and scatter when shots are fired.
import * as THREE from 'three';
import { makeRng, range, pick, clamp, dist2D } from './rng.js';
import { groundHeightAt } from './world.js';

const SHIRT_COLORS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xfd79a8, 0xffffff, 0x1abc9c, 0xff8c42];
const PANTS_COLORS = [0x2c3e50, 0x34495e, 0x7f8c8d, 0x5d4037, 0x212121];

function makePedMesh(shirt, pants, skin) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  function part(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(box, material);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }
  part(0.5, 0.62, 0.3, 0, 1.18, 0, shirtMat);
  part(0.42, 0.55, 0.28, 0, 0.62, 0, pantsMat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), skinMat);
  head.position.set(0, 1.66, 0);
  head.castShadow = true;
  group.add(head);
  const legL = part(0.17, 0.5, 0.2, -0.11, 0.28, 0, pantsMat);
  const legR = part(0.17, 0.5, 0.2, 0.11, 0.28, 0, pantsMat);
  const armL = part(0.12, 0.5, 0.14, -0.32, 1.18, 0, shirtMat);
  const armR = part(0.12, 0.5, 0.14, 0.32, 1.18, 0, shirtMat);
  return { group, legL, legR, armL, armR };
}

export class PedestrianManager {
  constructor(scene, world, count = 26) {
    this.scene = scene;
    this.world = world;
    this.peds = [];
    this.rng = makeRng('laguna-peds-v2');
    const rng = this.rng;
    const spots = [];
    for (let x = -250; x <= -10; x += 30) {
      spots.push([x, -126], [x, -54], [x, 6], [x, 54], [x, 126]);
    }
    for (let z = 40; z <= 150; z += 16) spots.push([-10, z]);
    for (let i = 0; i < count; i++) {
      const [sx, sz] = pick(rng, spots);
      const { group, legL, legR, armL, armR } = makePedMesh(
        pick(rng, SHIRT_COLORS),
        pick(rng, PANTS_COLORS),
        pick(rng, [0xe8b88a, 0xc68642, 0x8d5524, 0xffdbac]),
      );
      const ped = {
        group, legL, legR, armL, armR,
        x: sx + range(rng, -4, 4),
        z: sz + range(rng, -3, 3),
        heading: range(rng, 0, Math.PI * 2),
        speed: range(rng, 0.9, 1.7),
        walkPhase: range(rng, 0, Math.PI * 2),
        targetX: sx,
        targetZ: sz,
        flee: 0,
        pause: range(rng, 0, 4),
      };
      group.position.set(ped.x, 0, ped.z);
      scene.add(group);
      this.peds.push(ped);
    }
  }

  scare(x, z, radius = 22) {
    for (const ped of this.peds) {
      if (dist2D(ped.x, ped.z, x, z) < radius) {
        ped.flee = 3;
        ped.targetX = ped.x + (ped.x - x) * 1.5;
        ped.targetZ = ped.z + (ped.z - z) * 1.5;
      }
    }
  }

  update(dt, playerPos) {
    for (const ped of this.peds) {
      if (ped.pause > 0 && ped.flee <= 0) {
        ped.pause -= dt;
        ped.walkPhase += dt * 0.5;
        this._pose(ped, 0);
        continue;
      }
      const dx = ped.targetX - ped.x;
      const dz = ped.targetZ - ped.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 1.5) {
        // pick a new stroll target along the sidewalks
        ped.targetX = clamp(ped.x + range(this.rng, -60, 60), -255, -8);
        ped.targetZ = clamp(ped.z + range(this.rng, -60, 60), -175, 175);
        if (this.rng() < 0.3) ped.pause = range(this.rng, 1, 5);
        continue;
      }
      const speed = ped.flee > 0 ? ped.speed * 2.6 : ped.speed;
      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - ped.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ped.heading += clamp(diff, -3 * dt, 3 * dt);
      ped.x += Math.sin(ped.heading) * speed * dt;
      ped.z += Math.cos(ped.heading) * speed * dt;
      ped.x = clamp(ped.x, -258, 318);
      ped.z = clamp(ped.z, -178, 178);
      // stay out of the lagoon (except the marina promenade edge)
      if (this.world.isInWater(ped.x, ped.z) && !this.world.isInShallows(ped.x, ped.z)) {
        ped.x = clamp(ped.x, -258, -2);
      }
      ped.walkPhase += dt * speed * 5;
      if (ped.flee > 0) ped.flee -= dt;
      this._pose(ped, speed);
      const y = groundHeightAt(ped.x, ped.z);
      ped.group.position.set(ped.x, y, ped.z);
      ped.group.rotation.y = ped.heading;
    }
  }

  _pose(ped, speed) {
    const swing = Math.sin(ped.walkPhase) * clamp(speed / 1.6, 0, 1) * 0.55;
    ped.legL.rotation.x = swing;
    ped.legR.rotation.x = -swing;
    ped.armL.rotation.x = -swing * 0.7;
    ped.armR.rotation.x = swing * 0.7;
  }

  nearestTo(x, z, maxDist = 8) {
    let best = null;
    let bestD = maxDist;
    for (const ped of this.peds) {
      const d = dist2D(ped.x, ped.z, x, z);
      if (d < bestD) {
        bestD = d;
        best = ped;
      }
    }
    return best;
  }
}
