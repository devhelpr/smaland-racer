import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { CollisionWorld } from '../src/collision.ts';
import { moveTraffic } from '../src/traffic-steering.ts';
import physics from '../assets/traffic-physics.json' with {type:'json'};
import { Traffic } from '../src/traffic.ts';
import { disposeGroup } from '../src/dispose.ts';
import fixture from './fixtures/traffic-road.json' with {type:'json'};

function setup(width=8.2,direction=1) {
  const course=new Course({...courses[0],closed:false,setting:'holmahult',width,points:fixture.points as [number,number][],hills:0,lakes:[]});
  const root=new THREE.Group(),world=new CollisionWorld(),traffic=new Traffic(course,world,root);
  const tractor=traffic.vehicles.find(vehicle=>vehicle.direction===direction)!;
  for(const other of traffic.vehicles)if(other!==tractor){other.active=false;other.collider.active=false;}
  tractor.distance=fixture.meetingDistances[0];traffic.update(1/120);
  const forward=tractor.route.sample(tractor.distance).tangent.multiplyScalar(direction);
  const right=new THREE.Vector3(forward.z,0,-forward.x);
  return {course,root,world,traffic,tractor,forward,right,lane:tractor.laneOffset};
}

for(const direction of [-1,1])for(const sign of [-1,1])test(`an off-center impact recovers by steering in direction ${direction}, side ${sign}`,()=>{
  const {root,traffic,tractor,right,lane}=setup(8.2,direction);
  const position=tractor.mesh.position.clone(),baseHeading=tractor.drive.heading;
  const contact=position.clone().addScaledVector(right,-sign*tractor.collider.halfX);
  const forward=new THREE.Vector3(Math.sin(baseHeading),0,Math.cos(baseHeading));
  contact.addScaledVector(forward,1.2);
  tractor.collider.onPush!(right.clone().multiplyScalar(sign*8),right.clone().multiplyScalar(-sign),1/120,contact);
  assert.ok(tractor.mesh.position.equals(position),'the impulse changes momentum without teleporting the body');
  let maxLaneError=0,minSpeed=tractor.speed,sawSteering=false;
  for(let i=0;i<120*22;i++) {
    const before=tractor.mesh.position.clone(),velocity=tractor.velocity.clone(),heading=tractor.drive.heading,yaw=tractor.angularVelocity;
    traffic.update(1/120);
    const actual=tractor.mesh.position.clone().sub(before).setY(0);
    const integrated=velocity.add(tractor.velocity).multiplyScalar(.5/120);
    assert.ok(actual.distanceTo(integrated)<.003,'all visible translation comes from the physical velocity');
    assert.ok(Math.abs(tractor.drive.heading-heading-(yaw+tractor.angularVelocity)*.5/120)<1e-8,'all visible rotation comes from angular velocity');
    assert.equal(tractor.collider.angle,tractor.drive.heading);
    assert.ok(tractor.collider.velocity!.equals(tractor.velocity),'collisions see the same momentum as the rendered car');
    maxLaneError=Math.max(maxLaneError,Math.abs(tractor.laneOffset-lane));minSpeed=Math.min(minSpeed,tractor.speed);
    if(i>60&&Math.abs(tractor.drive.steering)>.02)sawSteering=true;
  }
  assert.ok(maxLaneError>.4&&sawSteering,'the car really gets displaced and steers its way back');
  assert.ok(minSpeed<tractor.baseSpeed-1,'the driver slows down before rejoining');
  assert.ok(Math.abs(tractor.laneOffset-lane)<.12,'the car settles in its original lane');
  assert.ok(Math.abs(Math.atan2(Math.sin(tractor.drive.heading-baseHeading),Math.cos(tractor.drive.heading-baseHeading)))<.08);
  assert.ok(tractor.speed>tractor.baseSpeed-.3,'normal cruising resumes after recovery');
  disposeGroup(root);
});

test('a displaced car with no drive or momentum cannot creep back toward the road',()=>{
  const {root,traffic,tractor,right}=setup();
  tractor.collider.onPush!(right.clone().multiplyScalar(10),right.clone().negate(),1/120,tractor.mesh.position);
  for(let i=0;i<60;i++)traffic.update(1/120);
  tractor.baseSpeed=0;tractor.speed=0;tractor.velocity.set(0,0,0);tractor.angularVelocity=0;tractor.acceleration=0;
  const position=tractor.mesh.position.clone(),heading=tractor.drive.heading;
  for(let i=0;i<120*3;i++)traffic.update(1/120);
  assert.ok(tractor.mesh.position.equals(position),'no spring or hidden route follower translates the stopped car');
  assert.equal(tractor.drive.heading,heading,'there is no automatic rotation back toward the route');
  assert.ok(Math.abs(tractor.drive.steering)>.02,'the driver can turn the wheels while stopped');
  disposeGroup(root);
});

test('a car facing the wrong way stops before changing gear, then manoeuvres back into its lane',()=>{
  const {root,traffic,tractor,lane}=setup();
  tractor.drive.heading+=Math.PI;
  tractor.velocity.negate();tractor.recovering=true;
  let reversed=false,forwardAgain=false;
  for(let i=0;i<120*50;i++) {
    const gear=tractor.gear,speed=tractor.speed;
    traffic.update(1/120);
    if(gear!==tractor.gear)assert.ok(Math.abs(speed)<.3,'a gear change happens only after the car has nearly stopped');
    if(tractor.gear===-1)reversed=true;
    if(reversed&&tractor.gear===1)forwardAgain=true;
  }
  assert.ok(reversed&&forwardAgain,'the driver uses a reverse manoeuvre instead of rotating in place');
  assert.ok(Math.abs(tractor.laneOffset-lane)<.15);
  assert.ok(Math.cos(tractor.drive.heading)>.99,'the physical car ends up facing the route again');
  assert.ok(tractor.speed>tractor.baseSpeed-.3);
  disposeGroup(root);
});

test('body lean leaves all four tires supported on the road during braking and recovery',()=>{
  const {root,traffic,tractor,course,right}=setup();
  tractor.collider.onPush!(right.clone().multiplyScalar(8),right.clone().negate(),1/120,tractor.mesh.position);
  for(let i=0;i<120*6;i++) {
    traffic.update(1/120);root.updateMatrixWorld(true);
    for(const wheel of tractor.wheels) {
      const tire=wheel.getObjectByName('tire') as THREE.Mesh;
      const position=tire.geometry.getAttribute('position');
      let lowest=Infinity;
      for(let j=0;j<position.count;j++) {
        const vertex=new THREE.Vector3().fromBufferAttribute(position,j).applyMatrix4(tire.matrixWorld);
        lowest=Math.min(lowest,vertex.y-course.heightAt(vertex.x,vertex.z));
      }
      assert.ok(lowest>-.006&&lowest<.012,'the tire neither floats nor sinks while the body leans');
    }
  }
  disposeGroup(root);
});

test('a heavy spinning impact cannot redirect momentum faster than available tire grip',()=>{
  const {root,tractor}=setup();
  tractor.angularVelocity=physics.contact.maxAngularSpeed;tractor.reactionTime=physics.contact.reactionTime;
  tractor.drive.steering=0;tractor.acceleration=0;
  const before=tractor.velocity.clone(),heading=tractor.drive.heading;
  moveTraffic(tractor,tractor.speed,1,1/120);
  assert.ok(tractor.velocity.distanceTo(before)<=physics.dynamics.roadGripAcceleration/120+1e-8,'tire force is bounded even when the body spins quickly');
  const velocityHeading=Math.atan2(tractor.velocity.x,tractor.velocity.z);
  assert.ok(Math.abs(tractor.drive.heading-heading)>Math.abs(velocityHeading-heading)+.001,'the body can rotate while momentum continues to carry it through the skid');
  disposeGroup(root);
});

test('traffic waits behind a stationary car and accelerates gradually when the lane clears',()=>{
  const {root,traffic,tractor}=setup();
  const leader=traffic.vehicles.find(vehicle=>vehicle!==tractor&&vehicle.direction===tractor.direction)!;
  leader.active=true;leader.collider.active=true;leader.mesh.visible=true;leader.distance=tractor.distance+14;
  leader.baseSpeed=0;leader.speed=0;leader.velocity.set(0,0,0);
  for(let i=0;i<120*8;i++) {
    traffic.update(1/120);
    assert.ok(leader.mesh.position.distanceTo(tractor.mesh.position)>leader.collider.halfZ+tractor.collider.halfZ,'following traffic leaves room instead of overlapping the stopped car');
  }
  assert.ok(tractor.speed<.2);
  const stopped=tractor.mesh.position.clone();leader.baseSpeed=6;
  for(let i=0;i<120*7;i++)traffic.update(1/120);
  assert.ok(tractor.mesh.position.distanceTo(stopped)>10&&tractor.speed>4,'the queue starts driving again');
  disposeGroup(root);
});

test('a car spun into the oncoming lane causes approaching traffic to brake',()=>{
  const {root,traffic,tractor,lane}=setup();
  const obstruction=traffic.vehicles.find(vehicle=>vehicle.direction!==tractor.direction)!;
  obstruction.active=true;obstruction.collider.active=true;obstruction.mesh.visible=true;
  obstruction.distance=tractor.distance+14;obstruction.laneOffset=-lane;
  obstruction.baseSpeed=0;obstruction.speed=0;obstruction.velocity.set(0,0,0);
  for(let i=0;i<120*8;i++) {
    traffic.update(1/120);
    assert.ok(tractor.mesh.position.distanceTo(obstruction.mesh.position)>4.3,'approaching traffic does not plow into a displaced car');
  }
  assert.ok(Math.abs(tractor.speed)<.2);
  disposeGroup(root);
});

test('a stopped tractor does not accelerate into a player immediately in front of its bumper',()=>{
  const {root,traffic,tractor,forward}=setup();
  tractor.speed=0;tractor.velocity.set(0,0,0);tractor.acceleration=0;tractor.angularVelocity=0;
  const position=tractor.mesh.position.clone(),player=position.clone().addScaledVector(forward,3.5);
  for(let i=0;i<240;i++)traffic.update(1/120,player);
  assert.ok(tractor.mesh.position.distanceTo(position)<.001);
  assert.equal(tractor.speed,0);
  disposeGroup(root);
});

test('an obstructed road makes traffic stop before the wall instead of driving through it',()=>{
  const {root,world,traffic,tractor,forward}=setup();
  const wall=tractor.mesh.position.clone().addScaledVector(forward,14);
  world.add({id:'road-block',kind:'building',x:wall.x,z:wall.z,radius:30,halfX:25,halfZ:1,angle:0});
  for(let i=0;i<120*8;i++) {
    traffic.update(1/120);
    assert.ok(tractor.mesh.position.z<wall.z-1-tractor.collider.halfZ,'the full body remains clear of the barrier');
  }
  assert.ok(Math.abs(tractor.speed)<.2);
  disposeGroup(root);
});
