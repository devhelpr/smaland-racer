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
  const paint = new THREE.MeshStandardMaterial({color, roughness: .68, metalness: .15});
  const dark = new THREE.MeshStandardMaterial({color: '#27312d', roughness: .8});
  const glass = new THREE.MeshStandardMaterial({color: '#779b9d', roughness: .28, metalness: .25});
  const chrome = new THREE.MeshStandardMaterial({color: '#c0c5b7', metalness: .45, roughness: .45});
  const rearLight = new THREE.MeshStandardMaterial({color: '#bc4432', emissive: '#b33120', emissiveIntensity: .35});
  const frontLight = new THREE.MeshStandardMaterial({color: '#f5e4a9', emissive: '#d1ba7a', emissiveIntensity: .2});
  const part = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    piece.position.set(x, y, z);piece.castShadow = true;mesh.add(piece);return piece;
  };
  part(1.96, .6, 4.15, 0, .85, 0, paint);
  part(1.67, .7, pickup ? 1.2 : 2.5, 0, 1.48, pickup ? .25 : -.3, glass);
  part(1.77, .13, pickup ? 1.35 : 2.65, 0, 1.88, pickup ? .25 : -.3, paint);
  for (const x of [-.83, .83]) for (const z of pickup ? [-.35, .85] : [-1.55, -.2, .95]) part(.1, .74, .12, x, 1.5, z, paint);
  if (pickup) {
    part(1.55, .09, 1.35, 0, 1.17, -1.17, dark);
    for (const x of [-.9,.9]) part(.14,.3,1.5,x,1.23,-1.2,paint);
  }
  for (const z of [-2.12, 2.12]) part(2.04,.17,.17,0,.62,z,dark);
  for (const x of [-.7,.7]) {
    part(.35,.23,.07,x,.98,2.1,frontLight);part(.3,.25,.07,x,.98,-2.1,rearLight);
  }
  part(.78,.23,.07,0,.98,2.11,dark);
  const wheels: THREE.Group[] = [];
  for (const x of [-1,1]) for (const z of [-1.35,1.35]) {
    const wheel = new THREE.Group();wheel.position.set(x,.47,z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(.44,.44,.26,10),dark);tire.rotation.z=Math.PI/2;tire.castShadow=true;wheel.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.28,8),chrome);hub.rotation.z=Math.PI/2;wheel.add(hub);
    wheels.push(wheel);mesh.add(wheel);
  }
  // Rear-facing slow-vehicle triangle: a wide red border around a bright orange center.
  const triangle = new THREE.Shape();triangle.moveTo(0,.38);triangle.lineTo(-.43,-.32);triangle.lineTo(.43,-.32);triangle.closePath();
  const border = new THREE.Mesh(new THREE.ShapeGeometry(triangle),new THREE.MeshBasicMaterial({color:'#b93b2c',side:THREE.DoubleSide}));
  border.position.set(0,1.3,-2.17);mesh.add(border);
  const center = new THREE.Mesh(new THREE.ShapeGeometry(triangle),new THREE.MeshBasicMaterial({color:'#f39242',side:THREE.DoubleSide}));
  center.scale.setScalar(.73);center.position.set(0,1.3,-2.18);mesh.add(center);
  return {mesh,wheels};
}

/** Slow same-direction traffic stays in its lane, leaving the other side open for passing. */
export class Traffic {
  readonly vehicles: ATractor[] = [];
  readonly course: Course;

  constructor(course: Course, world: CollisionWorld, group: THREE.Group) {
    this.course = course;
    const random = randomGenerator(course.definition.seed + 2901);
    const count = Math.max(3, Math.min(7, Math.ceil(course.length / 230)));
    for (let i=0;i<count;i++) {
      const {mesh,wheels}=createATractor(['#4f797a','#913d39','#6f784b','#596d8a'][i%4],i%3===1);
      const baseSpeed=6.4+random()*1.4;
      const collider: BoxCollider={id:`a-tractor-${i}`,x:0,z:0,radius:2.35,kind:'aTractor',halfX:1.03,halfZ:2.15,angle:0,active:true,velocity:new THREE.Vector3()};
      const vehicle: ATractor={mesh,wheels,collider,distance:38+i*(course.length-90)/count,baseSpeed,speed:baseSpeed,brakeTime:0,active:true};
      collider.onHit=()=>{vehicle.brakeTime=1.3;};
      this.vehicles.push(vehicle);world.dynamic.push(collider);group.add(mesh);this.place(vehicle);
    }
  }

  private place(vehicle: ATractor): void {
    const sample=this.course.sample(vehicle.distance/this.course.length);
    const side=new THREE.Vector3(-sample.tangent.z,0,sample.tangent.x);
    vehicle.mesh.position.copy(sample.point).addScaledVector(side,this.course.definition.width*.22);
    const {x,z}=vehicle.mesh.position;
    vehicle.mesh.position.y=this.course.height(x,z)+.13;
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
