import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { CAR_RADIUS, CollisionWorld } from '../src/collision.ts';
import { Traffic } from '../src/traffic.ts';
import { Vehicle } from '../src/vehicle.ts';
import { disposeGroup } from '../src/dispose.ts';
import physics from '../assets/traffic-physics.json' with {type:'json'};
import vehicleAsset from '../assets/vehicle.json' with {type:'json'};
import { createScenery } from '../src/scenery.ts';

function setup(angle=0) {
  const tangent=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
  const course=new Course({...courses[0],setting:undefined,points:[[-tangent.x*200,-tangent.z*200],[tangent.x*200,tangent.z*200]],lakes:[],hills:0});
  const world=new CollisionWorld(),root=new THREE.Group(),traffic=new Traffic(course,world,root);
  const tractor=traffic.vehicles[0];
  for(const other of traffic.vehicles.slice(1)){other.active=false;other.collider.active=false;}
  const side=new THREE.Vector3(-tangent.z,0,tangent.x);
  return {course,world,root,traffic,tractor,tangent,side,normalLane:tractor.laneOffset};
}

function sideImpact(rate:number,sign:number,closing:number,end=0,angle=0) {
  const scene=setup(angle),{course,world,traffic,tractor,tangent,side}=scene;
  const car=new Vehicle(course);
  const nose=vehicleAsset.frontBumper[5]+vehicleAsset.frontBumper[2]/2;
  car.position.copy(tractor.mesh.position).addScaledVector(side,-sign*(tractor.collider.halfX+nose+.02)).addScaledVector(tangent,end);
  car.heading=Math.atan2(side.x*sign,side.z*sign);
  car.velocity.copy(side).multiplyScalar(sign*closing);
  // A real perpendicular approach, using the same update order as main.ts.
  const physicsRate=rate*Math.max(1,Math.ceil(120/rate));
  for(let i=0;i<physicsRate&&tractor.reactionTime===0;i++) {
    traffic.update(1/physicsRate,car.position,car.velocity);
    car.update(1/physicsRate,{throttle:0,steer:0,handbrake:false},world);
  }
  assert.ok(tractor.reactionTime>0,'the player actually collides with the traffic body');
  return {...scene,car};
}

test('a real T-bone transfers momentum and visibly displaces traffic on both sides and rotated roads',()=>{
  const shifts=new Map<string,number[]>();
  for(const rate of [30,120])for(const sign of [-1,1])for(const angle of [0,.7]) {
    const {root,traffic,tractor,car,side,normalLane}=sideImpact(rate,sign,8,0,angle);
    const speed=tractor.speed,distance=tractor.distance;
    assert.ok(car.position.clone().sub(tractor.mesh.position).dot(side)*-sign>tractor.collider.halfX+CAR_RADIUS+.6,'the visible nose hits before the old center-only circle reaches the other car');
    assert.ok(tractor.velocity.dot(side)*sign>2,'the struck car receives physical sideways velocity');
    for(let i=0;i<rate;i++)traffic.update(1/rate);
    const shift=(normalLane-tractor.laneOffset)*sign;
    assert.ok(shift>.35,'side impacts visibly displace the physical car before the driver recovers');
    const key=`${sign}:${angle}`;shifts.set(key,[...(shifts.get(key)??[]),shift]);
    assert.ok(tractor.speed<speed-1,'the driver slows down to stabilize after a collision');
    assert.ok(tractor.distance-distance>speed*.3);
    assert.equal(tractor.collider.x,tractor.mesh.position.x);assert.equal(tractor.collider.z,tractor.mesh.position.z);
    assert.ok(Math.abs(tractor.collider.angle-tractor.drive.heading)<1e-6,'collider follows the physical body heading');
    disposeGroup(car.mesh);disposeGroup(root);
  }
  for(const values of shifts.values())assert.ok(Math.abs(values[0]-values[1])<.3,'physical response is consistent across simulation rates on the same road side');
});

test('side impact works in the actual Holmahult scenery and open-world collision maps',()=>{
  for(const id of ['holmahult-stage','holmahult-open-world']) {
    const course=new Course(courses.find(definition=>definition.id===id)!);
    const root=new THREE.Group(),world=new CollisionWorld();createScenery(root,course,world);
    const traffic=new Traffic(course,world,root),tractor=traffic.vehicles[0],car=new Vehicle(course),initialLane=tractor.laneOffset;
    const {tangent}=course.sample(tractor.distance/course.length),side=new THREE.Vector3(-tangent.z,0,tangent.x);
    const nose=vehicleAsset.frontBumper[5]+vehicleAsset.frontBumper[2]/2;
    car.position.copy(tractor.mesh.position).addScaledVector(side,-tractor.collider.halfX-nose-.02);
    car.heading=Math.atan2(side.x,side.z);car.velocity.copy(side).multiplyScalar(8);
    for(let i=0;i<60;i++) {
      traffic.update(1/120,car.position,car.velocity);
      car.update(1/120,{throttle:0,steer:0,handbrake:false},world);
    }
    assert.ok(initialLane-tractor.laneOffset>.3,`${id}: traffic visibly reacts with the real scenery colliders enabled`);
    disposeGroup(car.mesh);disposeGroup(root);
  }
});

test('striking the front or rear quarter creates opposite rotation, carried by the rendered mesh and collider',()=>{
  for(const sign of [-1,1]) {
    const turns:number[]=[];
    for(const end of [-1.4,1.4]) {
      const {root,traffic,tractor,car}=sideImpact(120,sign,8,end);
      assert.ok(Math.abs(tractor.angularVelocity)>.5,'off-center impact produces torque');
      for(let i=0;i<60;i++)traffic.update(1/120);
      turns.push(tractor.drive.heading);
      assert.ok(Math.abs(tractor.drive.heading)>.08,'the other car visibly rotates after the impact');
      assert.ok(Math.abs(tractor.mesh.rotation.y-tractor.collider.angle)<1e-8);
      disposeGroup(car.mesh);disposeGroup(root);
    }
    assert.ok(turns[0]*turns[1]<0,'front and rear impacts turn the car in opposite directions');
  }
});

test('light contact yields gently, and stronger impact transfers more speed and retains damage',()=>{
  const kicks:number[]=[];
  for(const closing of [2,12]) {
    const {root,tractor,car,side}=sideImpact(120,1,closing);
    kicks.push(tractor.velocity.dot(side));
    if(closing===2)assert.equal(car.damage,0);
    else assert.ok(car.damage>0,'hard contact still damages the player');
    disposeGroup(car.mesh);disposeGroup(root);
  }
  assert.ok(kicks[0]>.5&&kicks[0]<2,'gentle contact creates a controlled response');
  assert.ok(kicks[1]>kicks[0]*2,'impact strength changes the response rather than using a fixed slide speed');
});

test('the contact impulse conserves linear momentum, dissipates energy and is independent of timestep',()=>{
  const kicks:number[]=[];
  for(const rate of [30,60,120]) {
    const {root,tractor,side}=setup();
    const contact=tractor.mesh.position.clone().addScaledVector(side,-tractor.collider.halfX);
    const response=tractor.collider.onPush!(side.clone().multiplyScalar(4),side.clone().negate(),1/rate,contact) as number;
    const kick=tractor.velocity.dot(side);kicks.push(kick);
    assert.ok(Math.abs(physics.contact.playerMass*response-physics.contact.mass*kick)<1e-8);
    const after=physics.contact.playerMass*(4-response)**2+physics.contact.mass*kick**2;
    assert.ok(after<physics.contact.playerMass*4**2,'collision does not create kinetic energy');
    assert.ok(Math.abs(tractor.angularVelocity)<1e-8,'a centered strike has no invented torque');
    const before=tractor.velocity.clone();
    tractor.collider.onPush!(side.clone().negate(),side.clone().negate(),1/rate,contact);
    assert.ok(tractor.velocity.distanceTo(before)<1e-8,'separating contact gives no extra impulse');
    disposeGroup(root);
  }
  assert.ok(Math.max(...kicks)-Math.min(...kicks)<1e-8);
});

test('a physically displaced traffic body collides with scenery and stays out of water',()=>{
  for(const obstacle of ['wall','water']) {
    const {course,world,root,traffic,tractor,side}=setup(),before=tractor.mesh.position.clone();
    if(obstacle==='wall') {
      const point=before.clone().addScaledVector(side,tractor.collider.halfX+1.2);
      world.add({id:'wall',kind:'building',x:point.x,z:point.z,radius:51,halfX:1,halfZ:50,angle:0});
    } else course.inWater=(x,z)=>new THREE.Vector3(x,0,z).sub(before).dot(side)>.2;
    tractor.collider.onPush!(side.clone().multiplyScalar(8),side.clone().negate(),1/120,tractor.mesh.position.clone().addScaledVector(side,-tractor.collider.halfX));
    for(let i=0;i<120;i++) {
      traffic.update(1/120);
      assert.ok(tractor.mesh.position.clone().sub(before).dot(side)<.21,obstacle);
    }
    disposeGroup(root);
  }
});

test('traffic keeps momentum after a hit, pauses with the simulation and recovers gradually through steering',()=>{
  const {root,traffic,tractor,car,normalLane}=sideImpact(120,1,6,1);
  const velocity=tractor.velocity.clone(),position=tractor.mesh.position.clone(),yaw=tractor.drive.heading;
  traffic.update(0);
  assert.ok(tractor.velocity.equals(velocity)&&tractor.mesh.position.equals(position));assert.equal(tractor.drive.heading,yaw);
  for(let i=0;i<120;i++)traffic.update(1/120);
  const displaced=Math.abs(tractor.laneOffset-normalLane);
  assert.ok(displaced>.25,'the impact keeps affecting the car after contact ends');
  for(let i=0;i<120*12;i++)traffic.update(1/120);
  assert.ok(Math.abs(tractor.laneOffset-normalLane)<.12,'the driver physically steers back instead of snapping to the route');
  assert.ok(Math.abs(tractor.drive.heading)<.08);
  disposeGroup(car.mesh);disposeGroup(root);
});

test('traffic anticipates a cut-in ahead, but does not brake for someone behind or staying beside it',()=>{
  for(const situation of ['cut-in','behind','beside']) {
    const {root,traffic,tractor,tangent,side}=setup();
    const before=tractor.speed;
    const player=tractor.mesh.position.clone().addScaledVector(tangent,situation==='behind'?-8:8).addScaledVector(side,4);
    const velocity=situation==='beside'?new THREE.Vector3():side.clone().multiplyScalar(-8);
    traffic.update(.1,player,velocity);
    if(situation==='cut-in')assert.ok(tractor.speed<before-.05);
    else assert.ok(Math.abs(tractor.speed-before)<1e-6);
    disposeGroup(root);
  }
});
