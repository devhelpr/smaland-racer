import { textureDefinitions } from './textures.ts';
import openWorld from '../parcours/holmahult-open-world.json' with { type: 'json' };
import { RoadNetwork } from './road-network.ts';
import type { DrivingWorld, SurfaceType, WorldRoadSample } from './driving-world.ts';
import sandsjon from '../parcours/sandsjon.json' with { type: 'json' };
import world from '../parcours/world.json' with { type: 'json' };
import roadAsset from '../assets/road.json' with { type: 'json' };
import * as THREE from 'three';
import courseData from '../parcours/courses.json' with { type: 'json' };

export interface Lake { x: number; z: number; rx: number; rz: number; level: number; outline?: [number,number][] }
export interface CourseDefinition {
  id: string;
  openWorld?: Omit<typeof openWorld.openWorld, 'roads'> & { roads: import('./road-network.ts').RoadDefinition[] };
  setting?: 'holmahult' | 'sandsjon';
  bridge?: {position:[number,number,number];angle:number};
  shore?: {height:number;blendDistance:number;sceneryClearance:number};
  region: 'forest' | 'lakes' | 'hills';
  name: string;
  closed: boolean;
  width: number;
  seed: number;
  points: [number, number][];
  lakes: Lake[];
  hills: number;
  treeDensity: number;
  wildlifeCount: number;
  medals: { gold: number; silver: number; bronze: number };
}

export const courses: CourseDefinition[] = [...courseData, sandsjon, openWorld] as CourseDefinition[];

export interface RoadSample { point: THREE.Vector3; tangent: THREE.Vector3; distance: number; progress: number }
export interface Checkpoint { point: THREE.Vector3; tangent: THREE.Vector3; progress: number }
export const WORLD_SIZE = world.size;

function naturalHeight(x: number, z: number, hills: number, terrain=world.terrain): number {
  return (Math.sin(x * terrain.xFrequency) * terrain.xAmplitude + Math.cos(z * terrain.zFrequency) * terrain.zAmplitude + Math.sin((x + z) * terrain.diagonalFrequency) * terrain.diagonalAmplitude) * hills;
}

/** Add visible roadside water without letting the basin reach any part of the road. */
function roadsideLakes(definition: CourseDefinition, curve: THREE.CatmullRomCurve3): Lake[] {
  const lakes = definition.lakes.map(lake => ({...lake}));
  if (definition.setting === 'holmahult' || definition.setting === 'sandsjon') return lakes;
  const random = randomGenerator(definition.seed + world.lakes.seedOffset);
  const road = curve.getSpacedPoints(Math.ceil(curve.getLength() / world.lakes.roadSampleSpacing));
  const target = lakes.length + (definition.region === 'lakes' ? world.lakes.lakeRegionCount : world.lakes.otherRegionCount);
  for (let i = 0; i < world.lakes.attempts && lakes.length < target; i++) {
    const t = world.lakes.start + (i % world.lakes.samplesPerPass) * world.lakes.spacing + Math.floor(i / world.lakes.samplesPerPass) * world.lakes.passOffset;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).setY(0).normalize();
    const rx = (definition.region === 'lakes' ? world.lakes.lakeRegionRadiusX : world.lakes.otherRegionRadiusX) + random() * world.lakes.radiusXRange;
    const rz = world.lakes.radiusZ + random() * world.lakes.radiusZRange;
    const margin = definition.width / 2 + world.lakes.roadMargin;
    const offset = Math.hypot(tangent.z * (rx * world.lakes.bankScale + margin), tangent.x * (rz * world.lakes.bankScale + margin)) + world.lakes.roadOffset;
    for (const side of i % 2 ? [1, -1] : [-1, 1]) {
      const x = point.x - tangent.z * offset * side;
      const z = point.z + tangent.x * offset * side;
      if (Math.abs(x) + rx * world.lakes.worldMarginScale > world.lakes.worldLimit || Math.abs(z) + rz * world.lakes.worldMarginScale > world.lakes.worldLimit) continue;
      if (road.some(p => Math.hypot((p.x - x) / (rx * world.lakes.bankScale + margin), (p.z - z) / (rz * world.lakes.bankScale + margin)) < 1)) continue;
      if (lakes.some(l => Math.hypot((l.x - x) / (l.rx + rx + world.lakes.separation), (l.z - z) / (l.rz + rz + world.lakes.separation)) < world.lakes.separationScale)) continue;
      const level = Math.min(naturalHeight(x, z, definition.hills), naturalHeight(point.x, point.z, definition.hills) - world.lakes.roadLevelDrop);
      lakes.push({x, z, rx, rz, level});
      break;
    }
  }
  return lakes;
}

/** The same shoreline drives ice rendering, terrain, grip and scenery placement. */
export function lakeContains(lake:Lake,x:number,z:number):boolean {
  if(!lake.outline)return Math.hypot((x-lake.x)/lake.rx,(z-lake.z)/lake.rz)<=1;
  let inside=false;
  for(let i=0,j=lake.outline.length-1;i<lake.outline.length;j=i++) {
    const a=lake.outline[i],b=lake.outline[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}

export function shoreDistance(lake:Lake,x:number,z:number):number {
  if(!lake.outline)return Math.abs(Math.hypot((x-lake.x)/lake.rx,(z-lake.z)/lake.rz)-1)*Math.min(lake.rx,lake.rz);
  let distance=Infinity;
  for(let i=0;i<lake.outline.length;i++) {
    const a=lake.outline[i],b=lake.outline[(i+1)%lake.outline.length],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);
    distance=Math.min(distance,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
  }
  return distance;
}

export class Course implements DrivingWorld {
  readonly definition: CourseDefinition;
  readonly roadNetwork?: RoadNetwork;
  get drivingLength():number {return this.roadNetwork?.roads.reduce((sum,road)=>sum+road.length,0)??this.length;}
  get worldSize():number { return this.definition.openWorld?.size??WORLD_SIZE; }
  readonly points: THREE.Vector3[];
  readonly curve: THREE.CatmullRomCurve3;
  readonly length: number;
  readonly lakes: Lake[];
  readonly checkpoints: Checkpoint[];

  constructor(definition: CourseDefinition) {
    this.definition = definition;
    this.curve = new THREE.CatmullRomCurve3(definition.points.map(([x,z]) => new THREE.Vector3(x, 0, z)), definition.closed, 'catmullrom', world.road.tension);
    this.length = this.curve.getLength();
    this.lakes = roadsideLakes(definition, this.curve);
    const count = Math.ceil(this.length / world.road.sampleSpacing);
    this.points = this.curve.getSpacedPoints(count).map(p => { p.y = this.height(p.x, p.z); return p; });
    if(definition.openWorld)this.roadNetwork=new RoadNetwork(definition.openWorld.roads,(x,z)=>this.height(x,z),world.road.sampleSpacing);
    // Index zero is the recovery/start anchor; the six numbered gates follow it.
    const gates = world.road.checkpointCount;
    this.checkpoints = Array.from({length: gates + 1}, (_, i) => this.sample(i / gates));
  }

  get spawn() { return this.sample(0); }
  heightAt(x:number,z:number):number { return this.height(x,z); }
  nearestRoad(x:number,z:number):WorldRoadSample { return this.roadNetwork?.nearest(x,z)??{...this.nearest(x,z),width:this.definition.width,surface:'gravel'}; }
  surfaceAt(x:number,z:number):SurfaceType {
    if(this.onIce(x,z))return 'ice';
    const road=this.nearestRoad(x,z);
    if(road.distance<=road.width/2)return road.surface;
    if(this.definition.openWorld?.yards.some(([cx,cz,w,d])=>Math.abs(x-cx)<=w/2&&Math.abs(z-cz)<=d/2))return 'gravel';
    return 'grass';
  }
  isWater(x:number,z:number):boolean { return this.inWater(x,z); }

  height(x: number, z: number): number {
    const config=this.definition.openWorld;
    let height = naturalHeight(x, z, this.definition.hills,config?.terrain);
    if(config) {
      const b=config.bridge,{across,along}=this.bridgeCoordinates(x,z);
      const deck=naturalHeight(b.position[0],b.position[1],this.definition.hills,config.terrain);
      const blend=1-THREE.MathUtils.smoothstep(Math.abs(along),b.length/2,b.length/2+b.blend);
      if(Math.abs(across)<b.streamLength/2+b.blend) {
        const acrossBlend=1-THREE.MathUtils.smoothstep(Math.abs(across),b.streamLength/2,b.streamLength/2+b.blend);
        height=THREE.MathUtils.lerp(height,deck,blend*acrossBlend);
        const bank=THREE.MathUtils.smoothstep(Math.abs(across),b.width/2,b.width/2+4);
        const stream=1-THREE.MathUtils.smoothstep(Math.abs(along),b.streamWidth/2,b.streamWidth/2+4);
        let clearance=Infinity;
        if(bank*stream>0)for(const road of config.roads)for(let i=1;i<road.points.length;i++) {
          const [ax,az]=road.points[i-1],[bx,bz]=road.points[i],dx=bx-ax,dz=bz-az;
          const t=THREE.MathUtils.clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1),0,1);
          clearance=Math.min(clearance,Math.hypot(x-ax-dx*t,z-az-dz*t)-road.width/2);
        }
        height-=bank*stream*b.waterDrop*acrossBlend*THREE.MathUtils.smoothstep(clearance,0,4);
      }
    }
    for (const lake of this.lakes) {
      const radius = Math.hypot((x-lake.x)/lake.rx, (z-lake.z)/lake.rz);
      if(this.definition.setting==='sandsjon') {
        const shore=this.definition.shore!;
        height=lake.level+(lakeContains(lake,x,z)?0:shore.height*THREE.MathUtils.smoothstep(shoreDistance(lake,x,z),0,shore.blendDistance));
        continue;
      }
      const blend = THREE.MathUtils.smoothstep(radius, world.lakes.basinInner, world.lakes.basinOuter);
      const shoreline = 1 - THREE.MathUtils.smoothstep(radius, world.lakes.basinOuter, world.lakes.shoreOuter);
      const bank = THREE.MathUtils.lerp(height, Math.max(height, lake.level + world.lakes.bankHeight), shoreline);
      height = THREE.MathUtils.lerp(lake.level - world.lakes.depth, bank, blend);
    }
    return height;
  }

  sample(progress: number): Checkpoint {
    const t = THREE.MathUtils.clamp(progress, 0, 1);
    const point = this.curve.getPointAt(t);
    point.y = this.height(point.x, point.z);
    const tangent = this.curve.getTangentAt(t).setY(0).normalize();
    return {point, tangent, progress: t};
  }

  nearest(x: number, z: number): RoadSample {
    let best = Infinity; let index = 0; let fraction = 0;
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i]; const b = this.points[i+1];
      const dx = b.x-a.x; const dz = b.z-a.z;
      const t = THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz), 0, 1);
      const d = (x-a.x-dx*t)**2+(z-a.z-dz*t)**2;
      if (d < best) { best=d; index=i; fraction=t; }
    }
    const a = this.points[index]; const b = this.points[index+1];
    const point = a.clone().lerp(b, fraction); point.y=this.height(point.x, point.z);
    return { point, tangent: b.clone().sub(a).setY(0).normalize(), distance: Math.sqrt(best), progress: (index+fraction)/(this.points.length-1) };
  }

  onIce(x: number, z: number): boolean {
    return this.definition.setting==='sandsjon' && this.lakes.some(l=>lakeContains(l,x,z));
  }

  bridgeCoordinates(x:number,z:number):{across:number;along:number} {
    const b=this.definition.openWorld!.bridge,dx=x-b.position[0],dz=z-b.position[1];
    return {across:dx*Math.cos(b.angle)-dz*Math.sin(b.angle),along:dx*Math.sin(b.angle)+dz*Math.cos(b.angle)};
  }

  inWater(x: number, z: number): boolean {
    if(this.definition.openWorld) {
      const {across,along}=this.bridgeCoordinates(x,z),b=this.definition.openWorld.bridge;
      return Math.abs(along)<b.streamWidth/2&&Math.abs(across)>b.width/2+1&&Math.abs(across)<b.streamLength/2;
    }
    if(this.definition.setting==='sandsjon')return false;
    return this.lakes.some(l => Math.hypot((x-l.x)/l.rx,(z-l.z)/l.rz)<world.lakes.waterRadius && this.height(x,z)<l.level);
  }

  ribbon(width: number, elevation: number): THREE.BufferGeometry {
    const positions: number[]=[]; const colors: number[]=[]; const uvs: number[]=[]; const indices: number[]=[];
    for (let i=0;i<this.points.length;i++) {
      const p=this.points[i];
      const tangent = this.sample(i/(this.points.length-1)).tangent;
      for (const sign of [-1,1]) {
        const x=p.x-tangent.z*width/2*sign; const z=p.z+tangent.x*width/2*sign;
        positions.push(x,this.height(x,z)+elevation,z);
        const shade=roadAsset.baseShade+Math.sin(i*roadAsset.shadeFrequency)*roadAsset.shadeVariation; colors.push(shade,shade,shade);
        uvs.push(sign<0?0:width/textureDefinitions.gravel.worldScale,i/(this.points.length-1)*this.length/textureDefinitions.gravel.worldScale);
      }
      if (i<this.points.length-1) { const n=i*2; indices.push(n,n+2,n+1,n+1,n+2,n+3); }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }
}

export function randomGenerator(seed: number): () => number {
  return () => { seed=(Math.imul(1664525,seed)+1013904223)|0; return (seed>>>0)/4294967296; };
}
