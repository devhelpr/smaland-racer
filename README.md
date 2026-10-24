# Småland Racer

A single-player arcade rally game through the forests, lakes and highlands of Småland. Built with **Vite, TypeScript and Three.js**, using procedural graphics, custom driving physics and no external assets.

## Run

Use **Node.js 22.18+** and npm (Node 24 LTS recommended).

```sh
npm install
npm run dev
```

Open Vite's local URL in a browser with WebGL 2 and hardware acceleration enabled. Keyboard and touchscreens are supported.

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

### Touchscreen controls

Drive by dragging anywhere on the game view, with no on-screen steering, pedal or handbrake buttons:

| Gesture | Action |
| --- | --- |
| Drag up and hold | Accelerate |
| Drag down and hold | Brake, then reverse |
| Drag left / right | Steer proportionally; diagonal drags combine steering and gas/brake |
| Lift your finger | Release gas and steering; the car coasts |
| Hold a second finger | Handbrake, while the first finger keeps steering |
| Double tap | Recover at the last checkpoint (+5 seconds; damage remains) |

Each drag starts from wherever you touch, so no fixed control zone is needed. Move farther for stronger input. Small finger movements are ignored. The pause menu remains available in the header. Menus keep normal touch scrolling, while the game canvas suppresses browser pan/zoom gestures. Pause, focus loss, pointer cancellation and resizing clear held input. Touch hints are available in all three languages and replace the keyboard HUD when using touch.

Cross every checkpoint in order and in the forward direction. The start/finish has a checkered overhead gate; intermediate checkpoints are tracked invisibly and shown on the minimap. Grass reduces grip and speed. Trees, rocks, cottages, wildlife and A-traktors have collision geometry. The five fictional routes have 9–15 roadside cottages and 4–7 lakes, with open verges so the houses and water are visible from the road. Slim orange snow poles with reflective bands line the verges; you can knock them over without car damage. Fallen poles stay down until you restart the attempt. Water or leaving the world recovers your car with the same five-second penalty.

Your **final time = driving time + 0.2 seconds per damage point + 5 seconds per recovery**. Checkpoint splits compare against the cumulative score of your best run. Gold, silver and bronze targets are fixed per course. A slower attempt or a crash never overwrites your best result.

The car starts with 100 condition points. Impact speed and obstacle type determine damage; moose are especially dangerous. At over 50% damage the car gradually loses power, up to 25%. At zero condition the attempt ends. Recovering does not repair the car; restarting begins a new attempt with a repaired car and a new wildlife seed.

Deer and moose wait off the road, cross as you approach, then flee. Crossing locations and timing vary between attempts within each course's difficulty. Wildlife warning signs are placed ahead of crossings. Animal impacts are stylized, without gore.

Slow A-traktors travel in the same direction on the right side of the road, at roughly 23–28 km/h. They have an orange rear warning triangle and leave the other side available for overtaking. They brake for traffic or a player directly ahead. Impacts cause damage based on relative speed; the A-traktor briefly slows after contact. Circuit traffic loops around, while stage traffic exits at the finish. Restarting restores the initial traffic positions.

The game pauses automatically when the window loses focus or the tab is hidden. The simulation, countdown, wildlife, traffic and clock stop until you resume. The physics uses a 120 Hz fixed step and bounded catch-up; scored driving time uses elapsed wall time so slow frames cannot improve records.

## Holmahult stage

Course **01 — Holmahult** is the default selection and replaces Älgstigen with an approximately 850 m gravel stage inspired by [the supplied Holmahult 25 location near Tingsryd](https://maps.app.goo.gl/CznM1o2vWHhMrY8W9). The north-to-south route follows the lane past the farmyard, bends east at the green house and turns south towards the next farms. Its checkpoints, recovery positions, wildlife and A-traktors use that same route.

The fixed scenery includes the green home with white trim and a number 25 plaque, the long red barn and northern barn complex, red neighboring houses, sheds, gravel yards and driveways, stone field boundaries, broadleaf garden trees, open meadows and the neighboring paved road. This course has no generated lakes or random cottages. Detailed buildings batch their repeated parts to limit draw calls, and have collision footprints.

Number 25 is modeled from the supplied oblique front photograph: two full stories, horizontal green cladding, white divided-light windows, a long dark tiled roof and a centered veranda between the ground-floor windows, with a sloping canopy and white railing. Its entrance faces approaching drivers.

The setting is a stylized interpretation traced from aerial imagery and the supplied photograph, rather than a measured reconstruction. Building heights, facade details, vegetation and some outlying farm positions are approximate; the gravel lane is widened to 6.2 m for playable overtaking. No map imagery or external textures are shipped. The route has its own save ID, so records from the previous forest stage do not transfer; the other five courses retain their records.

## Seasons and golden hour

Choose **Spring, Summer, Autumn or Winter** on the title screen; the existing scene updates immediately and the choice is remembered locally. Every course uses warm, low golden-hour sunlight with long shadows. Seasonal palettes recolor terrain, gravel, water, rocks, pine foliage and broadleaf trees. Winter's pale ground and foliage are color changes only: there is no snow geometry, frozen-water physics or altered grip.

Course layouts, checkpoints, building models and paint, vehicles, wildlife, collisions and handling stay the same. Changing seasons does not rebuild the scene or reroll traffic/wildlife. All seasons share the same personal records. Existing saves default to summer.

## Languages and saves

English, Dutch and Swedish are available from the title screen and pause menu. Language changes preserve the current run. On first use the browser language is selected when supported, with English as fallback.

Personal bests, medals, language and season are saved in this browser's local storage under `smaland-racer:v1`. There is no account or server. Clearing browser site data removes this progress. Invalid saves fall back safely, and blocked storage does not prevent playing (a notice explains when progress cannot be saved).

## Checks and production

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`dist/` contains the production website. Tests cover all six courses, checkpoint and scoring rules, pause/resume, recovery and damage, swept collisions, road clearance, wildlife behavior, traffic and overtaking, touch gestures and cancellation, roadside placement, save handling, translations and disposal of graphics resources. Reference drives exercise each course; medal targets are calibrated against conservative and faster clean runs. Wildlife adds variation to scored attempts.

## Architecture

- `track.ts`: course definitions, terrain, lake basins, road geometry and projection.
- `holmahult-data.ts`, `holmahult-scenery.ts`, `holmahult-home.ts`: authored real-location route, fields, farmyards, buildings and surrounding lanes.
- `race.ts`: state machine, directional checkpoints, splits, medals and penalties.
- `vehicle.ts`: procedural car, fixed-step arcade handling, impact response and visible damage.
- `collision.ts`: spatial grid, swept circle / oriented-box tests and damage calculation.
- `scenery.ts`, `wildlife.ts`: deterministic environments, colliders, randomized wildlife and signs.
- `traffic.ts`: slow A-traktors, lane following, queuing and moving collision geometry.
- `snow-poles.ts`: flexible roadside snow markers and impact-driven falling animations.
- `storage.ts`, `i18n.ts`: validated local saves and typed translation dictionaries.
- `input.ts`, `gestures.ts`: keyboard/pointer bindings, analog drag gestures, handbrake, double-tap recovery and interruption handling.
- `main.ts`: application orchestration, menus and adaptive HUD.
- `seasons.ts`: environmental color palettes, reversible tinting and saved season validation.
- `rendering.ts`, `dispose.ts`: reusable renderer, camera, lighting and graphics-resource lifecycle.

The game supports desktop keyboard play and mobile/touchscreen gestures. Multiplayer, AI opponents, online leaderboards, vehicle upgrades and audio are outside this version.
