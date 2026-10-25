import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { Vehicle } from '../src/vehicle.ts';
import { CollisionWorld } from '../src/collision.ts';
import { createScenery } from '../src/scenery.ts';
import { disposeGroup } from '../src/dispose.ts';
import { courseRecordKey, loadProgress, recordResult, saveProgress } from '../src/storage.ts';
import bridgeAsset from '../assets/sandsjon.json' with { type: 'json' };

const straight=new Course({...courses[0],setting:undefined,points:[[0,-350],[0,350]],lakes:[],hills:0});
const controls={throttle:1,steer:0,handbrake:false};
function simulate(car:Vehicle,seconds:number,throttle=1) {
  for(let i=0;i<seconds*120;i++)car.update(1/120,{...controls,throttle});
}

test('Cruising is the default; Rally accelerates faster, reaches higher speeds and loses less speed on grass',()=> {
  const cruising=new Vehicle(straight),explicit=new Vehicle(straight,'cruising'),rally=new Vehicle(straight,'rally');
  simulate(cruising,1);simulate(explicit,1);simulate(rally,1);
  assert.deepEqual(cruising.velocity,explicit.velocity);
  assert.ok(rally.forwardSpeed>cruising.forwardSpeed*1.5);
  simulate(cruising,5);simulate(rally,5);
  assert.ok(rally.forwardSpeed>cruising.forwardSpeed*1.3);
  for(const car of [cruising,rally]) {car.position.set(100,0,0);car.heading=0;car.velocity.set(0,0,12);simulate(car,1,0);assert.equal(car.onRoad,false);}
  assert.ok(rally.forwardSpeed>cruising.forwardSpeed*2);
});

test('frozen lake supports the car off the marked route and has much less lateral grip',()=> {
  const lake=new Course(courses.find(c=>c.setting==='sandsjon')!),iceCar=new Vehicle(lake),grassCar=new Vehicle(straight);
  for(const car of [iceCar,grassCar]) {car.position.set(-80,0,-80);car.heading=0;car.velocity.set(8,0,0);simulate(car,.5,0);}
  assert.ok(lake.onIce(iceCar.position.x,iceCar.position.z));assert.equal(lake.inWater(iceCar.position.x,iceCar.position.z),false);
  assert.equal(iceCar.position.y,lake.lakes[0].level);
  assert.ok(iceCar.velocity.x>grassCar.velocity.x*5);
  disposeGroup(iceCar.mesh);disposeGroup(grassCar.mesh);
});

test('Road 120 has an elevated deck, collidable piers and clear passages beneath both halves',()=> {
  const course=new Course(courses.find(c=>c.setting==='sandsjon')!),world=new CollisionWorld(),group=new THREE.Group();
  createScenery(group,course,world);
  const bridge=group.getObjectByName('Road 120')!;assert.ok(bridge);
  const deck=bridgeAsset.bridge.parts[0];assert.ok(deck.position[1]-deck.size[1]/2>3);
  const placement=course.definition.bridge!;
  const local=(x:number,z:number)=>new THREE.Vector3(x,0,z).applyAxisAngle(new THREE.Vector3(0,1,0),placement.angle).add(new THREE.Vector3(...placement.position));
  for(const x of [-8,8]) {assert.ok(course.onIce(local(x,0).x,local(x,0).z));assert.equal(world.sweep(local(x,-20),local(x,20)),null);}
  const hit=world.sweep(local(bridgeAsset.bridge.pierX[0],-20),local(bridgeAsset.bridge.pierX[0],20));
  assert.ok(hit?.collider.id.startsWith('bridge-pier-'));
  disposeGroup(group);
});

test('style selection and separate records survive saving while old saves default to Cruising',()=> {
  let saved='';const storage={getItem:()=>saved,setItem:(_key:string,value:string)=>{saved=value;}};
  const progress=loadProgress(storage);assert.equal(progress.drivingStyle,'cruising');
  progress.drivingStyle='rally';
  const result={elapsed:20,damage:0,recoveries:0,total:20,medal:'gold' as const,splits:[20]};
  recordResult(progress,courses[0].id,result);recordResult(progress,courses[0].id,{...result,elapsed:15,total:15},'rally');saveProgress(storage,progress);
  const restored=loadProgress(storage);assert.equal(restored.drivingStyle,'rally');assert.equal(restored.records[courses[0].id].total,20);
  assert.equal(restored.records[courseRecordKey(courses[0].id,'rally')].total,15);
  saved=JSON.stringify({version:1,records:{},drivingStyle:'unknown'});assert.equal(loadProgress(storage).drivingStyle,'cruising');
});

test('Sandsjön follows the supplied shoreline, keeping the eastern peninsula snowy and the southern outlet frozen',()=> {
  const course=new Course(courses.find(c=>c.setting==='sandsjon')!);
  const fromImage=(x:number,y:number)=>[(x-475)*.65,(y-570)*.55] as const;
  assert.ok(course.lakes[0].outline!.length>80);
  for(const point of [[350,400],[350,750],[640,730],[435,995],[375,1090]]) {
    const [x,z]=fromImage(...point as [number,number]);assert.ok(course.onIce(x,z),`expected ice at ${point}`);assert.equal(course.height(x,z),0);
  }
  for(const point of [[500,380],[510,500],[540,740],[200,600]]) {
    const [x,z]=fromImage(...point as [number,number]);assert.equal(course.onIce(x,z),false,`expected land at ${point}`);assert.ok(course.height(x,z)>0);
  }
  assert.ok(course.definition.bridge!.position[2]>200,'bridge belongs at the southern outlet');
  for(const sample of course.points)assert.ok(course.onIce(sample.x,sample.z));
});
