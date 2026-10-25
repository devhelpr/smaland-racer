import type { Vector3 } from 'three';

export type SurfaceType = 'gravel' | 'asphalt' | 'grass' | 'ice';
export interface WorldRoadSample {
  point: Vector3;
  tangent: Vector3;
  distance: number;
  progress: number;
  width: number;
  surface: 'gravel' | 'asphalt';
}
export interface DrivingWorld {
  readonly spawn: { point: Vector3; tangent: Vector3 };
  heightAt(x: number, z: number): number;
  surfaceAt(x: number, z: number): SurfaceType;
  nearestRoad(x: number, z: number): WorldRoadSample;
  isWater(x: number, z: number): boolean;
}
