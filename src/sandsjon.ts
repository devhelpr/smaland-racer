import { createSceneryMaterial } from './materials.ts';
import materialAsset from '../assets/materials/sandsjon.json' with { type: 'json' };
import * as THREE from 'three';
import asset from '../assets/sandsjon.json' with { type: 'json' };
import { Course, lakeContains, randomGenerator } from './track.ts';
import type { BoxCollider, CollisionWorld } from './collision.ts';

export function createSandsjon(scene:THREE.Group,course:Course,world:CollisionWorld):void {
  const random=randomGenerator(course.definition.seed);
  for(const lake of course.lakes) {
    const shape=lake.outline?new THREE.Shape(lake.outline.map(([x,z])=>new THREE.Vector2(x,-z))):null;
    const ice=new THREE.Mesh(shape?new THREE.ShapeGeometry(shape):new THREE.CircleGeometry(1,asset.lakeSegments),createSceneryMaterial('sandsjon.ice',materialAsset.ice));
    ice.rotation.x=-Math.PI/2;if(!shape)ice.scale.set(lake.rx,lake.rz,1);ice.position.set(shape?0:lake.x,lake.level+asset.surfaceElevation,shape?0:lake.z);ice.receiveShadow=true;scene.add(ice);
    const cracks=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,asset.crackWidth),new THREE.MeshBasicMaterial(materialAsset.cracks),asset.crackCount);
    const dummy=new THREE.Object3D();
    for(let i=0;i<asset.crackCount;i++) {
      let x:number,z:number;
      do {x=lake.x+(random()*2-1)*lake.rx;z=lake.z+(random()*2-1)*lake.rz;}while(!lakeContains(lake,x,z));
      dummy.position.set(x,lake.level+asset.crackElevation,z);
      dummy.rotation.set(-Math.PI/2,0,random()*Math.PI);dummy.scale.set(asset.crackLength[0]+random()*asset.crackLength[1],1,1);dummy.updateMatrix();cracks.setMatrixAt(i,dummy.matrix);
    }
    scene.add(cracks);
  }
  const b=asset.bridge,bridge=new THREE.Group();bridge.name=b.name;const placement=course.definition.bridge!;bridge.position.fromArray(placement.position);bridge.rotation.y=placement.angle;
  const materials=Object.fromEntries(Object.entries(materialAsset.bridge).map(([name,settings])=>[name,createSceneryMaterial(`sandsjon.bridge.${name}`,settings)]));
  const box=(size:number[],position:number[],material:string)=> {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(size[0],size[1],size[2]),materials[material]);mesh.position.fromArray(position);mesh.castShadow=mesh.receiveShadow=true;bridge.add(mesh);
  };
  for(const part of b.parts)box(part.size,part.position,part.material);
  for(const x of b.pierX)for(const z of b.pierZ) {
    box(b.pierSize,[x,b.pierY,z],'concrete');
    const collider:BoxCollider={id:`bridge-pier-${x}-${z}`,x:x*Math.cos(placement.angle)+z*Math.sin(placement.angle)+placement.position[0],z:-x*Math.sin(placement.angle)+z*Math.cos(placement.angle)+placement.position[2],radius:Math.hypot(b.pierSize[0],b.pierSize[2])/2,halfX:b.pierSize[0]/2,halfZ:b.pierSize[2]/2,angle:placement.angle,kind:'building'};world.add(collider);
  }
  for(const z of b.railZ) {
    for(const y of b.railY)box(b.railSize,[0,y,z],'rail');
    for(let x=b.startX;x<b.endX;x+=b.postSpacing)box(b.postSize,[x,b.postY,z],'rail');
  }
  for(let x=b.startX;x<b.endX;x+=b.dashSpacing)box(b.dashSize,[x,b.dashY,0],'marking');
  scene.add(bridge);
}
