import asset from '../assets/snow-poles.json' with { type: 'json' };
import * as THREE from 'three';
import { Course } from './track.ts';
import type { Collider, CollisionWorld } from './collision.ts';

interface SnowPole {
  mesh: THREE.Group;
  collider: Collider;
  falling: boolean;
  progress: number;
  fallRate: number;
  axis: THREE.Vector3;
  angle: number;
}

/** Lightweight verge markers pivot at their base and stay down for this attempt. */
export class SnowPoles {
  readonly poles: SnowPole[] = [];

  constructor(course: Course, world: CollisionWorld, group: THREE.Group) {
    const height = asset.height;
    const shaftGeometry = new THREE.CylinderGeometry(asset.shaftRadiusTop, asset.shaftRadiusBottom, height, asset.shaftSegments);
    const bandGeometry = new THREE.CylinderGeometry(...asset.bandGeometry as [number, number, number, number]);
    const orange = new THREE.MeshStandardMaterial(asset.orange);
    const reflective = new THREE.MeshStandardMaterial(asset.reflective);
    const count = Math.ceil(course.length / asset.spacing);
    for (let i = 0; i < count; i++) {
      const sample = course.sample(i / count);
      for (const side of [-1, 1]) {
        const mesh = new THREE.Group();
        const offset = (course.definition.width / 2 + asset.roadOffset) * side;
        const x = sample.point.x - sample.tangent.z * offset;
        const z = sample.point.z + sample.tangent.x * offset;
        if(course.roadNetwork) {const road=course.nearestRoad(x,z);if(road.distance<road.width/2+asset.colliderRadius)continue;}
        mesh.position.set(x, course.height(x, z), z);
        const shaft = new THREE.Mesh(shaftGeometry, orange);
        shaft.position.y = height / 2;
        shaft.castShadow = true;
        mesh.add(shaft);
        for (const y of asset.bandHeights) {
          const band = new THREE.Mesh(bandGeometry, reflective);
          band.position.y = y;
          mesh.add(band);
        }
        const collider: Collider = { id: `snow-pole-${i}-${side}`, x, z, radius: asset.colliderRadius, kind: 'snowPole', active: true };
        const pole: SnowPole = { mesh, collider, falling: false, progress: 0, fallRate: 5, axis: new THREE.Vector3(), angle: Math.PI / 2 };
        collider.onHit = velocity => {
          if (pole.falling) return;
          const direction = velocity.clone().setY(0).normalize();
          pole.axis.set(direction.z, 0, -direction.x);
          // Follow the local ground at the tip so the fallen marker rests on sloping verges.
          const tipHeight = course.height(x + direction.x * height, z + direction.z * height);
          pole.angle = Math.acos(THREE.MathUtils.clamp((tipHeight - mesh.position.y + 0.06) / height, -0.3, 0.3));
          pole.fallRate = 3 + Math.min(30, velocity.length()) * 0.12;
          pole.falling = true;
        };
        this.poles.push(pole);
        world.add(collider);
        group.add(mesh);
      }
    }
  }

  update(dt: number): void {
    for (const pole of this.poles) {
      if (!pole.falling || pole.progress === 1) continue;
      pole.progress = Math.min(1, pole.progress + dt * pole.fallRate);
      const eased = 1 - (1 - pole.progress) ** 3;
      pole.mesh.quaternion.setFromAxisAngle(pole.axis, pole.angle * eased);
    }
  }
}
