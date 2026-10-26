import materialAsset from '../assets/materials/checkpoints.json' with { type: 'json' };
import * as THREE from 'three';
import asset from '../assets/checkpoints.json' with { type: 'json' };
import type { Course } from './track.ts';

interface Gate {
  mesh: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  depthMask: THREE.Group;
  age: number | null;
}

/** Numbered gantries fade as a single surface, preserving sign/metal occlusion. */
export class CheckpointGates {
  readonly root = new THREE.Group();
  private gates: Gate[] = [];
  private readonly closed: boolean;

  constructor(course: Course) {
    this.closed = course.definition.closed;
    for (const [index, sample] of course.checkpoints.slice(1).entries()) {
      const mesh = new THREE.Group();
      const metal = new THREE.MeshStandardMaterial(materialAsset.metal);
      const sign = new THREE.MeshStandardMaterial(materialAsset.sign);
      const lettering = new THREE.MeshStandardMaterial(materialAsset.lettering);
      const materials = [metal, sign, lettering];
      const bar = (a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.MeshStandardMaterial) => {
        const direction = b.clone().sub(a);
        const part = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material);
        part.position.copy(a).add(b).multiplyScalar(.5);
        part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        part.castShadow = true; mesh.add(part);
      };
      const path = (points: number[][], radius: number, material: THREE.MeshStandardMaterial) => {
        for (let i = 1; i < points.length; i++) bar(new THREE.Vector3(...points[i-1]), new THREE.Vector3(...points[i]), radius, material);
      };
      const halfWidth = course.definition.width / 2 + asset.postOffset;
      for (const side of [-1, 1]) {
        const x = side * halfWidth;
        // Seat both supports on the local terrain, including banked shoulders.
        const offset = new THREE.Vector3(x, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(sample.tangent.x, sample.tangent.z));
        const ground = course.height(sample.point.x + offset.x, sample.point.z + offset.z) - sample.point.y;
        bar(new THREE.Vector3(x, ground, 0), new THREE.Vector3(x, asset.height, 0), asset.postRadius, metal);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(...asset.footSize as [number,number,number]), metal);
        foot.position.set(x, ground + asset.footSize[1]/2, 0); mesh.add(foot);
      }
      for (const y of [asset.height, asset.height - asset.trussHeight]) {
        bar(new THREE.Vector3(-halfWidth, y, 0), new THREE.Vector3(halfWidth, y, 0), asset.postRadius, metal);
      }
      const braces = Math.ceil(halfWidth * 2 / asset.braceSpacing);
      for (let i = 0; i < braces; i++) {
        const x = -halfWidth + i * halfWidth * 2 / braces;
        const nextX = -halfWidth + (i+1) * halfWidth * 2 / braces;
        bar(new THREE.Vector3(x, asset.height - (i%2 ? 0 : asset.trussHeight), 0), new THREE.Vector3(nextX, asset.height - (i%2 ? asset.trussHeight : 0), 0), asset.braceRadius, metal);
      }
      const panel = new THREE.Mesh(new THREE.BoxGeometry(...asset.signSize as [number,number,number]), sign);
      panel.position.y = asset.signY; panel.castShadow = true; mesh.add(panel);
      // Mirror the face on the back so numbers remain readable from either direction.
      for (const face of [-1, 1]) {
        const [width, height, depth] = asset.signSize;
        const x = width/2 - asset.borderInset, bottom = asset.signY - height/2 + asset.borderInset, top = asset.signY + height/2 - asset.borderInset;
        path([[-x,bottom,face*(depth/2+asset.borderRadius)], [x,bottom,face*(depth/2+asset.borderRadius)], [x,top,face*(depth/2+asset.borderRadius)], [-x,top,face*(depth/2+asset.borderRadius)], [-x,bottom,face*(depth/2+asset.borderRadius)]], asset.borderRadius, lettering);
        const [nx, ny, nz] = asset.numberOffset;
        for (const stroke of asset.numberPaths[index]) path(stroke.map(([px,py])=>[face*(px+nx),py+ny,face*nz]), asset.strokeRadius, lettering);
        for (const stroke of asset.arrowPaths) path(stroke.map(([px,py,pz])=>[face*px,py,face*pz]), asset.strokeRadius, lettering);
      }
      mesh.position.copy(sample.point); mesh.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
      // Fill depth after the scenery, before blending the gantry. This prevents
      // hidden bars and the back of the sign showing through during the fade.
      const depthMask = new THREE.Group(); depthMask.visible = false;
      const maskMaterial = new THREE.MeshBasicMaterial(materialAsset.mask);
      for (const child of [...mesh.children]) {
        if (!(child instanceof THREE.Mesh)) continue;
        const mask = child.clone(false);
        mask.material = maskMaterial; mask.castShadow = false; mask.renderOrder = 1000;
        child.renderOrder = 1001;
        depthMask.add(mask);
      }
      mesh.add(depthMask);
      // The circuit finish shares the start line; reveal it only on the final leg.
      mesh.visible = !this.closed || index < course.checkpoints.length - 2;
      this.root.add(mesh); this.gates.push({mesh, materials, depthMask, age:null});
    }
  }

  restore(number: number): void {
    const gate = this.gates[number-1];
    gate.age = null; gate.mesh.visible = true; gate.depthMask.visible = false;
    for (const material of gate.materials) {
      material.opacity = 1; material.transparent = false; material.depthWrite = true;
    }
  }

  pass(number: number, repeatLap = false): void {
    if (repeatLap) for (let i = 1; i < this.gates.length; i++) this.restore(i);
    const gate = this.gates[number-1];
    if (gate.age !== null) return;
    if (this.closed && number === this.gates.length - 1) this.restore(this.gates.length);
    gate.age = 0; gate.depthMask.visible = true;
    for (const material of gate.materials) {
      material.transparent = true; material.depthWrite = false;
    }
  }

  update(dt: number): void {
    for (const gate of this.gates) {
      if (gate.age === null || !gate.mesh.visible) continue;
      gate.age += dt;
      const progress = Math.min(1, gate.age / asset.effect.duration);
      for (const material of gate.materials) material.opacity = 1-progress;
      if (progress === 1) {gate.mesh.visible = false; gate.depthMask.visible = false;}
    }
  }
}
