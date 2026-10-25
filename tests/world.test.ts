import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { courses, Course } from '../src/track.ts';
import { createScenery } from '../src/scenery.ts';
import { CollisionWorld, CAR_RADIUS } from '../src/collision.ts';
import { Wildlife } from '../src/wildlife.ts';
import { disposeGroup } from '../src/dispose.ts';
import { formatTime } from '../src/i18n.ts';

for(const definition of courses)test(`${definition.id}: driving corridor only contains authored road rocks and assets dispose once`,()=> {
  const group=new THREE.Group(),course=new Course(definition),world=new CollisionWorld();createScenery(group,course,world);
  for(let i=0;i<course.points.length-1;i++) {
    const a=course.points[i],b=course.points[i+1];
    const centerHit=world.sweep(a,b);
    assert.ok(!centerHit||centerHit.collider.id.startsWith('road-rock-'),`unexpected centerline obstacle at ${i}`);
    for(const sign of [-1,1]) {
      const tangent=course.sample(i/(course.points.length-1)).tangent;
      const offset=new THREE.Vector3(-tangent.z,0,tangent.x).multiplyScalar(sign*(definition.width/2-CAR_RADIUS));
      const edgeHit=world.sweep(a.clone().add(offset),b.clone().add(offset));
      assert.ok(!edgeHit||edgeHit.collider.id.startsWith('road-rock-'),`unexpected road-edge obstacle at ${i}`);
    }
  }
  const scene=new THREE.Scene();scene.add(group);
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  group.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const m of Array.isArray(object.material)?object.material:[object.material]){materials.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)textures.add(v);}}});
  let disposed=0;const assets=[...geometries,...materials,...textures];for(const asset of assets)asset.addEventListener('dispose',()=>disposed++);
  disposeGroup(group);assert.equal(group.parent,null);assert.equal(group.children.length,0);assert.equal(disposed,assets.length);
});

test('wildlife waits, crosses from the verge, flees and disables its collider',()=> {
  const course=new Course(courses[0]),world=new CollisionWorld(),group=new THREE.Group();const wildlife=new Wildlife(course,world,group,123);
  const animal=wildlife.animals[0],initial=animal.mesh.position.clone();
  wildlife.update(1,course.sample(0).point,0);assert.equal(animal.state,'waiting');assert.ok(animal.mesh.position.distanceTo(initial)<.001);
  const approach=course.sample(animal.plan.progress-50/course.length).point;
  wildlife.update(.01,approach,20);assert.equal(animal.activated,true);
  for(let i=0;i<120*25;i++)wildlife.update(1/120,approach,20);
  assert.equal(animal.state,'gone');assert.equal(animal.collider.active,false);assert.equal(animal.mesh.visible,false);
  disposeGroup(group);
});

test('time formatting carries rounded seconds into minutes',()=> {
  assert.equal(formatTime(59.999,'en'),'1:00.00');assert.equal(formatTime(61.25,'nl'),'1:01,25');
});
