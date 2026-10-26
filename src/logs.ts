import * as THREE from 'three';
import asset from '../assets/logs.json' with { type: 'json' };
import materials from '../assets/materials/logs.json' with { type: 'json' };
import placements from '../parcours/logs.json' with { type: 'json' };
import { Course, randomGenerator } from './track.ts';
import { CollisionWorld, type BoxCollider } from './collision.ts';
import { holmahultBuildings } from './holmahult-data.ts';
import { createSceneryMaterial } from './materials.ts';

/** Route-relative forestry sites keep the authored obstacles attached to their road. */
export function logSites(course:Course) {
  const definitions=course.roadNetwork?placements.roads:placements.excludedSettings.includes(course.definition.setting??'')?[]:placements.routes;
  return definitions.flatMap((definition,index)=>{
    let sample;
    let width=course.definition.width;
    if('road' in definition) {
      const road=course.roadNetwork?.roads.find(road=>road.definition.id===definition.road);
      if(!road)return [];
      const i=definition.progress*(road.points.length-1),a=Math.floor(i),b=Math.min(a+1,road.points.length-1);
      sample={point:road.points[a].clone().lerp(road.points[b],i-a),tangent:road.points[b].clone().sub(road.points[Math.max(0,a-1)]).setY(0).normalize()};
      width=road.definition.width;
    } else sample=course.sample(definition.progress);
    const offset=definition.side*(width/2+definition.clearance);
    const x=sample.point.x+sample.tangent.z*offset,z=sample.point.z-sample.tangent.x*offset;
    if(course.inWater(x,z))return [];
    const footprint=asset.length/2+asset.lengthVariation;
    if(course.definition.setting==='holmahult'&&[...holmahultBuildings,...course.definition.openWorld?.buildings??[]].some(building=>Math.hypot(x-building.x,z-building.z)<Math.hypot(building.width,building.depth)/2+footprint))return [];
    // Keep piles off crossing roads and avoid placing any timber in nearby water.
    const heading=Math.atan2(sample.tangent.x,sample.tangent.z)+definition.angle;
    for(const end of [-1,1]) {
      const ex=x+Math.sin(heading)*footprint*end,ez=z+Math.cos(heading)*footprint*end;
      if(course.inWater(ex,ez))return [];
      const nearest=course.nearestRoad(ex,ez);
      if(definition.pile&&nearest.distance<nearest.width/2+asset.radius)return [];
    }
    return [{...definition,id:`logs-${index}`,x,z,heading:Math.atan2(sample.tangent.x,sample.tangent.z)+definition.angle}];
  });
}

export function createLogScenery(scene:THREE.Group,course:Course,collisions:CollisionWorld):void {
  const sites=logSites(course);if(!sites.length)return;
  const random=randomGenerator(course.definition.seed+asset.seedOffset);
  const bark=createSceneryMaterial('logs.bark',materials.bark),end=createSceneryMaterial('logs.end',materials.end);
  const geometry=new THREE.CylinderGeometry(1,1,1,asset.segments);
  const logs=sites.flatMap(site=>{
    const rows=site.pile?asset.rows:[1];
    return rows.flatMap((count,layer)=>Array.from({length:count},(_,column)=>({site,layer,column,offset:(column-(count-1)/2)*asset.pileSpacing})));
  });
  const mesh=new THREE.InstancedMesh(geometry,[bark,end,end],logs.length);
  mesh.name='roadside-log-piles';mesh.castShadow=true;mesh.receiveShadow=true;
  const dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
  logs.forEach(({site,layer,column,offset},i)=>{
    const radius=asset.radius+random()*asset.radiusVariation,length=asset.length+random()*asset.lengthVariation;
    const side=new THREE.Vector3(Math.cos(site.heading),0,-Math.sin(site.heading));
    const along=new THREE.Vector3(Math.sin(site.heading),0,Math.cos(site.heading));
    const stagger=(random()-.5)*asset.endStagger;
    const x=site.x+side.x*offset+along.x*stagger,z=site.z+side.z*offset+along.z*stagger;
    const a=course.height(x-along.x*length/2,z-along.z*length/2),b=course.height(x+along.x*length/2,z+along.z*length/2);
    dummy.position.set(x,(a+b)/2+radius+layer*asset.layerHeight+asset.roadElevation,z);
    dummy.quaternion.setFromUnitVectors(up,new THREE.Vector3(along.x*length,b-a,along.z*length).normalize());
    dummy.scale.set(radius,Math.hypot(length,b-a),radius);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    if(layer===0)collisions.add({id:`${site.id}-${column}`,x,z,kind:'tree',halfX:radius,halfZ:length/2,angle:site.heading,radius:Math.hypot(radius,length/2)} as BoxCollider);
  });
  scene.add(mesh);
}
