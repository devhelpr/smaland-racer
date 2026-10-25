import placement from '../parcours/traffic.json' with { type: 'json' };
import asset from '../assets/traffic.json' with { type: 'json' };
import * as THREE from 'three';
import { Course, randomGenerator } from './track.ts';
import type { BoxCollider, CollisionWorld } from './collision.ts';

interface ATractor {
  mesh: THREE.Group;
  wheels: THREE.Group[];
  collider: BoxCollider;
  distance: number;
  baseSpeed: number;
  speed: number;
  brakeTime: number;
  active: boolean;
}

function createATractor(color: string, pickup: boolean): {mesh: THREE.Group; wheels: THREE.Group[]} {
  const mesh = new THREE.Group();
  const variant=pickup?asset.pickup:asset.wagon;
  const paint = new THREE.MeshStandardMaterial({color, ...asset.paint});
  const dark = new THREE.MeshStandardMaterial(asset.dark);
  const glass = new THREE.MeshStandardMaterial(asset.glass);
  const chrome = new THREE.MeshStandardMaterial(asset.chrome);
  const rearLight = new THREE.MeshStandardMaterial(asset.rearLight);
  const frontLight = new THREE.MeshStandardMaterial(asset.frontLight);
  const part = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    piece.position.set(x, y, z);piece.castShadow = true;mesh.add(piece);return piece;
  };
  part(...asset.body as [number, number, number, number, number, number], paint);
  part(...asset.cabinWidthHeight as [number, number], variant.cabinDepth, ...asset.cabinXY as [number, number], variant.cabinZ, glass);
  part(...asset.roofWidthHeight as [number, number], variant.roofDepth, ...asset.roofXY as [number, number], variant.cabinZ, paint);
  for (const x of asset.pillarX) for (const z of pickup ? asset.pickupPillarZ : asset.wagonPillarZ) part(...asset.pillarSize as [number, number, number], x, asset.pillarHeight, z, paint);
  if (pickup) {
    part(...asset.pickupBed as [number, number, number, number, number, number], dark);
    for (const x of asset.bedSideX) part(...asset.bedSideSize as [number, number, number],x,...asset.bedSideYZ as [number, number],paint);
  }
  for (const z of asset.bumperZ) part(...asset.bumperSizeXY as [number, number, number, number, number],z,dark);
  for (const x of asset.lampX) {
    part(...asset.headlampSize as [number, number, number],x,...asset.headlampYZ as [number, number],frontLight);part(...asset.tailLampSize as [number, number, number],x,...asset.tailLampYZ as [number, number],rearLight);
  }
  part(...asset.grille as [number, number, number, number, number, number],dark);
  const wheels: THREE.Group[] = [];
  for (const x of asset.wheelX) for (const z of asset.wheelZ) {
    const wheel = new THREE.Group();wheel.position.set(x,asset.wheelHeight,z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(...asset.tire as [number, number, number, number]),dark);tire.rotation.z=Math.PI/2;tire.castShadow=true;wheel.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(...asset.hub as [number, number, number, number]),chrome);hub.rotation.z=Math.PI/2;wheel.add(hub);
    wheels.push(wheel);mesh.add(wheel);
  }
  // Rear-facing slow-vehicle triangle: a wide red border around a bright orange center.
  const triangle = new THREE.Shape();triangle.moveTo(...asset.triangleTop as [number, number]);triangle.lineTo(...asset.triangleLeft as [number, number]);triangle.lineTo(...asset.triangleRight as [number, number]);triangle.closePath();
  const border = new THREE.Mesh(new THREE.ShapeGeometry(triangle),new THREE.MeshBasicMaterial({...asset.border,side:THREE.DoubleSide}));
  border.position.set(...asset.triangleBorderPosition as [number,number,number]);mesh.add(border);
  const center = new THREE.Mesh(new THREE.ShapeGeometry(triangle),new THREE.MeshBasicMaterial({...asset.center,side:THREE.DoubleSide}));
  center.scale.setScalar(asset.triangleCenterScale);center.position.set(...asset.triangleCenterPosition as [number,number,number]);mesh.add(center);
  return {mesh,wheels};
}

/** Slow same-direction traffic stays in its lane, leaving the other side open for passing. */
export class Traffic {
  readonly vehicles: ATractor[] = [];
  readonly course: Course;

  constructor(course: Course, world: CollisionWorld, group: THREE.Group) {
    this.course = course;
    if(course.definition.setting==='sandsjon')return;
    const random = randomGenerator(course.definition.seed + placement.seedOffset);
    const count = Math.max(placement.minCount, Math.min(placement.maxCount, Math.ceil(course.length / placement.lengthPerVehicle)));
    for (let i=0;i<count;i++) {
      const {mesh,wheels}=createATractor(asset.paintColors[i%asset.paintColors.length],i%placement.pickupEvery===placement.pickupOffset);
      const baseSpeed=placement.baseSpeed+random()*placement.speedRange;
      const collider: BoxCollider={id:`a-tractor-${i}`,x:0,z:0,...asset.collider,kind:'aTractor',angle:0,active:true,velocity:new THREE.Vector3()};
      const vehicle: ATractor={mesh,wheels,collider,distance:placement.startDistance+i*(course.length-placement.finishClearance)/count,baseSpeed,speed:baseSpeed,brakeTime:0,active:true};
      collider.onHit=()=>{vehicle.brakeTime=1.3;};
      this.vehicles.push(vehicle);world.dynamic.push(collider);group.add(mesh);this.place(vehicle);
    }
  }

  private place(vehicle: ATractor): void {
    const sample=this.course.sample(vehicle.distance/this.course.length);
    const side=new THREE.Vector3(-sample.tangent.z,0,sample.tangent.x);
    vehicle.mesh.position.copy(sample.point).addScaledVector(side,this.course.definition.width*placement.laneOffset);
    const {x,z}=vehicle.mesh.position;
    vehicle.mesh.position.y=this.course.height(x,z)+placement.groundOffset;
    const heading=Math.atan2(sample.tangent.x,sample.tangent.z);
    const front=this.course.height(x+sample.tangent.x,z+sample.tangent.z);
    const back=this.course.height(x-sample.tangent.x,z-sample.tangent.z);
    const across=this.course.height(x+side.x,z+side.z)-this.course.height(x-side.x,z-side.z);
    vehicle.mesh.rotation.set(-Math.atan((front-back)/2),heading,-Math.atan(across/2));
    vehicle.collider.x=x;vehicle.collider.z=z;vehicle.collider.angle=heading;
    vehicle.collider.velocity!.copy(sample.tangent).multiplyScalar(vehicle.speed);
  }

  update(dt: number, playerPosition?: THREE.Vector3): void {
    if (dt<=0) return;
    for (const vehicle of this.vehicles) {
      if (!vehicle.active) continue;
      let targetSpeed=vehicle.baseSpeed;
      vehicle.brakeTime=Math.max(0,vehicle.brakeTime-dt);
      if(vehicle.brakeTime>0)targetSpeed=2.5;
      for(const other of this.vehicles) {
        if(other===vehicle||!other.active)continue;
        let gap=other.distance-vehicle.distance;
        if(this.course.definition.closed&&gap<0)gap+=this.course.length;
        if(gap>0&&gap<20)targetSpeed=Math.min(targetSpeed,Math.max(0,(gap-7)*.65));
      }
      if(playerPosition) {
        const sample=this.course.sample(vehicle.distance/this.course.length);
        const relative=playerPosition.clone().sub(vehicle.mesh.position).setY(0);
        const forward=relative.dot(sample.tangent);
        const lateral=Math.abs(relative.x*sample.tangent.z-relative.z*sample.tangent.x);
        if(forward>0&&forward<16&&lateral<2.3)targetSpeed=Math.min(targetSpeed,Math.max(0,(forward-5)*.8));
      }
      vehicle.speed=THREE.MathUtils.damp(vehicle.speed,targetSpeed,targetSpeed<vehicle.speed?6:2,dt);
      vehicle.distance+=vehicle.speed*dt;
      if(vehicle.distance>=this.course.length) {
        if(this.course.definition.closed)vehicle.distance%=this.course.length;
        else {vehicle.active=false;vehicle.collider.active=false;vehicle.mesh.visible=false;continue;}
      }
      this.place(vehicle);
      for(const wheel of vehicle.wheels)for(const child of wheel.children)child.rotation.x+=vehicle.speed*dt/.44;
    }
  }

  aheadOf(position: THREE.Vector3): boolean {
    const tangent=this.course.nearest(position.x,position.z).tangent;
    return this.vehicles.some(vehicle=> {
      if(!vehicle.active)return false;
      const delta=vehicle.mesh.position.clone().sub(position).setY(0);
      const forward=delta.dot(tangent);
      return forward>0&&forward<45&&delta.length()<50;
    });
  }
}
