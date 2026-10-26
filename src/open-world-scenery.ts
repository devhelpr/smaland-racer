import { createSurfaceMaterial, createSceneryMaterial } from './materials.ts';
import materialAsset from '../assets/materials/open-world.json' with { type: 'json' };
import * as THREE from 'three';
import asset from '../assets/open-world.json' with { type: 'json' };
import type { Course } from './track.ts';
import type { BoxCollider, CollisionWorld } from './collision.ts';

export function createOpenWorldScenery(scene:THREE.Group,course:Course,collisions:CollisionWorld,gravelTexture:THREE.Texture):void {
  const materials={asphalt:createSceneryMaterial('open-world.asphalt',{...materialAsset.asphalt,side:THREE.DoubleSide}),asphaltMain:createSceneryMaterial('open-world.asphaltMain',{...materialAsset.asphaltMain,side:THREE.DoubleSide}),gravel:createSurfaceMaterial('gravel',gravelTexture)};
  for(const road of course.roadNetwork!.roads) {
    // Independent ribbons interpolate the terrain differently; separate their surfaces to prevent junction flicker.
    const elevation=asset.roadElevation+(road.definition.surface==='asphalt'?asset.asphaltElevationOffset:0);
    const mesh=new THREE.Mesh(course.roadNetwork!.ribbon(road,elevation),materials[road.definition.surface==='asphalt'?road.definition.material??'asphalt':'gravel']);
    mesh.name=road.definition.id;mesh.receiveShadow=true;
    if(road.definition.surface==='gravel')mesh.userData.seasonalSurface='gravel';scene.add(mesh);
  }
  const b=course.definition.openWorld!.bridge,[x,z]=b.position,y=course.height(x,z);
  const bridge=new THREE.Group();bridge.name='bro-bridge';bridge.position.set(x,y,z);bridge.rotation.y=b.angle;scene.add(bridge);
  const rail=createSceneryMaterial('open-world.rail',materialAsset.rail);
  for(const side of [-1,1]) {
    const offset=side*(b.width/2+asset.railOffset);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(asset.railThickness,asset.railThickness,b.length),rail);
    mesh.position.set(offset,asset.railHeight,0);mesh.castShadow=true;bridge.add(mesh);
    collisions.add({id:`bro-bridge-rail-${side}`,kind:'building',x:x+offset*Math.cos(b.angle),z:z-offset*Math.sin(b.angle),halfX:asset.railThickness/2,halfZ:b.length/2,angle:b.angle,radius:Math.hypot(asset.railThickness,b.length/2)} as BoxCollider);
  }
  const water=new THREE.Mesh(new THREE.PlaneGeometry(b.streamLength,b.streamWidth),createSceneryMaterial('open-world.water',{...materialAsset.water,side:THREE.DoubleSide}));
  water.rotation.x=-Math.PI/2;water.position.y=-b.waterDrop/2;water.userData.seasonalSurface='water';bridge.add(water);
}

/** Refine only the river crossing, keeping the large landscape mesh inexpensive. */
export function refineBridgeTerrain(geometry:THREE.PlaneGeometry,course:Course):THREE.BufferGeometry {
  const b=course.definition.openWorld!.bridge,step=course.worldSize/course.definition.openWorld!.groundSegments;
  const lower=(v:number)=>Math.floor((v+course.worldSize/2-b.terrainPatchRadius)/step)*step-course.worldSize/2;
  const upper=(v:number)=>Math.ceil((v+course.worldSize/2+b.terrainPatchRadius)/step)*step-course.worldSize/2;
  const minX=lower(b.position[0]),maxX=upper(b.position[0]),minZ=lower(b.position[1]),maxZ=upper(b.position[1]);
  const patch=new THREE.PlaneGeometry(maxX-minX,maxZ-minZ,Math.ceil((maxX-minX)/b.terrainPatchSpacing),Math.ceil((maxZ-minZ)/b.terrainPatchSpacing));
  patch.rotateX(-Math.PI/2);patch.translate((minX+maxX)/2,0,(minZ+maxZ)/2);
  const original=geometry.getAttribute('position'),extra=patch.getAttribute('position'),positions=new Float32Array((original.count+extra.count)*3);
  positions.set(original.array);positions.set(extra.array,original.count*3);
  const indices:number[]=[],index=geometry.index!;
  for(let i=0;i<index.count;i+=3) {
    const a=index.getX(i),bb=index.getX(i+1),c=index.getX(i+2);
    const x=(original.getX(a)+original.getX(bb)+original.getX(c))/3,z=(original.getZ(a)+original.getZ(bb)+original.getZ(c))/3;
    if(x>minX&&x<maxX&&z>minZ&&z<maxZ)continue;
    indices.push(a,bb,c);
  }
  for(let i=0;i<patch.index!.count;i++)indices.push(patch.index!.getX(i)+original.count);
  const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.BufferAttribute(positions,3));result.setIndex(indices);
  geometry.dispose();patch.dispose();return result;
}
