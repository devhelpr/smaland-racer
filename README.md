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
| R | Right the car in place (+5 seconds; damage remains) |
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

- `parcours/`: JSON course definitions, world/terrain and placement settings, and authored Holmahult roads, fields, buildings, yards, walls and trees.
- `assets/`: JSON model dimensions, vector/shape coordinates, lighting and roadside markers.
- `assets/materials/`: material properties, color palettes, texture definitions and seasonal overrides.
- `track.ts`: typed course loading, terrain, lake basins, road geometry and projection.
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
- `materials.ts`, `textures.ts`, `gravel.ts`: material inheritance, seasonal properties, shared textures and world-space gravel UVs.
- `seasons.ts`: JSON palette loading, reversible tinting and saved season validation.
- `rendering.ts`, `dispose.ts`: reusable renderer, camera, lighting and graphics-resource lifecycle.

### Editing game data

Edit `parcours/courses.json` to change route points, names, widths, seeds, lakes, scenery counts or medal times. The array order controls course selection; Holmahult remains first by default. Coordinates are world-space meters, with +X east and +Z south; Holmahult's traced coordinates are already converted into this system. `parcours/holmahult.json` contains the reference URL and fixed scenery placements. The other parcours files configure terrain, procedural scenery, traffic and wildlife placement.

Edit the matching file in `assets/` to change a model or palette. Numeric arrays follow the consuming Three.js constructor or function: box parts use `[width, height, depth, x, y, z]`, size arrays use `[width, height, depth]`, and vector/shape arrays use their axis order. Named `XY`, `YZ` and `SizeXY` fields identify partial box arguments. Building `details` hold offsets, proportions and repeated-detail spacing. Rendering and generation algorithms stay in TypeScript; authored geometry, colors and level settings live in JSON.

Material definitions live in `assets/materials/`, grouped by model or scenery system. Their geometry stays in the matching file directly under `assets/`. The shared `surfaces.json` defines `gravel`, `road` and `shoulder`: roads and shoulders inherit gravel's color, texture and physical appearance, with optional overrides. Every gravel road, side road, shoulder and farmyard uses the same scene-local texture and world-space UVs.

`textures.json` defines named textures. The shipped `gravel` entry generates the existing gray grain; `worldScale` controls its size in meters and `anisotropy` controls filtering at shallow viewing angles. To use a photo instead, place it in `public/textures/` and replace that entry with:

```json
"gravel": {
  "type": "image",
  "url": "/textures/gravel.jpg",
  "worldScale": 3,
  "anisotropy": 4
}
```

The open-world asphalt roads use two generated textures in `textures.json`: `asphaltMain` has a dashed white center line for road 120; `asphaltEdges` has thinner dashed white edge lines for the smaller roads around Dångebo and toward Bro. Their asphalt grain, paint color, stripe width, edge inset and dash lengths are editable JSON. Each asphalt road selects `asphaltMain` or `asphalt` through its `material` property in `parcours/holmahult-open-world.json`. Road UVs run across the width and along accumulated road distance, so markings follow bends and retain their length. Rounded junction mouths sample unpainted asphalt. These markings are part of the asphalt texture.

`assets/materials/seasons.json` contains the environmental color palettes and baseline colors used to preserve tree/terrain variation. Its `materials` section supports additional seasonal material properties, including named texture maps. Overrides under `gravel` also apply to `road` and `shoulder`; an override for the specific variant takes precedence. Standard scenery materials use IDs formed from their JSON filename and property name, such as `scenery.waterMaterial`, `holmahult-scenery.roof`, `open-world.asphalt` or `sandsjon.bridge.concrete`. For example, entries inside `materials.winter` can be:

```json
"gravel": { "map": "gravel", "roughness": 1 },
"shoulder": { "color": "#d9dedb", "map": null },
"scenery.waterMaterial": { "roughness": 0.2 }
```

An explicit seasonal `color` overrides palette tinting for that material. `map: null` disables a texture for that season; another texture name selects an entry in `textures.json`. Omitted properties restore the base material on the next season switch. Existing seasonal colors and gravel grain are preserved by default. Seasonal property overrides apply to standard scenery materials; vehicle, traffic, marker and wildlife materials have separate editable JSON definitions.

JSON imports are bundled by Vite and work in the Node test runner through `with { type: 'json' }`. No runtime data fetch is required. Run the checks above after editing data to catch invalid JSON, type errors and road/collision regressions.

The game supports desktop keyboard play and mobile/touchscreen gestures. Multiplayer, AI opponents, online leaderboards, vehicle upgrades and audio are outside this version.

Driving styles are selected from the title screen or route menu. **Cruising** preserves the original handling; **Rally** increases acceleration and top speed and reduces grass drag. Best times are saved separately for each style. Existing saves default to Cruising.

**Sandsjön · Isrally** uses a shoreline hand-traced from the supplied Sandsjön satellite reference, including the eastern peninsulas, bays, and southern outlet. The Road 120 bridge crosses the southern narrows; the marked ice stage runs beneath it. The frozen lake has low grip across its whole surface, snowy shores, and an elevated road bridge with solid piers and open passages underneath. Select **Free drive** to explore without a timer target. This level always uses winter, independently of the season selected for the other routes. Lake/route data lives in `parcours/sandsjon.json`; visual geometry in `assets/sandsjon.json` and materials in `assets/materials/sandsjon.json`; handling profiles in `assets/driving.json`.


Driving over rocks now uses the same rotated, scaled facets as the visible stone. Four wheel contacts and chassis contacts apply gravity and rotational impulses around the car’s center of mass. Approach speed, the stone’s slope and the side that touches determine whether the car climbs, jumps, balances briefly on two wheels or tumbles. Steering can affect balance while wheels touch; airborne throttle and steering do not create tire forces. Grass drag slows an off-road approach gradually, retaining momentum for a jump. Hard landings and chassis impacts cause damage; an overturned car remains on its side or roof until **R** (or the touch recovery gesture) rights it at its current position. A wreck continues its tumble behind the result panel.

Use **Rally → Free drive** to experiment with the stones on and beside the roads. The minimap’s surface indicator shows airborne, two-wheel and overturned states. Gravity, inertia, contacts, body dimensions, landing damage and friction live in `assets/stunts.json`; rock shapes remain in `assets/scenery.json` and materials in `assets/materials/scenery.json`, and rock placement in `parcours/scenery.json` and `parcours/road-rocks.json`.

Seven authored stones sit at spaced positions on each route, including very low, flat stones (roughly 7–12 cm high) and a few higher, angled rocks. They use the same rendered geometry and wheel contact physics as roadside stones. Route progress, side offsets, scales and angles live in `parcours/road-rocks.json`. Manual righting keeps the current position and driving heading, clears linear/angular motion and retains damage and checkpoint progress. It does not snap or reorient the camera. Water and map-boundary recovery still return to the last checkpoint.

If the car rests on its roof or side for five consecutive seconds, it automatically rights itself in place using the same recovery penalty as R. Moving or tumbling restarts the wait; pausing freezes it. Camera direction, damage and checkpoint progress are preserved. The delay and stillness thresholds live in `assets/stunts.json` under `autoRight`. In the route menu, Start rally sits above the course grid, to the right of the Cruising/Rally choices.

### Holmahult open world prototype

Select **Holmahult · Dångebo · Bro** (level 8), then **Free drive**. This level always starts as free driving, with no finish or medal target. Its map shows the connected road network and village names. It includes Sandsjövägen (808), road 120, the turn onto road 812 toward Bro, a short continuation of 820, a drivable bridge and water in Bro, plus the original Holmahult farmyards. Restarting this level retains its scenery and traffic; changing driving style rebuilds the vehicle/world as before.

Road alignments come from [OpenStreetMap](https://www.openstreetmap.org/#map=13/56.53071/15.15186), © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright). Geographic roads use 45% scale to keep travel manageable. The original Holmahult village is stylized and connects through authored lanes. Village houses, the Bro bridge/stream and gentle elevation are artistic approximations, not surveyed replicas. The entire bounded world is loaded at once; chunk streaming and traffic routing through junctions are future work. A-traktors currently follow the original village route.

All new level coordinates, connections, buildings, terrain settings and source metadata live in `parcours/holmahult-open-world.json`; rendering dimensions and map styling live in `assets/open-world.json`, with materials in `assets/materials/open-world.json`. `DrivingWorld` in `src/driving-world.ts` is the vehicle/stunt contract; `Course` adapts the existing levels through `heightAt`, `surfaceAt`, `nearestRoad`, `isWater` and `spawn`. Race/checkpoint sampling remains separate from network road detection, so driving onto a side road supplies road grip without changing race progress. `RoadNetwork` preserves shared segment endpoints at intersections. Tests cover standalone-world driving, existing adapters, connectivity, road clearance, gentle grades and the bridge crossing.
