import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { CollisionWorld } from '../src/collision.ts';
import { Traffic } from '../src/traffic.ts';
import { disposeGroup } from '../src/dispose.ts';
import fixture from './fixtures/traffic-road.json' with {type:'json'};
import physics from '../assets/traffic-physics.json' with {type:'json'};
import lights from '../assets/lighting.json' with {type:'json'};

function setup(count=1) {
  const course=new Course({...courses[0],closed:false,setting:'holmahult',width:fixture.widths[1],points:fixture.points as [number,number][],hills:0,lakes:[]});
  const root=new THREE.Group(),traffic=new Traffic(course,new CollisionWorld(),root);
  traffic.vehicles.forEach((vehicle,index)=>{
    vehicle.active=index<count;vehicle.collider.active=vehicle.active;
    if(index<count){vehicle.distance=fixture.meetingDistances[index];vehicle.speed=0;vehicle.baseSpeed=0;}
  });
  traffic.update(1/120);
  const tractor=traffic.vehicles[0],forward=new THREE.Vector3(Math.sin(tractor.drive.heading),0,Math.cos(tractor.drive.heading));
  const player=tractor.drive.position.clone().addScaledVector(forward,physics.lighting.dimDistance/2);
  const heading=tractor.drive.heading+Math.PI;
  return {root,traffic,tractor,forward,player,heading};
}

function ledIntensity(root:THREE.Group):number {
  const lens=root.getObjectByName('led-bar-lens') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
  return lens.material.emissiveIntensity;
}

test('night traffic uses full beam and the visible LED bar; day and inactive traffic switch off',()=>{
  const {root,traffic,tractor}=setup();
  assert.equal(tractor.lighting.mode,'off');
  traffic.setTimeOfDay('night');
  assert.equal(tractor.lighting.mode,'led');
  assert.equal(tractor.lighting.beam.intensity,lights.modes.led.intensity);
  assert.equal(ledIntensity(tractor.lighting.root),lights.modes.led.ledIntensity);
  assert.equal(tractor.lighting.beam.castShadow,false,'traffic does not add per-car forest shadow passes');
  assert.ok(traffic.vehicles.slice(1).every(vehicle=>vehicle.lighting.mode==='off'));
  traffic.setTimeOfDay('day');
  assert.equal(tractor.lighting.mode,'off');assert.equal(tractor.lighting.beam.visible,false);
  disposeGroup(root);
});

test('oncoming player triggers dipped headlights and extinguishes the LED bar, even when stopped',()=>{
  const {root,traffic,tractor,player,heading}=setup();
  traffic.setTimeOfDay('night',player,heading);
  assert.equal(tractor.lighting.mode,'dipped');
  assert.equal(tractor.lighting.beam.intensity,lights.modes.dipped.intensity);
  assert.equal(ledIntensity(tractor.lighting.root),0);
  traffic.update(.1,player,new THREE.Vector3(),heading);
  assert.equal(tractor.lighting.mode,'dipped');
  disposeGroup(root);
});

test('opposing A-traktors dip for each other without needing a player nearby',()=>{
  const {root,traffic}=setup(2);
  traffic.setTimeOfDay('night');
  assert.ok(traffic.vehicles.slice(0,2).every(vehicle=>vehicle.lighting.mode==='dipped'));
  const other=traffic.vehicles[1];other.direction=1;other.distance+=1;
  traffic.update(physics.lighting.releaseDelay+.1);
  assert.ok(traffic.vehicles.slice(0,2).every(vehicle=>vehicle.lighting.mode==='led'),'same-direction traffic does not count as oncoming');
  disposeGroup(root);
});

for(const rate of [30,120])test(`traffic restores full beam after an oncoming player passes at ${rate}Hz`,()=>{
  const {root,traffic,tractor,player,heading,forward}=setup();
  traffic.setTimeOfDay('night',player,heading);
  const behind=tractor.drive.position.clone().addScaledVector(forward,-physics.lighting.dimDistance/2);
  for(let i=0;i<rate;i++)traffic.update(1/rate,behind,undefined,heading);
  assert.equal(tractor.lighting.mode,'dipped','dipped beams hold briefly after passing');
  for(let i=0;i<rate;i++)traffic.update(1/rate,behind,undefined,heading);
  assert.equal(tractor.lighting.mode,'led');
  disposeGroup(root);
});

test('detection respects distance, facing direction and the forward field of view',()=>{
  const {root,traffic,tractor,player,heading,forward}=setup();
  traffic.setTimeOfDay('night');
  traffic.update(0,player,undefined,tractor.drive.heading);
  assert.equal(tractor.lighting.mode,'led','a car driving away does not trigger dipping');
  const distant=tractor.drive.position.clone().addScaledVector(forward,physics.lighting.dimDistance+1);
  traffic.update(0,distant,undefined,heading);
  assert.equal(tractor.lighting.mode,'led','distant cars do not trigger dipping');
  const beside=tractor.drive.position.clone().addScaledVector(new THREE.Vector3(forward.z,0,-forward.x),physics.lighting.dimDistance/2);
  traffic.update(0,beside,undefined,heading);
  assert.equal(tractor.lighting.mode,'led','cars beside or behind do not trigger dipping');
  traffic.update(0,player,forward.clone().negate());
  assert.equal(tractor.lighting.mode,'dipped','velocity also supports callers without a supplied heading');
  disposeGroup(root);
});

test('traffic lights remain attached through heading, pitch and roll changes',()=>{
  const {root,traffic,tractor}=setup();traffic.setTimeOfDay('night');
  const beam=tractor.lighting.beam,local=beam.target.position.clone().sub(beam.position).normalize();
  tractor.mesh.rotation.set(.2,Math.PI/2,.15);root.updateMatrixWorld(true);
  const actual=beam.target.getWorldPosition(new THREE.Vector3()).sub(beam.getWorldPosition(new THREE.Vector3())).normalize();
  assert.ok(actual.distanceTo(local.transformDirection(beam.parent!.matrixWorld))<1e-8);
  let disposed=false;beam.shadow.dispose=()=>{disposed=true;};disposeGroup(root);assert.ok(disposed);
});
