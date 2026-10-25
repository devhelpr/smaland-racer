import vehicleAsset from '../assets/vehicle.json' with { type: 'json' };
import * as THREE from 'three';
export type ObstacleKind = 'tree' | 'rock' | 'building' | 'moose' | 'deer' | 'snowPole' | 'aTractor';
export interface Collider { id: string; x: number; z: number; radius: number; kind: ObstacleKind; active?: boolean; velocity?: THREE.Vector3; onHit?: (velocity: THREE.Vector3) => void }
export interface BoxCollider extends Collider { halfX: number; halfZ: number; angle: number }
export interface SurfaceContact { height: number; normal: THREE.Vector3; rock: boolean }
interface RockSurface { mesh: THREE.Mesh; top: number; normalMatrix: THREE.Matrix3 }
export interface Hit { collider: Collider; time: number; normal: THREE.Vector3 }
export const CAR_RADIUS=vehicleAsset.colliderRadius;
export function impactDamage(speed: number,kind: ObstacleKind): number {
  const factor={tree:1.1,rock:.85,building:1.2,moose:1.65,deer:.95,snowPole:0,aTractor:.95}[kind];
  return Math.max(0,speed-2.5)**1.35*factor;
}

function sweepCircle(from: THREE.Vector3,to: THREE.Vector3,obstacle: Collider): Hit|null {
  const dx=to.x-from.x; const dz=to.z-from.z; const ox=from.x-obstacle.x; const oz=from.z-obstacle.z;
  const radius=CAR_RADIUS+obstacle.radius; const c=ox*ox+oz*oz-radius*radius;
  let t=0;
  if(c>0) {
    const a=dx*dx+dz*dz; if(a<1e-12) return null;
    const b=2*(ox*dx+oz*dz); const discriminant=b*b-4*a*c;
    if(discriminant<0) return null;
    t=(-b-Math.sqrt(discriminant))/(2*a); if(t<0||t>1) return null;
  }
  const normal=new THREE.Vector3(ox+dx*t,0,oz+dz*t);
  if(normal.lengthSq()<1e-12) normal.set(-dx,0,-dz);
  if(normal.lengthSq()<1e-12) normal.set(1,0,0);
  return {collider:obstacle,time:t,normal:normal.normalize()};
}

function sweepBox(from: THREE.Vector3,to: THREE.Vector3,box: BoxCollider): Hit|null {
  const cos=Math.cos(box.angle), sin=Math.sin(box.angle);
  const local=(p: THREE.Vector3) => ({x:(p.x-box.x)*cos-(p.z-box.z)*sin,z:(p.x-box.x)*sin+(p.z-box.z)*cos});
  const a=local(from), b=local(to); const dx=b.x-a.x,dz=b.z-a.z;
  const hx=box.halfX+CAR_RADIUS,hz=box.halfZ+CAR_RADIUS;
  let entry=0,exit=1; let nx=0,nz=0;
  if(Math.abs(a.x)<=hx&&Math.abs(a.z)<=hz) {
    if(hx-Math.abs(a.x)<hz-Math.abs(a.z)) nx=Math.sign(a.x)||1; else nz=Math.sign(a.z)||1;
  }
  for(const [origin,direction,half,axis] of [[a.x,dx,hx,0],[a.z,dz,hz,1]]) {
    if(Math.abs(direction)<1e-12) { if(Math.abs(origin)>half) return null; continue; }
    let near=(-half-origin)/direction,far=(half-origin)/direction; let sign=-1;
    if(near>far) { [near,far]=[far,near]; sign=1; }
    if(near>entry) {entry=near;nx=axis===0?sign:0;nz=axis===1?sign:0;}
    exit=Math.min(exit,far); if(entry>exit) return null;
  }
  if(entry<0||entry>1||exit<0) return null;
  return {collider:box,time:entry,normal:new THREE.Vector3(nx*cos+nz*sin,0,-nx*sin+nz*cos)};
}

export class CollisionWorld {
  private cells=new Map<string,Collider[]>();
  private cellSize=16;
  readonly dynamic: Collider[]=[];
  private rockSurfaces=new Map<string,RockSurface>();
  private surfaceRay=new THREE.Raycaster();

  /** Use the exact same transformed facets for drawing and wheel/chassis contact. */
  addRock(id:string,geometry:THREE.BufferGeometry,material:THREE.Material|THREE.Material[],matrix:THREE.Matrix4):void {
    const mesh=new THREE.Mesh(geometry,material);mesh.matrixAutoUpdate=false;
    mesh.matrix.copy(matrix);mesh.matrixWorld.copy(matrix);
    if(!geometry.boundingSphere)geometry.computeBoundingSphere();
    const sphere=geometry.boundingSphere!.clone().applyMatrix4(matrix);
    const bounds=new THREE.Box3().setFromObject(mesh),center=sphere.center,radius=sphere.radius;
    this.rockSurfaces.set(id,{mesh,top:bounds.max.y,normalMatrix:new THREE.Matrix3().getNormalMatrix(matrix)});
    this.add({id,x:center.x,z:center.z,radius,kind:'rock'});
  }

  hasRockNear(x:number,z:number,radius:number):boolean {
    for(let cx=Math.floor((x-radius)/this.cellSize);cx<=Math.floor((x+radius)/this.cellSize);cx++)
      for(let cz=Math.floor((z-radius)/this.cellSize);cz<=Math.floor((z+radius)/this.cellSize);cz++)
        for(const collider of this.cells.get(`${cx}:${cz}`)??[])
          if(this.rockSurfaces.has(collider.id)&&Math.hypot(x-collider.x,z-collider.z)<radius+collider.radius)return true;
    return false;
  }

  surfaceAt(x:number,z:number,height:number,normal=new THREE.Vector3(0,1,0)):SurfaceContact {
    const result={height,normal,rock:false};
    for(const collider of this.cells.get(`${Math.floor(x/this.cellSize)}:${Math.floor(z/this.cellSize)}`)??[]) {
      const surface=this.rockSurfaces.get(collider.id);
      if(!surface||collider.active===false||Math.hypot(x-collider.x,z-collider.z)>collider.radius)continue;
      this.surfaceRay.set(new THREE.Vector3(x,surface.top+1,z),new THREE.Vector3(0,-1,0));
      const hit=this.surfaceRay.intersectObject(surface.mesh,false)[0];
      if(hit&&hit.point.y>result.height) {
        result.height=hit.point.y;result.normal=hit.face!.normal.clone().applyNormalMatrix(surface.normalMatrix);result.rock=true;
      }
    }
    return result;
  }
  add(collider: Collider): void {
    const r=collider.radius;
    for(let x=Math.floor((collider.x-r)/this.cellSize);x<=Math.floor((collider.x+r)/this.cellSize);x++)
      for(let z=Math.floor((collider.z-r)/this.cellSize);z<=Math.floor((collider.z+r)/this.cellSize);z++) {
        const key=`${x}:${z}`; const cell=this.cells.get(key)??[]; cell.push(collider); this.cells.set(key,cell);
      }
  }
  sweep(from: THREE.Vector3,to: THREE.Vector3,driveOverRocks=false): Hit|null {
    const candidates=new Set(this.dynamic.filter(c=>c.active!==false));
    for(let x=Math.floor((Math.min(from.x,to.x)-CAR_RADIUS)/this.cellSize);x<=Math.floor((Math.max(from.x,to.x)+CAR_RADIUS)/this.cellSize);x++)
      for(let z=Math.floor((Math.min(from.z,to.z)-CAR_RADIUS)/this.cellSize);z<=Math.floor((Math.max(from.z,to.z)+CAR_RADIUS)/this.cellSize);z++)
        for(const c of this.cells.get(`${x}:${z}`)??[]) candidates.add(c);
    let best: Hit|null=null;
    for(const c of candidates) {
      if(c.active===false||(driveOverRocks&&this.rockSurfaces.has(c.id))) continue;
      const hit='halfX' in c?sweepBox(from,to,c as BoxCollider):sweepCircle(from,to,c);
      if(hit&&(!best||hit.time<best.time)) best=hit;
    }
    return best;
  }
}
