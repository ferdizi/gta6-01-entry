// Laguna Azul — the city itself. One job: build Laguna Azul (lagoon, causeway,
// marina, lighthouse, old town, palms) and answer ground-height questions so
// cars, feet and the camera all agree on where the ground is.
import * as THREE from 'three';
import { makeRng, range, rangeInt, pick, clamp, lerp } from './rng.js';

export const CAUSEWAY = { x0: -12, x1: 252, halfWidth: 8, deck: 7 };
export const LAGOON = { x0: 0, x1: 250, z0: -180, z1: 180 };
export const SHALLOWS = { x0: -4, x1: 30, z0: 30, z1: 150 };
export const LIGHTHOUSE = { x: 272, z: 48, radius: 15 };
export const WALKWAY = { x0: 250, x1: 272, z: 48, halfWidth: 2.5 };

export function deckHeightAt(x, z) {
  if (Math.abs(z) > CAUSEWAY.halfWidth || x < CAUSEWAY.x0 || x > CAUSEWAY.x1) return 0;
  if (x < 8) return 7 * ((x - CAUSEWAY.x0) / 20);
  if (x > 232) return 7 * ((CAUSEWAY.x1 - x) / 20);
  return 7;
}

export function isOnCauseway(x, z) {
  return Math.abs(z) <= CAUSEWAY.halfWidth && x >= CAUSEWAY.x0 && x <= CAUSEWAY.x1;
}

export function isInShallows(x, z) {
  return x >= SHALLOWS.x0 && x <= SHALLOWS.x1 && z >= SHALLOWS.z0 && z <= SHALLOWS.z1;
}

export function isInLagoon(x, z) {
  return x > LAGOON.x0 && x < LAGOON.x1 && z > LAGOON.z0 && z < LAGOON.z1 && !isOnCauseway(x, z);
}

export function groundHeightAt(x, z) {
  if (isOnCauseway(x, z)) return deckHeightAt(x, z);
  if (Math.abs(z - WALKWAY.z) <= WALKWAY.halfWidth && x >= WALKWAY.x0 && x <= WALKWAY.x1) return 1.0;
  const ldx = x - LIGHTHOUSE.x;
  const ldz = z - LIGHTHOUSE.z;
  if (ldx * ldx + ldz * ldz <= LIGHTHOUSE.radius * LIGHTHOUSE.radius) return 0.6;
  if (isInLagoon(x, z)) return isInShallows(x, z) ? -0.5 : -2.5;
  return 0;
}

const WALL_COLORS = [0xfff3e0, 0xffe8c9, 0xfdf6ec, 0xffd9a0, 0xf7e6c8, 0xffe0b8, 0xf3d9c2];
const ROOF_COLORS = [0xc96f3f, 0xb85c33, 0xd07a45, 0xa84e2e, 0xcf8256];
const CAR_COLORS = [0xd23c2e, 0x2e6fd2, 0xf2c230, 0x2ed2a0, 0xe8e8e8, 0x222831, 0x7a4fd2, 0xff7a3c];

export function buildWorld(scene) {
  const rng = makeRng('laguna-azul-city-v2');
  const colliders = [];
  const lamps = [];
  let beaconLight = null;
  let beaconMesh = null;
  let sun = null;
  let hemi = null;
  let waterMat = null;
  let waterMat2 = null;
  let timeOfDay = 17.6;

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.ConeGeometry(1, 1, 4);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
  const palmTrunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 1, 7);
  const palmCrownGeo = new THREE.SphereGeometry(1, 8, 6);
  const sphereGeo = new THREE.SphereGeometry(1, 10, 8);

  const matCache = new Map();
  function mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05, ...opts }));
    return matCache.get(key);
  }

  function addBox(parent, w, h, d, x, y, z, material, ry = 0) {
    const mesh = new THREE.Mesh(boxGeo, material);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = h > 2;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function addCollider(minX, maxX, minZ, maxZ) {
    colliders.push({ minX, maxX, minZ, maxZ });
  }

  // ---- ground: west city, east district, lagoon bed, sand rim ----
  const groundWest = new THREE.Mesh(new THREE.PlaneGeometry(270, 380), mat(0x8a7f6a));
  groundWest.rotation.x = -Math.PI / 2;
  groundWest.position.set(-130, 0, 0);
  groundWest.receiveShadow = true;
  scene.add(groundWest);

  const groundEast = new THREE.Mesh(new THREE.PlaneGeometry(90, 380), mat(0x8a7f6a));
  groundEast.rotation.x = -Math.PI / 2;
  groundEast.position.set(290, 0, 0);
  groundEast.receiveShadow = true;
  scene.add(groundEast);

  const lagoonBed = new THREE.Mesh(new THREE.PlaneGeometry(250, 360), mat(0x2e6f6a));
  lagoonBed.rotation.x = -Math.PI / 2;
  lagoonBed.position.set(125, -2.5, 0);
  lagoonBed.receiveShadow = true;
  scene.add(lagoonBed);

  const sandRim = new THREE.Mesh(new THREE.PlaneGeometry(14, 150), mat(0xe8d29a));
  sandRim.rotation.x = -Math.PI / 2;
  sandRim.position.set(-2, 0.06, 90);
  sandRim.receiveShadow = true;
  scene.add(sandRim);

  // ---- lagoon water: two turquoise sheets, gently animated ----
  waterMat = new THREE.MeshStandardMaterial({ color: 0x27bdd2, transparent: true, opacity: 0.88, roughness: 0.25, metalness: 0.1 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(250, 360), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(125, 0.35, 0);
  water.receiveShadow = true;
  scene.add(water);
  waterMat2 = new THREE.MeshStandardMaterial({ color: 0x5fdcec, transparent: true, opacity: 0.22, roughness: 0.15, metalness: 0.1 });
  const water2 = new THREE.Mesh(new THREE.PlaneGeometry(250, 360), waterMat2);
  water2.rotation.x = -Math.PI / 2;
  water2.position.set(125, 0.45, 0);
  scene.add(water2);

  // ---- roads: asphalt strips + centre lines on the west grid and east ----
  const roadMat = mat(0x33363d, { roughness: 1 });
  const lineMat = mat(0xf5e9c8, { roughness: 1 });
  function road(x, z, w, d) {
    addBox(scene, w, 0.08, d, x, 0.04, z, roadMat);
    if (w > d) addBox(scene, w - 4, 0.1, 0.35, x, 0.05, z, lineMat);
    else addBox(scene, 0.35, 0.1, d - 4, x, 0.05, z, lineMat);
  }
  const ewRoads = [-120, -60, 0, 60, 120];
  const nsRoads = [-220, -160, -100, -40];
  for (const z of ewRoads) road(-130, z, 260, 10);
  for (const x of nsRoads) road(x, 0, 10, 360);
  road(290, 60, 70, 10);
  road(290, -60, 70, 10);
  road(290, 0, 10, 360);

  // ---- causeway: deck, ramps, guard rails, FLANKING piers (never on the line) ----
  const deckMat = mat(0x4a4d55, { roughness: 1 });
  const railMat = mat(0xd8d2c4, { roughness: 0.7 });
  const pierMat = mat(0x9a938a, { roughness: 1 });
  addBox(scene, 220, 1.2, 16, 120, 6.4, 0, deckMat);
  const rampW = new THREE.Mesh(boxGeo, deckMat);
  rampW.scale.set(22, 1.2, 16);
  rampW.position.set(-2, 3.5, 0);
  rampW.rotation.z = Math.atan2(7, 20);
  rampW.receiveShadow = true;
  scene.add(rampW);
  const rampE = new THREE.Mesh(boxGeo, deckMat);
  rampE.scale.set(22, 1.2, 16);
  rampE.position.set(242, 3.5, 0);
  rampE.rotation.z = -Math.atan2(7, 20);
  rampE.receiveShadow = true;
  scene.add(rampE);
  addBox(scene, 244, 0.9, 0.8, 120, 7.5, -8.2, railMat);
  addBox(scene, 244, 0.9, 0.8, 120, 7.5, 8.2, railMat);
  for (let x = 0; x <= 240; x += 20) {
    for (const zSide of [-12, 12]) {
      const pier = new THREE.Mesh(cylGeo, pierMat);
      pier.scale.set(1.6, 9.5, 1.6);
      pier.position.set(x, 2.2, zSide);
      pier.castShadow = true;
      scene.add(pier);
    }
  }
  // causeway lamp posts (on the rails, off the driving line)
  for (let x = 10; x <= 230; x += 40) {
    for (const zSide of [-8.2, 8.2]) {
      const pole = new THREE.Mesh(cylGeo, mat(0x2c2f36));
      pole.scale.set(0.12, 5, 0.12);
      pole.position.set(x, 9.5, zSide);
      scene.add(pole);
      const head = new THREE.Mesh(sphereGeo, mat(0xffe9a8, { emissive: 0xffc95e, emissiveIntensity: 0.4 }));
      head.scale.setScalar(0.35);
      head.position.set(x, 12, zSide);
      scene.add(head);
      lamps.push(head);
    }
  }

  // ---- buildings: whitewashed blocks with terracotta roofs, old town + east ----
  function building(x, z, w, h, d) {
    const group = new THREE.Group();
    const wall = pick(rng, WALL_COLORS);
    const body = addBox(group, w, h, d, 0, h / 2, 0, mat(wall));
    const roof = new THREE.Mesh(roofGeo, mat(pick(rng, ROOF_COLORS)));
    roof.scale.set(w * 0.75, h * 0.35 + 1.2, d * 0.75);
    roof.position.set(0, h + (h * 0.35 + 1.2) / 2 - 0.1, 0);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);
    const strip = addBox(group, w * 0.8, 0.5, 0.1, 0, h * 0.62, d / 2 + 0.06, mat(0x2b2f38));
    strip.castShadow = false;
    group.position.set(x, 0, z);
    scene.add(group);
    addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
    return group;
  }

  const blockXs = [-250, -190, -130, -70];
  const blockZs = [-165, -90, -30, 30, 90, 150];
  for (const bx of blockXs) {
    for (const bz of blockZs) {
      // skip the marina quarter (docks and boats live there instead)
      if (bx === -70 && bz >= 30) continue;
      // skip the bank plaza block, the bank is placed by hand below
      if (bx === -130 && bz === -90) continue;
      const n = rangeInt(rng, 1, 2);
      for (let i = 0; i < n; i++) {
        const w = range(rng, 14, 26);
        const d = range(rng, 12, 22);
        const h = range(rng, 7, 22);
        building(bx + range(rng, -14, 14), bz + range(rng, -14, 14), w, h, d);
      }
    }
  }
  // east district towers
  for (let i = 0; i < 10; i++) {
    const x = range(rng, 262, 318);
    const z = pick(rng, [-150, -105, -15, 15, 105, 150]) + range(rng, -8, 8);
    building(x, z, range(rng, 14, 22), range(rng, 10, 30), range(rng, 12, 20));
  }

  // ---- the Azul Bank (mission 10 finale) with its own plaza ----
  const bank = new THREE.Group();
  addBox(bank, 34, 14, 24, 0, 7, 0, mat(0xe8dcc0));
  addBox(bank, 36, 1.2, 26, 0, 14.6, 0, mat(0xc96f3f));
  for (let i = -2; i <= 2; i++) {
    addBox(bank, 1.6, 12, 1.6, i * 6, 6, 12.4, mat(0xfdf6ec));
  }
  const bankSign = addBox(bank, 22, 2.2, 0.5, 0, 16.5, 12.6, mat(0x1d4e89));
  bankSign.castShadow = false;
  bank.position.set(-130, 0, -90);
  scene.add(bank);
  addCollider(-147, -113, -102, -78);
  const bankPos = new THREE.Vector3(-130, 0, -66);

  // ---- marina: docks, boats, promenade palms, shallows ----
  const dockMat = mat(0x7a5c38, { roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const z = 48 + i * 28;
    addBox(scene, 26, 0.8, 4, 12, 0.4, z, dockMat);
  }
  function boat(x, z, ry, sailColor) {
    const group = new THREE.Group();
    addBox(group, 7, 1.6, 2.6, 0, 0.8, 0, mat(0xf2ede2));
    addBox(group, 6, 1, 2.2, 0, 1.9, 0, mat(0x2e6fd2));
    const mast = new THREE.Mesh(cylGeo, mat(0x5a4632));
    mast.scale.set(0.12, 6, 0.12);
    mast.position.set(0, 4.5, 0);
    group.add(mast);
    const sail = new THREE.Mesh(roofGeo, mat(sailColor));
    sail.scale.set(2.2, 3.4, 0.4);
    sail.position.set(0.6, 5, 0);
    sail.rotation.y = Math.PI / 4;
    group.add(sail);
    group.position.set(x, 0.2, z);
    group.rotation.y = ry;
    scene.add(group);
  }
  boat(24, 48, 0.2, 0xffffff);
  boat(26, 76, -0.15, 0xffd166);
  boat(22, 104, 0.1, 0xef476f);
  boat(30, 132, 0.3, 0xffffff);
  boat(48, 62, 1.4, 0x06d6a0);
  boat(60, 118, 1.2, 0xffd166);

  // ---- lighthouse on its island, with a walkable stone walkway ----
  const island = new THREE.Mesh(new THREE.CylinderGeometry(LIGHTHOUSE.radius, LIGHTHOUSE.radius + 3, 1.4, 18), mat(0xcfc4a8));
  island.position.set(LIGHTHOUSE.x, -0.1, LIGHTHOUSE.z);
  island.receiveShadow = true;
  scene.add(island);
  const walkwayMesh = addBox(scene, WALKWAY.x1 - WALKWAY.x0, 0.8, WALKWAY.halfWidth * 2, (WALKWAY.x0 + WALKWAY.x1) / 2, 0.6, WALKWAY.z, mat(0xb8ab8c));
  walkwayMesh.receiveShadow = true;
  const stripeWhite = mat(0xfdf6ec);
  const stripeRed = mat(0xc0392b);
  let stripeY = 0.6;
  for (let i = 0; i < 6; i++) {
    const band = new THREE.Mesh(cylGeo, i % 2 === 0 ? stripeWhite : stripeRed);
    band.scale.set(3.2, 3.4, 3.2);
    band.position.set(LIGHTHOUSE.x, stripeY + 1.7, LIGHTHOUSE.z);
    band.castShadow = true;
    scene.add(band);
    stripeY += 3.4;
  }
  const lampRoom = new THREE.Mesh(cylGeo, mat(0x222831, { emissive: 0x111111 }));
  lampRoom.scale.set(2.2, 2.6, 2.2);
  lampRoom.position.set(LIGHTHOUSE.x, stripeY + 1.3, LIGHTHOUSE.z);
  scene.add(lampRoom);
  beaconMesh = new THREE.Mesh(sphereGeo, mat(0xfff2b0, { emissive: 0xffe066, emissiveIntensity: 1.6 }));
  beaconMesh.scale.setScalar(1.4);
  beaconMesh.position.set(LIGHTHOUSE.x, stripeY + 1.4, LIGHTHOUSE.z);
  scene.add(beaconMesh);
  beaconLight = new THREE.SpotLight(0xffe9a8, 0, 90, 0.35, 0.5, 1.2);
  beaconLight.position.set(LIGHTHOUSE.x, stripeY + 1.4, LIGHTHOUSE.z);
  beaconLight.target.position.set(LIGHTHOUSE.x + 40, 0, LIGHTHOUSE.z);
  scene.add(beaconLight);
  scene.add(beaconLight.target);

  // ---- palms along the boulevards and the marina promenade ----
  function palm(x, z) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(palmTrunkGeo, mat(0x8a6b46));
    trunk.scale.set(1, range(rng, 5, 8), 1);
    trunk.position.y = trunk.scale.y / 2;
    trunk.castShadow = true;
    group.add(trunk);
    const crown = new THREE.Mesh(palmCrownGeo, mat(0x2e7d4f, { roughness: 1 }));
    crown.scale.set(2.6, 1.1, 2.6);
    crown.position.y = trunk.scale.y + 0.6;
    crown.castShadow = true;
    group.add(crown);
    group.position.set(x, 0, z);
    scene.add(group);
  }
  for (let x = -250; x <= -20; x += 22) {
    palm(x, 54);
    palm(x + 11, -54);
  }
  for (let z = 40; z <= 150; z += 18) palm(-8, z);
  for (let z = -170; z <= 170; z += 34) palm(256, z);

  // ---- street lamps on the west grid ----
  function streetLamp(x, z) {
    const pole = new THREE.Mesh(cylGeo, mat(0x2c2f36));
    pole.scale.set(0.14, 5.5, 0.14);
    pole.position.set(x, 2.75, z);
    scene.add(pole);
    const head = new THREE.Mesh(sphereGeo, mat(0xffe9a8, { emissive: 0xffc95e, emissiveIntensity: 0.4 }));
    head.scale.setScalar(0.4);
    head.position.set(x, 5.6, z);
    scene.add(head);
    lamps.push(head);
  }
  for (const z of ewRoads) for (let x = -240; x <= -20; x += 55) streetLamp(x, z + 6);
  for (const x of nsRoads) for (let z = -150; z <= 150; z += 60) streetLamp(x + 6, z);

  // ---- lighting: golden-hour sun, sky, haze ----
  sun = new THREE.DirectionalLight(0xffb36b, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 700;
  scene.add(sun);
  scene.add(sun.target);
  hemi = new THREE.HemisphereLight(0xffd9a0, 0x3a5a6a, 0.9);
  scene.add(hemi);
  scene.fog = new THREE.Fog(0xffc98a, 220, 620);

  const skyDay = new THREE.Color(0x87b5d6);
  const skyGold = new THREE.Color(0xff9e5e);
  const skyNight = new THREE.Color(0x0b1026);
  const fogGold = new THREE.Color(0xffc98a);
  const fogNight = new THREE.Color(0x0b1026);

  function setTimeOfDay(hours) {
    timeOfDay = ((hours % 24) + 24) % 24;
    const isNight = timeOfDay < 6 || timeOfDay >= 19.5;
    const isGolden = !isNight && (timeOfDay >= 16.5 || timeOfDay <= 8);
    const sunAngle = ((timeOfDay - 6) / 12) * Math.PI;
    const sunX = Math.cos(sunAngle) * 300;
    const sunY = Math.max(18, Math.sin(sunAngle) * 260);
    const sunZ = 120;
    sun.position.set(sunX, isNight ? 60 : sunY, sunZ);
    sun.target.position.set(0, 0, 0);
    if (isNight) {
      sun.intensity = 0.35;
      sun.color.setHex(0x8fa8ff);
      hemi.intensity = 0.35;
      scene.background = skyNight.clone();
      scene.fog.color.copy(fogNight);
      beaconLight.intensity = 900;
    } else if (isGolden) {
      sun.intensity = 2.4;
      sun.color.setHex(0xffb36b);
      hemi.intensity = 1.05;
      scene.background = skyGold.clone();
      scene.fog.color.copy(fogGold);
      beaconLight.intensity = 0;
    } else {
      sun.intensity = 2.8;
      sun.color.setHex(0xfff2d0);
      hemi.intensity = 1.1;
      scene.background = skyDay.clone();
      scene.fog.color.setHex(0xcfe0ea);
      beaconLight.intensity = 0;
    }
    const lampGlow = isNight ? 1.8 : 0.4;
    for (const lamp of lamps) lamp.material.emissiveIntensity = lampGlow;
    return isNight;
  }

  function resolveCollision(pos, radius) {
    for (const c of colliders) {
      const cx = clamp(pos.x, c.minX, c.maxX);
      const cz = clamp(pos.z, c.minZ, c.maxZ);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        } else {
          pos.x = c.minX - radius;
        }
      }
    }
    // keep everyone inside the playable map
    pos.x = clamp(pos.x, -262, 322);
    pos.z = clamp(pos.z, -182, 182);
    return pos;
  }

  function update(dt, elapsed) {
    water.position.y = 0.35 + Math.sin(elapsed * 0.7) * 0.05;
    water2.position.y = 0.45 + Math.sin(elapsed * 0.7 + 1.3) * 0.05;
    if (beaconLight && beaconLight.intensity > 0) {
      const a = elapsed * 0.9;
      beaconLight.target.position.set(
        LIGHTHOUSE.x + Math.cos(a) * 60,
        0,
        LIGHTHOUSE.z + Math.sin(a) * 60,
      );
      beaconMesh.material.emissiveIntensity = 1.2 + Math.sin(elapsed * 4) * 0.6;
    }
  }

  setTimeOfDay(timeOfDay);

  return {
    colliders,
    groundHeightAt,
    deckHeightAt,
    isInWater: isInLagoon,
    isInShallows,
    isOnCauseway,
    resolveCollision,
    setTimeOfDay,
    getTimeOfDay: () => timeOfDay,
    isNight: () => timeOfDay < 6 || timeOfDay >= 19.5,
    update,
    bankPos,
    lighthousePos: new THREE.Vector3(LIGHTHOUSE.x, 0.6, LIGHTHOUSE.z),
    marinaPos: new THREE.Vector3(-14, 0, 90),
    oldTownPos: new THREE.Vector3(-130, 0, 30),
    causewayWest: new THREE.Vector3(-30, 0, 0),
    spawnPoints: {
      marina: new THREE.Vector3(-14, 0, 66),
      oldTown: new THREE.Vector3(-130, 0, 30),
      causeway: new THREE.Vector3(-30, 0, 0),
      bank: new THREE.Vector3(-130, 0, -66),
      lighthouse: new THREE.Vector3(258, 1, 48),
    },
  };
}
