import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { Traffic } from '../src/traffic.ts';
import { Vehicle } from '../src/vehicle.ts';
import { CollisionWorld } from '../src/collision.ts';
import { disposeGroup } from '../src/dispose.ts';
import physics from '../assets/traffic-physics.json' with {type:'json'};

function setup() {
  const course=new Course({...courses[0],setting:'holmahult',closed:false,width:8.2,points:[[0,-500],[0,0],[0,500]],hills:0,lakes:[]});
  const world=new CollisionWorld(),root=new THREE.Group(),traffic=new Traffic(course,world,root);
  const farmer=traffic.vehicles.find(vehicle=>vehicle.aggressive)!;
  for(const other of traffic.vehicles)if(other!==farmer){other.active=false;other.collider.active=false;}
  const player=new Vehicle(course);root.add(player.mesh);
  return {course,world,root,traffic,farmer,player};
}

for(const rate of [30,120])test(`loaded Caddy transfers a hard ram without creating momentum or energy at ${rate}Hz`,()=>{
  const {root,farmer,player}=setup(),config=physics.contact;
  const normal=new THREE.Vector3(1,0,0),speed=20;
  farmer.velocity.copy(normal).multiplyScalar(speed);farmer.angularVelocity=0;
  const playerInertia=config.playerMass*(player.asset.bodyWidth**2+(player.asset.frontBumper[5]-player.asset.rearBumper[5])**2)/12;
  const change=farmer.collider.onPush!(normal.clone().multiplyScalar(-speed),normal,1/rate,farmer.drive.position.clone(),{mass:config.playerMass,inertia:playerInertia,lever:0}) as number;
  assert.ok(change>10,'a hard Caddy ram gives substantially more than the former 5 m/s cap');
  const momentum=farmer.velocity.x*config.farmer.mass+change*config.playerMass;
  assert.ok(Math.abs(momentum-speed*config.farmer.mass)<1e-8,'the same impulse acts on both bodies');
  const energy=farmer.velocity.lengthSq()*config.farmer.mass+change**2*config.playerMass;
  assert.ok(energy<speed**2*config.farmer.mass,'rebound dissipates energy');
  assert.equal(farmer.angularVelocity,0,'centered impact does not invent spin');
  disposeGroup(root);
});

for(const rate of [30,120])test(`a quarter ram keeps the player sliding and spinning after contact at ${rate}Hz`,()=>{
  const {root,world,traffic,farmer,player}=setup();
  player.position.copy(farmer.drive.position).add(new THREE.Vector3(4,0,2.2));player.heading=0;
  farmer.drive.heading=Math.PI/2;farmer.drive.steering=0;farmer.angularVelocity=0;farmer.velocity.set(12,0,0);farmer.speed=12;
  let struck=false;
  for(let i=0;i<rate*3;i++) {
    traffic.update(1/rate,player.position,player.velocity);
    player.update(1/rate,{throttle:0,steer:0,handbrake:false},world);
    if(farmer.reactionTime>0){struck=true;break;}
  }
  assert.ok(struck);
  const position=player.position.clone(),heading=player.heading,spin=player.stunts.angularVelocity.y;
  assert.ok(player.velocity.x>3,'the player receives a visible lateral kick');
  assert.ok(Math.abs(spin)>.3,`off-center contact produces angular momentum: ${spin}, kick ${player.velocity.x}`);
  farmer.active=false;farmer.collider.active=false;
  for(let i=0;i<rate;i++)player.update(1/rate,{throttle:0,steer:0,handbrake:false},world);
  assert.ok(player.position.x-position.x>1.5,'tire grip does not erase the shove immediately');
  assert.ok(Math.abs(player.heading-heading)>.15,'rotation continues after the cars separate');
  assert.ok(Math.abs(player.stunts.angularVelocity.y)<Math.abs(spin),'ground contact damps the spin');
  player.restart();assert.equal(player.stunts.angularVelocity.y,0,'recovery resets the physical spin');
  disposeGroup(root);
});

test('quarter-contact impulses include both bodies rotational inertia',()=>{
  const {root,farmer,player}=setup(),config=physics.contact,normal=new THREE.Vector3(1,0,0);
  const playerMass=config.playerMass,farmerMass=config.farmer.mass;
  const playerLength=player.asset.frontBumper[5]+player.asset.frontBumper[2]/2-player.asset.rearBumper[5]+player.asset.rearBumper[2]/2;
  const playerInertia=playerMass*(player.asset.bodyWidth**2+playerLength**2)/12;
  const farmerInertia=farmerMass*((farmer.collider.halfX*2)**2+(farmer.collider.halfZ*2)**2)/12;
  const farmerLever=.4,playerLever=-.9,speed=8;
  farmer.velocity.copy(normal).multiplyScalar(speed);farmer.angularVelocity=0;
  const contact=farmer.drive.position.clone().add(new THREE.Vector3(1.8,0,farmerLever));
  const change=farmer.collider.onPush!(normal.clone().multiplyScalar(-speed),normal,1/120,contact,{mass:playerMass,inertia:playerInertia,lever:playerLever}) as number;
  const impulse=change*playerMass,playerSpin=impulse*playerLever/playerInertia;
  const expected=(1+config.farmer.restitution)*speed/(1/playerMass+1/farmerMass+farmerLever**2/farmerInertia+playerLever**2/playerInertia);
  assert.ok(Math.abs(impulse-expected)<1e-8);
  const angularMomentum=farmerInertia*farmer.angularVelocity+playerInertia*playerSpin+(farmerLever-playerLever)*impulse;
  assert.ok(Math.abs(angularMomentum)<1e-8,'the contact conserves angular momentum about the Caddy center');
  const energy=farmer.velocity.lengthSq()*farmerMass+change**2*playerMass+farmer.angularVelocity**2*farmerInertia+playerSpin**2*playerInertia;
  assert.ok(energy<speed**2*farmerMass,'translation and spin together do not create energy');
  disposeGroup(root);
});
