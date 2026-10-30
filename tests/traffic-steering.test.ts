import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { CollisionWorld } from '../src/collision.ts';
import { Traffic } from '../src/traffic.ts';
import { disposeGroup } from '../src/dispose.ts';
import fixture from './fixtures/traffic-road.json' with {type:'json'};
import physics from '../assets/traffic-physics.json' with {type:'json'};

function meeting() {
  const course=new Course({...courses[0],closed:false,setting:'holmahult',points:fixture.points as [number,number][],hills:0,lakes:[]});
  const root=new THREE.Group(),traffic=new Traffic(course,new CollisionWorld(),root);
  for(const other of traffic.vehicles.slice(2)){other.active=false;other.collider.active=false;}
  const [outbound,inbound]=traffic.vehicles;
  outbound.distance=fixture.meetingDistances[0];inbound.distance=fixture.meetingDistances[1];
  traffic.update(1/120);
  return {root,traffic,outbound,inbound};
}

for(const rate of [15,30,120])test(`traffic steers through a meeting without heading jumps or sideways sliding at ${rate}Hz`,()=>{
  const {root,traffic,outbound}=meeting();
  let maxSteering=0,maxLane=0;
  for(let i=0;i<rate*18;i++) {
    const position=outbound.mesh.position.clone(),heading=outbound.drive.heading,steering=outbound.drive.steering;
    traffic.update(1/rate);
    const headingChange=outbound.drive.heading-heading;
    assert.ok(Math.abs(outbound.drive.steering-steering)<=physics.driving.maxSteeringRate/rate+1e-8,'front-wheel steering has a bounded rate');
    assert.ok(Math.abs(headingChange)<outbound.baseSpeed*Math.tan(physics.driving.maxSteeringAngle)/outbound.wheelbase/rate+1e-8,'body rotation is bounded by speed and turning radius');
    const displacement=outbound.mesh.position.clone().sub(position).setY(0);
    const middleHeading=heading+headingChange/2;
    const sideways=displacement.dot(new THREE.Vector3(Math.cos(middleHeading),0,-Math.sin(middleHeading)));
    assert.ok(Math.abs(sideways)<.001,'the car follows its heading instead of being shifted sideways along the route');
    for(const wheel of outbound.wheels) {
      if(wheel.position.z>0)assert.equal(Math.sign(wheel.rotation.y),Math.sign(outbound.drive.steering),'front wheels point into the turn');
      else assert.equal(wheel.rotation.y,0,'rear wheels do not steer');
    }
    maxSteering=Math.max(maxSteering,Math.abs(outbound.drive.steering));maxLane=Math.max(maxLane,outbound.laneOffset);
  }
  assert.ok(maxSteering>.02&&maxLane>1,'the scenario actually requires an evasive turn');
  assert.ok(Math.abs(outbound.laneOffset-(outbound.route.width/2-outbound.collider.halfX))<.01,'steering settles back into the original lane');
  disposeGroup(root);
});

test('a stopped A-traktor can turn its front wheels without rotating or sliding its body',()=>{
  const {root,traffic,outbound}=meeting();outbound.baseSpeed=0;outbound.speed=0;outbound.velocity.set(0,0,0);outbound.angularVelocity=0;outbound.acceleration=0;
  const position=outbound.mesh.position.clone(),heading=outbound.drive.heading;
  for(let i=0;i<120;i++)traffic.update(1/120);
  assert.ok(Math.abs(outbound.drive.steering)>.02);
  assert.equal(outbound.drive.heading,heading);assert.ok(outbound.mesh.position.equals(position));
  disposeGroup(root);
});

test('meeting trajectories agree across slow and fast simulation rates',()=>{
  const results=[15,30,120].map(rate=>{
    const {root,traffic,outbound}=meeting();
    for(let i=0;i<rate*8;i++)traffic.update(1/rate);
    const result={position:outbound.mesh.position.clone(),heading:outbound.drive.heading};
    disposeGroup(root);return result;
  });
  for(const result of results.slice(1)) {
    assert.ok(result.position.distanceTo(results[0].position)<.08);
    assert.ok(Math.abs(result.heading-results[0].heading)<.01);
  }
});

test('Road 120 traffic follows bends smoothly while keeping its lane',()=>{
  const course=new Course(courses.find(definition=>definition.id==='holmahult-open-world')!);
  const root=new THREE.Group(),traffic=new Traffic(course,new CollisionWorld(),root);
  const mainRoadIds=new Set(course.roadNetwork!.roads.filter(road=>road.definition.name==='Väg 120').map(road=>road.definition.id));
  const tractor=traffic.vehicles.find(vehicle=>mainRoadIds.has(vehicle.route.id))!;
  for(const other of traffic.vehicles)if(other!==tractor){other.active=false;other.collider.active=false;}
  let turned=false;
  for(let i=0;i<30*50;i++) {
    const heading=tractor.drive.heading,steering=tractor.drive.steering;
    traffic.update(1/30);
    assert.ok(Math.abs(tractor.drive.heading-heading)<tractor.baseSpeed*Math.tan(physics.driving.maxSteeringAngle)/tractor.wheelbase/30+1e-8);
    assert.ok(Math.abs(tractor.drive.steering-steering)<=physics.driving.maxSteeringRate/30+1e-8);
    assert.ok(tractor.laneOffset>tractor.collider.halfX,'the body remains on its own side of the centerline');
    assert.ok(tractor.laneOffset+tractor.collider.halfX<tractor.route.width/2,'the car stays inside the road edge');
    if(Math.abs(tractor.drive.steering)>.03)turned=true;
  }
  assert.ok(turned,'the test drives through actual bends in Road 120');
  disposeGroup(root);
});

test('traffic slows before sharp bends and keeps the full body inside its lane',()=>{
  const course=new Course(courses.find(definition=>definition.id==='holmahult-open-world')!);
  const root=new THREE.Group(),traffic=new Traffic(course,new CollisionWorld(),root);
  const tractor=traffic.vehicles.find(vehicle=>vehicle.route.id===fixture.sharpBendRoadId)!;
  for(const other of traffic.vehicles)if(other!==tractor){other.active=false;other.collider.active=false;}
  let slowest=tractor.speed;
  for(let i=0;i<30*90&&tractor.active;i++) {
    traffic.update(1/30);slowest=Math.min(slowest,tractor.speed);
    assert.ok(tractor.laneOffset>tractor.collider.halfX,'the car does not cut across the centerline');
    assert.ok(tractor.laneOffset+tractor.collider.halfX<tractor.route.width/2,'the car does not swing outside the road');
  }
  assert.ok(slowest<tractor.baseSpeed-1,'the driver anticipates the sharp curve and brakes');
  disposeGroup(root);
});
