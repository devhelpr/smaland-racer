import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DrivingSurfaces } from '../src/driving-surfaces.ts';
import { Vehicle } from '../src/vehicle.ts';
import { Course, courses } from '../src/track.ts';
import { createScenery } from '../src/scenery.ts';
import { CollisionWorld } from '../src/collision.ts';
import { disposeGroup } from '../src/dispose.ts';
import vehicleAsset from '../assets/vehicle.json' with {type:'json'};
import type { DrivingWorld } from '../src/driving-world.ts';

const neutral={throttle:0,steer:0,handbrake:false};

function tireBottoms(car:Vehicle):number[] {
  car.mesh.updateMatrixWorld(true);
  const result:number[]=[];
  car.mesh.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||!(object.geometry instanceof THREE.CylinderGeometry)||object.geometry.parameters.radiusTop!==vehicleAsset.tire[0])return;
    const points=object.geometry.getAttribute('position');let minimum=Infinity;
    for(let i=0;i<points.count;i++)minimum=Math.min(minimum,new THREE.Vector3().fromBufferAttribute(points,i).applyMatrix4(object.matrixWorld).y);
    result.push(minimum);
  });
  assert.equal(result.length,4);return result;
}

test('stationary, spinning and recovered tires touch a flat driving surface with no visual lift',()=>{
  const height=2;
  const world:DrivingWorld={heightAt:()=>height,surfaceAt:()=> 'asphalt',isWater:()=>false,
    spawn:{point:new THREE.Vector3(0,height,0),tangent:new THREE.Vector3(0,0,1)},
    nearestRoad:()=>({point:new THREE.Vector3(0,height,0),tangent:new THREE.Vector3(0,0,1),distance:0,progress:0,width:8,surface:'asphalt'})};
  const car=new Vehicle(world);
  for(const bottom of tireBottoms(car))assert.ok(Math.abs(bottom-height)<1e-6,'stationary tire floats');
  car.velocity.set(0,0,10);
  for(let i=0;i<100;i++) {
    car.update(1/120,neutral);
    for(const bottom of tireBottoms(car))assert.ok(bottom-height>=-1e-6&&bottom-height<.004,'spinning tire floats');
  }
  car.recover(world.spawn.point,world.spawn.tangent,false);
  for(const bottom of tireBottoms(car))assert.ok(Math.abs(bottom-height)<.004);
  car.rightInPlace();car.update(1/120,neutral);
  for(const bottom of tireBottoms(car))assert.ok(Math.abs(bottom-height)<.03,'righting reintroduces visual lift');
  disposeGroup(car.mesh);
});

test('driving surface sampling follows transformed triangles, topmost overlaps and terrain outside the mesh',()=>{
  const surfaces=new DrivingSurfaces(2);
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(10,10,2,2),material);
  mesh.rotation.x=-Math.PI/2;mesh.rotation.z=.1;mesh.position.set(3,2,-4);surfaces.add(mesh);
  const ray=new THREE.Raycaster(new THREE.Vector3(3,10,-4),new THREE.Vector3(0,-1,0));
  assert.ok(Math.abs(surfaces.heightAt(3,-4,0)-ray.intersectObject(mesh)[0].point.y)<1e-6);
  const upper=new THREE.Mesh(new THREE.PlaneGeometry(4,4),material);upper.rotation.x=-Math.PI/2;upper.position.set(3,3,-4);surfaces.add(upper);
  assert.equal(surfaces.heightAt(3,-4,0),3);assert.equal(surfaces.heightAt(30,30,.5),.5);
  surfaces.clear();assert.equal(surfaces.heightAt(3,-4,0),0);
  mesh.geometry.dispose();upper.geometry.dispose();material.dispose();
});

test('physics uses the actual rendered road, shoulder, yard and ice heights across all courses',()=>{
  for(const definition of courses) {
    const course=new Course(definition),root=new THREE.Group();createScenery(root,course,new CollisionWorld());
    const surfaces:THREE.Mesh[]=[];
    root.traverse(object=>{if(object instanceof THREE.Mesh&&(object.userData.drivingSurface||object.userData.seasonalSurface==='gravel'))surfaces.push(object);});
    root.updateMatrixWorld(true);
    const points=course.points.filter((_,i)=>i%Math.max(1,Math.floor(course.points.length/10))===0).map(p=>[p.x,p.z]);
    for(const road of course.roadNetwork?.roads??[]) {
      const p=road.points[Math.floor(road.points.length/2)];points.push([p.x,p.z]);
    }
    for(const [x,z] of definition.openWorld?.yards??[])points.push([x,z]);
    for(const lake of definition.setting==='sandsjon'?course.lakes:[])points.push([lake.x,lake.z]);
    let raisedSamples=0;
    for(const [x,z] of points) {
      const terrain=course.height(x,z);
      const ray=new THREE.Raycaster(new THREE.Vector3(x,terrain+100,z),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObjects(surfaces,false)[0];
      const expected=Math.max(terrain,hit?.point.y??terrain);
      assert.ok(Math.abs(course.heightAt(x,z)-expected)<1e-5,`${definition.id}: contact height differs from visible surface at ${x}, ${z}`);
      if(expected>terrain+.005)raisedSamples++;
    }
    assert.ok(raisedSamples>0,`${definition.id}: no raised road or ice tested`);
    disposeGroup(root);
  }
});
