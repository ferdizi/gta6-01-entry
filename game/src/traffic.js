// Laguna Azul — traffic. One job: keep the roads alive with cars that follow
// the street grid, slow for the player, and never drive into the lagoon.
import * as THREE from 'three';
import { makeRng, range, pick, clamp } from './rng.js';
import { makeCar, carSpeedKmh } from './vehicles.js';
import { groundHeightAt } from './world.js';

const LOOPS = [
  // west city rectangle loops
  [[-220, -120], [-40, -120], [-40, 120], [-220, 120]],
  [[-160, -60], [-100, -60], [-100, 60], [-160, 60]],
  [[-220, 0], [-40, 0], [-40, 60], [-220, 60]],
  // causeway out-and-back (the money loop for screenshots)
  [[-40, 0], [240, 0], [240, 0], [-40, 0]],
  [[-220, -60], [-40, -60], [-40, -120], [-220, -120]],
];

export class TrafficManager {
  constructor(scene, world, count = 14) {
    this.scene = scene;
    this.world = world;
    this.cars = [];
    const rng = makeRng('laguna-traffic-v2');
    for (let i = 0; i < count; i++) {
      const loop = pick(rng, LOOPS);
      const wp = Math.floor(rng() * loop.length);
      const [x, z] = loop[wp];
      const car = makeCar(scene, { x: x + range(rng, -3, 3), z: z + range(rng, -2.5, 2.5) });
      car.loop = loop;
      car.wp = (wp + 1) % loop.length;
      car.cruise = range(rng, 9, 15);
      car.speed = car.cruise;
      car.wait = 0;
      this.cars.push(car);
    }
  }

  update(dt, playerCar, playerPos) {
    for (const car of this.cars) {
      if (car.wait > 0) {
        car.wait -= dt;
        car.speed = Math.max(0, car.speed - 20 * dt);
        this._place(car);
        continue;
      }
      const [tx, tz] = car.loop[car.wp];
      const dx = tx - car.x;
      const dz = tz - car.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 4) {
        car.wp = (car.wp + 1) % car.loop.length;
        continue;
      }
      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += clamp(diff, -1.6 * dt, 1.6 * dt);

      // slow down for the player's car or feet right ahead
      let desired = car.cruise;
      const checkX = playerCar ? playerCar.x : playerPos?.x;
      const checkZ = playerCar ? playerCar.z : playerPos?.z;
      if (checkX !== undefined) {
        const px = checkX - car.x;
        const pz = checkZ - car.z;
        const ahead = px * Math.sin(car.heading) + pz * Math.cos(car.heading);
        const side = Math.abs(px * Math.cos(car.heading) - pz * Math.sin(car.heading));
        if (ahead > 0 && ahead < 12 && side < 3.5) desired = 0;
      }
      // and for the traffic car directly ahead of this one
      for (const other of this.cars) {
        if (other === car) continue;
        const ox = other.x - car.x;
        const oz = other.z - car.z;
        const ahead = ox * Math.sin(car.heading) + oz * Math.cos(car.heading);
        const side = Math.abs(ox * Math.cos(car.heading) - oz * Math.sin(car.heading));
        if (ahead > 0 && ahead < 9 && side < 3) desired = Math.min(desired, other.speed);
      }
      car.speed += clamp(desired - car.speed, -18 * dt, 10 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      this._place(car);
    }
  }

  _place(car) {
    const y = groundHeightAt(car.x, car.z);
    car.group.position.set(car.x, y + 0.05, car.z);
    car.group.rotation.y = car.heading;
    for (const wheel of car.wheels) wheel.rotation.z -= (car.speed * 0.016) / 0.38;
  }

  // a traffic car close to a point, for near-miss bonuses
  nearestTo(x, z, maxDist = 6) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  get kmh() {
    return this.cars.length ? carSpeedKmh(this.cars[0]) : 0;
  }
}
