import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { CollisionWorld } from '../src/collision.ts';
import { SnowPoles } from '../src/snow-poles.ts';
import { Vehicle } from '../src/vehicle.ts';
import { Wildlife } from '../src/wildlife.ts';
import { disposeGroup } from '../src/dispose.ts';

const neutral={throttle:0,steer:0,handbrake:false};

test('wildlife faces its movement on both verges and runs at the faster species-specific speeds',()=> {
  const course=new Course(courses[0]);
  const sides=new Set<number>(),species=new Set<string>();
  for(const seed of [1,2,3,4,5,6,7,8]) {
    const group=new THREE.Group(),wildlife=new Wildlife(course,new CollisionWorld(),group,seed);
    const before=wildlife.animals.map(animal=> {
      animal.activated=true;animal.state='crossing';
      return animal.mesh.position.clone();
    });
    wildlife.update(.1,course.sample(0).point,0);
    wildlife.animals.forEach((animal,i)=> {
      const movement=animal.mesh.position.clone().sub(before[i]).setY(0);
      const facing=animal.mesh.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
      assert.ok(facing.dot(movement.clone().normalize())>.999,`runs backward from side ${animal.plan.side}`);
      assert.ok(Math.abs(movement.length()/.1-animal.plan.speed)<.001);
      assert.ok(animal.plan.speed>=(animal.plan.species==='moose'?7:9));
      assert.ok(animal.plan.speed<=(animal.plan.species==='moose'?9:12));
      sides.add(animal.plan.side);species.add(animal.plan.species);
    });
    disposeGroup(group);
  }
  assert.equal(sides.size,2);assert.equal(species.size,2);
});

test('car knocks snow pole down, passes through, and cannot hit the fallen collider again',()=> {
  const course=new Course(courses.find(course=>course.id==='forest-loop')!),world=new CollisionWorld(),group=new THREE.Group();
  const markers=new SnowPoles(course,world,group),pole=markers.poles[0];
  const car=new Vehicle(course),direction=new THREE.Vector3(0,0,1);
  car.position.copy(pole.mesh.position).addScaledVector(direction,-4);
  car.heading=0;car.velocity.copy(direction).multiplyScalar(18);
  for(let i=0;i<120;i++) {car.update(1/120,neutral,world);markers.update(1/120);}
  assert.equal(pole.falling,true);assert.equal(pole.collider.active,false);
  assert.equal(pole.progress,1);assert.equal(car.damage,0);
  assert.ok(car.velocity.z>0);assert.ok(car.position.z>pole.mesh.position.z+5);
  const fallenDirection=new THREE.Vector3(0,1,0).applyQuaternion(pole.mesh.quaternion);
  assert.ok(fallenDirection.z>.9);assert.ok(Math.abs(fallenDirection.y)<.35);
  assert.equal(world.sweep(pole.mesh.position.clone().addScaledVector(direction,-2),pole.mesh.position.clone().addScaledVector(direction,2)),null);
  const savedQuaternion=pole.mesh.quaternion.clone();markers.update(10);assert.ok(pole.mesh.quaternion.equals(savedQuaternion));
  // A fresh attempt builds fresh upright markers; recovery does not reconstruct them.
  const freshGroup=new THREE.Group(),fresh=new SnowPoles(course,new CollisionWorld(),freshGroup);
  assert.equal(fresh.poles[0].collider.active,true);assert.equal(fresh.poles[0].falling,false);
  disposeGroup(group);disposeGroup(freshGroup);
});

test('fall animation is stationary when paused and follows a reverse impact direction',()=> {
  const course=new Course(courses[0]),world=new CollisionWorld(),group=new THREE.Group();
  const markers=new SnowPoles(course,world,group),pole=markers.poles[0];
  pole.collider.onHit!(new THREE.Vector3(-10,0,0));
  markers.update(.05);const paused=pole.mesh.quaternion.clone();markers.update(0);
  assert.ok(pole.mesh.quaternion.equals(paused));
  markers.update(1);const tip=new THREE.Vector3(0,1,0).applyQuaternion(pole.mesh.quaternion);
  assert.ok(tip.x<-.9);disposeGroup(group);
});
