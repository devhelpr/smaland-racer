import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course,courses } from '../src/track.ts';
import { Traffic } from '../src/traffic.ts';
import { CollisionWorld } from '../src/collision.ts';
import { disposeGroup } from '../src/dispose.ts';
import { createDrivingProfiles } from '../src/driving.ts';

for(const rate of [30,120])test(`farmer brakes for a sharp pursuit turn without spinning its body away from velocity at ${rate}Hz`,()=>{
  const course=new Course({...courses[0],setting:'holmahult',closed:false,width:8.2,points:[[0,0],[0,300],[0,600]],hills:0,lakes:[]});
  const root=new THREE.Group(),traffic=new Traffic(course,new CollisionWorld(),root,{profiles:createDrivingProfiles(),drivingStyle:'rally'});
  const farmer=traffic.vehicles.find(v=>v.aggressive)!;
  for(const other of traffic.vehicles)if(other!==farmer){other.active=false;other.collider.active=false;}
  farmer.distance=150;farmer.speed=36;traffic.update(1/120);
  farmer.velocity.set(0,0,36);farmer.speed=36;farmer.angularVelocity=0;farmer.drive.steering=0;farmer.acceleration=0;
  const player=farmer.drive.position.clone().add(new THREE.Vector3(28,0,10));
  let maxSlip=0,minSpeed=36,maxSteering=0;
  for(let i=0;i<rate*8;i++) {
    traffic.update(1/rate,player,new THREE.Vector3());
    const speed=farmer.velocity.length();
    if(speed>5) {
      const forward=new THREE.Vector3(Math.sin(farmer.drive.heading),0,Math.cos(farmer.drive.heading));
      maxSlip=Math.max(maxSlip,Math.acos(THREE.MathUtils.clamp(forward.dot(farmer.velocity.clone().normalize()),-1,1)));
    }
    minSpeed=Math.min(minSpeed,Math.abs(farmer.speed));maxSteering=Math.max(maxSteering,Math.abs(farmer.drive.steering));
  }
  assert.ok(minSpeed<8,'driver brakes before trying to turn tightly');
  assert.ok(maxSteering>.05,'scenario requires real wheel steering');
  assert.ok(maxSlip<.15,`tires keep the body aligned with its momentum instead of a constant drift: ${maxSlip}`);
  disposeGroup(root);
});

for(const rate of [30,120])test(`farmer stays composed through curved-road pursuit at ${rate}Hz`,()=>{
  const radius=90,points:[number,number][]=Array.from({length:24},(_,i)=>[Math.sin(i/24*Math.PI*2)*radius,Math.cos(i/24*Math.PI*2)*radius]);
  const course=new Course({...courses[0],setting:'holmahult',closed:true,width:8.2,points,hills:0,lakes:[]});
  const root=new THREE.Group(),traffic=new Traffic(course,new CollisionWorld(),root),farmer=traffic.vehicles.find(v=>v.aggressive)!;
  for(const other of traffic.vehicles)if(other!==farmer){other.active=false;other.collider.active=false;}
  farmer.distance=0;farmer.speed=14;traffic.update(1/120);
  let maxSlip=0,maxRoadDistance=0;
  for(let i=0;i<rate*8;i++) {
    const sample=course.sample(((35+14*i/rate)%course.length)/course.length);
    traffic.update(1/rate,sample.point,sample.tangent.clone().multiplyScalar(14));
    if(farmer.velocity.length()>5) {
      const forward=new THREE.Vector3(Math.sin(farmer.drive.heading),0,Math.cos(farmer.drive.heading));
      maxSlip=Math.max(maxSlip,Math.acos(THREE.MathUtils.clamp(forward.dot(farmer.velocity.clone().normalize()),-1,1)));
    }
    maxRoadDistance=Math.max(maxRoadDistance,course.nearest(farmer.drive.position.x,farmer.drive.position.z).distance);
  }
  assert.ok(maxSlip<.15,`curved pursuit stays below a visible sustained drift: ${maxSlip}`);
  assert.ok(maxRoadDistance<course.definition.width/2+.5,`farmer follows the bend instead of sliding away: ${maxRoadDistance}`);
  disposeGroup(root);
});
