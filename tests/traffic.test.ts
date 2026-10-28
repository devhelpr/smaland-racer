import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { CAR_RADIUS, CollisionWorld } from '../src/collision.ts';
import { Traffic } from '../src/traffic.ts';
import { Vehicle } from '../src/vehicle.ts';
import { roadsideCottages } from '../src/scenery.ts';
import { disposeGroup } from '../src/dispose.ts';

for(const definition of courses)test(`${definition.id}: scenery follows the setting and leaves roads safe`,()=> {
  const course=new Course(definition),cottages=roadsideCottages(course);
  if(definition.setting==='sandsjon') {
    assert.equal(course.lakes.length,1);
    assert.ok(course.points.every(point=>course.onIce(point.x,point.z)));
  } else if(definition.setting==='holmahult') {
    assert.equal(course.lakes.length,0,'the real lane has no lakes alongside it');
    assert.equal(cottages.length,0,'fixed farmyards replace random cottages');
  } else {
    assert.ok(course.lakes.length>=definition.lakes.length+3);
    assert.ok(cottages.length>=9);
  }
  for(const site of cottages) {
    const distance=course.nearest(site.x,site.z).distance;
    assert.ok(distance>=definition.width/2+10&&distance<32);
    assert.ok(!course.inWater(site.x,site.z));
  }
  for(const point of course.points) {
    for(const lake of definition.setting==='sandsjon'?[]:course.lakes)assert.ok(Math.hypot((point.x-lake.x)/(lake.rx+definition.width/2+2),(point.z-lake.z)/(lake.rz+definition.width/2+2))>1,`${definition.id}: shoreline reaches road`);
  }
});

for(const definition of courses)test(`${definition.id}: slow traffic follows the road and blocks passing on narrow roads`,()=> {
  const course=new Course(definition),world=new CollisionWorld(),group=new THREE.Group(),traffic=new Traffic(course,world,group);
  if(definition.setting==='sandsjon')assert.equal(traffic.vehicles.length,0);
  else assert.ok(traffic.vehicles.length>=3&&traffic.vehicles.length<=7);
  for(const vehicle of traffic.vehicles) {
    assert.ok(vehicle.speed>=6.4&&vehicle.speed<=7.8);
    const sample=course.sample(vehicle.distance/course.length);
    const offset=vehicle.mesh.position.clone().sub(sample.point).setY(0);
    const right=new THREE.Vector3(-sample.tangent.z,0,sample.tangent.x);
    assert.ok(offset.dot(right)>0);
    assert.ok(offset.dot(right)+vehicle.collider.halfX<=definition.width/2+1e-6,'traffic stays within the road edge');
    const facing=vehicle.mesh.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    assert.ok(facing.dot(sample.tangent)>.99);
    assert.ok(!course.inWater(vehicle.mesh.position.x,vehicle.mesh.position.z));
    const passingCenter=sample.point.clone().addScaledVector(right,-definition.width/2+CAR_RADIUS);
    assert.ok(world.sweep(passingCenter.clone().addScaledVector(sample.tangent,-8),passingCenter.clone().addScaledVector(sample.tangent,8)),'a second car cannot pass within the gravel road');
  }
  const before=traffic.vehicles.map(vehicle=>vehicle.distance);
  traffic.update(1);
  traffic.vehicles.forEach((vehicle,i)=>assert.ok(vehicle.distance>before[i]));
  const paused=traffic.vehicles.map(vehicle=>vehicle.mesh.position.clone());traffic.update(0);
  traffic.vehicles.forEach((vehicle,i)=>assert.ok(vehicle.mesh.position.equals(paused[i])));
  disposeGroup(group);
});

test('traffic loops at the circuit seam, exits stages, and brakes for the player',()=> {
  for(const definition of [courses[0],courses[1]]) {
    const course=new Course(definition),world=new CollisionWorld(),group=new THREE.Group(),traffic=new Traffic(course,world,group);
    const vehicle=traffic.vehicles[0];vehicle.distance=course.length-.1;traffic.update(.1);
    if(definition.closed) {assert.ok(vehicle.active);assert.ok(vehicle.distance<1);assert.ok(vehicle.mesh.position.distanceTo(course.sample(0).point)<4);}
    else {assert.equal(vehicle.active,false);assert.equal(vehicle.collider.active,false);assert.equal(vehicle.mesh.visible,false);}
    disposeGroup(group);
  }
  const course=new Course(courses[0]),group=new THREE.Group(),traffic=new Traffic(course,new CollisionWorld(),group);
  const vehicle=traffic.vehicles[0],forward=course.sample(vehicle.distance/course.length).tangent;
  const player=vehicle.mesh.position.clone().addScaledVector(forward,10);
  for(let i=0;i<240;i++)traffic.update(1/120,player);
  assert.ok(vehicle.speed<3);assert.ok(vehicle.mesh.position.distanceTo(player)>4);
  disposeGroup(group);
});

test('rear impacts damage the player using relative speed while traffic keeps driving',()=> {
  function collision(moving:boolean): {damage:number;speedChange:number} {
    const course=new Course(courses[0]),world=new CollisionWorld(),group=new THREE.Group(),traffic=new Traffic(course,world,group);
    const tractor=traffic.vehicles[0],sample=course.sample(tractor.distance/course.length);
    const car=new Vehicle(course);car.position.copy(tractor.mesh.position).addScaledVector(sample.tangent,-6);
    car.heading=Math.atan2(sample.tangent.x,sample.tangent.z);car.velocity.copy(sample.tangent).multiplyScalar(30);
    if(!moving)tractor.collider.velocity!.set(0,0,0);
    const speed=tractor.speed;
    car.update(.2,{throttle:0,steer:0,handbrake:false},world);
    traffic.update(.2,car.position,car.velocity);
    const result={damage:car.damage,speedChange:tractor.speed-speed};disposeGroup(group);return result;
  }
  const moving=collision(true),stationary=collision(false);
  assert.ok(moving.damage>0);assert.ok(moving.damage<stationary.damage);assert.ok(Math.abs(moving.speedChange)<1e-8);
});
