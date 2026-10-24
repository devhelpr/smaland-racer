import * as THREE from 'three';
import { nearestRoad, ROAD_WIDTH, terrainHeight, trackPoints, WORLD_SIZE } from './track.ts';
import type { DriveInput } from './input.ts';

export class Vehicle {
  readonly mesh = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  heading = 0;
  forwardSpeed = 0;
  onRoad = true;
  private steering = 0;
  private wheels: THREE.Group[] = [];

  constructor() {
    const paint = new THREE.MeshStandardMaterial({ color: '#e9ad48', roughness: 0.66, metalness: 0.12 });
    const trim = new THREE.MeshStandardMaterial({ color: '#233632', roughness: 0.7 });
    const glass = new THREE.MeshStandardMaterial({ color: '#71999e', roughness: 0.23, metalness: 0.3 });
    const white = new THREE.MeshStandardMaterial({ color: '#eee8d7' });
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z); mesh.castShadow = true; this.mesh.add(mesh); return mesh;
    };
    box(1.85, 0.55, 3.9, 0, 0.83, 0, paint);
    box(1.57, 0.65, 1.85, 0, 1.4, -0.25, glass);
    box(1.64, 0.12, 1.92, 0, 1.77, -0.25, paint);
    for (const x of [-0.78, 0.78]) {
      box(0.09, 0.72, 0.12, x, 1.4, 0.64, paint);
      box(0.09, 0.72, 0.12, x, 1.4, -1.14, paint);
      box(0.08, 0.65, 0.1, x, 1.4, -0.3, paint);
    }
    box(1.95, 0.16, 0.18, 0, 0.6, 1.99, trim);
    box(1.95, 0.16, 0.18, 0, 0.6, -1.99, trim);
    box(0.65, 0.2, 0.04, 0, 0.83, -1.963, white);
    const lamp = new THREE.MeshStandardMaterial({ color: '#fff0bf', emissive: '#c4a76c', emissiveIntensity: 0.35 });
    const red = new THREE.MeshStandardMaterial({ color: '#b64032' });
    for (const x of [-0.65, 0.65]) {
      box(0.37, 0.22, 0.06, x, 0.94, 1.97, lamp);
      box(0.28, 0.2, 0.06, x, 0.94, -1.97, red);
    }
    for (const x of [-0.95, 0.95]) for (const z of [-1.22, 1.22]) {
      const pivot = new THREE.Group(); pivot.position.set(x, 0.48, z);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.28, 10), trim);
      tire.rotation.z = Math.PI / 2; tire.castShadow = true; pivot.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.29, 8), white);
      hub.rotation.z = Math.PI / 2; pivot.add(hub);
      this.mesh.add(pivot); this.wheels.push(pivot);
    }
    this.position.copy(trackPoints[0]); this.reset();
  }

  reset(): void {
    const road = nearestRoad(this.position.x, this.position.z);
    this.position.copy(road.point);
    this.heading = Math.atan2(road.tangent.x, road.tangent.z);
    this.velocity.set(0, 0, 0); this.forwardSpeed = 0; this.steering = 0; this.onRoad = true;
    this.syncMesh();
  }

  update(dt: number, input: DriveInput): void {
    const road = nearestRoad(this.position.x, this.position.z);
    this.onRoad = road.distance <= ROAD_WIDTH / 2;
    const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const right = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    let longitudinal = this.velocity.dot(forward);
    let lateral = this.velocity.dot(right);
    this.steering = THREE.MathUtils.damp(this.steering, input.steer, 9, dt);
    const braking = input.throttle !== 0 && Math.sign(input.throttle) !== Math.sign(longitudinal) && Math.abs(longitudinal) > 0.8;
    const acceleration = braking ? 24 : input.throttle < 0 ? 8 : 12;
    longitudinal += input.throttle * acceleration * dt;
    longitudinal *= Math.exp(-(this.onRoad ? 0.16 : 1.2) * dt);
    if (input.handbrake) longitudinal *= Math.exp(-1.35 * dt);
    longitudinal = THREE.MathUtils.clamp(longitudinal, -9, this.onRoad ? 36 : 14);
    const grip = input.handbrake ? 1.4 : this.onRoad ? 5.2 : 7;
    lateral *= Math.exp(-grip * dt);
    this.heading += this.steering * longitudinal * (0.065 / (1 + Math.abs(longitudinal) * 0.045)) * dt * (input.handbrake ? 1.6 : 1);
    this.velocity.copy(forward).multiplyScalar(longitudinal).addScaledVector(right, lateral);
    this.position.addScaledVector(this.velocity, dt);
    this.position.y = terrainHeight(this.position.x, this.position.z);
    this.forwardSpeed = longitudinal;
    if (Math.abs(this.position.x) > WORLD_SIZE / 2 - 10 || Math.abs(this.position.z) > WORLD_SIZE / 2 - 10) this.reset();
    this.syncMesh();
    for (const wheel of this.wheels) {
      wheel.rotation.y = wheel.position.z > 0 ? this.steering * 0.35 : 0;
      for (const child of wheel.children) child.rotation.x += longitudinal * dt / 0.43;
    }
  }

  private syncMesh(): void {
    this.mesh.position.copy(this.position).y += 0.12;
    this.mesh.rotation.set(0, this.heading, 0);
    const dx = Math.sin(this.heading); const dz = Math.cos(this.heading);
    this.mesh.rotation.x = -Math.atan((terrainHeight(this.position.x + dx, this.position.z + dz) - terrainHeight(this.position.x - dx, this.position.z - dz)) / 2);
    this.mesh.rotation.z = Math.atan((terrainHeight(this.position.x + dz, this.position.z - dx) - terrainHeight(this.position.x - dz, this.position.z + dx)) / 2) + this.steering * Math.min(Math.abs(this.forwardSpeed) * 0.002, 0.045);
  }
}
