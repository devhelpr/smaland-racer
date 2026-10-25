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

test('the ordinary Holmahult start approach joins both road edges and shoulders without the sideways stub',async()=>{
  const {createScenery}=await import('../src/scenery.ts');
  const {holmahultSideRoads}=await import('../src/holmahult-data.ts');
  const course=new Course(courses[0]),group=new THREE.Group();createScenery(group,course,new CollisionWorld());
  const start=course.sample(0),definition=holmahultSideRoads.find(r=>r.joinsCourseStart)!;
  const last=definition.points.at(-1)!,before=definition.points.at(-2)!;
  assert.deepEqual(last,[start.point.x,start.point.z]);
  const incoming=new THREE.Vector3(last[0]-before[0],0,last[1]-before[1]).normalize();
  assert.ok(incoming.dot(start.tangent)>.9999,'approach turns sideways at the race start');
  for(const [approachName,routeName] of [['holmahult-side-road-1','course-road'],['holmahult-start-shoulder','course-shoulder']]) {
    const approach=group.getObjectByName(approachName) as THREE.Mesh,route=group.getObjectByName(routeName) as THREE.Mesh;
    const a=approach.geometry.getAttribute('position'),b=route.geometry.getAttribute('position');
    for(let side=0;side<2;side++) {
      assert.ok(new THREE.Vector3().fromBufferAttribute(a,a.count-2+side).distanceTo(new THREE.Vector3().fromBufferAttribute(b,side))<1e-5,`${approachName}: seam in position or height`);
      if(routeName==='course-road') {
        const auv=approach.geometry.getAttribute('uv'),buv=route.geometry.getAttribute('uv');
        assert.equal(auv.getX(a.count-2+side),buv.getX(side));assert.equal(auv.getY(a.count-2+side),buv.getY(side));
        assert.equal((approach.material as THREE.MeshStandardMaterial).map,(route.material as THREE.MeshStandardMaterial).map);
      }
    }
  }
  const approach=group.getObjectByName('holmahult-side-road-1')!,road=group.getObjectByName('course-road')!;
  const across=new THREE.Vector3(-start.tangent.z,0,start.tangent.x);
  for(let along=-8;along<=8;along+=.25)for(let side=-course.definition.width/2+.2;side<course.definition.width/2-.2;side+=.25) {
    const p=start.point.clone().addScaledVector(start.tangent,along).addScaledVector(across,side);p.y+=10;
    assert.ok(new THREE.Raycaster(p,new THREE.Vector3(0,-1,0)).intersectObjects([approach,road]).length,'gap visible behind the car at the ordinary Holmahult start');
  }
  disposeGroup(group);
});
