# Småland Racer

A single-player arcade rally game through the forests, lakes and highlands of Småland. Built with **Vite, TypeScript and Three.js**, using procedural graphics, custom driving physics and no external assets.

## Run

Use **Node.js 22.18+** and npm (Node 24 LTS recommended).

```sh
npm install
npm run dev
```

Open Vite's local URL in a desktop browser with WebGL 2 and hardware acceleration enabled.

## Play

The title screen leads to six courses across three landscapes. Each landscape has a distinct one-lap circuit and a start-to-finish rally stage. All six courses are available immediately in both rally and free drive, without earning medals first. You can replay any course to improve your personal best, or choose **Free drive** to practice without saving results.

| Key | Action |
| --- | --- |
| W / ↑ | Accelerate; brake when reversing |
| S / ↓ | Brake, then reverse |
| A D / ← → | Steer |
| Space | Handbrake / slide |
| R | Recover at your last passed checkpoint (+5 seconds; damage remains) |
| Escape | Pause / resume |

Cross every checkpoint in order and in the forward direction. The start/finish has a checkered overhead gate; intermediate checkpoints are tracked invisibly and shown on the minimap. Grass reduces grip and speed. Trees, rocks, cottages and wildlife have collision geometry. Slim orange snow poles with reflective bands line the verges; you can knock them over without car damage. Fallen poles stay down until you restart the attempt. Water or leaving the world recovers your car with the same five-second penalty.

Your **final time = driving time + 0.2 seconds per damage point + 5 seconds per recovery**. Checkpoint splits compare against the cumulative score of your best run. Gold, silver and bronze targets are fixed per course. A slower attempt or a crash never overwrites your best result.

The car starts with 100 condition points. Impact speed and obstacle type determine damage; moose are especially dangerous. At over 50% damage the car gradually loses power, up to 25%. At zero condition the attempt ends. Recovering does not repair the car; restarting begins a new attempt with a repaired car and a new wildlife seed.

Deer and moose wait off the road, cross as you approach, then flee. Crossing locations and timing vary between attempts within each course's difficulty. Wildlife warning signs are placed ahead of crossings. Animal impacts are stylized, without gore.

The game pauses automatically when the window loses focus or the tab is hidden. The simulation, countdown, wildlife and clock stop until you resume. The physics uses a 120 Hz fixed step and bounded catch-up; scored driving time uses elapsed wall time so slow frames cannot improve records.

## Languages and saves

English, Dutch and Swedish are available from the title screen and pause menu. Language changes preserve the current run. On first use the browser language is selected when supported, with English as fallback.

Personal bests, medals and language are saved in this browser's local storage under `smaland-racer:v1`. There is no account or server. Clearing browser site data removes this progress. Invalid saves fall back safely, and blocked storage does not prevent playing (a notice explains when progress cannot be saved).

## Checks and production

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`dist/` contains the production website. Tests cover all six courses, checkpoint and scoring rules, pause/resume, recovery and damage, swept collisions, road clearance, wildlife behavior, save handling, translations and disposal of graphics resources. Reference drives exercise each course; medal targets are calibrated against conservative and faster clean runs. Wildlife adds variation to scored attempts.

## Architecture

- `track.ts`: course definitions, terrain, lake basins, road geometry and projection.
- `race.ts`: state machine, directional checkpoints, splits, medals and penalties.
- `vehicle.ts`: procedural car, fixed-step arcade handling, impact response and visible damage.
- `collision.ts`: spatial grid, swept circle / oriented-box tests and damage calculation.
- `scenery.ts`, `wildlife.ts`: deterministic environments, colliders, randomized wildlife and signs.
- `snow-poles.ts`: flexible roadside snow markers and impact-driven falling animations.
- `storage.ts`, `i18n.ts`: validated local saves and typed translation dictionaries.
- `main.ts`: application orchestration, menus, HUD and input bindings.
- `rendering.ts`, `dispose.ts`: reusable renderer, camera, lighting and graphics-resource lifecycle.

The game targets desktop keyboard play. Multiplayer, AI opponents, online leaderboards, vehicle upgrades, audio and touch controls are outside this version.
