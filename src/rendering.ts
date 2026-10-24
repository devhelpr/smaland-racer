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
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#c8d9cf'); scene.fog = new THREE.Fog('#c8d9cf', 85, 330);
  const ambient=new THREE.HemisphereLight('#ffe5c4','#6e7054',1.9);scene.add(ambient);
  const sunlightOffset=new THREE.Vector3(-100,48,-60);
  const sun = new THREE.DirectionalLight('#ffd09a', 3.0); sun.position.copy(sunlightOffset); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -65; sun.shadow.camera.right = 65; sun.shadow.camera.top = 65; sun.shadow.camera.bottom = -65;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 300; sun.shadow.normalBias = 0.08; sun.shadow.bias = -0.0002; scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 650);
  const target = new THREE.Vector3(); const desired = new THREE.Vector3(); const lookAt = new THREE.Vector3();
  const resize = () => { const width = container.clientWidth; const height = container.clientHeight; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); };
  window.addEventListener('resize', resize); resize();
  function follow(vehicle: Vehicle, dt: number, snap = false) {
    const forward = new THREE.Vector3(Math.sin(vehicle.heading), 0, Math.cos(vehicle.heading));
    desired.copy(vehicle.position).addScaledVector(forward, -10.5 - Math.abs(vehicle.forwardSpeed) * 0.065); desired.y += 6.8;
    desired.y = Math.max(desired.y, vehicle.course.height(desired.x, desired.z) + 2.5);
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
    ambient.groundColor.set(season==='winter'?'#9c9b9c':'#6e7054');
  }
  setSeason('summer');
  return { renderer, scene, camera, follow, setSeason };
}
