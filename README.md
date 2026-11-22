# Laguna Azul — Make GTA 6

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/ferdizi/gta6-01-entry/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/ferdizi/gta6-01-entry/reward.svg)](https://make.fun/bounty/gta6-01)

**Laguna Azul** is a sun-soaked open-world crime game built for the [Make GTA 6](https://make.fun/bounty/gta6-01) bounty on make.fun. You are Dante "Rio" Marín, getaway driver in a turquoise lagoon city of terracotta rooftops, palm boulevards, a marina district and a striped lighthouse — ten story missions from your first stolen car to the Azul Bank job.

## Play it

Serve `game/` with any static server and open `index.html` in desktop Chrome (no build step, no network requests, everything vendored or synthesized):

```sh
node serve.ts
# open http://localhost:8080
```

## What is in the game

- **A city to explore on foot and by car** — old town, marina, highway causeway across the lagoon, lighthouse island with a walkable stone walkway.
- **Traffic and pedestrians** — cars follow the street grid and slow for you; walkers stroll the sidewalks and scatter when shots are fired.
- **Cars to steal and drive** — parked cars, traffic cars and your own sunset-orange sport coupe, with arcade physics, handbrake drift and near-miss bonuses.
- **Wanted level and police who respond** — five stars of Azul PD: cruisers that chase and ram, roadblocks at 3+ stars, and a helicopter with a searchlight at 4+ stars. Break line of sight in the marina shallows to cool the heat.
- **Missions and a story** — a 10-mission heist arc: first wheels, sunset run, marina pickup, causeway dash, shakedown, midnight cargo, lighthouse signal, roadblock run, the getaway, and the Azul Bank job finale.
- **Combat** — hitscan shooting with enemy squads, health bars, tracers and damage.
- **HUD with minimap** — wanted stars, cash, health, speed, mission timer, objective line and a circular live minimap.
- **Start screen and save** — menu with new game / continue, progress saved to localStorage.
- **Sound and music** — fully synthesized WebAudio: engine hum, sirens, gunshots, pickups and a golden-hour cruise loop. No audio files.

## Tech

Three.js 0.160.0 (vendored as `game/vendor/three.module.min.js`), plain ES modules, no build step. Source is split one job per file under `game/src/` (`main`, `world`, `vehicles`, `traffic`, `pedestrians`, `police`, `missions`, `combat`, `hud`, `audio`, `save`, `shots`, `rng`, `input`).

## Controls

WASD drive / walk · mouse look / aim · E steal & enter car · click shoot · Space handbrake · Shift sprint · H horn · R reload · P pause · M mute · Enter start.

## License

MIT — see [LICENSE](LICENSE).
