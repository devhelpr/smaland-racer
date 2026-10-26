import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createConfiguredTexture, textureDefinitions } from '../src/textures.ts';
import { createOpenWorldScenery } from '../src/open-world-scenery.ts';
import { createGravelTexture } from '../src/gravel.ts';
import { Course, courses } from '../src/track.ts';
import { CollisionWorld } from '../src/collision.ts';
import { applySeason, seasons } from '../src/seasons.ts';
import { disposeGroup } from '../src/dispose.ts';
import materials from '../assets/materials/open-world.json' with { type:'json' };

function sample(texture:THREE.DataTexture,u:number,v:number):number {
  const {data,width,height}=texture.image;
  return data[(Math.floor(v*height)*width+Math.min(width-1,Math.floor(u*width)))*4];
}

test('asphalt textures contain grain and white dashed center or narrower edge markings',()=>{
  const main=createConfiguredTexture('asphaltMain',()=>.5) as THREE.DataTexture;
  const edges=createConfiguredTexture('asphaltEdges',()=>.5) as THREE.DataTexture;
  const config=textureDefinitions.asphaltEdges;
  assert.equal(config.type,'road');if(config.type!=='road')throw new Error('Expected a road texture');
  const left=config.markings[0].edgeInset!/config.roadWidth;
  assert.ok(sample(main,.5,.1)>220,'missing white center dash');
  assert.ok(sample(main,.5,.8)<100,'missing center dash gap');
  assert.ok(sample(main,left,.1)<100,'main road unexpectedly has edge markings');
  assert.ok(sample(edges,.5,.1)<100,'narrow road unexpectedly has a center line');
  for(const u of [left,1-left]) {
    assert.ok(sample(edges,u,.1)>220,'missing white edge dash');
    assert.ok(sample(edges,u,.8)<100,'missing edge dash gap');
  }
  const count=(texture:THREE.DataTexture)=>Array.from({length:texture.image.width},(_,x)=>sample(texture,(x+.5)/texture.image.width,.1)).filter(shade=>shade>220).length;
  assert.ok(count(edges)/2<count(main),'edge markings should be narrower than the center marking');
  const grain=createConfiguredTexture('asphaltMain',()=>Math.random()) as THREE.DataTexture;
  const shades=new Set(Array.from({length:grain.image.height},(_,y)=>sample(grain,.25,(y+.5)/grain.image.height)));
  assert.ok(shades.size>10,'asphalt has no grain');
  assert.equal(main.wrapS,THREE.ClampToEdgeWrapping);assert.equal(main.wrapT,THREE.RepeatWrapping);
  assert.equal(main.repeat.x,1);assert.equal(main.repeat.y,1);
  main.dispose();edges.dispose();grain.dispose();
});

test('authored asphalt materials and UVs follow each road along bends and retain white paint in all seasons',()=>{
  const course=new Course(courses.find(c=>c.id==='holmahult-open-world')!),root=new THREE.Group();
  createOpenWorldScenery(root,course,new CollisionWorld(),createGravelTexture(()=>.5));
  const maps=new Map<string,THREE.Texture>();
  for(const road of course.roadNetwork!.roads) {
    if(road.definition.surface!=='asphalt')continue;
    const mesh=root.getObjectByName(road.definition.id) as THREE.Mesh;
    const material=mesh.material as THREE.MeshStandardMaterial;
    const expected=road.definition.name==='Väg 120'?'asphaltMain':'asphalt';
    assert.equal(road.definition.material,expected,road.definition.name);
    assert.equal(material.map!.name,materials[expected].map);
    assert.equal(material.color.getHexString(),'ffffff','material tint darkens the white marking');
    const previous=maps.get(expected);if(previous)assert.equal(material.map,previous);else maps.set(expected,material.map!);
    const uv=mesh.geometry.getAttribute('uv'),scale=textureDefinitions[materials[expected].map].worldScale;
    let distance=0;
    road.points.forEach((point,i)=>{
      if(i)distance+=Math.hypot(point.x-road.points[i-1].x,point.z-road.points[i-1].z);
      assert.equal(uv.getX(i*2),0);assert.equal(uv.getX(i*2+1),1);
      assert.ok(Math.abs(uv.getY(i*2)-distance/scale)<.0001,'dash length changes around bends');
    });
    for(let i=road.points.length*2;i<uv.count;i++)assert.equal(uv.getX(i),0,'rounded junction caps should not introduce paint blobs');
  }
  assert.equal(maps.size,2);
  for(const season of seasons) {
    applySeason(root,season);
    for(const road of course.roadNetwork!.roads.filter(r=>r.definition.surface==='asphalt')) {
      const material=(root.getObjectByName(road.definition.id) as THREE.Mesh).material as THREE.MeshStandardMaterial;
      assert.equal(material.map,maps.get(road.definition.material!));assert.equal(material.color.getHexString(),'ffffff');
    }
  }
  disposeGroup(root);
});
