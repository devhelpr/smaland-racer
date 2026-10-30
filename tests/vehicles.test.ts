import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vehicles, vehicleDefinition } from '../src/vehicles.ts';
import { createVehicleModel } from '../src/vehicle-model.ts';
import { Vehicle } from '../src/vehicle.ts';
import { Course, courses } from '../src/track.ts';
import { loadProgress, saveProgress } from '../src/storage.ts';
import { disposeGroup } from '../src/dispose.ts';

test('car choice survives saving; old saves and invalid choices retain the Volvo',()=>{
  let saved='';const storage={getItem:()=>saved,setItem:(_key:string,value:string)=>{saved=value;}};
  const progress=loadProgress(storage);progress.vehicle='tiguan-2022';
  assert.ok(saveProgress(storage,progress));assert.equal(loadProgress(storage).vehicle,'tiguan-2022');
  for(const vehicle of [undefined,'unknown','constructor','__proto__']) {
    saved=JSON.stringify({version:1,vehicle});assert.equal(loadProgress(storage).vehicle,'volvo-240');
  }
});

test('both models have valid geometry and steerable wheels; the Tiguan adds curved detail at a bounded cost',()=>{
  const triangles:Record<string,number>={};
  for(const {id} of vehicles) {
    const root=new THREE.Group(),definition=vehicleDefinition(id);
    const model=createVehicleModel(root,definition.asset,undefined,definition.materials);
    assert.equal(root.userData.model,definition.asset.name);
    assert.equal(model.wheels.length,4);assert.equal(model.panels.length,2);
    triangles[id]=0;let draws=0;
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      draws++;
      const positions=object.geometry.getAttribute('position');
      assert.ok(Array.from(positions.array).every(Number.isFinite),`${id}: finite vertices`);
      triangles[id]+=(object.geometry.index?.count??positions.count)/3;
      assert.ok(object.material instanceof THREE.MeshStandardMaterial);
    });
    assert.ok(draws<50,'decorations stay batched by material');
    assert.equal((model.panels[0].material as THREE.MeshStandardMaterial).color.getHexString(),new THREE.Color(definition.materials.paint.color).getHexString());
    disposeGroup(root);
  }
  assert.ok(triangles['tiguan-2022']>triangles['volvo-240']);
  assert.ok(triangles['tiguan-2022']<100000,'a detailed player car keeps a reasonable polygon budget');
});

test('the Tiguan drives, brakes, deforms and recovers with its own hood and wheel dimensions',()=>{
  const car=new Vehicle(new Course(courses[0]),'cruising',undefined,'tiguan-2022');
  assert.equal(car.vehicleId,'tiguan-2022');assert.match(car.mesh.userData.model,/Tiguan/);
  assert.deepEqual(car.lighting.beam.position.toArray(),car.asset.lighting!.beamPosition);
  const start=car.position.clone();
  for(let i=0;i<120;i++)car.update(1/120,{throttle:1,steer:0,handbrake:false});
  assert.ok(car.position.distanceTo(start)>1);assert.ok(car.forwardSpeed>0);
  const speed=car.forwardSpeed;
  for(let i=0;i<30;i++)car.update(1/120,{throttle:-1,steer:0,handbrake:false});
  assert.ok(car.forwardSpeed<speed);
  car.damage=75;car.update(1/120,{throttle:0,steer:.5,handbrake:false});
  const hood=car.mesh.getObjectByName('vehicle-hood')!;
  assert.equal(hood.position.y,car.asset.hood[4]+75*.0015);
  car.rightInPlace();assert.equal(car.damage,75);assert.equal(car.velocity.length(),0);
  car.restart();car.update(1/120,{throttle:0,steer:0,handbrake:false});
  assert.equal(car.damage,0);assert.equal(hood.position.y,car.asset.hood[4]);
  disposeGroup(car.mesh);
});
