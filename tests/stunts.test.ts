import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Vehicle } from '../src/vehicle.ts';
import { Course, courses } from '../src/track.ts';
import { CollisionWorld } from '../src/collision.ts';
import { disposeGroup } from '../src/dispose.ts';
import stunt from '../assets/stunts.json' with { type: 'json' };

const neutral={throttle:0,steer:0,handbrake:false};
const course=new Course({...courses[0],setting:undefined,points:[[0,-350],[0,350]],lakes:[],hills:0});
const dt=1/120;
function setup(speed:number,offset=0,stoneHeight=.35,angle=0) {
  const world=new CollisionWorld(),rock=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshBasicMaterial());
  rock.scale.set(1.4,stoneHeight,1.8);rock.rotation.set(.2,.3,angle);rock.updateMatrix();
  world.addRock('test-rock',rock.geometry,rock.material,rock.matrix);
  const car=new Vehicle(course,'rally');car.position.set(offset,0,-8);car.heading=0;car.velocity.set(0,0,speed);
  return {car,world,rock,dispose:()=>{disposeGroup(car.mesh);rock.geometry.dispose();rock.material.dispose();}};
}
function run(env:ReturnType<typeof setup>,seconds=5) {
  let peak=0,minUp=1,flight=0,twoWheels=0,spinAngle=0,maxSpin=0,maxFlightDistance=0;
  let flightStart:THREE.Vector3|null=null;
  for(let i=0;i<seconds/dt;i++) {
    env.car.update(dt,neutral,env.world);
    peak=Math.max(peak,env.car.position.y);minUp=Math.min(minUp,env.car.stunts.upright);
    flight+=Number(env.car.stunts.airborne)*dt;
    twoWheels+=Number(env.car.stunts.wheelsOnGround===2)*dt;
    const spin=env.car.stunts.angularVelocity.length();maxSpin=Math.max(maxSpin,spin);spinAngle+=spin*dt;
    if(env.car.stunts.airborne) {
      flightStart??=env.car.position.clone();maxFlightDistance=Math.max(maxFlightDistance,flightStart.distanceTo(env.car.position));
    } else flightStart=null;
    assert.ok([...env.car.position.toArray(),...env.car.velocity.toArray(),...env.car.mesh.quaternion.toArray()].every(Number.isFinite));
  }
  return {peak,minUp,flight,twoWheels,maxSpin,maxFlightDistance,rotations:spinAngle/(2*Math.PI)};
}

test('rock support follows visible rotated and nonuniformly scaled facets, including correct normals',()=> {
  const world=new CollisionWorld(),rock=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());
  rock.scale.set(3,.4,2);rock.rotation.set(.3,.2,.4);rock.position.set(3,1,4);rock.updateMatrix();
  world.addRock('tilted',rock.geometry,rock.material,rock.matrix);
  const surface=world.surfaceAt(3,4,-10),normal=new THREE.Vector3(0,1,0).applyQuaternion(rock.quaternion);
  assert.ok(surface.rock);assert.ok(surface.normal.distanceTo(normal)<1e-6);
  assert.ok(Math.abs(surface.height-(1+.2/normal.y))<1e-6);
  assert.deepEqual(world.surfaceAt(20,20,0).height,0);
  assert.ok(world.sweep(new THREE.Vector3(3,0,-5),new THREE.Vector3(3,0,8)));
  assert.equal(world.sweep(new THREE.Vector3(3,0,-5),new THREE.Vector3(3,0,8),true),null);
  rock.geometry.dispose();rock.material.dispose();
});

test('slow contact stays small; a faster approach launches off the same rock and lands',()=> {
  const slow=setup(6),fast=setup(20);
  const a=run(slow),b=run(fast);
  assert.ok(a.peak<.4);assert.equal(a.flight,0);assert.equal(slow.car.damage,0);
  assert.ok(b.peak>.4&&b.peak<.8);assert.ok(b.flight>.3&&b.flight<.6);
  assert.ok(b.maxFlightDistance>2&&b.maxFlightDistance<8,'ordinary rock jump travels too far');assert.ok(b.rotations<.5);assert.ok(b.peak>a.peak*3);
  assert.equal(fast.car.stunts.airborne,false);assert.ok(fast.car.stunts.upright>.95);
  slow.dispose();fast.dispose();
});

test('off-center angled contact lifts two wheels and can roll past the balance point',()=> {
  const env=setup(25,.9,.95,.45),result=run(env);
  assert.ok(result.twoWheels>.15);assert.ok(result.minUp<0);assert.ok(result.flight>.5);
  env.dispose();
});

test('a high-speed large rock impact loses energy without an extreme launch or repeated flips',()=> {
  const env=setup(40,0,.95),result=run(env,9);
  assert.ok(result.peak>.5&&result.peak<3);assert.ok(result.maxFlightDistance<15);
  assert.ok(result.flight<1.5);assert.ok(result.maxSpin<7);assert.ok(result.rotations<1);
  assert.ok(env.car.stunts.upright>.9);assert.equal(env.car.stunts.airborne,false);
  assert.ok(env.car.damage>0&&env.car.damage<=100);
  const damage=env.car.damage;
  env.car.recover(course.sample(0).point,course.sample(0).tangent);
  assert.equal(env.car.stunts.active,false);assert.equal(env.car.stunts.airborne,false);
  assert.equal(env.car.stunts.wheelsOnGround,4);assert.equal(env.car.stunts.angularVelocity.length(),0);
  assert.equal(env.car.velocity.length(),0);assert.equal(env.car.damage,damage);
  env.dispose();
});

test('a fast strike on a smaller stone stays below a full tumble and a large launch',()=> {
  const env=setup(30),result=run(env);
  assert.ok(result.peak<1.3);assert.ok(result.rotations<1);assert.ok(result.maxSpin<8);
  assert.ok(result.maxFlightDistance<8);env.dispose();
});

test('flight follows gravity and momentum, with no steering or throttle force in midair',()=> {
  const env=setup(20);
  for(let i=0;i<240;i++) {
    env.car.update(dt,neutral,env.world);
    if(env.car.stunts.airborne&&env.car.position.y>.5&&env.car.velocity.y>0)break;
  }
  assert.equal(env.car.stunts.airborne,true);assert.equal(env.car.stunts.traction,0);
  const velocity=env.car.velocity.clone(),heading=env.car.heading;
  env.car.update(dt,{throttle:1,steer:1,handbrake:true},env.world);
  assert.equal(env.car.stunts.airborne,true);
  assert.ok(Math.abs(env.car.velocity.y-(velocity.y-stunt.gravity*dt))<1e-8);
  assert.ok(Math.abs(env.car.velocity.x-velocity.x*Math.exp(-stunt.airDrag*dt))<1e-8);
  assert.ok(Math.abs(env.car.velocity.z-velocity.z*Math.exp(-stunt.airDrag*dt))<1e-8);
  assert.equal(env.car.heading,heading);env.dispose();
});

test('grass drag reduces an off-road approach gradually, preserving momentum for a stone jump',()=> {
  const car=new Vehicle(course);car.position.set(100,0,-8);car.heading=0;car.velocity.set(0,0,30);
  car.update(dt,neutral);
  assert.ok(car.forwardSpeed>25&&car.forwardSpeed<30);
  assert.equal(car.stunts.active,false);assert.equal(car.position.y,0);
  disposeGroup(car.mesh);
});


test('righting an overturned car preserves off-road position, heading, damage and clears all motion',()=> {
  const car=new Vehicle(course);car.position.set(100,0,70);car.heading=.7;car.damage=27;
  car.stunts.placeUpright(-.2);car.stunts.rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI));
  car.stunts.angularVelocity.set(2,3,4);car.velocity.set(4,-2,6);
  car.rightInPlace();
  assert.equal(car.position.x,100);assert.equal(car.position.z,70);
  assert.ok(Math.abs(car.heading-.7)<1e-8);assert.ok(car.stunts.upright>.999);
  assert.equal(car.onRoad,false);assert.equal(car.damage,27);assert.equal(car.velocity.length(),0);
  assert.equal(car.stunts.angularVelocity.length(),0);
  for(let i=0;i<120;i++)car.update(dt,neutral);
  assert.equal(car.position.x,100);assert.equal(car.position.z,70);assert.ok(car.stunts.upright>.99);
  disposeGroup(car.mesh);
});

test('righting over a rock clears its surface without moving sideways; midair righting preserves height',()=> {
  const env=setup(0);env.car.position.set(0,0,0);env.car.damage=14;
  const surface=env.world.surfaceAt(0,0,0);
  assert.ok(surface.rock);
  env.car.rightInPlace(env.world);
  assert.equal(env.car.position.x,0);assert.equal(env.car.position.z,0);
  assert.ok(env.car.position.y>=surface.height);assert.equal(env.car.damage,14);
  env.car.position.set(100,8,50);env.car.rightInPlace(env.world);
  assert.equal(env.car.position.y,8);env.car.update(dt,neutral,env.world);
  assert.ok(env.car.position.y<8&&env.car.position.y>7.9);assert.equal(env.car.stunts.airborne,true);
  env.dispose();
});

test('automatic righting becomes ready after five continuous seconds still on the roof and resets on motion',()=> {
  const car=new Vehicle(course);car.heading=0;car.position.set(100,-.04,70);
  car.stunts.placeUpright(0);car.stunts.rotation.setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI);
  for(let i=0;i<4.9/dt;i++)car.update(dt,neutral);
  assert.equal(car.stunts.autoRightReady,false,'must wait the full five seconds');
  car.velocity.set(2,0,0);car.update(dt,neutral);
  assert.equal(car.stunts.autoRightReady,false);
  car.velocity.set(0,0,0);car.stunts.angularVelocity.set(0,0,0);
  for(let i=0;i<4.9/dt;i++)car.update(dt,neutral);
  assert.equal(car.stunts.autoRightReady,false,'movement must restart the five-second wait');
  for(let i=0;i<.2/dt;i++)car.update(dt,neutral);
  assert.equal(car.stunts.autoRightReady,true);
  const x=car.position.x,z=car.position.z,heading=car.heading;car.damage=20;
  car.rightInPlace();
  assert.equal(car.stunts.autoRightReady,false);assert.ok(car.stunts.upright>.99);
  assert.equal(car.position.x,x);assert.equal(car.position.z,z);assert.equal(car.heading,heading);assert.equal(car.damage,20);
  disposeGroup(car.mesh);
});

test('automatic righting never triggers upright or during an inverted flight',()=> {
  const grounded=new Vehicle(course),flying=new Vehicle(course);
  flying.position.set(100,1000,70);flying.heading=0;flying.stunts.placeUpright(0);
  flying.stunts.rotation.setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI);
  for(let i=0;i<6/dt;i++) {grounded.update(dt,neutral);flying.update(dt,neutral);}
  assert.equal(grounded.stunts.autoRightReady,false);
  assert.equal(flying.stunts.airborne,true);assert.equal(flying.stunts.autoRightReady,false);
  disposeGroup(grounded.mesh);disposeGroup(flying.mesh);
});

test('a stationary car on its side also becomes ready for automatic righting',()=> {
  const car=new Vehicle(course);car.heading=0;car.position.set(100,0,70);
  car.stunts.placeUpright(0);car.stunts.rotation.setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2);
  for(let i=0;i<4.9/dt;i++)car.update(dt,neutral);
  assert.ok(Math.abs(car.stunts.upright)<.25,'car remains resting on its side');
  assert.equal(car.stunts.autoRightReady,false);
  for(let i=0;i<.3/dt;i++)car.update(dt,neutral);
  assert.equal(car.stunts.autoRightReady,true);
  car.rightInPlace();assert.ok(car.stunts.upright>.99);assert.equal(car.stunts.autoRightReady,false);
  disposeGroup(car.mesh);
});
