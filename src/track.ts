import * as THREE from 'three';
import { holmahultCourse } from './holmahult-data.ts';

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

export const courses: CourseDefinition[] = [
  holmahultCourse,
  { id: 'forest-loop', region: 'forest', name: 'Tallskogen', closed: true, width: 11, seed: 481,
    points: [[-80,-105],[5,-120],[90,-85],[112,-15],[80,60],[15,110],[-65,100],[-112,35],[-110,-35]],
    lakes: [{x:-5,z:-5,rx:38,rz:29,level:0.4}], hills: 1, treeDensity: 2700, wildlifeCount: 2,
    medals: {gold: 37, silver: 49, bronze: 68} },
  { id: 'lake-loop', region: 'lakes', name: 'Sjövarvet', closed: true, width: 10, seed: 736,
    points: [[-150,-95],[-50,-130],[65,-115],[145,-60],[155,30],[80,105],[-15,130],[-125,80],[-165,0]],
    lakes: [{x:0,z:0,rx:87,rz:64,level:0.2},{x:270,z:90,rx:48,rz:85,level:-0.2}], hills: 0.65, treeDensity: 1800, wildlifeCount: 3,
    medals: {gold: 45, silver: 60, bronze: 83} },
  { id: 'lake-stage', region: 'lakes', name: 'Strandvägen', closed: false, width: 9, seed: 809,
    points: [[-285,160],[-255,70],[-180,35],[-115,65],[-60,15],[-95,-60],[-50,-125],[45,-150],[125,-100],[150,-25],[220,0],[280,-80]],
    lakes: [{x:-190,z:-55,rx:43,rz:47,level:-0.4},{x:55,z:-20,rx:46,rz:55,level:0.1},{x:205,z:140,rx:57,rz:66,level:0.2}], hills: 0.75, treeDensity: 1800, wildlifeCount: 4,
    medals: {gold: 55, silver: 72, bronze: 100} },
  { id: 'hill-loop', region: 'hills', name: 'Höjdrundan', closed: true, width: 9.5, seed: 901,
    points: [[-170,-125],[-75,-160],[10,-110],[90,-145],[170,-75],[130,10],[175,95],[70,150],[-15,95],[-115,140],[-180,60],[-135,-25]],
    lakes: [{x:0,z:0,rx:35,rz:30,level:-1}], hills: 2.8, treeDensity: 2400, wildlifeCount: 4,
    medals: {gold: 70, silver: 86, bronze: 112} },
  { id: 'hill-stage', region: 'hills', name: 'Smålandsprovet', closed: false, width: 9, seed: 1027,
    points: [[-280,235],[-250,155],[-160,120],[-95,170],[-15,130],[0,50],[-85,5],[-175,30],[-240,-40],[-170,-120],[-70,-95],[0,-155],[95,-190],[165,-120],[140,-35],[205,35],[280,-30],[300,-140]],
    lakes: [{x:70,z:230,rx:42,rz:28,level:0.2}], hills: 3.2, treeDensity: 2700, wildlifeCount: 5,
    medals: {gold: 90, silver: 116, bronze: 155} },
];

export interface RoadSample { point: THREE.Vector3; tangent: THREE.Vector3; distance: number; progress: number }
export interface Checkpoint { point: THREE.Vector3; tangent: THREE.Vector3; progress: number }
export const WORLD_SIZE = 850;

function naturalHeight(x: number, z: number, hills: number): number {
  return (Math.sin(x * 0.013) * 2.4 + Math.cos(z * 0.017) * 1.8 + Math.sin((x + z) * 0.009) * 1.4) * hills;
}

/** Add visible roadside water without letting the basin reach any part of the road. */
function roadsideLakes(definition: CourseDefinition, curve: THREE.CatmullRomCurve3): Lake[] {
  const lakes = definition.lakes.map(lake => ({...lake}));
  if (definition.setting === 'holmahult') return lakes;
  const random = randomGenerator(definition.seed + 3781);
  const road = curve.getSpacedPoints(Math.ceil(curve.getLength() / 3));
  const target = lakes.length + (definition.region === 'lakes' ? 4 : 3);
  for (let i = 0; i < 36 && lakes.length < target; i++) {
    const t = .055 + (i % 12) * .075 + Math.floor(i / 12) * .008;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).setY(0).normalize();
    const rx = (definition.region === 'lakes' ? 39 : 30) + random() * 12;
    const rz = 21 + random() * 14;
    const margin = definition.width / 2 + 4;
    const offset = Math.hypot(tangent.z * (rx * 1.3 + margin), tangent.x * (rz * 1.3 + margin)) + 4;
    for (const side of i % 2 ? [1, -1] : [-1, 1]) {
      const x = point.x - tangent.z * offset * side;
      const z = point.z + tangent.x * offset * side;
      if (Math.abs(x) + rx * 1.4 > 410 || Math.abs(z) + rz * 1.4 > 410) continue;
      if (road.some(p => Math.hypot((p.x - x) / (rx * 1.3 + margin), (p.z - z) / (rz * 1.3 + margin)) < 1)) continue;
      if (lakes.some(l => Math.hypot((l.x - x) / (l.rx + rx + 10), (l.z - z) / (l.rz + rz + 10)) < 1.1)) continue;
      const level = Math.min(naturalHeight(x, z, definition.hills), naturalHeight(point.x, point.z, definition.hills) - .8);
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
    this.curve = new THREE.CatmullRomCurve3(definition.points.map(([x,z]) => new THREE.Vector3(x, 0, z)), definition.closed, 'catmullrom', 0.5);
    this.length = this.curve.getLength();
    this.lakes = roadsideLakes(definition, this.curve);
    const count = Math.ceil(this.length / 1.5);
    this.points = this.curve.getSpacedPoints(count).map(p => { p.y = this.height(p.x, p.z); return p; });
    const gates = Math.ceil(this.length / 40);
    this.checkpoints = Array.from({length: gates + 1}, (_, i) => this.sample(i / gates));
  }

  height(x: number, z: number): number {
    let height = naturalHeight(x, z, this.definition.hills);
    for (const lake of this.lakes) {
      const radius = Math.hypot((x-lake.x)/lake.rx, (z-lake.z)/lake.rz);
      const blend = THREE.MathUtils.smoothstep(radius, 0.78, 1.08);
      const shoreline = 1 - THREE.MathUtils.smoothstep(radius, 1.08, 1.3);
      const bank = THREE.MathUtils.lerp(height, Math.max(height, lake.level + 0.6), shoreline);
      height = THREE.MathUtils.lerp(lake.level - 2.5, bank, blend);
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
    return this.lakes.some(l => Math.hypot((x-l.x)/l.rx,(z-l.z)/l.rz)<0.98 && this.height(x,z)<l.level);
  }

  ribbon(width: number, elevation: number): THREE.BufferGeometry {
    const positions: number[]=[]; const colors: number[]=[]; const uvs: number[]=[]; const indices: number[]=[];
    for (let i=0;i<this.points.length;i++) {
      const p=this.points[i];
      const tangent = this.sample(i/(this.points.length-1)).tangent;
      for (const sign of [-1,1]) {
        const x=p.x-tangent.z*width/2*sign; const z=p.z+tangent.x*width/2*sign;
        positions.push(x,this.height(x,z)+elevation,z);
        const shade=0.94+Math.sin(i*2.71)*0.035; colors.push(shade,shade,shade);
        uvs.push(sign<0?0:width/3,i/(this.points.length-1)*this.length/3);
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
