import type { CourseDefinition } from './track.ts';

import courseData from '../parcours/courses.json' with { type: 'json' };
import sceneryData from '../parcours/holmahult.json' with { type: 'json' };

// Hand-traced, stylized reference; local axes are +X east, +Z south.
export const HOLMAHULT_SOURCE = sceneryData.source;
export const holmahultCourse = courseData.find(course=>course.id==='holmahult-stage') as CourseDefinition;

export interface HolmahultBuilding {
  id: string;
  kind: 'home' | 'barn' | 'shed';
  x: number; z: number; width: number; depth: number; height: number; roofHeight: number; angle: number;
  color: string;
  porch?: boolean;
  porchWidth?: number; porchDepth?: number; porchOffsetX?: number;
}

export const holmahultBuildings: HolmahultBuilding[] = sceneryData.buildings as HolmahultBuilding[];

export interface LocalRoad { points: [number, number][]; width: number; asphalt?: boolean }
export const holmahultSideRoads: LocalRoad[] = sceneryData.sideRoads as LocalRoad[];

export const holmahultFields: [number, number][][] = sceneryData.fields as [number, number][][];

export function holmahultFieldAt(x: number, z: number): number {
  return holmahultFields.findIndex(polygon => {
    let inside = false;
    for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const [xi,zi]=polygon[i], [xj,zj]=polygon[j];
      if ((zi>z)!==(zj>z) && x<(xj-xi)*(z-zi)/(zj-zi)+xi) inside=!inside;
    }
    return inside;
  });
}

export const holmahultWalls: [number, number][][] = sceneryData.walls as [number, number][][];

/** Keep background vegetation off the surrounding lanes as well as the timed route. */
export function onHolmahultSideRoad(x: number, z: number, clearance: number): boolean {
  return holmahultSideRoads.some(road => road.points.slice(1).some(([bx,bz],i) => {
    const [ax,az]=road.points[i],dx=bx-ax,dz=bz-az;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    return Math.hypot(x-ax-dx*t,z-az-dz*t)<road.width/2+clearance+2;
  }));
}
