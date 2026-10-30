import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { CollisionWorld } from '../src/collision.ts';
import { Traffic } from '../src/traffic.ts';
import { disposeGroup } from '../src/dispose.ts';
import fixture from './fixtures/traffic-road.json' with {type:'json'};
import physics from '../assets/traffic-physics.json' with {type:'json'};

function setup(width:number,closed=false) {
  const course=new Course({...courses[0],closed,setting:'holmahult',width,points:fixture.points as [number,number][],hills:0,lakes:[]});
  const root=new THREE.Group(),traffic=new Traffic(course,new CollisionWorld(),root);
  for(const other of traffic.vehicles.slice(2)){other.active=false;other.collider.active=false;}
  const [outbound,inbound]=traffic.vehicles;
  outbound.distance=fixture.meetingDistances[0];inbound.distance=fixture.meetingDistances[1];
  traffic.update(1/120);
  return {course,root,traffic,outbound,inbound};
}

for(const width of fixture.widths)for(const rate of [30,120])test(`oncoming traffic passes on the right on a ${width}m road at ${rate}Hz`,()=>{
  const {root,traffic,outbound,inbound}=setup(width);
  let passed=false,sawOverlap=false,slowest=Infinity;
  for(let i=0;i<rate*20;i++) {
    traffic.update(1/rate);
    for(const vehicle of [outbound,inbound]) {
      const sample=vehicle.route.sample(vehicle.distance),forward=sample.tangent.multiplyScalar(vehicle.direction);
      const right=new THREE.Vector3(forward.z,0,-forward.x);
      assert.ok(vehicle.mesh.position.clone().sub(sample.point).dot(right)>0,'both drivers stay on their own right');
      assert.ok(vehicle.collider.velocity!.dot(forward)>0,'collider velocity follows the actual travel direction');
      assert.ok(vehicle.mesh.getWorldDirection(new THREE.Vector3()).dot(forward)>.97,'the visible car faces its travel direction');
      if(width>4)assert.ok(vehicle.laneOffset+vehicle.collider.halfX<=width/2,'normal roads keep traffic within its half of the road');
    }
    slowest=Math.min(slowest,outbound.speed,inbound.speed);
    if(Math.abs(outbound.distance-inbound.distance)<outbound.collider.halfZ+inbound.collider.halfZ) {
      sawOverlap=true;
      assert.ok(Math.abs(outbound.mesh.position.x-inbound.mesh.position.x)>outbound.collider.halfX+inbound.collider.halfX+.2,'the bodies have lateral clearance throughout the encounter');
    }
    if(outbound.distance>inbound.distance+physics.meeting.rearClearance)passed=true;
  }
  assert.ok(sawOverlap&&passed,'drivers pass each other without stopping nose to nose');
  if(width<4)assert.ok(slowest<4,'drivers slow down for a narrow-road encounter');
  else assert.ok(slowest>6,'separate lanes do not trigger following-distance braking');
  for(const vehicle of [outbound,inbound])assert.ok(Math.abs(vehicle.laneOffset-width*.22)<.01||Math.abs(vehicle.laneOffset-(width/2-vehicle.collider.halfX))<.01,'drivers smoothly return after passing');
  disposeGroup(root);
});

test('reverse traffic brakes for the player ahead and exits at the beginning of a stage',()=>{
  const {root,traffic,outbound,inbound}=setup(8.2);outbound.active=false;
  const tangent=inbound.route.sample(inbound.distance).tangent.multiplyScalar(inbound.direction);
  const player=inbound.mesh.position.clone().addScaledVector(tangent,10);
  const before=inbound.speed;
  traffic.update(.1,player);assert.ok(inbound.speed<before);
  inbound.distance=.01;traffic.update(.1);
  assert.equal(inbound.active,false);assert.equal(inbound.collider.active,false);assert.equal(inbound.mesh.visible,false);
  disposeGroup(root);
});

test('reverse traffic wraps at the closed circuit seam',()=>{
  const {root,traffic,outbound,inbound}=setup(8.2,true);outbound.active=false;
  inbound.distance=.01;traffic.update(.1);
  assert.ok(inbound.active);assert.ok(inbound.distance>inbound.route.length-1);
  disposeGroup(root);
});

test('open-world traffic uses the actual Road 120 centerline and both right-hand lanes',()=>{
  const course=new Course(courses.find(definition=>definition.id==='holmahult-open-world')!);
  const root=new THREE.Group(),traffic=new Traffic(course,new CollisionWorld(),root);
  const mainRoadIds=new Set(course.roadNetwork!.roads.filter(road=>road.definition.name==='Väg 120').map(road=>road.definition.id));
  const vehicles=traffic.vehicles.filter(vehicle=>mainRoadIds.has(vehicle.route.id));
  assert.ok(vehicles.some(vehicle=>vehicle.direction===1)&&vehicles.some(vehicle=>vehicle.direction===-1),'Road 120 has traffic in both directions');
  for(const vehicle of vehicles) {
    const sample=vehicle.route.sample(vehicle.distance);
    const right=new THREE.Vector3(sample.tangent.z,0,-sample.tangent.x).multiplyScalar(vehicle.direction);
    assert.ok(vehicle.mesh.position.clone().sub(sample.point).dot(right)>vehicle.collider.halfX,'the entire vehicle stays in its own lane');
    assert.ok(course.nearestRoad(vehicle.mesh.position.x,vehicle.mesh.position.z).distance<vehicle.route.width/2);
  }
  disposeGroup(root);
});
