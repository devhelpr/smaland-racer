import world from '../parcours/world.json' with { type: 'json' };
import roadAsset from '../assets/road.json' with { type: 'json' };
import * as THREE from 'three';
import courseData from '../parcours/courses.json' with { type: 'json' };

export interface Lake { x: number; z: number; rx: number; rz: number; level: number }
export interface CourseDefinition {
  id: string;
  setting?: 'holmahult';
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

export const courses: CourseDefinition[] = courseData as CourseDefinition[];

export interface RoadSample { point: THREE.Vector3; tangent: THREE.Vector3; distance: number; progress: number }
export interface Checkpoint { point: THREE.Vector3; tangent: THREE.Vector3; progress: number }
export const WORLD_SIZE = world.size;

function naturalHeight(x: number, z: number, hills: number): number {
  return (Math.sin(x * world.terrain.xFrequency) * world.terrain.xAmplitude + Math.cos(z * world.terrain.zFrequency) * world.terrain.zAmplitude + Math.sin((x + z) * world.terrain.diagonalFrequency) * world.terrain.diagonalAmplitude) * hills;
}

/** Add visible roadside water without letting the basin reach any part of the road. */
function roadsideLakes(definition: CourseDefinition, curve: THREE.CatmullRomCurve3): Lake[] {
  const lakes = definition.lakes.map(lake => ({...lake}));
  if (definition.setting === 'holmahult') return lakes;
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

export class Course {
  readonly definition: CourseDefinition;
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
    // Index zero is the recovery/start anchor; the six numbered gates follow it.
    const gates = world.road.checkpointCount;
    this.checkpoints = Array.from({length: gates + 1}, (_, i) => this.sample(i / gates));
  }

  height(x: number, z: number): number {
    let height = naturalHeight(x, z, this.definition.hills);
    for (const lake of this.lakes) {
      const radius = Math.hypot((x-lake.x)/lake.rx, (z-lake.z)/lake.rz);
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

  inWater(x: number, z: number): boolean {
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
        uvs.push(sign<0?0:width/roadAsset.textureScale,i/(this.points.length-1)*this.length/roadAsset.textureScale);
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
