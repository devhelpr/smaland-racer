import './style.css';
import { createRendering } from './rendering.ts';
import { createScenery } from './scenery.ts';
import { Input } from './input.ts';
import { Vehicle } from './vehicle.ts';
import { trackLength, trackPoints } from './track.ts';

function start(): void {
  const viewport = document.querySelector<HTMLElement>('#viewport')!;
  const { renderer, scene, camera, follow } = createRendering(viewport);
  createScenery(scene);
  const vehicle = new Vehicle(); scene.add(vehicle.mesh);
  const input = new Input();
  const speed = document.querySelector<HTMLElement>('#speed')!;
  const gear = document.querySelector<HTMLElement>('#gear')!;
  const surface = document.querySelector<HTMLElement>('#surface')!;
  const hint = document.querySelector<HTMLElement>('#drive-hint')!;
  const mapCar = document.querySelector<SVGCircleElement>('#map-car')!;
  document.querySelector('#map-track')!.setAttribute('d', trackPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' ') + 'Z');
  document.querySelector('#route-length')!.textContent = `${(trackLength / 1000).toFixed(2)} KM CIRCUIT`;
  document.querySelector('#reset')!.addEventListener('click', () => { input.reset(); (document.activeElement as HTMLElement)?.blur(); });
  follow(vehicle, 0, true);
  let lastTime = performance.now();
  let accumulator = 0;
  const step = 1 / 120;
  let departed = false;
  document.addEventListener('visibilitychange', () => { lastTime = performance.now(); accumulator = 0; });
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); renderer.setAnimationLoop(null);
    const error = document.querySelector<HTMLElement>('#error')!; error.hidden = false; error.textContent = 'The graphics context was interrupted. Reload the page to return to the road.';
  });
  renderer.setAnimationLoop(now => {
    const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.05); lastTime = now;
    if (input.consumeReset()) { vehicle.reset(); follow(vehicle, 0, true); accumulator = 0; }
    const controls = input.read();
    accumulator += dt;
    while (accumulator >= step) { vehicle.update(step, controls); accumulator -= step; }
    follow(vehicle, dt);
    if (!departed && Math.abs(vehicle.forwardSpeed) > 2) { hint.classList.add('departed'); departed = true; }
    speed.textContent = Math.round(vehicle.velocity.length() * 3.6).toString().padStart(3, '0');
    gear.textContent = vehicle.forwardSpeed < -0.5 ? 'R' : Math.abs(vehicle.forwardSpeed) < 0.5 ? 'N' : 'D';
    surface.textContent = vehicle.onRoad ? 'GRAVEL' : 'OFF ROAD'; surface.classList.toggle('off-road', !vehicle.onRoad);
    mapCar.setAttribute('cx', vehicle.position.x.toFixed(2)); mapCar.setAttribute('cy', vehicle.position.z.toFixed(2));
    renderer.render(scene, camera);
  });
}

try { start(); } catch (error) {
  console.error(error);
  const message = document.querySelector<HTMLElement>('#error')!;
  message.hidden = false; message.textContent = 'Unable to start the game. Use a browser with WebGL 2 and hardware acceleration enabled, then reload.';
}
