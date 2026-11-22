// Laguna Azul — the heist arc. One job: ten story missions for Dante "Rio"
// Marín, from his first stolen car to the Azul Bank job, each with a target,
// a live objective line, and a cash reward.
import * as THREE from 'three';
import { clamp, dist2D } from './rng.js';

function markerAt(scene, x, z, color = 0xf2c230) {
  const geo = new THREE.CylinderGeometry(2.2, 2.2, 0.2, 24);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 });
  const ring = new THREE.Mesh(geo, mat);
  ring.position.set(x, 0.15, z);
  scene.add(ring);
  const beamGeo = new THREE.CylinderGeometry(0.5, 1.6, 26, 12, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(x, 13, z);
  scene.add(beam);
  return { ring, beam, color };
}

function removeMarker(scene, marker) {
  if (!marker) return;
  scene.remove(marker.ring);
  scene.remove(marker.beam);
}

export function buildMissions(scene, world) {
  return [
    {
      id: 1, title: 'First Wheels', reward: 400,
      briefing: 'Rio needs wheels. Steal a parked car on the marina promenade.',
      objective: 'Steal a parked car (walk up to one and press E)',
      kind: 'steal', target: { x: -14, z: 72 },
      begin(api) { api.police.addHeat(0); },
      tick(api) { return api.player.inCar ? 'done' : 'active'; },
    },
    {
      id: 2, title: 'Sunset Run', reward: 600,
      briefing: 'Take the car to the old town drop-off before the light dies.',
      objective: 'Drive to the old town drop-off',
      kind: 'drive', target: { x: -130, z: 30 }, radius: 9,
      tick(api) { return dist2D(api.player.x, api.player.z, -130, 30) < 9 ? 'done' : 'active'; },
    },
    {
      id: 3, title: 'The Pickup', reward: 800,
      briefing: 'A package waits on the marina docks. Grab it — and mind the patrols.',
      objective: 'Collect the package at the marina docks',
      kind: 'goto', target: { x: 12, z: 76 }, radius: 5,
      begin(api) { api.police.addHeat(20); },
      tick(api) { return dist2D(api.player.x, api.player.z, 12, 76) < 5 ? 'done' : 'active'; },
    },
    {
      id: 4, title: 'Causeway Dash', reward: 900,
      briefing: 'Flat out across the causeway. Hit 100 km/h past the lighthouse turn.',
      objective: 'Cross the causeway east at over 100 km/h',
      kind: 'stunt', target: { x: 200, z: 0 }, radius: 12,
      tick(api) {
        const fast = api.player.inCar && Math.abs(api.player.speedKmh) > 100;
        const past = api.player.x > 185;
        return fast && past ? 'done' : 'active';
      },
    },
    {
      id: 5, title: 'Shakedown', reward: 1200,
      briefing: 'A rival crew is shaking down the old town market. Clear them out.',
      objective: 'Defeat the rival crew in the old town (0 left)',
      kind: 'combat', target: { x: -100, z: -30 }, radius: 10,
      begin(api) { api.combat.spawnSquad(-100, -30, 4); api.police.addHeat(20); },
      tick(api) { return api.combat.enemiesRemaining() === 0 ? 'done' : 'active'; },
      objectiveText(api) { return `Defeat the rival crew — ${api.combat.enemiesRemaining()} left`; },
    },
    {
      id: 6, title: 'Midnight Cargo', reward: 1500,
      briefing: 'Night run: take the cargo to the east district. No headlights off, no stops.',
      objective: 'Deliver the cargo to the east district at night',
      kind: 'drive', target: { x: 290, z: 60 }, radius: 10,
      begin(api) { api.world.setTimeOfDay(22.5); },
      tick(api) { return dist2D(api.player.x, api.player.z, 290, 60) < 10 ? 'done' : 'active'; },
    },
    {
      id: 7, title: 'Lighthouse Signal', reward: 1800,
      briefing: 'On foot: cross the stone walkway and plant the beacon at the lighthouse.',
      objective: 'Reach the lighthouse on foot and hold the beacon 5s',
      kind: 'signal', target: { x: 272, z: 48 }, radius: 7,
      begin(api) { api.world.setTimeOfDay(17.6); },
      tick(api, dt) {
        const near = dist2D(api.player.x, api.player.z, 272, 48) < 7 && !api.player.inCar;
        if (near) {
          api._hold = (api._hold || 0) + dt;
          return api._hold >= 5 ? 'done' : 'active';
        }
        api._hold = 0;
        return 'active';
      },
      objectiveText(api) {
        const held = Math.min(5, Math.floor(api._hold || 0));
        return `Hold the beacon at the lighthouse — ${held}/5s`;
      },
    },
    {
      id: 8, title: 'Roadblock Run', reward: 2200,
      briefing: 'Three stars and the whole Azul PD is out. Smash through their roadblock.',
      objective: 'Break through the roadblock and reach the west highway',
      kind: 'escape', target: { x: -220, z: 0 }, radius: 12,
      begin(api) { api.police.setWanted(3); },
      tick(api) { return dist2D(api.player.x, api.player.z, -220, 0) < 12 ? 'done' : 'active'; },
    },
    {
      id: 9, title: 'The Getaway', reward: 2800,
      briefing: 'Four stars, helicopter overhead. Lose them in the marina shallows.',
      objective: 'Lose the helicopter — hide in the marina shallows until heat fades',
      kind: 'hide', target: { x: 12, z: 90 }, radius: 16,
      begin(api) { api.police.setWanted(4); },
      tick(api) {
        const hiding = api.world.isInShallows(api.player.x, api.player.z);
        const cold = api.police.level === 0;
        return cold && hiding ? 'done' : 'active';
      },
      objectiveText(api) {
        return api.world.isInShallows(api.player.x, api.player.z)
          ? 'Hidden in the shallows — stay put until the heat fades'
          : 'Get to the marina shallows and break line of sight';
      },
    },
    {
      id: 10, title: 'The Azul Bank Job', reward: 8000,
      briefing: 'The finale. Hit the Azul Bank, hold the plaza, then vanish east across the causeway.',
      objective: 'Reach the bank, hold the plaza, escape east across the causeway',
      kind: 'bank', target: { x: -130, z: -66 }, radius: 10,
      begin(api) { api.police.setWanted(2); api._bankPhase = 0; api._holdTime = 0; },
      tick(api, dt) {
        if (api._bankPhase === 0) {
          if (dist2D(api.player.x, api.player.z, -130, -66) < 10) {
            api._bankPhase = 1;
            api.combat.spawnSquad(-130, -66, 5);
            api.police.setWanted(4);
            api.toast('Hold the plaza — Azul PD is coming!');
          }
          return 'active';
        }
        if (api._bankPhase === 1) {
          if (api.combat.enemiesRemaining() === 0) {
            api._bankPhase = 2;
            api.toast('Plaza clear — run the causeway east!');
          }
          return 'active';
        }
        return api.player.x > 240 ? 'done' : 'active';
      },
      objectiveText(api) {
        if (api._bankPhase === 0) return 'Reach the Azul Bank';
        if (api._bankPhase === 1) return `Hold the plaza — ${api.combat.enemiesRemaining()} Azul PD left`;
        return 'Escape east across the causeway!';
      },
    },
  ];
}

export class MissionManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.missions = buildMissions(scene, world);
    this.index = 0;
    this.active = null;
    this.marker = null;
    this.state = 'idle';
    this._hold = 0;
    this._bankPhase = 0;
    this.onMissionComplete = null;
    this.onAllComplete = null;
    this.onToast = null;
  }

  get current() {
    return this.missions[this.index] || null;
  }

  get done() {
    return this.index >= this.missions.length;
  }

  start(index = 0, api = null) {
    this.index = clamp(index, 0, this.missions.length - 1);
    this._startCurrent(api);
  }

  _startCurrent(api = null) {
    const mission = this.current;
    if (!mission) {
      this.state = 'complete';
      this.onAllComplete?.();
      return;
    }
    this.state = 'active';
    this._hold = 0;
    this._bankPhase = 0;
    removeMarker(this.scene, this.marker);
    this.marker = markerAt(this.scene, mission.target.x, mission.target.z);
    this.toast(`${mission.id}. ${mission.title} — ${mission.briefing}`);
    if (api && mission.begin) {
      mission.begin({ ...api, _hold: this._hold, _bankPhase: this._bankPhase, toast: (t) => this.toast(t) });
    }
  }

  toast(text) {
    this.onToast?.(text);
  }

  objectiveText(api) {
    const mission = this.current;
    if (!mission) return 'All missions complete — free roam Laguna Azul!';
    if (mission.objectiveText) return mission.objectiveText({ ...api, _hold: this._hold, _bankPhase: this._bankPhase });
    return mission.objective;
  }

  update(dt, api) {
    const mission = this.current;
    if (!mission || this.state !== 'active') return;
    const fullApi = {
      ...api,
      _hold: this._hold,
      _bankPhase: this._bankPhase,
      toast: (t) => this.toast(t),
    };
    if (this.marker) {
      this.marker.ring.position.y = 0.15 + Math.sin(performance.now() / 300) * 0.1;
      this.marker.ring.rotation.y += dt * 0.8;
    }
    const result = mission.tick(fullApi, dt);
    this._hold = fullApi._hold || 0;
    this._bankPhase = fullApi._bankPhase || 0;
    if (result === 'done') {
      const reward = mission.reward;
      this.index += 1;
      removeMarker(this.scene, this.marker);
      this.marker = null;
      this.onMissionComplete?.(mission, reward);
      if (this.done) {
        this.state = 'complete';
        this.onAllComplete?.();
      } else {
        this._startCurrent(api);
      }
    }
  }

  beginMission(api) {
    const mission = this.current;
    if (mission?.begin) mission.begin({ ...api, _hold: this._hold, _bankPhase: this._bankPhase, toast: (t) => this.toast(t) });
  }

  // called right after _startCurrent so begin() runs once per mission
  startWithBegin(api) {
    this._startCurrent();
    this.beginMission(api);
  }

  reset() {
    removeMarker(this.scene, this.marker);
    this.marker = null;
    this.index = 0;
    this.state = 'idle';
  }
}
