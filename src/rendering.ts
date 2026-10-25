import asset from '../assets/rendering.json' with { type: 'json' };
import * as THREE from 'three';
import { seasonPalettes, type Season } from './seasons.ts';
import type { Vehicle } from './vehicle.ts';

export function createRendering(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
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
    desired.copy(vehicle.position).addScaledVector(forward, -10.5 - Math.abs(vehicle.forwardSpeed) * 0.065); desired.y += 6.8;
    desired.y = Math.max(desired.y, vehicle.course.heightAt(desired.x, desired.z) + 2.5);
    target.copy(vehicle.position).addScaledVector(forward, 7); target.y += 1.1;
    camera.position.lerp(desired, snap ? 1 : 1 - Math.exp(-5 * dt));
    lookAt.lerp(target, snap ? 1 : 1 - Math.exp(-7 * dt)); camera.lookAt(lookAt);
    if(vehicle.impact>0) {camera.position.x+=Math.sin(performance.now()*.08)*vehicle.impact*.08; camera.position.y+=Math.cos(performance.now()*.065)*vehicle.impact*.06;}
    sun.position.copy(vehicle.position).add(sunlightOffset); sun.target.position.copy(vehicle.position); sun.target.updateMatrixWorld();
  }
  function setSeason(season:Season):void {
    const palette=seasonPalettes[season];
    scene.background=new THREE.Color(palette.sky);
    if(scene.fog instanceof THREE.Fog)scene.fog.color.set(palette.fog);
    ambient.groundColor.set(season==='winter'?asset.winterGround:asset.seasonGround);
  }
  setSeason('summer');
  return { renderer, scene, camera, follow, setSeason };
}
