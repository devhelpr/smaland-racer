import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Vehicle } from '../src/vehicle.ts';
import { Course, courses } from '../src/track.ts';
import { CollisionWorld, impactDamage } from '../src/collision.ts';
import { Race } from '../src/race.ts';

const neutral={throttle:0,steer:0,handbrake:false};
function drive(car:Vehicle,seconds:number,throttle:number,steer=0,handbrake=false,world?:CollisionWorld) {
  for(let i=0;i<seconds*120;i++) car.update(1/120,{throttle,steer,handbrake},world);
}

test('six unique routes have safe roads, terrain, water clearance and gates',()=> {
  assert.equal(new Set(courses.map(c=>JSON.stringify(c.points))).size,6);
  for(const def of courses) {
    const course=new Course(def);
    for(const point of course.points) {
      assert.ok(course.nearest(point.x,point.z).distance<.001);
      assert.ok(!course.inWater(point.x,point.z),`${def.id}: road under water`);
      assert.ok(Math.abs(point.x)<400&&Math.abs(point.z)<400);
      for(const lake of def.lakes) assert.ok(Math.hypot((point.x-lake.x)/(lake.rx+def.width/2+2),(point.z-lake.z)/(lake.rz+def.width/2+2))>1,`${def.id}: lake too close`);
    }
    for(const gate of course.checkpoints)assert.ok(course.nearest(gate.point.x,gate.point.z).distance<.08);
    assert.ok(course.checkpoints.length>10);
  }
});

test('accelerates, brakes, reverses and recovers without repairing',()=> {
  const course=new Course(courses[0]);const car=new Vehicle(course);
  drive(car,1,1);assert.ok(car.forwardSpeed>10);
  drive(car,.5,-1);assert.ok(car.forwardSpeed<2);
  drive(car,2,-1);assert.ok(car.forwardSpeed<-4);
  car.damage=45;const point=course.checkpoints[2];car.recover(point.point,point.tangent);
  assert.equal(car.damage,45);assert.equal(car.velocity.length(),0);
  assert.ok(Math.abs(car.heading-Math.atan2(point.tangent.x,point.tangent.z))<.001);
  car.restart();assert.equal(car.damage,0);
});

test('grass slows more than gravel; handbrake sheds speed and steering works in reverse',()=> {
  const course=new Course(courses[0]);const road=new Vehicle(course),grass=new Vehicle(course);
  grass.position.set(310,course.height(310,310),310);
  for(const car of [road,grass])car.velocity.set(Math.sin(car.heading)*12,0,Math.cos(car.heading)*12);
  for(let i=0;i<60;i++){road.update(1/120,neutral);grass.update(1/120,neutral);}
  assert.ok(road.onRoad);assert.ok(!grass.onRoad);assert.ok(grass.velocity.length()<road.velocity.length()*.7);
  const normal=new Vehicle(course),brake=new Vehicle(course);
  drive(normal,1,1);drive(brake,1,1);drive(normal,.4,0);drive(brake,.4,0,0,true);
  assert.ok(brake.velocity.length()<normal.velocity.length());
  for(const throttle of [1,-1]){const car=new Vehicle(course),initial=car.heading;drive(car,1.5,throttle,1);assert.equal(Math.sign(car.heading-initial),throttle);}
});

test('swept collisions prevent tunneling, including rotated buildings',()=> {
  const world=new CollisionWorld();world.add({id:'tree',x:0,z:0,radius:.35,kind:'tree'});
  const hit=world.sweep(new THREE.Vector3(-20,0,0),new THREE.Vector3(20,0,0));
  assert.ok(hit);assert.ok(hit.time<.5);assert.ok(Math.abs(hit.normal.x+1)<1e-10);
  const buildings=new CollisionWorld();const box={id:'house',x:0,z:0,radius:6,kind:'building' as const,halfX:4,halfZ:3,angle:Math.PI/4};buildings.add(box);
  assert.ok(buildings.sweep(new THREE.Vector3(0,0,-20),new THREE.Vector3(0,0,20)));
  assert.equal(buildings.sweep(new THREE.Vector3(15,0,-20),new THREE.Vector3(15,0,20)),null);
});

test('impacts slow and damage cars; light hits survive, moose are more dangerous, sustained contact is bounded',()=> {
  assert.ok(impactDamage(5,'tree')>0&&impactDamage(5,'tree')<10);
  assert.ok(impactDamage(25,'moose')>100);
  assert.ok(impactDamage(15,'moose')>impactDamage(15,'deer'));
  const course=new Course(courses[0]);const car=new Vehicle(course);const world=new CollisionWorld();
  const forward=new THREE.Vector3(Math.sin(car.heading),0,Math.cos(car.heading));
  const obstacle=car.position.clone().addScaledVector(forward,4);
  world.add({id:'test-tree',x:obstacle.x,z:obstacle.z,radius:.5,kind:'tree'});
  car.velocity.copy(forward).multiplyScalar(10);
  drive(car,.5,0,0,false,world);
  assert.ok(car.damage>0&&car.damage<100);assert.ok(car.velocity.length()<5);
  const initial=car.damage;drive(car,1,1,0,false,world);assert.ok(car.damage-initial<10);
});

test('power loss starts after 50 damage and stays below 25%',()=> {
  const course=new Course(courses[0]);const healthy=new Vehicle(course),hurt=new Vehicle(course);hurt.damage=90;
  drive(healthy,1,1);drive(hurt,1,1);
  assert.ok(hurt.forwardSpeed<healthy.forwardSpeed);assert.ok(hurt.forwardSpeed>healthy.forwardSpeed*.74);
});

for(const definition of courses) test(`controller completes ${definition.id}; medal targets are attainable`,()=> {
  const course=new Course(definition),car=new Vehicle(course),race=new Race(course);
  race.start();race.elapse(3);
  let maxDistance=0;
  for(let i=0;i<120*definition.medals.bronze;i++) {
    const road=course.nearest(car.position.x,car.position.z);
    const target=course.sample(Math.min(1,road.progress+9/course.length));
    const ahead=course.sample(Math.min(1,road.progress+25/course.length));
    const turn=Math.acos(Math.max(-1,Math.min(1,road.tangent.dot(ahead.tangent))));
    const targetSpeed=turn>.5?11:turn>.25?15:22;
    const desired=Math.atan2(target.point.x-car.position.x,target.point.z-car.position.z);
    const error=Math.atan2(Math.sin(desired-car.heading),Math.cos(desired-car.heading));
    const previous=car.position.clone();
    const curvature=2*Math.sin(error)/Math.max(3,car.position.distanceTo(target.point));
    const steer=curvature*(1+Math.abs(car.forwardSpeed)*.045)/.08;
    car.update(1/120,{throttle:car.forwardSpeed<targetSpeed?1:car.forwardSpeed>targetSpeed+1?-1:0,steer:Math.max(-1,Math.min(1,steer)),handbrake:false});
    race.elapse(1/120);race.observe(previous,car.position,car.damage);
    maxDistance=Math.max(maxDistance,road.distance);
    if(race.state==='finished')break;
  }
  assert.equal(race.state,'finished',`${definition.id}: gate ${race.nextCheckpoint}/${course.checkpoints.length}, time ${race.elapsed.toFixed(1)}`);
  assert.ok(maxDistance<definition.width/2+1.5,`deviation ${maxDistance}`);
  assert.ok(race.result!.total<=definition.medals.bronze,`bronze time ${race.result!.total}`);
  console.log(`${definition.id}: reference drive ${race.elapsed.toFixed(2)}s; targets ${JSON.stringify(definition.medals)}`);
});

test('a high-speed moose impact wrecks the vehicle and ends the active attempt',()=> {
  const course=new Course(courses[0]),car=new Vehicle(course),world=new CollisionWorld(),race=new Race(course);
  const forward=new THREE.Vector3(Math.sin(car.heading),0,Math.cos(car.heading));
  const obstacle=car.position.clone().addScaledVector(forward,5);
  world.dynamic.push({id:'moose',x:obstacle.x,z:obstacle.z,radius:1.2,kind:'moose'});
  race.start();race.elapse(3);car.velocity.copy(forward).multiplyScalar(30);
  for(let i=0;i<60&&race.state==='racing';i++) {
    const previous=car.position.clone();car.update(1/120,neutral,world);race.observe(previous,car.position,car.damage);
  }
  assert.equal(car.damage,100);assert.equal(race.state,'crashed');assert.equal(race.result,null);
});
