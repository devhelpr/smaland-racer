import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { CollisionWorld } from '../src/collision.ts';
import { Traffic } from '../src/traffic.ts';
import { Vehicle } from '../src/vehicle.ts';
import { disposeGroup } from '../src/dispose.ts';
import { createDrivingProfiles } from '../src/driving.ts';
import renderAsset from '../assets/rendering.json' with {type:'json'};
import fixture from './fixtures/traffic-road.json' with {type:'json'};

function setup() {
  const course=new Course({...courses[0],setting:undefined,closed:false,width:fixture.widths[1],points:[fixture.points[0],[0,300],fixture.points[1]] as [number,number][],hills:0,lakes:[]});
  const root=new THREE.Group(),world=new CollisionWorld(),traffic=new Traffic(course,world,root);
  const farmer=traffic.vehicles.find(vehicle=>vehicle.aggressive)!;
  for(const other of traffic.vehicles)if(other!==farmer){other.active=false;other.collider.active=false;}
  return {course,root,world,traffic,farmer};
}

test('every parcours has exactly one white farmer Caddy with two orange beacons and no auxiliary lights',()=>{
  for(const definition of courses) {
    const root=new THREE.Group(),traffic=new Traffic(new Course(definition),new CollisionWorld(),root);
    const farmers=traffic.vehicles.filter(vehicle=>vehicle.aggressive);
    assert.equal(farmers.length,1,definition.id);
    const farmer=farmers[0];
    assert.equal(farmer.mesh.userData.modelId,'vw-caddy');
    assert.equal(farmer.mesh.userData.paintColor,'#f4f3ed');
    assert.equal(farmer.beacons.length,2);
    assert.equal(farmer.mesh.getObjectByName('led-bar-housing'),undefined);
    assert.equal(farmer.mesh.getObjectByName('led-bar-lens'),undefined);
    const glow=farmer.beacons[0].material.emissiveIntensity;
    traffic.setTimeOfDay('night');traffic.update(.1);
    assert.equal(farmer.lighting.beam.visible,false);
    assert.notEqual(farmer.beacons[0].material.emissiveIntensity,glow);
    disposeGroup(root);
  }
});

for(const rate of [30,120])test(`farmer catches a moving player and steers into its rear quarter at ${rate}Hz`,()=>{
  const {root,traffic,farmer}=setup();
  const player=farmer.drive.position.clone().add(new THREE.Vector3(1,0,24));
  const velocity=new THREE.Vector3(0,0,5);
  const initial=player.distanceTo(farmer.drive.position);
  let closest=initial,sideTravel=0;
  for(let i=0;i<rate*8;i++) {
    player.addScaledVector(velocity,1/rate);
    const before=farmer.drive.position.clone(),speed=farmer.velocity.length();
    traffic.update(1/rate,player,velocity);
    const travelled=farmer.drive.position.distanceTo(before);
    assert.ok(travelled<(speed+1)*1/rate+.02,'pursuit moves only through velocity integration');
    closest=Math.min(closest,player.distanceTo(farmer.drive.position));
    sideTravel=Math.max(sideTravel,Math.abs(farmer.drive.position.x-before.x));
    assert.equal(farmer.collider.x,farmer.drive.position.x);
    assert.equal(farmer.collider.z,farmer.drive.position.z);
  }
  assert.ok(closest<4,`farmer closes for contact: ${closest}`);
  assert.ok(sideTravel>0,'steering changes the lateral position');
  assert.ok(farmer.wheels.filter(wheel=>wheel.name==='front-wheel').some(wheel=>Math.abs(wheel.rotation.y)>0));
  disposeGroup(root);
});

test('a farmer ramming the player transfers momentum, then recovers through the same physical state',()=>{
  const {course,root,world,traffic,farmer}=setup();
  const player=new Vehicle(course);
  player.position.copy(farmer.drive.position).add(new THREE.Vector3(.5,0,10));player.heading=0;player.velocity.set(0,0,2);
  let hit=false;
  for(let i=0;i<120*5;i++) {
    traffic.update(1/120,player.position,player.velocity);
    player.update(1/120,{throttle:0,steer:0,handbrake:false},world);
    if(farmer.reactionTime>0&&player.velocity.length()>1)hit=true;
  }
  assert.ok(hit,'the Caddy makes physical contact with the player');
  assert.ok(player.damage>0,'ramming produces real collision damage');
  const position=farmer.drive.position.clone(),velocity=farmer.velocity.clone();traffic.update(0,player.position,player.velocity);
  assert.ok(farmer.drive.position.equals(position)&&farmer.velocity.equals(velocity),'pause preserves physics');
  assert.ok(farmer.active);
  disposeGroup(player.mesh);disposeGroup(root);
});

test('farmer stays active beyond an open stage endpoint',()=>{
  const {root,traffic,farmer,course}=setup();
  farmer.distance=course.length-.05;
  traffic.update(.1);
  assert.ok(farmer.active&&farmer.collider.active&&farmer.mesh.visible);
  disposeGroup(root);
});

for(const rate of [30,120])test(`farmer turns back for an evasive player behind it at ${rate}Hz`,()=>{
  const {root,traffic,farmer}=setup();
  const player=farmer.drive.position.clone().add(new THREE.Vector3(-3,0,-12));
  let closest=Infinity,reversed=false;
  for(let i=0;i<rate*30;i++) {
    traffic.update(1/rate,player,new THREE.Vector3());
    closest=Math.min(closest,farmer.drive.position.distanceTo(player));
    if(farmer.speed<-.2)reversed=true;
    assert.ok(Number.isFinite(farmer.drive.heading));
  }
  assert.ok(reversed,'driver brakes before selecting reverse to turn around');
  assert.ok(closest<5,`farmer returns to the player rather than abandoning pursuit: ${closest}`);
  disposeGroup(root);
});

for(const style of ['cruising','rally'] as const)for(const rate of [30,120])test(`farmer catches a player at full ${style} speed at ${rate}Hz`,()=>{
  const course=new Course({...courses[0],setting:undefined,closed:false,width:fixture.widths[1],points:[[0,-2000],[0,0],[0,2000]],hills:0,lakes:[]});
  const player=new Vehicle(course,style),root=new THREE.Group(),traffic=new Traffic(course,new CollisionWorld(),root,player);
  const farmer=traffic.vehicles.find(vehicle=>vehicle.aggressive)!;
  for(const other of traffic.vehicles)if(other!==farmer){other.active=false;other.collider.active=false;}
  const forward=new THREE.Vector3(Math.sin(farmer.drive.heading),0,Math.cos(farmer.drive.heading));
  const side=new THREE.Vector3(forward.z,0,-forward.x);
  player.position.copy(farmer.drive.position).addScaledVector(forward,35).addScaledVector(side,.5);
  const topSpeed=player.profiles[style].road.speed;
  player.velocity.copy(forward).multiplyScalar(topSpeed);
  let closest=Infinity,fastest=0;
  for(let i=0;i<rate*30;i++) {
    player.position.addScaledVector(player.velocity,1/rate);
    const previous=farmer.drive.position.clone(),speed=farmer.velocity.length();
    traffic.update(1/rate,player.position,player.velocity);
    assert.ok(farmer.drive.position.distanceTo(previous)<(speed+player.profiles[style].acceleration/rate)*1/rate+.02,'catch-up uses engine acceleration, never a position pull');
    closest=Math.min(closest,farmer.drive.position.distanceTo(player.position));
    fastest=Math.max(fastest,farmer.speed);
  }
  assert.ok(fastest>topSpeed*1.04,`farmer exceeds the player top speed: ${fastest} vs ${topSpeed}`);
  assert.ok(fastest<=topSpeed*1.09,`the speed advantage stays modest: ${fastest} / ${topSpeed}`);
  assert.ok(closest<5,`farmer closes the gap for a ram: ${closest}`);
  disposeGroup(player.mesh);disposeGroup(root);
});

test('farmer performance follows live player tuning',()=>{
  const {course,root}=setup(),profiles=createDrivingProfiles();
  const player=new Vehicle(course,'rally',profiles,'tiguan-2022');
  const traffic=new Traffic(course,new CollisionWorld(),root,player),farmer=traffic.vehicles.find(vehicle=>vehicle.aggressive)!;
  profiles.rally.road.speed=65;profiles.rally.acceleration=25;
  traffic.update(1/120);
  assert.ok(Math.abs(farmer.baseSpeed-70.2)<1e-8);
  assert.ok(farmer.powertrain!.acceleration>profiles.rally.acceleration);
  disposeGroup(player.mesh);disposeGroup(root);
});


test('farmer starts behind the player, outside the follow camera on every parcours',()=>{
  for(const definition of courses) {
    const course=new Course(definition),root=new THREE.Group(),player=new Vehicle(course),traffic=new Traffic(course,new CollisionWorld(),root,player);
    const farmer=traffic.vehicles.find(vehicle=>vehicle.aggressive)!;
    const forward=new THREE.Vector3(Math.sin(player.heading),0,Math.cos(player.heading));
    const delta=farmer.drive.position.clone().sub(player.position);
    assert.ok(delta.dot(forward)<-30,`${definition.id}: farmer starts well behind the player`);
    assert.ok(!course.inWater(farmer.drive.position.x,farmer.drive.position.z));
    const config=renderAsset.follow;
    for(const aspect of [.5,1,2.4]) {
      const camera=new THREE.PerspectiveCamera(renderAsset.camera.fov,aspect,renderAsset.camera.near,renderAsset.camera.far);
      camera.position.copy(player.position).addScaledVector(forward,-config.distance);camera.position.y+=config.height;
      camera.position.y=Math.max(camera.position.y,course.heightAt(camera.position.x,camera.position.z)+config.minGroundClearance);
      const target=player.position.clone().addScaledVector(forward,config.lookAhead);target.y+=config.lookHeight;
      camera.lookAt(target);camera.updateMatrixWorld(true);
      const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      assert.equal(frustum.intersectsBox(new THREE.Box3().setFromObject(farmer.mesh)),false,`${definition.id}: entire Caddy starts outside the camera at aspect ${aspect}`);
    }
    disposeGroup(player.mesh);disposeGroup(root);
  }
});

for(const rate of [30,120])for(const vehicleId of ['volvo-240','tiguan-2022'] as const)for(const contact of ['rear','side'])test(`${vehicleId}: player responds to a farmer ${contact} ram at ${rate}Hz`,()=>{
  const {course,root,world,traffic,farmer}=setup();
  const player=new Vehicle(course,'cruising',createDrivingProfiles(),vehicleId);
  const forward=new THREE.Vector3(Math.sin(farmer.drive.heading),0,Math.cos(farmer.drive.heading));
  const side=new THREE.Vector3(forward.z,0,-forward.x);
  player.position.copy(farmer.drive.position).addScaledVector(contact==='rear'?forward:side,8);
  if(contact==='side')player.position.addScaledVector(forward,1.1);
  player.heading=farmer.drive.heading;player.velocity.set(0,0,0);
  if(contact==='side') {
    farmer.drive.heading+=Math.PI/2;farmer.drive.steering=0;farmer.angularVelocity=0;
    farmer.velocity.copy(side).multiplyScalar(12);farmer.speed=12;
  }
  const origin=player.position.clone(),originalHeading=player.heading;let contactMade=false,largestKick=0,turn=0;
  for(let i=0;i<rate*3;i++) {
    traffic.update(1/rate,player.position,player.velocity);
    const before=player.velocity.clone();
    player.update(1/rate,{throttle:0,steer:0,handbrake:false},world);
    if(farmer.reactionTime>0) {
      contactMade=true;largestKick=Math.max(largestKick,player.velocity.clone().sub(before).dot(contact==='rear'?forward:side));
      turn=Math.max(turn,Math.abs(player.heading-originalHeading));
    }
  }
  assert.ok(contactMade,'farmer physically strikes the main car');
  assert.ok(largestKick>1,'the impact changes the main car velocity in the collision direction');
  assert.ok(player.position.clone().sub(origin).dot(contact==='rear'?forward:side)>.5,'main car visibly moves from the impact');
  assert.ok(player.damage>0,'a hard farmer collision damages the main car');
  if(contact==='side')assert.ok(turn>.01,'side contact also turns the main car');
  assert.ok(Number.isFinite(player.position.x)&&Number.isFinite(player.heading));
  disposeGroup(player.mesh);disposeGroup(root);
});
