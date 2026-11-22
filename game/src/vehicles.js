// Laguna Azul — cars. One job: build cars, drive them with arcade physics,
// steal them, and keep them on the road, the causeway deck or the ground.
import * as THREE from 'three';
import { makeRng, pick, clamp, angleLerp, dist2D } from './rng.js';
import { groundHeightAt, deckHeightAt } from './world.js';

const CAR_COLORS = [0xd23c2e, 0x2e6fd2, 0xf2c230, 0x2ed2a0, 0xe8e8e8, 0x222831, 0x7a4fd2, 0xff7a3c, 0x18b5a6];

let carIdCounter = 0;

export function createCarMesh(color, kind = 'sedan') {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x182430, roughness: 0.15, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.9 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  function part(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(box, material);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }
  const long = kind === 'truck' ? 5.6 : 4.4;
  const wide = kind === 'truck' ? 2.2 : 1.9;
  part(long, 0.7, wide, 0, 0.65, 0, paint);
  part(long * 0.52, 0.62, wide * 0.86, -long * 0.04, 1.28, 0, glass);
  part(long * 0.9, 0.22, wide * 0.94, 0, 0.32, 0, dark);
  if (kind === 'sport') {
    part(1.1, 0.16, 1.8, -long / 2 + 0.1, 1.05, 0, dark);
  }
  if (kind === 'taxi') {
    part(1.0, 0.3, 1.2, 0, 1.75, 0, new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 }));
  }
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.95 });
  const wheels = [];
  for (const [wx, wz] of [[long * 0.32, wide / 2], [long * 0.32, -wide / 2], [-long * 0.32, wide / 2], [-long * 0.32, -wide / 2]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  // headlights that read at a glance in screenshots
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 0.9 });
  part(0.1, 0.22, 0.4, long / 2 + 0.02, 0.75, wide / 2 - 0.45, lightMat);
  part(0.1, 0.22, 0.4, long / 2 + 0.02, 0.75, -wide / 2 + 0.45, lightMat);
  return { group, wheels, length: long, width: wide };
}

export function makeCar(scene, options = {}) {
  const rng = makeRng(`laguna-car-${carIdCounter}`);
  const kind = options.kind || pick(rng, ['sedan', 'sedan', 'sport', 'taxi', 'truck']);
  const color = options.color ?? pick(rng, CAR_COLORS);
  const { group, wheels, length, width } = createCarMesh(color, kind);
  const car = {
    id: carIdCounter++,
    group,
    wheels,
    kind,
    color,
    length,
    width,
    x: options.x ?? 0,
    z: options.z ?? 0,
    heading: options.heading ?? 0,
    speed: 0,
    steer: 0,
    isPlayer: !!options.isPlayer,
    isPolice: !!options.isPolice,
    parked: options.parked ?? false,
    topSpeed: kind === 'sport' ? 62 : kind === 'truck' ? 38 : 50,
    accel: kind === 'sport' ? 26 : 20,
    damaged: 0,
  };
  group.position.set(car.x, 0, car.z);
  group.rotation.y = car.heading;
  scene.add(group);
  return car;
}

export function carSpeedKmh(car) {
  return Math.abs(car.speed) * 3.6;
}

// Arcade driving: throttle, steering that bites harder at low speed, handbrake
// drift, deck-aware ground height, building push-out, water drag.
export function updateCarPhysics(car, input, dt, world, audio) {
  const throttle = input.throttleAxis();
  const steer = input.steerAxis();
  const onDeck = Math.abs(car.z) <= 8 && car.x > -12 && car.x < 252;
  const inWater = world.isInWater(car.x, car.z) && !onDeck;
  const accel = car.accel * (inWater ? 0.25 : 1);
  if (throttle > 0) car.speed += accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 0.5) car.speed -= 34 * dt;
    else car.speed -= 12 * dt;
  }
  const drag = input.handbrake ? 2.2 : 0.55;
  car.speed -= car.speed * drag * dt;
  if (throttle === 0) car.speed -= car.speed * 0.8 * dt;
  car.speed = clamp(car.speed, -14, car.topSpeed);
  if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;

  const steerAuthority = clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed >= 0 ? 1 : -1);
  const steerRate = input.handbrake ? 2.6 : 1.9;
  car.heading += steer * steerRate * steerAuthority * dt * (input.handbrake ? 1.35 : 1);
  car.steer = angleLerp(car.steer, steer * 0.42, Math.min(1, dt * 10));

  const forwardX = Math.sin(car.heading);
  const forwardZ = Math.cos(car.heading);
  car.x += forwardX * car.speed * dt;
  car.z += forwardZ * car.speed * dt;

  // buildings push the car out; a hard hit costs speed and sparks a crash sound
  const beforeX = car.x;
  const beforeZ = car.z;
  const pos = world.resolveCollision({ x: car.x, z: car.z }, Math.max(car.length, car.width) / 2);
  car.x = pos.x;
  car.z = pos.z;
  const hit = Math.abs(beforeX - car.x) + Math.abs(beforeZ - car.z) > 0.01;
  if (hit && Math.abs(car.speed) > 6) {
    car.speed *= 0.45;
    car.damaged = Math.min(100, car.damaged + 6);
    audio?.crash();
  }

  // ground height: causeway deck on the deck, lagoon bed in the water, else 0
  const groundY = groundHeightAt(car.x, car.z);
  car.group.position.set(car.x, groundY + 0.05, car.z);
  car.group.rotation.y = car.heading;
  car.group.rotation.z = -car.steer * 0.06;
  const tilt = clamp(-throttle * 0.02, -0.03, 0.03);
  car.group.rotation.x = tilt;
  for (const wheel of car.wheels) {
    wheel.rotation.z -= (car.speed * dt) / 0.38;
  }
  if (inWater && Math.abs(car.speed) > 2) car.speed *= 1 - 0.4 * dt;
  return { hit, inWater, onDeck };
}

export function findNearestStealableCar(cars, x, z, maxDist = 5) {
  let best = null;
  let bestDist = maxDist;
  for (const car of cars) {
    if (car.isPlayer) continue;
    const d = dist2D(x, z, car.x, car.z);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

export function spawnParkedCars(scene, rng) {
  const cars = [];
  const spots = [
    [-26, 78, Math.PI], [-14, 78, Math.PI], [-26, -54, 0], [-34, -54, Math.PI],
    [-94, 66, 0], [-106, -54, Math.PI], [-154, 66, 0], [-166, -114, 0],
    [-214, -54, Math.PI], [-226, 66, 0], [-94, -114, Math.PI], [-154, -114, 0],
    [-46, 114, 0], [-214, 114, Math.PI], [284, 66, 0], [296, -54, Math.PI],
  ];
  for (const [x, z, heading] of spots) {
    const car = makeCar(scene, { x, z, heading, parked: true });
    cars.push(car);
  }
  return cars;
}

export { deckHeightAt };
