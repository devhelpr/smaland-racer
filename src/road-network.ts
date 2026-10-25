import * as THREE from 'three';
import type { WorldRoadSample } from './driving-world.ts';

export interface RoadDefinition {
  id: string; name: string; width: number; surface: 'asphalt' | 'gravel'; points: [number,number][];
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
      if(x<Math.min(a.x,b.x)-best||x>Math.max(a.x,b.x)+best||z<Math.min(a.z,b.z)-best||z>Math.max(a.z,b.z)+best)continue;
      const dx=b.x-a.x,dz=b.z-a.z,denominator=dx*dx+dz*dz;
      if(!denominator)continue;
      const t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/denominator,0,1),distance=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
      if(distance>=best)continue;
      best=distance;const point=a.clone().lerp(b,t);point.y=this.height(point.x,point.z);
      result={point,tangent:b.clone().sub(a).setY(0).normalize(),distance,progress:(i+t)/(road.points.length-1),width:road.definition.width,surface:road.definition.surface};
    }
    return result!;
  }
  ribbon(road:RoadNetwork['roads'][number],elevation:number):THREE.BufferGeometry {
    const positions:number[]=[],indices:number[]=[];
    road.points.forEach((p,i)=>{
      const tangent=road.points[Math.min(i+1,road.points.length-1)].clone().sub(road.points[Math.max(0,i-1)]).setY(0).normalize();
      for(const side of [-1,1]) {const x=p.x-tangent.z*road.definition.width/2*side,z=p.z+tangent.x*road.definition.width/2*side;positions.push(x,this.height(x,z)+elevation,z);}
      if(i<road.points.length-1){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
    });
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
  }
}
