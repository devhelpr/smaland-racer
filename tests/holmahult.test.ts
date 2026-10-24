import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { holmahultBuildings, holmahultFieldAt, onHolmahultSideRoad } from '../src/holmahult-data.ts';
import { createHolmahultScenery } from '../src/holmahult-scenery.ts';
import { CollisionWorld } from '../src/collision.ts';
import { disposeGroup } from '../src/dispose.ts';
import { loadProgress } from '../src/storage.ts';

test('Holmahult is the first/default open stage with a bend east of number 25 and fixed farmyards',()=>{
  const course=new Course(courses[0]),home=holmahultBuildings.find(b=>b.id==='holmahult-25')!;
  assert.equal(course.definition.id,'holmahult-stage');assert.equal(course.definition.closed,false);
  assert.ok(course.length>800&&course.length<900);assert.equal(course.lakes.length,0);
  const lane=course.nearest(home.x,home.z);
  assert.ok(lane.point.x>home.x);assert.ok(lane.distance>10&&lane.distance<20);
  assert.ok(course.sample(0).point.z<home.z-200);
  assert.ok(course.sample(1).point.z>home.z+300);
  const barns=holmahultBuildings.filter(b=>b.kind==='barn'&&b.z<home.z);
  assert.ok(barns.length>=2);assert.ok(barns.some(b=>b.depth>25&&Math.abs(b.x-home.x)<20));
  assert.ok(holmahultFieldAt(0,-70)>=0);assert.ok(onHolmahultSideRoad(-59,-112,1));
});

test('the green home and red farm buildings have bounded render geometry and matching collisions',()=>{
  const group=new THREE.Group(),world=new CollisionWorld(),course=new Course(courses[0]);
  createHolmahultScenery(group,course,world);group.updateMatrixWorld(true);
  for(const building of holmahultBuildings) {
    const mesh=group.getObjectByName(building.id)!;assert.ok(mesh);
    assert.equal(mesh.position.x,building.x);assert.equal(mesh.position.z,building.z);
    const bounds=new THREE.Box3().setFromObject(mesh),size=bounds.getSize(new THREE.Vector3());
    assert.ok(size.x<40&&size.z<40&&size.y<12);
    const center=new THREE.Vector3(building.x,0,building.z);
    assert.equal(world.sweep(center,center)?.collider.id,building.id);
    const painted:THREE.Mesh[]=[];let drawCalls=0;
    mesh.traverse(object=>{
      if(object instanceof THREE.Mesh) {
        drawCalls++;
        if((object.material as THREE.MeshStandardMaterial).color.equals(new THREE.Color(building.color)))painted.push(object);
      }
    });
    assert.ok(painted.length>0,`${building.id}: painted walls missing`);
    assert.ok(drawCalls<=8,`${building.id}: decorative details must be batched`);
  }
  const home=holmahultBuildings.find(building=>building.id==='holmahult-25')!;
  // The veranda is centered between the two ground-floor windows.
  // It must still stop a car, after rotating the entrance towards arriving drivers.
  const verandaEdge=new THREE.Vector3(2.1,0,home.depth/2+2.1)
    .applyAxisAngle(new THREE.Vector3(0,1,0),home.angle)
    .add(new THREE.Vector3(home.x,0,home.z));
  assert.equal(world.sweep(verandaEdge,verandaEdge)?.collider.id,'holmahult-25-porch');
  const rightWindowApproach=new THREE.Vector3(4.05,0,home.depth/2+2.1)
    .applyAxisAngle(new THREE.Vector3(0,1,0),home.angle)
    .add(new THREE.Vector3(home.x,0,home.z));
  assert.equal(world.sweep(rightWindowApproach,rightWindowApproach),null);
  disposeGroup(group);
});

test('old forest-stage times do not become Holmahult records',()=>{
  const progress=loadProgress({getItem:()=>JSON.stringify({version:1,language:'nl',records:{'forest-stage':{elapsed:1,damage:0,recoveries:0,total:1,medal:'gold',splits:[]}}}),setItem:()=>{}});
  assert.equal(progress.records['holmahult-stage'],undefined);
});
