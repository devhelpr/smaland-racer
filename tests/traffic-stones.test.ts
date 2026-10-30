import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { CollisionWorld } from '../src/collision.ts';
import { Traffic } from '../src/traffic.ts';
import { disposeGroup } from '../src/dispose.ts';
import fixture from './fixtures/traffic-road.json' with {type:'json'};
import stones from '../parcours/road-rocks.json' with {type:'json'};
import scenery from '../assets/scenery.json' with {type:'json'};
import physics from '../assets/traffic-physics.json' with {type:'json'};

function setup(direction:number,stone:typeof stones.placements[number]) {
  const course=new Course({...courses[0],closed:false,setting:'holmahult',width:fixture.widths[1],points:fixture.points as [number,number][],hills:0,lakes:[]});
  const root=new THREE.Group(),world=new CollisionWorld(),traffic=new Traffic(course,world,root);
  const tractor=traffic.vehicles.find(vehicle=>vehicle.direction===direction)!;
  for(const other of traffic.vehicles)if(other!==tractor){other.active=false;other.collider.active=false;}
  tractor.distance=fixture.meetingDistances[0];traffic.update(1/120);
  const forward=tractor.route.sample(tractor.distance).tangent.multiplyScalar(direction);
  const right=new THREE.Vector3(forward.z,0,-forward.x);
  const frontWheel=tractor.wheels.find(wheel=>wheel.position.z>0&&wheel.position.x>0)!;
  const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(...scenery.rockGeometry as [number,number]),new THREE.MeshStandardMaterial({side:THREE.DoubleSide}));
  rock.position.copy(tractor.mesh.position).addScaledVector(forward,physics.avoidance.lookAhead).addScaledVector(right,frontWheel.position.x);rock.position.y=0;
  rock.scale.fromArray(stone.scale);rock.rotation.set(stone.rotation[0],tractor.drive.heading+stone.rotation[1],stone.rotation[2],'YXZ');
  root.add(rock);rock.updateMatrixWorld(true);world.addRock('drivable-stone',rock.geometry,rock.material,rock.matrixWorld);
  return {root,world,traffic,tractor,forward,frontWheel,rock};
}

for(const direction of [-1,1])for(const stone of [stones.placements[1],stones.placements[4]])test(`traffic drives over a ${stone.scale[1]}m stone in direction ${direction} without braking or avoiding it`,()=>{
  const {root,traffic,tractor,forward,frontWheel,rock}=setup(direction,stone);
  const lane=tractor.laneOffset,heading=tractor.drive.heading,start=tractor.mesh.position.clone();
  const initialHeight=tractor.mesh.position.y,initialWheel=frontWheel.getWorldPosition(new THREE.Vector3()).y;
  let maxBodyHeight=initialHeight,maxWheelHeight=initialWheel;
  for(let i=0;i<120*5;i++) {
    traffic.update(1/120);root.updateMatrixWorld(true);
    assert.ok(Math.abs(tractor.laneOffset-lane)<.005,'the driver keeps the lane instead of taking a detour');
    assert.ok(Math.abs(tractor.drive.heading-heading)<.001,'stones do not trigger avoidance steering');
    assert.ok(tractor.speed>tractor.baseSpeed-.1,'stones do not trigger obstacle braking');
    assert.equal(tractor.obstacleLane,null);assert.equal(tractor.recovering,false);
    maxBodyHeight=Math.max(maxBodyHeight,tractor.mesh.position.y);
    maxWheelHeight=Math.max(maxWheelHeight,frontWheel.getWorldPosition(new THREE.Vector3()).y);
  }
  assert.ok(tractor.mesh.position.clone().sub(rock.position).dot(forward)>tractor.collider.halfZ,'the entire vehicle passes over the stone');
  assert.ok(tractor.mesh.position.clone().sub(start).dot(forward)>physics.avoidance.lookAhead);
  assert.ok(maxBodyHeight>initialHeight+.01,'the body rises over the stone');
  assert.ok(maxWheelHeight>initialWheel+.03,'the wheel follows the visible stone surface rather than passing through it');
  assert.ok(Math.abs(tractor.mesh.position.y-initialHeight)<.01,'the car settles back onto the road after crossing');
  disposeGroup(root);
});

test('ignoring drivable stones still leaves solid barriers collidable and visible to the driver',()=>{
  const {root,world,traffic,tractor,forward,rock}=setup(1,stones.placements[1]);
  const barrier=rock.position.clone().addScaledVector(forward,physics.avoidance.lookAhead);
  world.add({id:'solid-barrier',kind:'building',x:barrier.x,z:barrier.z,radius:30,halfX:25,halfZ:1,angle:0});
  for(let i=0;i<120*9;i++) {
    traffic.update(1/120);
    assert.ok(tractor.mesh.position.z<barrier.z-1-tractor.collider.halfZ,'the body never crosses the solid barrier');
  }
  assert.ok(tractor.mesh.position.clone().sub(rock.position).dot(forward)>tractor.collider.halfZ,'the car first crosses the stone');
  assert.ok(Math.abs(tractor.speed)<.2,'the driver stops for the barrier');
  disposeGroup(root);
});
