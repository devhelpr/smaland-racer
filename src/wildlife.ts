import placement from '../parcours/wildlife.json' with { type: 'json' };
import asset from '../assets/wildlife.json' with { type: 'json' };
import * as THREE from 'three';
import { Course, randomGenerator } from './track.ts';
import type { Collider, CollisionWorld } from './collision.ts';

export interface WildlifePlan { progress: number; species: 'moose'|'deer'; side: number; speed: number; delay: number }
export function wildlifePlan(course: Course,seed: number): WildlifePlan[] {
  const random=randomGenerator(seed);
  return Array.from({length:course.definition.wildlifeCount},(_,i)=> {
    const progress=placement.start+(i+random()*placement.jitter)/course.definition.wildlifeCount*placement.span;
    const species=random()<placement.mooseProbability?'moose':'deer';
    return {progress,species,side:random()<placement.sideProbability?-1:1,speed:species==='moose'?placement.mooseSpeed+random()*placement.mooseSpeedRange:placement.deerSpeed+random()*placement.deerSpeedRange,delay:random()*placement.delayRange};
  });
}
interface Animal { plan: WildlifePlan; mesh: THREE.Group; legs: THREE.Mesh[]; collider: Collider; offset: number; state: 'waiting'|'crossing'|'fleeing'|'gone'; activated: boolean; timer: number; stride: number }

function animalMesh(species: 'moose'|'deer'): {mesh:THREE.Group;legs:THREE.Mesh[]} {
  const mesh=new THREE.Group(); const legs: THREE.Mesh[]=[];
  const moose=species==='moose'; const scale=moose?1:asset.deerScale;
  const fur=new THREE.MeshStandardMaterial({color:moose?asset.mooseColor:asset.deerColor,...asset.fur});
  const pale=new THREE.MeshStandardMaterial(asset.pale);
  const dark=new THREE.MeshStandardMaterial(asset.dark);
  const part=(w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material=fur)=> {
    const p=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);p.position.set(x,y,z);p.castShadow=true;mesh.add(p);return p;
  };
  part(...asset.body as [number, number, number, number, number, number]);part(...asset.neck as [number, number, number, number, number, number]);part(...asset.head as [number, number, number, number, number, number]);
  part(...asset.muzzle as [number, number, number, number, number, number]);part(...asset.leftEye as [number, number, number, number, number, number],dark);part(...asset.rightEye as [number, number, number, number, number, number],dark);
  for(const side of [-1,1]) {
    for(const z of asset.legZ) legs.push(part(...asset.legSize as [number, number, number],side*asset.legX,asset.legHeight,z));
    const ear=part(...asset.earSize as [number, number, number],side*asset.earX,...asset.earYZ as [number, number]);ear.rotation.z=-side*asset.earAngle;
    if(moose) {
      const antler=part(...asset.antlerSize as [number, number, number],side*asset.antlerX,...asset.antlerYZ as [number, number],pale);antler.rotation.z=side*asset.antlerAngle;
      for(let i=0;i<asset.tineCount;i++) {const tine=part(...asset.tineSize as [number, number, number],side*(asset.tineX+i*asset.tineSpacingX),asset.tineHeight+i*asset.tineSpacingY,asset.tineZ,pale);tine.rotation.z=-side*asset.tineAngle;}
    }
  }
  part(...asset.tail as [number, number, number, number, number, number],moose?fur:pale);mesh.scale.setScalar(scale);
  return {mesh,legs};
}

export class Wildlife {
  readonly animals: Animal[]=[];
  readonly course: Course;
  readonly collisions: CollisionWorld;
  constructor(course:Course,collisions:CollisionWorld,group:THREE.Group,seed:number) {
    this.course=course;this.collisions=collisions;
    for(const [index,plan] of wildlifePlan(course,seed).entries()) {
      const offset=plan.side*(course.definition.width/2+placement.vergeOffset);
      const {mesh,legs}=animalMesh(plan.species);
      const collider:Collider={id:`animal-${index}`,x:0,z:0,radius:asset.colliderRadii[plan.species],kind:plan.species,active:true};
      const animal:Animal={plan,mesh,legs,collider,offset,state:'waiting',activated:false,timer:0,stride:0};
      this.animals.push(animal);collisions.dynamic.push(collider);group.add(mesh);this.positionAnimal(animal);
      this.addSign(group,Math.max(placement.signMinProgress,plan.progress-placement.signDistance/course.length));
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
    const sample=this.course.sample(progress);const side=this.course.definition.width/2+placement.signRoadOffset;
    const sign=new THREE.Group();
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(...asset.signPoleGeometry as [number, number, number, number]),new THREE.MeshStandardMaterial(asset.signPoleMaterial));pole.position.y=asset.signPoleHeight;sign.add(pole);
    const shape=new THREE.Shape();shape.moveTo(...asset.signTop as [number, number]);shape.lineTo(...asset.signLeft as [number, number]);shape.lineTo(...asset.signRight as [number, number]);shape.closePath();
    const triangle=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({...asset.triangle,side:THREE.DoubleSide}));triangle.position.y=asset.signHeight;sign.add(triangle);
    const inside=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({...asset.inside,side:THREE.DoubleSide}));inside.scale.setScalar(asset.signInsetScale);inside.position.set(...asset.signInsetPosition as [number,number,number]);sign.add(inside);
    // Simple dark antlered silhouette, readable without language-specific text.
    const ink=new THREE.MeshBasicMaterial({...asset.ink,side:THREE.DoubleSide});
    for(const [w,h,x,y] of asset.signSilhouette) {
      const part=new THREE.Mesh(new THREE.PlaneGeometry(w,h),ink);part.position.set(x,y,asset.signInkDepth);sign.add(part);
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
