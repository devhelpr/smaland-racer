import * as THREE from 'three';
import type { Course } from './track.ts';
import placement from '../parcours/traffic.json' with { type: 'json' };

export interface TrafficRoute {
  id: string;
  length: number;
  width: number;
  closed: boolean;
  sample(distance: number): { point: THREE.Vector3; tangent: THREE.Vector3 };
}

/** Follow the authored road centerlines, joining matching road sections at their endpoints. */
export function trafficRoutes(course: Course): TrafficRoute[] {
  const routes: TrafficRoute[]=[{
    id: course.definition.id, length: course.length, width: course.definition.width,
    closed: course.definition.closed, sample: distance=>course.sample(distance/course.length)
  }];
  if(!course.roadNetwork)return routes;
  const remaining=course.roadNetwork.roads.filter(road=>road.definition.surface==='asphalt');
  const joined: {id:string;name:string;width:number;points:THREE.Vector3[]}[]=[];
  while(remaining.length) {
    const first=remaining.shift()!;
    const route={id:first.definition.id,name:first.definition.name,width:first.definition.width,points:[...first.points]};
    for(const start of [false,true]) {
      while(true) {
        const endpoint=start?route.points[0]:route.points.at(-1)!;
        const matches=remaining.flatMap((road,index)=>{
          if(road.definition.name!==route.name||road.definition.width!==route.width)return [];
          return [false,true].filter(reverse=>endpoint.distanceTo(reverse?road.points.at(-1)!:road.points[0])<placement.network.joinTolerance).map(reverse=>({road,index,reverse}));
        });
        if(matches.length!==1)break;
        const {road,index,reverse}=matches[0];remaining.splice(index,1);
        const points=reverse?[...road.points].reverse():[...road.points];
        if(start)route.points.unshift(...points.slice(1).reverse());
        else route.points.push(...points.slice(1));
      }
    }
    joined.push(route);
  }
  const candidates=joined.map(road=>{
    const distances=[0];
    for(let i=1;i<road.points.length;i++)distances.push(distances[i-1]+road.points[i].clone().sub(road.points[i-1]).setY(0).length());
    const tangents=road.points.map((point,i)=>{
      const incoming=point.clone().sub(road.points[Math.max(0,i-1)]).setY(0).normalize();
      const outgoing=road.points[Math.min(road.points.length-1,i+1)].clone().sub(point).setY(0).normalize();
      return incoming.add(outgoing).normalize();
    });
    const length=distances.at(-1)!;
    const route:TrafficRoute={id:road.id,length,width:road.width,closed:false,sample(distance) {
      const d=THREE.MathUtils.clamp(distance,0,length);
      let low=0,high=distances.length-1;
      while(high-low>1){const mid=(low+high)>>1;if(distances[mid]<=d)low=mid;else high=mid;}
      const a=road.points[low],b=road.points[high];
      const t=(d-distances[low])/(distances[high]-distances[low]);
      return {point:a.clone().lerp(b,t),tangent:tangents[low].clone().lerp(tangents[high],t).normalize()};
    }};
    return {route,preferred:placement.network.preferredRoadNames.includes(road.name)};
  }).filter(({route})=>route.length>=placement.network.minLength)
    .sort((a,b)=>Number(b.preferred)-Number(a.preferred)||b.route.length-a.route.length);
  routes.push(...candidates.slice(0,placement.network.maxRoutes).map(({route})=>route));
  return routes;
}
