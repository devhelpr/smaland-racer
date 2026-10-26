import materialAsset from '../assets/materials/lighting.json' with { type: 'json' };
import * as THREE from 'three';
import asset from '../assets/lighting.json' with { type: 'json' };

export const timesOfDay = ['day', 'night'] as const;
export type TimeOfDay = typeof timesOfDay[number];
export const headlightModes = ['off', 'dipped', 'beam', 'led'] as const;
export type HeadlightMode = typeof headlightModes[number];
export const isTimeOfDay = (value: unknown): value is TimeOfDay => timesOfDay.some(mode => mode === value);
export const isHeadlightMode = (value: unknown): value is HeadlightMode => headlightModes.some(mode => mode === value);
export const nextHeadlightMode = (mode: HeadlightMode): HeadlightMode => headlightModes[(headlightModes.indexOf(mode) + 1) % headlightModes.length];

/** One combined beam keeps the forest's shadow cost fixed across all lamp settings. */
export class VehicleLighting {
  readonly root = new THREE.Group();
  readonly beam = new THREE.SpotLight();
  private lens: THREE.MeshStandardMaterial;
  private headlights: THREE.MeshStandardMaterial;
  private tailLights: THREE.MeshStandardMaterial;
  constructor(headlights: THREE.MeshStandardMaterial, tailLights: THREE.MeshStandardMaterial) {
    this.headlights = headlights;
    this.tailLights = tailLights;
    this.root.name = 'vehicle-lighting';
    this.beam.position.fromArray(asset.beamPosition);
    this.beam.castShadow = true;
    this.beam.shadow.mapSize.set(asset.shadow.mapSize, asset.shadow.mapSize);
    this.beam.shadow.camera.near = asset.shadow.near;
    this.beam.shadow.bias = asset.shadow.bias;
    this.beam.shadow.normalBias = asset.shadow.normalBias;
    this.root.add(this.beam, this.beam.target);
    const housing = asset.ledHousing, lens = asset.ledLens;
    const body = new THREE.Mesh(new THREE.BoxGeometry(...housing.size as [number, number, number]), new THREE.MeshStandardMaterial(materialAsset.ledHousing));
    body.position.fromArray(housing.position);
    this.lens = new THREE.MeshStandardMaterial(materialAsset.ledLens);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(...lens.size as [number, number, number]), this.lens);
    glass.position.fromArray(lens.position);
    this.root.add(body, glass);
    this.setMode('dipped');
  }
  setMode(mode: HeadlightMode): void {
    const profile = asset.modes[mode];
    this.beam.visible = mode !== 'off';
    this.beam.color.set(profile.color);
    this.beam.intensity = profile.intensity;
    this.beam.distance = profile.distance;
    this.beam.angle = profile.angle;
    this.beam.penumbra = profile.penumbra;
    this.beam.target.position.fromArray(profile.target);
    this.beam.shadow.camera.far = profile.distance;
    this.beam.shadow.camera.updateProjectionMatrix();
    this.headlights.emissiveIntensity = profile.lampIntensity;
    this.lens.emissiveIntensity = profile.ledIntensity;
    this.tailLights.emissive.set(asset.tailEmissive);
    this.tailLights.emissiveIntensity = mode === 'off' ? 0 : asset.tailIntensity;
  }
}
