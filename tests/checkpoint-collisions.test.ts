import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CheckpointGates } from '../src/checkpoints.ts';
import { CollisionWorld } from '../src/collision.ts';
import { Course, courses } from '../src/track.ts';
import { Vehicle } from '../src/vehicle.ts';
import { Traffic } from '../src/traffic.ts';
import { disposeGroup } from '../src/dispose.ts';
import asset from '../assets/checkpoints.json' with {type:'json'};
import physics from '../assets/traffic-physics.json' with {type:'json'};
import fixture from './fixtures/traffic-road.json' with {type:'json'};

function setup(angle=0) {
  const rotation=new THREE.Matrix4().makeRotationY(angle);
  const points=fixture.points.map(([x,z])=>{
    const point=new THREE.Vector3(x,0,z).applyMatrix4(rotation);return [point.x,point.z] as [number,number];
  });
  const course=new Course({...courses[0],closed:false,setting:'holmahult',width:fixture.widths[0],points,hills:0,lakes:[]});
  const world=new CollisionWorld(),root=new THREE.Group(),gates=new CheckpointGates(course,world);root.add(gates.root);
  const sample=course.checkpoints[1],forward=sample.tangent.clone(),right=new THREE.Vector3(forward.z,0,-forward.x);
  const post=(side:number)=>sample.point.clone().addScaledVector(right,side*(course.definition.width/2+asset.postOffset));
  return {course,world,root,gates,sample,forward,right,post};
}

for(const angle of [0,Math.PI/4,Math.PI/2])test(`checkpoint support footprints match their meshes at heading ${angle}`,()=>{
  const {world,root,sample,forward,post}=setup(angle);
  for(const side of [-1,1]) {
    const point=post(side),hit=world.sweep(point.clone().addScaledVector(forward,-5),point.clone().addScaledVector(forward,5));
    assert.equal(hit?.collider.id,`checkpoint-1-post-${side<0?'left':'right'}`);
    assert.ok(Math.hypot(hit!.collider.x-point.x,hit!.collider.z-point.z)<1e-6);
  }
  assert.equal(world.sweep(sample.point.clone().addScaledVector(forward,-5),sample.point.clone().addScaledVector(forward,5)),null,'the driving opening remains clear below the sign and crossbar');
  disposeGroup(root);
});

for(const side of [-1,1])test(`the player car collides with checkpoint support ${side}`,()=>{
  const {course,world,root,forward,post}=setup(Math.PI/4),point=post(side),car=new Vehicle(course);
  car.position.copy(point).addScaledVector(forward,-8);car.heading=Math.atan2(forward.x,forward.z);car.velocity.copy(forward).multiplyScalar(18);
  for(let i=0;i<120;i++) {
    car.update(1/120,{throttle:0,steer:0,handbrake:false},world);
    assert.ok(car.position.clone().sub(point).dot(forward)<0,'the car cannot pass through the support');
  }
  assert.ok(car.damage>0,'hitting the solid support produces collision damage');
  assert.ok(car.velocity.dot(forward)<3,'the support stops forward momentum');
  disposeGroup(car.mesh);disposeGroup(root);
});

for(const side of [-1,1])test(`a recovering A-traktor physically collides with checkpoint support ${side}`,()=>{
  const {course,world,root,sample,forward,post}=setup(),traffic=new Traffic(course,world,root),tractor=traffic.vehicles[0];
  for(const other of traffic.vehicles.slice(1)){other.active=false;other.collider.active=false;}
  tractor.distance=sample.progress*course.length-4;
  tractor.laneOffset=side*(course.definition.width/2+asset.postOffset);
  tractor.reactionTime=physics.contact.reactionTime;
  let contactedSupport=false;
  for(let i=0;i<42;i++) {
    traffic.update(1/120);
    if(tractor.blockedTime>0)contactedSupport=true;
    assert.ok(tractor.mesh.position.clone().sub(post(side)).dot(forward)<0,'the traffic body cannot pass through the support');
  }
  assert.ok(contactedSupport,'the physical body actually hits the support during the reaction interval');
  assert.ok(tractor.speed<1,'the collision arrests forward momentum');
  disposeGroup(root);
});

test('both the player and normal traffic can drive through the checkpoint opening',()=>{
  const {course,world,root,sample,forward}=setup(),traffic=new Traffic(course,world,root),tractor=traffic.vehicles[0],car=new Vehicle(course);
  for(const other of traffic.vehicles.slice(1)){other.active=false;other.collider.active=false;}
  tractor.distance=sample.progress*course.length-16;
  car.position.copy(sample.point).addScaledVector(forward,-8);car.heading=Math.atan2(forward.x,forward.z);car.velocity.copy(forward).multiplyScalar(18);
  for(let i=0;i<120*5;i++) {
    traffic.update(1/120);
    // The faster player clears the gate before traffic reaches it.
    if(i<120)car.update(1/120,{throttle:0,steer:0,handbrake:false},world);
  }
  assert.ok(tractor.mesh.position.clone().sub(sample.point).dot(forward)>5);
  assert.equal(tractor.recovering,false);assert.equal(tractor.obstacleLane,null);
  assert.ok(car.position.clone().sub(sample.point).dot(forward)>5);assert.equal(car.damage,0);
  disposeGroup(car.mesh);disposeGroup(root);
});

test('checkpoint collisions fade out with the structure and return when restored',()=>{
  const {world,root,gates,forward,post}=setup(),point=post(1);
  const hit=()=>world.sweep(point.clone().addScaledVector(forward,-5),point.clone().addScaledVector(forward,5));
  assert.ok(hit());gates.pass(1);gates.update(asset.effect.duration/2);
  assert.ok(hit(),'a still-visible support remains solid while fading');
  gates.update(asset.effect.duration);assert.equal(hit(),null,'a fully faded gate leaves no invisible collision');
  gates.restore(1);assert.ok(hit(),'restoring the gate restores its collision');
  disposeGroup(root);
});

test('the hidden circuit finish becomes collidable only when revealed',()=>{
  const course=new Course(courses.find(definition=>definition.closed)!),world=new CollisionWorld(),gates=new CheckpointGates(course,world);
  const sample=course.checkpoints.at(-1)!,right=new THREE.Vector3(sample.tangent.z,0,-sample.tangent.x);
  const point=sample.point.clone().addScaledVector(right,course.definition.width/2+asset.postOffset);
  const hit=()=>world.sweep(point.clone().addScaledVector(sample.tangent,-3),point.clone().addScaledVector(sample.tangent,3));
  assert.equal(hit(),null,'the hidden finish does not block the start');
  gates.pass(5);assert.equal(hit()?.collider.id,'checkpoint-6-post-right');
  gates.pass(6,true);gates.update(1);assert.equal(hit(),null);
  disposeGroup(gates.root);
});

test('open-world mode has neither visible checkpoint gates nor invisible support colliders',()=>{
  const course=new Course(courses.find(definition=>definition.openWorld)!),world=new CollisionWorld(),gates=new CheckpointGates(course,world);
  assert.equal(gates.root.visible,false);
  for(const sample of course.checkpoints.slice(1))for(const side of [-1,1]) {
    const point=sample.point.clone().addScaledVector(new THREE.Vector3(sample.tangent.z,0,-sample.tangent.x),side*(course.definition.width/2+asset.postOffset));
    assert.equal(world.sweep(point.clone().addScaledVector(sample.tangent,-3),point.clone().addScaledVector(sample.tangent,3)),null);
  }
  disposeGroup(gates.root);
});
