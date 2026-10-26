import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSceneryMaterial, createSurfaceMaterial } from '../src/materials.ts';
import { createGravelTexture } from '../src/gravel.ts';
import { textureDefinitions } from '../src/textures.ts';
import seasonData from '../assets/materials/seasons.json' with { type: 'json' };
import { applySeason, seasons } from '../src/seasons.ts';
import { createScenery } from '../src/scenery.ts';
import { Course, courses } from '../src/track.ts';
import { CollisionWorld } from '../src/collision.ts';
import { disposeGroup } from '../src/dispose.ts';

// JSON remains the editable source of truth; exercise configurations without changing shipped defaults.
const overrides=seasonData.materials as Record<string,Record<string,Record<string,unknown>>>;

test('every gravel surface on every course shares grain and continuous world-space UVs',()=>{
  for(const definition of courses) {
    const root=new THREE.Group();createScenery(root,new Course(definition),new CollisionWorld());
    const gravel:THREE.Mesh[]=[];
    root.traverse(object=>{if(object instanceof THREE.Mesh&&object.userData.seasonalSurface==='gravel')gravel.push(object);});
    assert.ok(definition.setting==='sandsjon'||gravel.length>0);
    const maps=new Set<THREE.Texture>();
    for(const mesh of gravel) {
      const material=mesh.material as THREE.MeshStandardMaterial;
      assert.ok(material.map instanceof THREE.DataTexture,`${definition.id}/${mesh.name}: missing gravel texture`);
      maps.add(material.map);
      const positions=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv');
      assert.equal(uv.count,positions.count);
      for(let i=0;i<positions.count;i++) {
        assert.ok(Math.abs(uv.getX(i)-positions.getX(i)/textureDefinitions.gravel.worldScale)<.0001);
        assert.ok(Math.abs(uv.getY(i)-positions.getZ(i)/textureDefinitions.gravel.worldScale)<.0001);
      }
    }
    assert.ok(maps.size<=1,`${definition.id}: gravel textures were duplicated`);
    for(const season of seasons) {
      applySeason(root,season);
      for(const mesh of gravel)assert.ok(maps.has((mesh.material as THREE.MeshStandardMaterial).map!));
    }
    disposeGroup(root);
  }
});

test('season overrides inherit, switch textures, reset omitted properties and dispose inactive maps once',()=>{
  const original=overrides.winter.gravel;
  const texture=createGravelTexture(()=>.5),root=new THREE.Group();
  textureDefinitions.testGravel={...textureDefinitions.gravel,worldScale:6};
  overrides.winter.gravel={map:'testGravel',color:'#eeeeee',roughness:.3,metalness:.2,flatShading:true};
  try {
    const materials=['gravel','road','shoulder'].map(id=>createSurfaceMaterial(id as 'gravel'|'road'|'shoulder',texture));
    for(const material of materials) {
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(),material);mesh.userData.seasonalSurface='gravel';root.add(mesh);
    }
    applySeason(root,'winter');
    const snow=materials[0].map!;
    assert.notEqual(snow,texture);assert.equal(snow.repeat.x,.5);
    for(const material of materials) {
      assert.equal(material.map,snow);assert.equal(material.color.getHexString(),'eeeeee');
      assert.equal(material.roughness,.3);assert.equal(material.metalness,.2);assert.equal(material.flatShading,true);
    }
    applySeason(root,'summer');
    for(const material of materials) {
      assert.equal(material.map,texture);assert.equal(material.roughness,1);
      assert.equal(material.metalness,0);assert.equal(material.flatShading,false);
    }
    applySeason(root,'winter');assert.equal(materials[0].map,snow);
    applySeason(root,'summer');
    let originalDisposed=0,snowDisposed=0;
    texture.addEventListener('dispose',()=>originalDisposed++);snow.addEventListener('dispose',()=>snowDisposed++);
    disposeGroup(root);assert.equal(originalDisposed,1);assert.equal(snowDisposed,1);
  } finally {
    overrides.winter.gravel=original;delete textureDefinitions.testGravel;
    if(root.children.length)disposeGroup(root);
  }
});

test('untagged scenery supports seasonal settings and disabling a texture restores the base next season',()=>{
  const root=new THREE.Group();
  overrides.winter['test.wall']={color:'#aabbcc',roughness:.25,map:null};
  const material=createSceneryMaterial('test.wall',{color:'#334455',map:'gravel'});
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(),material));
  const baseMap=material.map;
  try {
    applySeason(root,'winter');assert.equal(material.map,null);assert.equal(material.roughness,.25);assert.equal(material.color.getHexString(),'aabbcc');
    applySeason(root,'summer');assert.equal(material.map,baseMap);assert.equal(material.roughness,1);assert.equal(material.color.getHexString(),'334455');
  } finally {delete overrides.winter['test.wall'];disposeGroup(root);}
});
