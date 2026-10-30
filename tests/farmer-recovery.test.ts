import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course,courses } from '../src/track.ts';
import { Traffic } from '../src/traffic.ts';
import { CollisionWorld } from '../src/collision.ts';
import { disposeGroup } from '../src/dispose.ts';
import { createDrivingProfiles } from '../src/driving.ts';

function setup(visible=false,trap=true) {
  const course=new Course({...courses[0],setting:'holmahult',closed:false,width:8.2,points:[[0,0],[0,300],[0,600]],hills:0,lakes:[]});
  const root=new THREE.Group(),world=new CollisionWorld(),profiles=createDrivingProfiles();
  const traffic=new Traffic(course,world,root,{profiles,drivingStyle:'cruising'}),farmer=traffic.vehicles.find(v=>v.aggressive)!;
  for(const other of traffic.vehicles)if(other!==farmer){other.active=false;other.collider.active=false;}
  farmer.distance=100;farmer.driveDistance=100;farmer.drive.position.set(10,0,100);farmer.drive.heading=0;farmer.drive.steering=0;
  farmer.velocity.set(0,0,0);farmer.previousVelocity.set(0,0,0);farmer.speed=0;farmer.angularVelocity=0;farmer.laneOffset=10;
  farmer.stuckOrigin.copy(farmer.drive.position);farmer.mesh.position.copy(farmer.drive.position);farmer.collider.x=10;farmer.collider.z=100;farmer.collider.angle=0;
  if(trap)for(const [i,[dx,dz,hx,hz]] of [[-1.5,0,.4,4],[1.5,0,.4,4],[0,-3,2,.5],[0,3,2,.5]].entries()) {
    world.add({id:`trap-${i}`,kind:'building',x:10+dx,z:100+dz,halfX:hx,halfZ:hz,radius:Math.hypot(hx,hz),angle:0});
  }
  const player=new THREE.Vector3(0,0,300),camera=new THREE.PerspectiveCamera(55,1.8,.1,650);
  const hide=()=>{camera.position.set(0,6.8,289.5);camera.lookAt(0,1.1,307);camera.updateMatrixWorld(true);};
  const show=()=>{camera.position.set(10,20,80);camera.lookAt(10,0,100);camera.updateMatrixWorld(true);};
  if(visible)show();else hide();
  const tick=(seconds:number,rate=120,view:THREE.Camera|undefined=camera)=>{for(let i=0;i<Math.round(seconds*rate);i++)traffic.update(1/rate,player,new THREE.Vector3(),0,view);};
  return {course,root,world,traffic,farmer,profiles,player,camera,hide,show,tick};
}

for(const rate of [30,120])test(`hidden farmer resets only after five seconds stuck at ${rate}Hz`,()=>{
  const s=setup(),{farmer,traffic,player,camera}=s;
  s.tick(4.9,rate);
  assert.ok(farmer.drive.position.distanceTo(new THREE.Vector3(10,0,100))<1.5,'driver remains in the trap before timeout');
  let resetAt=0;
  for(let i=0;i<rate;i++) {
    const previous=farmer.drive.position.clone();
    traffic.update(1/rate,player,new THREE.Vector3(),0,camera);
    if(farmer.drive.position.distanceTo(previous)>20){resetAt=4.9+(i+1)/rate;break;}
  }
  assert.ok(resetAt>=5&&resetAt<=5+1/rate,`reset occurs at the five second threshold: ${resetAt}`);
  assert.ok(Math.abs(farmer.laneOffset)<s.course.definition.width/2-farmer.collider.halfX);
  assert.ok(farmer.drive.position.z>240&&farmer.drive.position.z<260,'farmer returns to the road behind the player');
  assert.ok(farmer.velocity.length()<.01&&Math.abs(farmer.angularVelocity)<.01,'reset clears collision momentum');
  assert.equal(farmer.collider.x,farmer.drive.position.x);assert.equal(farmer.collider.z,farmer.mesh.position.z);
  assert.equal(farmer.driveDistance,farmer.distance);
  disposeGroup(s.root);
});

test('visible farmer never teleports, and being revealed restarts the off-camera countdown',()=>{
  const s=setup(true);s.tick(6);
  assert.ok(s.farmer.drive.position.z<105);assert.equal(s.farmer.stuckTime,0);
  s.hide();s.tick(4);assert.ok(s.farmer.stuckTime>3.9);
  s.show();s.tick(.2);assert.equal(s.farmer.stuckTime,0);
  s.hide();s.tick(4.9);assert.ok(s.farmer.drive.position.z<105);
  s.tick(.2);assert.ok(s.farmer.drive.position.z>240);
  disposeGroup(s.root);
});

test('recovery waits for camera information and does not count paused time',()=>{
  const s=setup();
  for(let i=0;i<720;i++)s.traffic.update(1/120,s.player,new THREE.Vector3());
  assert.equal(s.farmer.stuckTime,0);assert.ok(s.farmer.drive.position.z<105);
  s.tick(4);const time=s.farmer.stuckTime,position=s.farmer.drive.position.clone();
  for(let i=0;i<600;i++)s.traffic.update(0,s.player,new THREE.Vector3(),0,s.camera);
  assert.equal(s.farmer.stuckTime,time);assert.ok(s.farmer.drive.position.equals(position));
  s.tick(1.1);assert.ok(s.farmer.drive.position.z>240);
  disposeGroup(s.root);
});

test('farmer skips a road spot occupied by a crossways A-traktor',()=>{
  const s=setup(),tractor=s.traffic.vehicles.find(v=>!v.aggressive)!;
  tractor.active=true;tractor.collider.active=true;tractor.baseSpeed=0;tractor.speed=0;
  tractor.distance=255;tractor.driveDistance=255;tractor.drive.position.set(1.804,0,255);tractor.drive.heading=Math.PI/2;
  tractor.mesh.position.copy(tractor.drive.position);tractor.velocity.set(0,0,0);tractor.previousVelocity.set(0,0,0);
  tractor.collider.x=1.804;tractor.collider.z=255;tractor.collider.angle=Math.PI/2;
  s.tick(5.02);
  assert.ok(s.farmer.drive.position.z>230&&s.farmer.drive.position.z<250,'an occupied first choice is skipped');
  assert.ok(s.farmer.drive.position.distanceTo(tractor.drive.position)>8,'the full traffic bodies have clearance');
  disposeGroup(s.root);
});

test('no clear hidden road spot means wait; removing the obstacle permits recovery',()=>{
  const s=setup();
  const wall={id:'blocked-road',kind:'building' as const,x:0,z:300,radius:301,halfX:4,halfZ:300,angle:0,active:true};
  s.world.add(wall);s.tick(6);assert.ok(s.farmer.drive.position.z<105);
  wall.active=false;s.tick(.6);assert.ok(s.farmer.drive.position.z>240);
  disposeGroup(s.root);
});

test('an off-camera farmer standing still without an obstacle is not reset',()=>{
  const s=setup(false,false);s.profiles.cruising.acceleration=0;s.tick(7);
  assert.equal(s.farmer.stuckTime,0);assert.ok(s.farmer.drive.position.z<105);
  disposeGroup(s.root);
});
