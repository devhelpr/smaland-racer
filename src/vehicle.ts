import asset from '../assets/vehicle.json' with { type: 'json' };
import * as THREE from 'three';
import { Course } from './track.ts';
import { CollisionWorld, impactDamage } from './collision.ts';
import type { DriveInput } from './input.ts';

export class Vehicle {
  readonly mesh = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  heading = 0;
  forwardSpeed = 0;
  onRoad = true;
  damage = 0;
  impact = 0;
  private age = 0;
  private contacts = new Map<string, number>();
  private panels: THREE.Mesh[] = [];
  private smoke = new THREE.Group();
  private steering = 0;
  private wheels: THREE.Group[] = [];

  readonly course: Course;
  constructor(course: Course) {
    this.course=course;
    const paint = new THREE.MeshStandardMaterial(asset.paint);
    const trim = new THREE.MeshStandardMaterial(asset.trim);
    const glass = new THREE.MeshStandardMaterial(asset.glass);
    const white = new THREE.MeshStandardMaterial(asset.white);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z); mesh.castShadow = true; this.mesh.add(mesh); return mesh;
    };
    this.panels.push(box(...asset.body as [number, number, number, number, number, number], paint));
    this.panels.push(box(...asset.hood as [number, number, number, number, number, number], paint));
    box(...asset.cabin as [number, number, number, number, number, number], glass);
    box(...asset.roof as [number, number, number, number, number, number], paint);
    for (const x of asset.pillarX) {
      box(...asset.frontPillarSize as [number, number, number], x, ...asset.frontPillarYZ as [number, number], paint);
      box(...asset.rearPillarSize as [number, number, number], x, ...asset.rearPillarYZ as [number, number], paint);
      box(...asset.middlePillarSize as [number, number, number], x, ...asset.middlePillarYZ as [number, number], paint);
    }
    box(...asset.frontBumper as [number, number, number, number, number, number], trim);
    box(...asset.rearBumper as [number, number, number, number, number, number], trim);
    box(...asset.licensePlate as [number, number, number, number, number, number], white);
    const lamp = new THREE.MeshStandardMaterial(asset.lamp);
    const red = new THREE.MeshStandardMaterial(asset.red);
    for (const x of asset.lampX) {
      box(...asset.headlampSize as [number, number, number], x, ...asset.headlampYZ as [number, number], lamp);
      box(...asset.tailLampSize as [number, number, number], x, ...asset.tailLampYZ as [number, number], red);
    }
    for (const x of asset.wheelX) for (const z of asset.wheelZ) {
      const pivot = new THREE.Group(); pivot.position.set(x, asset.wheelHeight, z);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(...asset.tire as [number, number, number, number]), trim);
      tire.rotation.z = Math.PI / 2; tire.castShadow = true; pivot.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(...asset.hub as [number, number, number, number]), white);
      hub.rotation.z = Math.PI / 2; pivot.add(hub);
      this.mesh.add(pivot); this.wheels.push(pivot);
    }
    const smokeMaterial = new THREE.MeshBasicMaterial(asset.smokeMaterial);
    const smokeGeometry = new THREE.IcosahedronGeometry(...asset.smokeGeometry as [number, number]);
    for(let i=0;i<asset.smokeCount;i++) this.smoke.add(new THREE.Mesh(smokeGeometry,smokeMaterial));
    this.mesh.add(this.smoke);
    this.restart();
  }

  restart(): void {
    this.damage=0; this.impact=0; this.age=0; this.contacts.clear();
    const start=this.course.sample(0); this.recover(start.point,start.tangent,false);
  }

  recover(point: THREE.Vector3, tangent: THREE.Vector3, advance=true): void {
    this.position.copy(point).addScaledVector(tangent,advance?1.8:0);
    this.position.y=this.course.height(this.position.x,this.position.z);
    this.heading=Math.atan2(tangent.x,tangent.z);
    this.velocity.set(0,0,0); this.forwardSpeed=0; this.steering=0; this.onRoad=true; this.contacts.clear(); this.syncMesh();
  }

  update(dt: number, input: DriveInput, collisions?: CollisionWorld): void {
    this.age+=dt; this.impact=Math.max(0,this.impact-dt*2.5);
    this.onRoad=this.course.nearest(this.position.x,this.position.z).distance<=this.course.definition.width/2;
    const forward=new THREE.Vector3(Math.sin(this.heading),0,Math.cos(this.heading));
    const right=new THREE.Vector3(Math.cos(this.heading),0,-Math.sin(this.heading));
    let longitudinal=this.velocity.dot(forward); let lateral=this.velocity.dot(right);
    this.steering=THREE.MathUtils.damp(this.steering,input.steer,9,dt);
    const braking=input.throttle!==0&&Math.sign(input.throttle)!==Math.sign(longitudinal)&&Math.abs(longitudinal)>0.8;
    const power=1-Math.max(0,this.damage-50)/50*.25;
    const acceleration=braking?24:(input.throttle<0?8:12)*power;
    longitudinal+=input.throttle*acceleration*dt;
    longitudinal*=Math.exp(-(this.onRoad?.16:1.2)*dt);
    if(input.handbrake) longitudinal*=Math.exp(-1.35*dt);
    longitudinal=THREE.MathUtils.clamp(longitudinal,-9,(this.onRoad?36:14)*power);
    lateral*=Math.exp(-(input.handbrake?1.4:this.onRoad?5.2:7)*dt);
    this.heading+=this.steering*longitudinal*(.08/(1+Math.abs(longitudinal)*.045))*dt*(input.handbrake?1.6:1);
    this.velocity.copy(forward).multiplyScalar(longitudinal).addScaledVector(right,lateral);
    let remaining=dt;
    for(let iteration=0;iteration<3&&remaining>0;iteration++) {
      const destination=this.position.clone().addScaledVector(this.velocity,remaining);
      const hit=collisions?.sweep(this.position,destination);
      if(!hit) {this.position.copy(destination);break;}
      if(hit.collider.kind==='snowPole' && this.velocity.lengthSq()>1e-6) {
        hit.collider.active=false;
        hit.collider.onHit?.(this.velocity.clone());
        // Flexible markers yield to the car, without the bounce or damage of solid scenery.
        this.velocity.multiplyScalar(.995);
        continue;
      }
      const relativeVelocity=this.velocity.clone().sub(hit.collider.velocity??new THREE.Vector3());
      const inward=-relativeVelocity.dot(hit.normal);
      if(inward<=0&&hit.time===0) {this.position.copy(destination);break;}
      this.position.lerp(destination,Math.max(0,hit.time-.001)).addScaledVector(hit.normal,.035);
      if(inward>0) {
        if(this.age-(this.contacts.get(hit.collider.id)??-Infinity)>.65) {
          const damage=impactDamage(inward,hit.collider.kind);
          this.damage=Math.min(100,this.damage+damage); this.contacts.set(hit.collider.id,this.age);
          hit.collider.onHit?.(this.velocity.clone());
          this.impact=Math.min(1,inward/15);
          this.heading+=(hit.normal.x*forward.z-hit.normal.z*forward.x)*Math.min(.3,inward*.012);
        }
        this.velocity.addScaledVector(hit.normal,inward*1.12).multiplyScalar(.7);
      }
      remaining*=1-hit.time;
    }
    this.position.y=this.course.height(this.position.x,this.position.z);
    this.forwardSpeed=this.velocity.dot(forward);
    this.syncMesh();
    for(const wheel of this.wheels) {
      wheel.rotation.y=wheel.position.z>0?this.steering*.35:0;
      for(const child of wheel.children) child.rotation.x+=this.forwardSpeed*dt/.43;
    }
    this.panels[0].scale.x=1-this.damage*.0012;
    this.panels[1].rotation.x=-this.damage*.002;
    this.panels[1].position.y=1.13+this.damage*.0015;
    this.smoke.visible=this.damage>50;
    this.smoke.children.forEach((puff,i)=> {
      const phase=(this.age*.6+i/asset.smokeCount)%1;
      puff.position.set(Math.sin(i*2+this.age)*phase*.5,1.2+phase*3,1.2+phase*.5);
      puff.scale.setScalar(.4+phase*1.9);
    });
  }

  private syncMesh(): void {
    this.mesh.position.copy(this.position).y += 0.12;
    this.mesh.rotation.set(0, this.heading, 0);
    const dx = Math.sin(this.heading); const dz = Math.cos(this.heading);
    this.mesh.rotation.x = -Math.atan((this.course.height(this.position.x + dx, this.position.z + dz) - this.course.height(this.position.x - dx, this.position.z - dz)) / 2);
    this.mesh.rotation.z = Math.atan((this.course.height(this.position.x + dz, this.position.z - dx) - this.course.height(this.position.x - dz, this.position.z + dx)) / 2) + this.steering * Math.min(Math.abs(this.forwardSpeed) * 0.002, 0.045);
  }
}
