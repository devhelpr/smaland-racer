import { textureDefinitions } from './textures.ts';
import roadMaterials from '../assets/materials/open-world.json' with { type: 'json' };
import { applyGravelUVs } from './gravel.ts';
import * as THREE from 'three';
import asset from '../assets/road.json' with { type: 'json' };
import type { WorldRoadSample } from './driving-world.ts';

export interface RoadDefinition {
  id: string; name: string; width: number; surface: 'asphalt' | 'gravel'; material?:'asphalt'|'asphaltMain'; points: [number,number][];
}

/** Segment endpoints stay exact, so independently authored roads meet at their junctions. */
export class RoadNetwork {
  readonly roads: { definition: RoadDefinition; points: THREE.Vector3[]; length:number }[];
  private height:(x:number,z:number)=>number;
  constructor(definitions:RoadDefinition[],height:(x:number,z:number)=>number,spacing:number) {
    this.height=height;
    this.roads=definitions.map(definition=>{
      const points:THREE.Vector3[]=[];let length=0;
      definition.points.slice(1).forEach(([bx,bz],i)=>{
        const [ax,az]=definition.points[i],distance=Math.hypot(bx-ax,bz-az),count=Math.max(1,Math.ceil(distance/spacing));
        length+=distance;
        for(let j=0;j<count;j++) {const x=THREE.MathUtils.lerp(ax,bx,j/count),z=THREE.MathUtils.lerp(az,bz,j/count);points.push(new THREE.Vector3(x,height(x,z),z));}
      });
      const [x,z]=definition.points.at(-1)!;points.push(new THREE.Vector3(x,height(x,z),z));
      return {definition,points,length};
    });
  }
  nearest(x:number,z:number):WorldRoadSample {
    let best=Infinity,result:WorldRoadSample|undefined;
    for(const road of this.roads)for(let i=0;i<road.points.length-1;i++) {
      const a=road.points[i],b=road.points[i+1];
      const margin=best+road.definition.width/2;
      if(x<Math.min(a.x,b.x)-margin||x>Math.max(a.x,b.x)+margin||z<Math.min(a.z,b.z)-margin||z>Math.max(a.z,b.z)+margin)continue;
      const dx=b.x-a.x,dz=b.z-a.z,denominator=dx*dx+dz*dz;
      if(!denominator)continue;
      const t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/denominator,0,1),distance=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
      const clearance=distance-road.definition.width/2;
      if(clearance>=best)continue;
      best=clearance;const point=a.clone().lerp(b,t);point.y=this.height(point.x,point.z);
      result={point,tangent:b.clone().sub(a).setY(0).normalize(),distance,progress:(i+t)/(road.points.length-1),width:road.definition.width,surface:road.definition.surface};
    }
    return result!;
  }
  /** A degree-two junction uses the same cross-section on both sides of the seam. */
  private continuation(road:RoadNetwork['roads'][number],start:boolean):THREE.Vector3|null {
    const p=start?road.points[0]:road.points.at(-1)!,neighbours:THREE.Vector3[]=[];
    for(const other of this.roads) {
      if(other===road)continue;
      for(let i=0;i<other.points.length;i++) {
        const q=other.points[i];
        if(Math.hypot(q.x-p.x,q.z-p.z)>asset.network.junctionTolerance)continue;
        if(other.definition.width!==road.definition.width)return null;
        if(i>0)neighbours.push(other.points[i-1]);
        if(i<other.points.length-1)neighbours.push(other.points[i+1]);
      }
    }
    return neighbours.length===1?neighbours[0]:null;
  }

  ribbon(road:RoadNetwork['roads'][number],elevation:number):THREE.BufferGeometry {
    const positions:number[]=[],indices:number[]=[],uvs:number[]=[],half=road.definition.width/2;
    const asphalt=road.definition.surface==='asphalt';
    const textureScale=asphalt?textureDefinitions[roadMaterials[road.definition.material??'asphalt'].map].worldScale:1;
    let distance=0;
    const startNeighbour=this.continuation(road,true),endNeighbour=this.continuation(road,false);
    const vertex=(x:number,z:number,u=0,v=0)=>{const index=positions.length/3;positions.push(x,this.height(x,z)+elevation,z);uvs.push(u,v);return index;};
    road.points.forEach((p,i)=>{
      if(i>0)distance+=Math.hypot(p.x-road.points[i-1].x,p.z-road.points[i-1].z);
      const before=i>0?road.points[i-1]:startNeighbour??p;
      const after=i<road.points.length-1?road.points[i+1]:endNeighbour??p;
      const incoming=p.clone().sub(before).setY(0).normalize(),outgoing=after.clone().sub(p).setY(0).normalize();
      if(!incoming.lengthSq())incoming.copy(outgoing);
      if(!outgoing.lengthSq())outgoing.copy(incoming);
      const normal=new THREE.Vector3(-outgoing.z,0,outgoing.x);
      const miter=new THREE.Vector3(-incoming.z-outgoing.z,0,incoming.x+outgoing.x).normalize();
      const denominator=miter.dot(normal);
      if(denominator<=0)miter.copy(normal).multiplyScalar(half);
      else miter.multiplyScalar(Math.min(half/denominator,half*asset.network.miterLimit));
      for(const side of [-1,1])vertex(p.x+miter.x*side,p.z+miter.z*side,(side+1)/2,distance/textureScale);
      if(i<road.points.length-1){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
    });
    // Rounded mouths cover T-junctions and match the finite-segment grip calculation.
    for(const start of [true,false]) {
      if(start?startNeighbour:endNeighbour)continue;
      const p=start?road.points[0]:road.points.at(-1)!,inside=start?road.points[1]:road.points.at(-2)!;
      const outward=p.clone().sub(inside).setY(0).normalize(),normal=new THREE.Vector3(-outward.z,0,outward.x);
      const center=vertex(p.x,p.z);let previous=vertex(p.x+normal.x*half,p.z+normal.z*half);
      for(let i=1;i<=asset.network.capSegments;i++) {
        const angle=i/asset.network.capSegments*Math.PI;
        const next=vertex(p.x+half*(normal.x*Math.cos(angle)+outward.x*Math.sin(angle)),p.z+half*(normal.z*Math.cos(angle)+outward.z*Math.sin(angle)));
        indices.push(center,previous,next);previous=next;
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
    if(asphalt)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));else applyGravelUVs(geometry);
    geometry.computeVertexNormals();return geometry;
  }
}
