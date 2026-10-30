import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { CollisionWorld } from '../src/collision.ts';
import { Traffic } from '../src/traffic.ts';
import { SnowPoles } from '../src/snow-poles.ts';
import { disposeGroup } from '../src/dispose.ts';
import fixture from './fixtures/traffic-road.json' with {type:'json'};
import scenery from '../assets/scenery.json' with {type:'json'};
import physics from '../assets/traffic-physics.json' with {type:'json'};

function setup(direction:number,width=fixture.widths[1]) {
  const course=new Course({...courses[0],closed:false,setting:'holmahult',width,points:fixture.points as [number,number][],hills:0,lakes:[]});
  const root=new THREE.Group(),world=new CollisionWorld(),traffic=new Traffic(course,world,root);
  const tractor=traffic.vehicles.find(vehicle=>vehicle.direction===direction)!;
  for(const other of traffic.vehicles)if(other!==tractor){other.active=false;other.collider.active=false;}
  tractor.distance=fixture.meetingDistances[0];traffic.update(1/120);
  // Place real verge markers close enough for the body to pass over them while staying in lane.
  const markerCourse=new Course({...course.definition,width:fixture.widths[0]});
  const markers=new SnowPoles(markerCourse,world,root);
  const forward=course.sample(tractor.distance/course.length).tangent.multiplyScalar(direction);
  const pole=markers.poles.filter(pole=>Math.sign(pole.mesh.position.x)===direction&&pole.mesh.position.clone().sub(tractor.mesh.position).dot(forward)>0)
    .sort((a,b)=>a.mesh.position.distanceTo(tractor.mesh.position)-b.mesh.position.distanceTo(tractor.mesh.position))[0];
  return {root,world,traffic,tractor,markers,pole,forward};
}

for(const direction of [-1,1])test(`A-traktor knocks snow poles down and continues in direction ${direction}`,()=>{
  const {root,world,traffic,tractor,markers,pole,forward}=setup(direction);
  const lane=tractor.laneOffset;
  let hits=0;
  const onHit=pole.collider.onHit!;
  pole.collider.onHit=velocity=>{hits++;onHit(velocity);};
  for(let i=0;i<120*5;i++) {
    traffic.update(1/120);markers.update(1/120);
    assert.ok(Math.abs(tractor.laneOffset-lane)<.005,'the driver does not swerve around a flexible pole');
    assert.ok(tractor.speed>tractor.baseSpeed-.1,'the pole does not trigger obstacle braking or a crash response');
    assert.equal(tractor.obstacleLane,null);assert.equal(tractor.recovering,false);
    assert.ok(tractor.collider.velocity!.equals(tractor.velocity),'the small contact drag is published to the collider immediately');
  }
  assert.equal(hits,1,'body probes do not knock the same pole down repeatedly');
  assert.equal(pole.collider.active,false);assert.equal(pole.falling,true);assert.equal(pole.progress,1);
  assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(pole.mesh.quaternion).dot(forward)>.9,'the pole falls in the impact direction');
  assert.ok(tractor.mesh.position.clone().sub(pole.mesh.position).dot(forward)>tractor.collider.halfZ,'the full vehicle passes the fallen pole');
  assert.equal(world.sweep(pole.mesh.position.clone().addScaledVector(forward,-2),pole.mesh.position.clone().addScaledVector(forward,2),true,tractor.collider),null,'the fallen pole remains non-collidable');
  disposeGroup(root);
});

test('ignoring snow poles during planning still detects a solid barrier behind them',()=>{
  const {root,world,traffic,tractor,markers,pole,forward}=setup(1);
  const barrier=pole.mesh.position.clone().addScaledVector(forward,physics.avoidance.lookAhead);
  world.add({id:'solid-barrier',kind:'building',x:barrier.x,z:barrier.z,...scenery.cottageCollider,angle:0});
  const end=barrier.clone().addScaledVector(forward,scenery.cottageCollider.halfZ);
  assert.equal(world.sweep(tractor.mesh.position,end,true,tractor.collider)?.collider.kind,'snowPole');
  assert.equal(world.sweep(tractor.mesh.position,end,true,tractor.collider,['snowPole'])?.collider.kind,'building');
  assert.equal(pole.collider.active,true);assert.equal(pole.falling,false,'looking ahead does not knock down a pole remotely');
  for(let i=0;i<120*9;i++) {
    traffic.update(1/120);markers.update(1/120);
    assert.ok(barrier.clone().sub(tractor.mesh.position).dot(forward)>scenery.cottageCollider.halfZ+tractor.collider.halfZ,'the full body stays outside the solid barrier');
  }
  assert.equal(pole.falling,true);assert.equal(pole.collider.active,false);
  assert.ok(Math.abs(tractor.speed)<.2,'the driver drives over the pole and then stops for the barrier');
  disposeGroup(root);
});

test('a struck A-traktor drives over a verge marker while steering back onto a narrow road',()=>{
  const {root,traffic,tractor,markers,pole,forward}=setup(1,fixture.widths[0]);
  const right=new THREE.Vector3(forward.z,0,-forward.x),lane=tractor.laneOffset;
  tractor.collider.onPush!(right.clone().multiplyScalar(8),right.clone().negate(),1/120,tractor.mesh.position);
  let knockedDuringRecovery=false;
  for(let i=0;i<120*15;i++) {
    traffic.update(1/120);markers.update(1/120);
    if(pole.falling&&tractor.recovering)knockedDuringRecovery=true;
  }
  assert.ok(knockedDuringRecovery,'the recovering car actually crosses the verge marker');
  assert.equal(pole.collider.active,false);assert.equal(pole.progress,1);
  assert.ok(Math.abs(tractor.laneOffset-lane)<.15,'the driver continues rejoining the road after knocking down the pole');
  assert.ok(tractor.mesh.position.clone().sub(pole.mesh.position).dot(forward)>tractor.collider.halfZ);
  disposeGroup(root);
});
