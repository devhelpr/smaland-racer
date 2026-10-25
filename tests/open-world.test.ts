import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { Vehicle } from '../src/vehicle.ts';
import type { DrivingWorld } from '../src/driving-world.ts';
import { createScenery } from '../src/scenery.ts';
import { CollisionWorld } from '../src/collision.ts';
import { disposeGroup } from '../src/dispose.ts';

const definition=courses.find(c=>c.id==='holmahult-open-world')!;

test('vehicle and stunts drive in a world without a course or race',()=>{
  const world:DrivingWorld={spawn:{point:new THREE.Vector3(),tangent:new THREE.Vector3(0,0,1)},heightAt:()=>0,surfaceAt:()=> 'asphalt',isWater:()=>false,nearestRoad:()=>({point:new THREE.Vector3(),tangent:new THREE.Vector3(0,0,1),width:8,distance:0,progress:0,surface:'asphalt'})};
  const car=new Vehicle(world);
  for(let i=0;i<120;i++)car.update(1/120,{throttle:1,steer:0,handbrake:false,autoDrift:false});
  assert.ok(car.position.z>1);assert.ok(car.onRoad);assert.equal(car.position.y,0);
  car.rightInPlace();assert.ok(Number.isFinite(car.position.y));
  disposeGroup(car.mesh);
});

test('the Course adapter preserves height, road surface, spawn and water on existing levels',()=>{
  for(const definition of courses.filter(c=>!c.openWorld)) {
    const course=new Course(definition);
    for(const t of [0,.25,.5,.75,1]) {
      const {point}=course.sample(t);
      assert.equal(course.heightAt(point.x,point.z),course.height(point.x,point.z));
      assert.equal(course.surfaceAt(point.x,point.z),course.onIce(point.x,point.z)?'ice':'gravel');
      assert.equal(course.isWater(point.x,point.z),course.inWater(point.x,point.z));
    }
    assert.deepEqual(course.spawn,course.sample(0));
  }
});

test('all network roads have grip, stay within the world and have gentle grades',()=>{
  const course=new Course(definition);
  for(const road of course.roadNetwork!.roads)for(const [i,p] of road.points.entries()) {
    assert.notEqual(course.surfaceAt(p.x,p.z),'grass',road.definition.id);
    assert.ok(Math.abs(p.x)<course.worldSize/2-8&&Math.abs(p.z)<course.worldSize/2-8);
    if(i) {
      const a=road.points[i-1],grade=Math.abs(p.y-a.y)/Math.hypot(p.x-a.x,p.z-a.z);
      assert.ok(grade<.12,`${road.definition.id}: grade ${grade}`);
    }
  }
  const heights=course.roadNetwork!.roads.flatMap(r=>r.points.map(p=>p.y));
  assert.ok(Math.max(...heights)-Math.min(...heights)>8);
});

test('every geographic road connects to Holmahult, including Dångebo and the Bro crossing',()=>{
  const course=new Course(definition),roads=course.roadNetwork!.roads;
  const reachable=new Set(['holmahult-village']);
  let changed=true;
  while(changed) {
    changed=false;
    for(const road of roads) {
      if(reachable.has(road.definition.id))continue;
      if(roads.some(other=>reachable.has(other.definition.id)&&road.definition.points.some(p=>other.definition.points.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<(road.definition.width+other.definition.width)/2)))) {
        reachable.add(road.definition.id);changed=true;
      }
    }
  }
  for(const road of roads.filter(r=>r.definition.id.startsWith('osm-')))assert.ok(reachable.has(road.definition.id),`${road.definition.id} disconnected`);
});

test('all road centerlines are clear and the Bro deck is dry above visible roadside water',()=>{
  const course=new Course(definition),scene=new THREE.Group(),collisions=new CollisionWorld();createScenery(scene,course,collisions);
  const blocked=new Set<string>();
  for(const road of course.roadNetwork!.roads)for(let i=1;i<road.points.length;i++) {
    const hit=collisions.sweep(road.points[i-1],road.points[i]);
    if(hit&&!hit.collider.id.startsWith('road-rock-'))blocked.add(`${road.definition.id} blocked by ${hit.collider.id}`);
  }
  assert.deepEqual([...blocked],[]);
  const b=definition.openWorld!.bridge,[x,z]=b.position;
  assert.ok(scene.getObjectByName('bro-bridge'));assert.equal(course.isWater(x,z),false);
  const sideX=x+20*Math.cos(b.angle),sideZ=z-20*Math.sin(b.angle);
  assert.ok(course.isWater(sideX,sideZ));assert.ok(course.height(x,z)-course.height(sideX,sideZ)>2);
  disposeGroup(scene);
});
