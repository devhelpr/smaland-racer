# Småland Racer

A small arcade rally escape through procedural pine woods, lakes, and red cottages. Built with **Vite, TypeScript, and Three.js**, with no UI framework, physics engine, or external art assets.

## Run locally

Use Node.js **22.18+** (Node 24 LTS recommended) and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The game starts immediately in free drive. Use a desktop browser with WebGL 2 and hardware acceleration enabled.

## Controls

| Key | Action |
| --- | --- |
| W / ↑ | Accelerate; brake when reversing |
| S / ↓ | Brake, then reverse |
| A D / ← → | Steer |
| Space | Handbrake / slide |
| R / Reset car button | Return to the nearest road section, facing forward |

Gravel provides speed and forgiving grip. Grass slows the car. Scenery is decorative and has no collisions; use reset if you drive into a lake or trees. Leaving the map automatically resets the car. The route display shows your position around the closed circuit.

## Checks and production

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`dist/` contains the production site. `preview` serves that build locally.

## Code layout

- `src/main.ts`: fixed-step simulation, HUD, and application setup.
- `src/track.ts`: shared circuit, road meshes, nearest-road projection, and terrain height.
- `src/vehicle.ts`: procedural car and arcade driving model (world units are meters).
- `src/input.ts`: keyboard state and focus handling.
- `src/scenery.ts`: deterministic terrain, lakes, instanced trees and rocks, cottages, and road posts.
- `src/rendering.ts`: lighting, renderer, resizing, and chase camera.
- `src/style.css`: responsive dashboard and overlays.

The simulation runs at 120 Hz with a capped frame delta. Input clears on blur or tab hiding. The starter targets keyboard free driving on one circuit; opponents, lap timing, audio, mobile controls, and scenery collisions are future work.
