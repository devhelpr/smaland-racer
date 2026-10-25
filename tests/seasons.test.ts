import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applySeason, seasons, isSeason } from '../src/seasons.ts';
import { courses, Course } from '../src/track.ts';
import { createScenery } from '../src/scenery.ts';
import { CollisionWorld } from '../src/collision.ts';
import { disposeGroup } from '../src/dispose.ts';
import { loadProgress, saveProgress } from '../src/storage.ts';

test('season switches retain all course geometry, assets, landmarks and collisions',()=>{
  for(const definition of courses) {
    const root=new THREE.Group(),course=new Course(definition),world=new CollisionWorld();createScenery(root,course,world);root.updateMatrixWorld(true);
    const meshes:THREE.Mesh[]=[];root.traverse(object=>{if(object instanceof THREE.Mesh)meshes.push(object);});
    const snapshots=meshes.map(mesh=>({geometry:mesh.geometry,positions:mesh.geometry.getAttribute('position').array.slice(),matrix:mesh.matrixWorld.clone(),material:mesh.material}));
    const greenHouse=root.getObjectByName('holmahult-25');
    const paint:THREE.Color[]=[];
    greenHouse?.traverse(object=>{if(object instanceof THREE.Mesh&&(object.material as THREE.MeshStandardMaterial).color.equals(new THREE.Color('#607a68')))paint.push((object.material as THREE.MeshStandardMaterial).color);});
    const points=course.points.map(point=>point.clone());
    const collisionIds=()=>course.points.slice(0,-1).map((point,i)=>world.sweep(point,course.points[i+1])?.collider.id??null);
    const originalCollisions=collisionIds();
    const terrain=meshes.find(mesh=>mesh.userData.seasonalSurface==='grass')!;
    const colors=terrain.geometry.getAttribute('color');let summer:number[]=[];
    for(const season of ['summer',...seasons,'summer'] as const) {
      applySeason(root,season);
      meshes.forEach((mesh,i)=>{
        assert.equal(mesh.geometry,snapshots[i].geometry);assert.equal(mesh.material,snapshots[i].material);
        assert.deepEqual(mesh.geometry.getAttribute('position').array,snapshots[i].positions);
        assert.ok(mesh.matrixWorld.equals(snapshots[i].matrix));
      });
      assert.equal(root.getObjectsByProperty('isMesh',true).length,meshes.length);
      assert.deepEqual(course.points,points);
      for(const color of paint)assert.ok(color.equals(new THREE.Color('#607a68')),'green house paint changed');
      if(season==='summer') {
        const current=Array.from(colors.array);if(summer.length)assert.deepEqual(current,summer,'season changes accumulated color drift');else summer=current;
      }
      assert.deepEqual(collisionIds(),originalCollisions);
    }
    disposeGroup(root);
  }
});

test('all four seasons visibly change terrain and foliage without accumulating tints',()=>{
  const group=new THREE.Group(),world=new CollisionWorld();createScenery(group,new Course(courses[0]),world);
  const samples=new Set<string>();
  for(const season of seasons) {
    applySeason(group,season);
    const values:number[]=[];
    group.traverse(object=>{
      if(object instanceof THREE.Mesh&&object.userData.seasonalSurface==='grass')values.push(...Array.from(object.geometry.getAttribute('color').array.slice(0,9)));
      if(object instanceof THREE.InstancedMesh&&object.instanceColor&&object.userData.seasonalSurface==='evergreen')values.push(...Array.from(object.instanceColor.array.slice(0,3)));
    });
    assert.ok(values.every(Number.isFinite));samples.add(JSON.stringify(values));
    const foliage=group.children.find(object=>object instanceof THREE.InstancedMesh&&object.instanceColor&&object.userData.seasonalSurface==='evergreen') as THREE.InstancedMesh;
    const variations=new Set(Array.from({length:10},(_,i)=>new THREE.Color().fromArray(foliage.instanceColor!.array,i*3).getHexString()));
    assert.ok(variations.size>1,'season recoloring flattened all tree color variation');
  }
  assert.equal(samples.size,4);disposeGroup(group);
});

test('season preference persists alongside records and old or invalid saves default to summer',()=>{
  let data='';const storage={getItem:()=>data,setItem:(_key:string,value:string)=>{data=value;}};
  const progress=loadProgress(storage,'nl');assert.equal(progress.season,'summer');
  progress.records[courses[0].id]={elapsed:20,damage:0,recoveries:0,total:20,medal:'gold',splits:[20]};
  for(const season of seasons) {
    progress.season=season;assert.ok(saveProgress(storage,progress));const restored=loadProgress(storage);
    assert.equal(restored.season,season);assert.deepEqual(restored.records,progress.records);
  }
  for(const season of [undefined,'rain',null,1,{}]) {
    data=JSON.stringify({version:1,season,records:progress.records});
    assert.equal(loadProgress(storage).season,'summer');assert.deepEqual(loadProgress(storage).records,progress.records);
  }
  assert.equal(isSeason('rain'),false);assert.equal(loadProgress(null).season,'summer');
});
