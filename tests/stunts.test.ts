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
  let peak=0,minUp=1,flight=0,twoWheels=0;
  for(let i=0;i<seconds/dt;i++) {
    env.car.update(dt,neutral,env.world);
    peak=Math.max(peak,env.car.position.y);minUp=Math.min(minUp,env.car.stunts.upright);
    flight+=Number(env.car.stunts.airborne)*dt;
    twoWheels+=Number(env.car.stunts.wheelsOnGround===2)*dt;
    assert.ok([...env.car.position.toArray(),...env.car.velocity.toArray(),...env.car.mesh.quaternion.toArray()].every(Number.isFinite));
  }
  return {peak,minUp,flight,twoWheels};
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
  assert.ok(b.peak>.6&&b.peak<2);assert.ok(b.flight>.3);assert.ok(b.peak>a.peak*3);
  assert.equal(fast.car.stunts.airborne,false);assert.ok(fast.car.stunts.upright>.95);
  slow.dispose();fast.dispose();
});

test('off-center angled contact lifts two wheels and can roll past the balance point',()=> {
  const env=setup(25,.9,.95,.45),result=run(env);
  assert.ok(result.twoWheels>.15);assert.ok(result.minUp<0);assert.ok(result.flight>.5);
  env.dispose();
});

test('a fast rock strike can fully overturn; the roof settles on the ground until recovery',()=> {
  const env=setup(30,0,.95),result=run(env,9);
  assert.ok(result.minUp<-.95);assert.ok(env.car.stunts.upright<-.9);
  assert.ok(env.car.damage>0&&env.car.damage<=100);
  const damage=env.car.damage;
  env.car.recover(course.sample(0).point,course.sample(0).tangent);
  assert.equal(env.car.stunts.active,false);assert.equal(env.car.stunts.airborne,false);
  assert.equal(env.car.stunts.wheelsOnGround,4);assert.equal(env.car.stunts.angularVelocity.length(),0);
  assert.equal(env.car.velocity.length(),0);assert.equal(env.car.damage,damage);
  env.dispose();
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
