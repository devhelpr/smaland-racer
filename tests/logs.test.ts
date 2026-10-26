import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { CollisionWorld, CAR_RADIUS } from '../src/collision.ts';
import { createLogScenery, logSites } from '../src/logs.ts';
import { disposeGroup } from '../src/dispose.ts';

for(const id of courses.filter(course=>course.setting!=='sandsjon').map(course=>course.id))test(`${id}: timber piles have collision and loose logs occupy only part of the road`,()=>{
  const course=new Course(courses.find(course=>course.id===id)!),root=new THREE.Group(),world=new CollisionWorld();
  createLogScenery(root,course,world);
  const mesh=root.getObjectByName('roadside-log-piles') as THREE.InstancedMesh;
  const sites=logSites(course);
  assert.ok(sites.filter(site=>site.pile).length>=2);assert.ok(sites.some(site=>!site.pile));
  assert.ok(mesh.count>sites.length);
  for(const site of sites) {
    const road=course.nearestRoad(site.x,site.z);
    const across=new THREE.Vector3(site.x-road.point.x,0,site.z-road.point.z).normalize();
    const from=road.point.clone().addScaledVector(across,-road.width/2+CAR_RADIUS);
    const to=from.clone().addScaledVector(road.tangent,3);
    assert.equal(world.sweep(from,to),null,'opposite lane must remain passable');
    const verge=road.point.clone().addScaledVector(across,road.width/2-CAR_RADIUS);
    if(!site.pile)assert.ok(world.sweep(verge,verge)?.collider.id.startsWith('logs-'),'loose log must actually overlap the driving lane');
    else assert.ok(world.sweep(new THREE.Vector3(site.x,0,site.z),new THREE.Vector3(site.x,0,site.z)),'piles must have physical collision');
  }
  disposeGroup(root);
});
