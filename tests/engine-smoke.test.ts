import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EngineSmoke } from '../src/engine-smoke.ts';
import { disposeGroup } from '../src/dispose.ts';

function plume(damage:number) {
  const car=new THREE.Group(),hood=new THREE.Object3D(),smoke=new EngineSmoke();
  hood.position.set(0,1.2,1.4);car.add(hood,smoke.root);
  const velocity=new THREE.Vector3();
  const step=(dt=1/60)=>smoke.update(dt,damage,hood,velocity);
  for(let i=0;i<60;i++)step();
  const mesh=smoke.root.children[0] as THREE.InstancedMesh;
  return {car,hood,smoke,mesh,step};
}

test('damage produces a bounded plume which fades after repair and clears on recovery',()=>{
  const healthy=plume(50),light=plume(55),heavy=plume(100);
  assert.equal(healthy.mesh.count,0);
  assert.ok(light.mesh.count>0);
  assert.ok(heavy.mesh.count>light.mesh.count,'greater damage emits more smoke');
  assert.equal(heavy.mesh.material.depthWrite,false);
  for(let i=0;i<600;i++)heavy.step();
  assert.ok(heavy.mesh.count<=heavy.mesh.instanceMatrix.count,'particle pool stays bounded');
  for(let i=0;i<240;i++)heavy.smoke.update(1/60,0,heavy.hood,new THREE.Vector3());
  assert.equal(heavy.mesh.count,0,'existing smoke dissipates after repair');
  light.smoke.reset();assert.equal(light.mesh.count,0);
  for(const p of [healthy,light,heavy])disposeGroup(p.car);
});

test('emitted smoke rises in world space while the bonnet moves and rolls',()=>{
  const {car,hood,smoke,mesh}=plume(100);
  const matrix=new THREE.Matrix4(),before=new THREE.Vector3(),after=new THREE.Vector3();
  mesh.getMatrixAt(0,matrix);before.setFromMatrixPosition(matrix);
  car.position.set(30,0,-20);car.rotation.set(0,1,Math.PI);
  smoke.update(1/60,0,hood,new THREE.Vector3(20,0,0));
  car.updateMatrixWorld(true);
  mesh.getMatrixAt(0,matrix);after.setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld);
  assert.ok(after.distanceTo(before)<.1,'old smoke does not follow the vehicle');
  assert.ok(after.y>before.y,'buoyancy remains upright during a rollover');
  smoke.update(1,100,hood,new THREE.Vector3());
  mesh.getMatrixAt(mesh.count-1,matrix);
  after.setFromMatrixPosition(matrix);
  assert.ok(after.x>29,'new smoke follows the transformed bonnet');
  disposeGroup(car);
});
