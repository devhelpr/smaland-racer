import type { CourseDefinition } from './track.ts';
import * as THREE from 'three';
import asset from '../assets/holmahult-scenery.json' with { type: 'json' };

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

export interface LocalRoad { points: [number, number][]; width: number; asphalt?: boolean; joinsCourseStart?: boolean }
export const holmahultSideRoads: LocalRoad[] = sceneryData.sideRoads as LocalRoad[];
// Use the rendered curves for scenery clearance, including their bends between anchors.
export const holmahultSideRoadCurves = holmahultSideRoads.map(road =>
  new THREE.CatmullRomCurve3(road.points.map(([x,z])=>new THREE.Vector3(x,0,z)),false,'centripetal'));
const sideRoadSamples=holmahultSideRoadCurves.map(curve=>
  curve.getSpacedPoints(Math.ceil(curve.getLength()/asset.details.roadSampleSpacing)));
const sideRoadBounds=sideRoadSamples.map(points=>new THREE.Box3().setFromPoints(points));

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
  return holmahultSideRoads.some((road,index) => {
    const margin=road.width/2+clearance+2,bounds=sideRoadBounds[index];
    if(x<bounds.min.x-margin||x>bounds.max.x+margin||z<bounds.min.z-margin||z>bounds.max.z+margin)return false;
    return sideRoadSamples[index].some((b,i) => {
      if(i===0)return false;
      const a=sideRoadSamples[index][i-1],ax=a.x,az=a.z,bx=b.x,bz=b.z,dx=bx-ax,dz=bz-az;
      const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
      return Math.hypot(x-ax-dx*t,z-az-dz*t)<margin;
    });
  });
}
