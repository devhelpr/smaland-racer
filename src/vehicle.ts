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
    const paint = new THREE.MeshStandardMaterial({ color: '#e9ad48', roughness: 0.66, metalness: 0.12 });
    const trim = new THREE.MeshStandardMaterial({ color: '#233632', roughness: 0.7 });
    const glass = new THREE.MeshStandardMaterial({ color: '#71999e', roughness: 0.23, metalness: 0.3 });
    const white = new THREE.MeshStandardMaterial({ color: '#eee8d7' });
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z); mesh.castShadow = true; this.mesh.add(mesh); return mesh;
    };
    this.panels.push(box(1.85, 0.55, 3.9, 0, 0.83, 0, paint));
    this.panels.push(box(1.75, 0.1, 1.1, 0, 1.13, 1.25, paint));
    box(1.57, 0.65, 1.85, 0, 1.4, -0.25, glass);
    box(1.64, 0.12, 1.92, 0, 1.77, -0.25, paint);
    for (const x of [-0.78, 0.78]) {
      box(0.09, 0.72, 0.12, x, 1.4, 0.64, paint);
      box(0.09, 0.72, 0.12, x, 1.4, -1.14, paint);
      box(0.08, 0.65, 0.1, x, 1.4, -0.3, paint);
    }
    box(1.95, 0.16, 0.18, 0, 0.6, 1.99, trim);
    box(1.95, 0.16, 0.18, 0, 0.6, -1.99, trim);
    box(0.65, 0.2, 0.04, 0, 0.83, -1.963, white);
    const lamp = new THREE.MeshStandardMaterial({ color: '#fff0bf', emissive: '#c4a76c', emissiveIntensity: 0.35 });
    const red = new THREE.MeshStandardMaterial({ color: '#b64032' });
    for (const x of [-0.65, 0.65]) {
      box(0.37, 0.22, 0.06, x, 0.94, 1.97, lamp);
      box(0.28, 0.2, 0.06, x, 0.94, -1.97, red);
    }
    for (const x of [-0.95, 0.95]) for (const z of [-1.22, 1.22]) {
      const pivot = new THREE.Group(); pivot.position.set(x, 0.48, z);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.28, 10), trim);
      tire.rotation.z = Math.PI / 2; tire.castShadow = true; pivot.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.29, 8), white);
      hub.rotation.z = Math.PI / 2; pivot.add(hub);
      this.mesh.add(pivot); this.wheels.push(pivot);
    }
    const smokeMaterial = new THREE.MeshBasicMaterial({color: '#555c56', transparent: true, opacity: 0.35, depthWrite: false});
    const smokeGeometry = new THREE.IcosahedronGeometry(0.3, 0);
    for(let i=0;i<7;i++) this.smoke.add(new THREE.Mesh(smokeGeometry,smokeMaterial));
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
      const inward=-this.velocity.dot(hit.normal);
      if(inward<=0&&hit.time===0) {this.position.copy(destination);break;}
      this.position.lerp(destination,Math.max(0,hit.time-.001)).addScaledVector(hit.normal,.035);
      if(inward>0) {
        if(this.age-(this.contacts.get(hit.collider.id)??-Infinity)>.65) {
          const damage=impactDamage(inward,hit.collider.kind);
          this.damage=Math.min(100,this.damage+damage); this.contacts.set(hit.collider.id,this.age);
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
      const phase=(this.age*.6+i/7)%1;
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
