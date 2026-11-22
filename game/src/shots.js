// Laguna Azul — deterministic screenshot staging. One job: given ?shot=,
// place the player, the police and the mission into a frozen pose that shows
// several systems at once, so every screenshot is a real render of the game.
import { groundHeightAt } from './world.js';

export const SHOT_NAMES = ['start', 'play', 'chase', 'mission', 'night'];

export function parseShot() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seed = Number(params.get('seed') || 1);
  return { shot: SHOT_NAMES.includes(shot) ? shot : null, seed };
}

// game: the live game object from main.js (player, cars, police, missions,
// combat, world, audio, hud). Each staging freezes gameplay after posing so
// the frame the browser captures is exactly the staged one.
export function applyShot(game, shot) {
  const world = game.world;
  const police = game.police;
  const missions = game.missions;
  const combat = game.combat;

  function putPlayerOnFoot(x, z, heading) {
    game.exitCar(true);
    game.player.x = x;
    game.player.z = z;
    game.player.heading = heading;
    game.player.y = groundHeightAt(x, z);
    game.player.speed = 0;
    game.cameraYaw = heading;
  }

  function putPlayerInCar(x, z, heading, speedKmh) {
    const car = game.playerCar;
    car.x = x;
    car.z = z;
    car.heading = heading;
    car.speed = speedKmh / 3.6;
    car.parked = false;
    const y = groundHeightAt(x, z);
    car.group.position.set(x, y + 0.05, z);
    car.group.rotation.y = heading;
    game.enterCar(car, true);
  }

  function spawnCruisersBehind(count, startX, spacing) {
    // chase formation: two cruisers cutting in ahead, one alongside, two behind
    const formation = [
      { x: 224, z: -4, heading: -Math.PI / 2, speed: 12 },
      { x: 230, z: 3.5, heading: -Math.PI / 2, speed: 12 },
      { x: 210, z: -5.5, heading: Math.PI / 2, speed: 17 },
      { x: 190, z: 3.2, heading: Math.PI / 2, speed: 16 },
      { x: 183, z: -3.2, heading: Math.PI / 2, speed: 15 },
    ];
    for (let i = 0; i < count; i++) {
      const slot = formation[i % formation.length];
      const cruiser = police._spawnCruiser(game.player.x, game.player.z, game.player.heading);
      cruiser.x = slot.x;
      cruiser.z = slot.z;
      cruiser.heading = slot.heading;
      cruiser.speed = slot.speed;
      const y = groundHeightAt(cruiser.x, cruiser.z);
      cruiser.group.position.set(cruiser.x, y + 0.05, cruiser.z);
      cruiser.group.rotation.y = cruiser.heading;
    }
  }

  if (shot === 'start') {
    game.showMenu();
    game.cameraOrbit = true;
    game.frozen = true;
    return { frozen: true, label: 'start menu over golden-hour Laguna Azul' };
  }

  game.hideMenu();
  game.started = true;
  game.cameraSide = 0;

  if (shot === 'play') {
    // On foot in the marina with pedestrians and traffic around.
    putPlayerOnFoot(-14, 66, Math.PI * 0.15);
    world.setTimeOfDay(17.6);
    missions.start(2, game.missionApi());
    game.state.cash = 2400;
    game.cameraMode = 'foot';
    game.frozen = true;
    return { frozen: true, label: 'on foot in the marina' };
  }

  if (shot === 'chase') {
    // Golden-hour causeway chase: player east at 68 km/h, wanted 3, 5 cruisers.
    putPlayerInCar(212.6, 0, Math.PI / 2, 68);
    world.setTimeOfDay(17.6);
    police.setWanted(3);
    spawnCruisersBehind(5, 198, 7);
    missions.start(3, game.missionApi());
    game.state.cash = 3100;
    game.cameraMode = 'car';
    game.cameraChase = true;
    game.cameraSide = 8;
    game.frozen = true;
    return { frozen: true, label: 'causeway chase at golden hour' };
  }

  if (shot === 'mission') {
    // The bank job: player at the bank plaza, roadblock ahead, wanted 3.
    // Parked south-east of the bank, facing north-west, so the bank, the
    // roadblock and the plaza crew are all in frame (no palm in the way).
    putPlayerInCar(-108, -38, -2.48, 0);
    world.setTimeOfDay(17.6);
    missions.start(9, game.missionApi());
    missions._bankPhase = 1;
    combat.spawnSquad(-130, -66, 3);
    police.setWanted(3);
    police._spawnRoadblock(game.player.x, game.player.z, game.player.heading);
    game.state.cash = 5400;
    game.cameraMode = 'car';
    game.frozen = true;
    return { frozen: true, label: 'bank job with roadblock' };
  }

  if (shot === 'night') {
    // Night combat under the helicopter searchlight.
    putPlayerOnFoot(-100, -24, Math.PI * 0.9);
    world.setTimeOfDay(22.4);
    police.setWanted(4);
    police._spawnHelicopter(game.player.x, game.player.z);
    // park the helicopter ahead-high so it reads in frame, searchlight down
    police.heliAngle = -1.25;
    if (police.heli) police.heli.position.set(game.player.x + 5, 40, game.player.z - 15);
    missions.start(4, game.missionApi());
    game.state.cash = 6100;
    game.state.health = 82;
    game.player.health = 82;
    game.cameraMode = 'foot';
    game.frozen = true;
    return { frozen: true, label: 'night combat under the searchlight' };
  }

  return null;
}
