import lightingAsset from '../assets/lighting.json' with { type: 'json' };
import type { TimeOfDay } from './lighting.ts';
import asset from '../assets/rendering.json' with { type: 'json' };
import * as THREE from 'three';
import { seasonPalettes, type Season } from './seasons.ts';
import type { Vehicle } from './vehicle.ts';

export function createRendering(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = lightingAsset.dayExposure;
  container.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Småland forest rally. Drive with WASD or arrow keys.');
  const scene = new THREE.Scene(); scene.background = new THREE.Color(asset.initialSky); scene.fog = new THREE.Fog(asset.initialFog, asset.fogNear, asset.fogFar);
  const ambient=new THREE.HemisphereLight(asset.ambientSky,asset.ambientGround,asset.ambientIntensity);scene.add(ambient);
  const sunlightOffset=new THREE.Vector3(...asset.sunlightOffset as [number,number,number]);
  const sun = new THREE.DirectionalLight(asset.sunColor, asset.sunIntensity); sun.position.copy(sunlightOffset); sun.castShadow = true;
  sun.shadow.mapSize.set(asset.shadow.mapSize, asset.shadow.mapSize); sun.shadow.camera.left = -asset.shadow.extent; sun.shadow.camera.right = asset.shadow.extent; sun.shadow.camera.top = asset.shadow.extent; sun.shadow.camera.bottom = -asset.shadow.extent;
  sun.shadow.camera.near = asset.shadow.near; sun.shadow.camera.far = asset.shadow.far; sun.shadow.normalBias = asset.shadow.normalBias; sun.shadow.bias = asset.shadow.bias; scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(asset.camera.fov, 1, asset.camera.near, asset.camera.far);
  const target = new THREE.Vector3(); const desired = new THREE.Vector3(); const lookAt = new THREE.Vector3();
  const resize = () => { const width = container.clientWidth; const height = container.clientHeight; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); };
  window.addEventListener('resize', resize); resize();
  function follow(vehicle: Vehicle, dt: number, snap = false) {
    const forward = new THREE.Vector3(Math.sin(vehicle.heading), 0, Math.cos(vehicle.heading));
    desired.copy(vehicle.position).addScaledVector(forward, -asset.follow.distance - Math.abs(vehicle.forwardSpeed) * asset.follow.speedDistance); desired.y += asset.follow.height;
    desired.y = Math.max(desired.y, vehicle.course.heightAt(desired.x, desired.z) + asset.follow.minGroundClearance);
    target.copy(vehicle.position).addScaledVector(forward, asset.follow.lookAhead); target.y += asset.follow.lookHeight;
    camera.position.lerp(desired, snap ? 1 : 1 - Math.exp(-asset.follow.positionResponse * dt));
    lookAt.lerp(target, snap ? 1 : 1 - Math.exp(-asset.follow.lookResponse * dt)); camera.lookAt(lookAt);
    if(vehicle.impact>0) {camera.position.x+=Math.sin(performance.now()*.08)*vehicle.impact*.08; camera.position.y+=Math.cos(performance.now()*.065)*vehicle.impact*.06;}
    sun.position.copy(vehicle.position).add(sunlightOffset); sun.target.position.copy(vehicle.position); sun.target.updateMatrixWorld();
  }
  let currentSeason: Season = 'summer';
  let currentTime: TimeOfDay = 'day';
  function updateEnvironment(): void {
    const palette = seasonPalettes[currentSeason], night = lightingAsset.night;
    const dark = currentTime === 'night';
    scene.background = new THREE.Color(dark ? night.sky : palette.sky);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(dark ? night.fog : palette.fog);
      scene.fog.near = dark ? night.fogNear : asset.fogNear;
      scene.fog.far = dark ? night.fogFar : asset.fogFar;
    }
    ambient.color.set(dark ? night.ambientSky : asset.ambientSky);
    ambient.groundColor.set(dark ? night.ambientGround : currentSeason === 'winter' ? asset.winterGround : asset.seasonGround);
    ambient.intensity = dark ? night.ambientIntensity : asset.ambientIntensity;
    sun.color.set(dark ? night.moonColor : asset.sunColor);
    sun.intensity = dark ? night.moonIntensity : asset.sunIntensity;
    // Moonlight only provides a faint silhouette; the car supplies road visibility.
    sun.castShadow = !dark;
    renderer.toneMappingExposure = dark ? night.exposure : lightingAsset.dayExposure;
  }
  function setSeason(season: Season): void { currentSeason = season; updateEnvironment(); }
  function setTimeOfDay(time: TimeOfDay): void { currentTime = time; updateEnvironment(); }
  setSeason('summer');
  return { renderer, scene, camera, follow, setSeason, setTimeOfDay };
}
