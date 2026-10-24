import * as THREE from 'three';
import { Course, randomGenerator } from './track.ts';
import type { Collider, CollisionWorld } from './collision.ts';

export interface WildlifePlan { progress: number; species: 'moose'|'deer'; side: number; speed: number; delay: number }
export function wildlifePlan(course: Course,seed: number): WildlifePlan[] {
  const random=randomGenerator(seed);
  return Array.from({length:course.definition.wildlifeCount},(_,i)=> {
    const progress=.16+(i+random()*.45)/course.definition.wildlifeCount*.69;
    const species=random()<.4?'moose':'deer';
    return {progress,species,side:random()<.5?-1:1,speed:species==='moose'?7+random()*2:9+random()*3,delay:random()*.7};
  });
}
interface Animal { plan: WildlifePlan; mesh: THREE.Group; legs: THREE.Mesh[]; collider: Collider; offset: number; state: 'waiting'|'crossing'|'fleeing'|'gone'; activated: boolean; timer: number; stride: number }

function animalMesh(species: 'moose'|'deer'): {mesh:THREE.Group;legs:THREE.Mesh[]} {
  const mesh=new THREE.Group(); const legs: THREE.Mesh[]=[];
  const moose=species==='moose'; const scale=moose?1:0.65;
  const fur=new THREE.MeshStandardMaterial({color:moose?'#665440':'#a47b4d',roughness:1});
  const pale=new THREE.MeshStandardMaterial({color:'#e4d5ae',roughness:1});
  const dark=new THREE.MeshStandardMaterial({color:'#242c24'});
  const part=(w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material=fur)=> {
    const p=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);p.position.set(x,y,z);p.castShadow=true;mesh.add(p);return p;
  };
  part(.85,1,2,0,1.65,0);part(.55,1.1,.65,0,2.05,.95);part(.62,.6,.9,0,2.55,1.25);
  part(.5,.3,.55,0,2.35,1.7);part(.15,.12,.12,-.32,2.65,1.42,dark);part(.15,.12,.12,.32,2.65,1.42,dark);
  for(const side of [-1,1]) {
    for(const z of [-.7,.7]) legs.push(part(.19,1.2,.22,side*.3,.65,z));
    const ear=part(.23,.5,.22,side*.42,2.95,1.1);ear.rotation.z=-side*.55;
    if(moose) {
      const antler=part(.95,.13,.12,side*.7,3.18,1.1,pale);antler.rotation.z=side*.25;
      for(let i=0;i<3;i++) {const tine=part(.13,.45,.12,side*(.65+i*.22),3.38+i*.04,1.1,pale);tine.rotation.z=-side*.3;}
    }
  }
  part(.24,.25,.35,0,1.95,-1.12,moose?fur:pale);mesh.scale.setScalar(scale);
  return {mesh,legs};
}

export class Wildlife {
  readonly animals: Animal[]=[];
  readonly course: Course;
  readonly collisions: CollisionWorld;
  constructor(course:Course,collisions:CollisionWorld,group:THREE.Group,seed:number) {
    this.course=course;this.collisions=collisions;
    for(const [index,plan] of wildlifePlan(course,seed).entries()) {
      const offset=plan.side*(course.definition.width/2+5);
      const {mesh,legs}=animalMesh(plan.species);
      const collider:Collider={id:`animal-${index}`,x:0,z:0,radius:plan.species==='moose'?1.2:.8,kind:plan.species,active:true};
      const animal:Animal={plan,mesh,legs,collider,offset,state:'waiting',activated:false,timer:0,stride:0};
      this.animals.push(animal);collisions.dynamic.push(collider);group.add(mesh);this.positionAnimal(animal);
      this.addSign(group,Math.max(.02,plan.progress-55/course.length));
    }
  }
  private positionAnimal(animal:Animal): void {
    const center=this.course.sample(animal.plan.progress);
    const x=center.point.x-center.tangent.z*animal.offset;
    const z=center.point.z+center.tangent.x*animal.offset;
    // The model faces +Z; decreasing offset moves along (tangent.z, -tangent.x) * side.
    animal.mesh.rotation.y=Math.atan2(center.tangent.z*animal.plan.side,-center.tangent.x*animal.plan.side);
    animal.mesh.position.set(x,this.course.height(x,z),z);animal.collider.x=x;animal.collider.z=z;
  }
  private addSign(group:THREE.Group,progress:number): void {
    const sample=this.course.sample(progress);const side=this.course.definition.width/2+1.5;
    const sign=new THREE.Group();
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,2.5,6),new THREE.MeshStandardMaterial({color:'#9a9e91'}));pole.position.y=1.25;sign.add(pole);
    const shape=new THREE.Shape();shape.moveTo(0,.65);shape.lineTo(-.65,-.45);shape.lineTo(.65,-.45);shape.closePath();
    const triangle=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:'#c65d41',side:THREE.DoubleSide}));triangle.position.y=2.4;sign.add(triangle);
    const inside=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:'#f5d878',side:THREE.DoubleSide}));inside.scale.setScalar(.8);inside.position.set(0,2.4,.015);sign.add(inside);
    // Simple dark antlered silhouette, readable without language-specific text.
    const ink=new THREE.MeshBasicMaterial({color:'#263c31',side:THREE.DoubleSide});
    for(const [w,h,x,y] of [[.34,.16,0,2.34],[.12,.25,.17,2.44],[.04,.19,-.12,2.19],[.04,.19,.12,2.19],[.3,.035,.19,2.58]]) {
      const part=new THREE.Mesh(new THREE.PlaneGeometry(w,h),ink);part.position.set(x,y,.025);sign.add(part);
    }
    sign.position.copy(sample.point).add(new THREE.Vector3(-sample.tangent.z*side,0,sample.tangent.x*side));sign.position.y=this.course.height(sign.position.x,sign.position.z);
    sign.rotation.y=Math.atan2(-sample.tangent.x,-sample.tangent.z);group.add(sign);
  }
  update(dt:number,carPosition:THREE.Vector3,carSpeed:number): void {
    const carProgress=this.course.nearest(carPosition.x,carPosition.z).progress;
    for(const animal of this.animals) {
      if(animal.state==='gone') continue;
      animal.timer+=dt;
      const center=this.course.sample(animal.plan.progress);
      // Trigger with at least 55 m of approach; never materialize an animal on the road.
      const approach=(animal.plan.progress-carProgress)*this.course.length;
      if(!animal.activated&&approach>0&&approach<Math.max(55,Math.abs(carSpeed)*2.1)&&carPosition.distanceTo(center.point)<100) {
        animal.activated=true;animal.timer=0;
      }
      if(animal.state==='waiting'&&animal.activated&&animal.timer>=animal.plan.delay) {animal.state='crossing';animal.timer=0;}
      if(animal.state==='crossing'||animal.state==='fleeing') {
        const speed=animal.plan.speed*(animal.state==='fleeing'?1.6:1);
        animal.offset-=animal.plan.side*speed*dt;
        animal.stride+=speed*dt*1.9;
        animal.mesh.rotation.z=0;
        if(animal.offset*animal.plan.side<-(this.course.definition.width/2+4)) animal.state='fleeing';
        if(Math.abs(animal.offset)>25) {animal.state='gone';animal.mesh.visible=false;animal.collider.active=false;}
        animal.legs.forEach((leg,i)=>leg.rotation.x=Math.sin(animal.stride+((i===0||i===3)?0:Math.PI))*.55);
        this.positionAnimal(animal);
      } else animal.mesh.rotation.z=Math.sin(animal.timer*1.7)*.02;
      if(carPosition.distanceTo(animal.mesh.position)<2.6&&Math.abs(carSpeed)>2) animal.state='fleeing';
    }
  }
}
