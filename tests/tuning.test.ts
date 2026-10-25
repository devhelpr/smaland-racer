import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrivingProfiles, restoreDrivingProfiles } from '../src/driving.ts';
import { Vehicle } from '../src/vehicle.ts';
import { Course, courses } from '../src/track.ts';
import { disposeGroup } from '../src/dispose.ts';

const straight=new Course({...courses[0],setting:undefined,points:[[0,-350],[0,350]],lakes:[],hills:0});
const coast={throttle:0,steer:0,handbrake:false};

test('exported tuning round-trips independently and rejects unsafe saved values',()=> {
  const profiles=createDrivingProfiles();
  profiles.rally.handling.drift=2.5;profiles.cruising.grass.drag=.45;profiles.ice.drag=.1;
  assert.deepEqual(restoreDrivingProfiles(JSON.parse(JSON.stringify(profiles))),profiles);
  const invalid={...profiles,cruising:{...profiles.cruising,acceleration:Infinity,handling:{drift:0}}};
  const restored=restoreDrivingProfiles(invalid),defaults=createDrivingProfiles();
  assert.equal(restored.cruising.acceleration,defaults.cruising.acceleration);
  assert.equal(restored.cruising.handling.drift,defaults.cruising.handling.drift);
  assert.deepEqual(restoreDrivingProfiles(null),defaults);
  profiles.rally.road.speed=80;
  assert.notEqual(createDrivingProfiles().rally.road.speed,80);
});

test('live drift and grass drag changes affect an existing vehicle',()=> {
  const profiles=createDrivingProfiles(),car=new Vehicle(straight,'cruising',profiles);
  const slide=()=> {car.position.set(0,0,0);car.heading=0;car.velocity.set(5,0,0);car.update(.1,coast);return car.velocity.x;};
  const normal=slide();profiles.cruising.handling.drift=4;
  assert.ok(slide()>normal);
  const grassCoast=()=> {car.position.set(100,0,0);car.heading=0;car.velocity.set(0,0,10);car.update(.1,coast);return car.forwardSpeed;};
  profiles.cruising.grass.drag=0;const lowDrag=grassCoast();profiles.cruising.grass.drag=4;
  assert.ok(grassCoast()<lowDrag);
  disposeGroup(car.mesh);
});

test('live ice drag changes affect frozen lake coasting',()=> {
  const profiles=createDrivingProfiles(),course=new Course(courses.find(course=>course.setting==='sandsjon')!);
  const car=new Vehicle(course,'rally',profiles);
  const coastOnIce=()=> {car.position.set(-80,0,-80);car.heading=0;car.velocity.set(0,0,10);assert.ok(course.onIce(car.position.x,car.position.z));car.update(.1,coast);return car.forwardSpeed;};
  profiles.ice.drag=0;const lowDrag=coastOnIce();profiles.ice.drag=2;
  assert.ok(coastOnIce()<lowDrag);
  disposeGroup(car.mesh);
});
