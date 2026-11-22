// Laguna Azul — combat. One job: shooting (player hitscan + enemy squads),
// health, and the feedback (tracer flash, hit markers) that makes it readable.
import * as THREE from 'three';
import { makeRng, range, pick, clamp, dist2D } from './rng.js';
import { groundHeightAt } from './world.js';

const ENEMY_COLORS = [0x8e44ad, 0x2c3e50, 0x7b241c];

function makeEnemyMesh(color) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.8 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  function part(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(box, material);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }
  part(0.55, 0.65, 0.32, 0, 1.2, 0, bodyMat);
  part(0.45, 0.55, 0.3, 0, 0.6, 0, new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.9 }));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), skinMat);
  head.position.set(0, 1.7, 0);
  head.castShadow = true;
  group.add(head);
  // health bar floating over the head
  const barBg = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.02), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  barBg.position.set(0, 2.05, 0);
  group.add(barBg);
  const barFg = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.08, 0.03), new THREE.MeshBasicMaterial({ color: 0xe74c3c }));
  barFg.position.set(0, 2.05, 0.01);
  group.add(barFg);
  // a visible gun
  part(0.7, 0.1, 0.12, 0.3, 1.25, 0.2, new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.6 }));
  return { group, barFg };
}

export class CombatManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.enemies = [];
    this.tracer = null;
    this.tracerTimer = 0;
    this.rng = makeRng('laguna-combat-v2');
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9 });
    this.tracer = new THREE.Mesh(geo, mat);
    this.tracer.visible = false;
    scene.add(this.tracer);
  }

  spawnSquad(x, z, count) {
    for (let i = 0; i < count; i++) {
      const ex = x + range(this.rng, -10, 10);
      const ez = z + range(this.rng, -10, 10);
      const { group, barFg } = makeEnemyMesh(pick(this.rng, ENEMY_COLORS));
      const enemy = {
        group, barFg,
        x: ex, z: ez,
        health: 100,
        maxHealth: 100,
        shootTimer: range(this.rng, 0.8, 2),
        moveTimer: 0,
        targetX: ex, targetZ: ez,
      };
      group.position.set(ex, groundHeightAt(ex, ez), ez);
      this.scene.add(group);
      this.enemies.push(enemy);
    }
  }

  enemiesRemaining() {
    return this.enemies.length;
  }

  clear() {
    for (const enemy of this.enemies) this.scene.remove(enemy.group);
    this.enemies = [];
  }

  // Player hitscan: nearest enemy inside a narrow cone from the aim direction.
  playerShoot(origin, dir, audio) {
    let best = null;
    let bestScore = Infinity;
    for (const enemy of this.enemies) {
      const dx = enemy.x - origin.x;
      const dz = enemy.z - origin.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 46) continue;
      const dot = (dx * dir.x + dz * dir.z) / (dist || 1);
      if (dot < 0.93) continue;
      const score = dist + (1 - dot) * 30;
      if (score < bestScore) {
        bestScore = score;
        best = { enemy, dist };
      }
    }
    const from = new THREE.Vector3(origin.x, (origin.y || 1.4) + 0.2, origin.z);
    const to = best
      ? new THREE.Vector3(best.enemy.x, groundHeightAt(best.enemy.x, best.enemy.z) + 1.3, best.enemy.z)
      : new THREE.Vector3(origin.x + dir.x * 40, (origin.y || 1.4) + 0.2, origin.z + dir.z * 40);
    this._flashTracer(from, to);
    audio?.gunshot();
    if (!best) return null;
    best.enemy.health -= 34;
    const ratio = clamp(best.enemy.health / best.enemy.maxHealth, 0, 1);
    best.enemy.barFg.scale.x = Math.max(0.01, ratio);
    best.enemy.barFg.position.x = -0.43 * (1 - ratio);
    if (best.enemy.health <= 0) {
      this.scene.remove(best.enemy.group);
      this.enemies = this.enemies.filter((e) => e !== best.enemy);
      audio?.hit();
      return { killed: true, enemy: best.enemy };
    }
    return { killed: false, enemy: best.enemy };
  }

  _flashTracer(from, to) {
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const len = from.distanceTo(to);
    this.tracer.position.copy(mid);
    this.tracer.scale.set(0.05, 0.05, len);
    this.tracer.lookAt(to);
    this.tracer.visible = true;
    this.tracerTimer = 0.08;
  }

  update(dt, playerPos, onPlayerDamaged, peds) {
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0) this.tracer.visible = false;
    }
    for (const enemy of this.enemies) {
      const dx = playerPos.x - enemy.x;
      const dz = playerPos.z - enemy.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      enemy.group.rotation.y = Math.atan2(dx, dz);
      // strafe to a new spot now and then, but hold range ~10-24
      enemy.moveTimer -= dt;
      if (enemy.moveTimer <= 0) {
        enemy.moveTimer = range(this.rng, 1.5, 3.5);
        if (dist > 24) {
          enemy.targetX = playerPos.x + range(this.rng, -6, 6);
          enemy.targetZ = playerPos.z + range(this.rng, -6, 6);
        } else if (dist < 8) {
          enemy.targetX = enemy.x - dx * 0.8;
          enemy.targetZ = enemy.z - dz * 0.8;
        } else {
          enemy.targetX = enemy.x + range(this.rng, -7, 7);
          enemy.targetZ = enemy.z + range(this.rng, -7, 7);
        }
      }
      const mx = enemy.targetX - enemy.x;
      const mz = enemy.targetZ - enemy.z;
      const md = Math.sqrt(mx * mx + mz * mz);
      if (md > 0.5) {
        enemy.x += (mx / md) * 2.6 * dt;
        enemy.z += (mz / md) * 2.6 * dt;
        const pos = this.world.resolveCollision({ x: enemy.x, z: enemy.z }, 0.6);
        enemy.x = pos.x;
        enemy.z = pos.z;
      }
      enemy.group.position.set(enemy.x, groundHeightAt(enemy.x, enemy.z), enemy.z);
      // shoot at the player when in range
      enemy.shootTimer -= dt;
      if (dist < 32 && enemy.shootTimer <= 0) {
        enemy.shootTimer = range(this.rng, 1.1, 2.1);
        const hitChance = dist < 12 ? 0.5 : dist < 22 ? 0.32 : 0.18;
        if (this.rng() < hitChance) {
          onPlayerDamaged?.(range(this.rng, 4, 8));
        }
        const from = new THREE.Vector3(enemy.x, groundHeightAt(enemy.x, enemy.z) + 1.3, enemy.z);
        const to = new THREE.Vector3(playerPos.x, (playerPos.y || 1.4), playerPos.z);
        this._flashTracer(from, to);
        peds?.scare(enemy.x, enemy.z, 18);
      }
    }
  }
}
