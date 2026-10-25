import * as THREE from 'three';
import data from '../assets/stunts.json' with { type: 'json' };
import vehicle from '../assets/vehicle.json' with { type: 'json' };
import type { DrivingWorld } from './driving-world.ts';
import type { CollisionWorld } from './collision.ts';

interface Probe { point:THREE.Vector3; wheel:boolean }
const probes:Probe[]=[];
for(const x of vehicle.wheelX)for(const z of vehicle.wheelZ)
  probes.push({point:new THREE.Vector3(x,-data.centerOfMassHeight,z),wheel:true});
const bounds=data.bodyContactBounds;
for(const y of [bounds.min[1],bounds.max[1]])
  for(let x=0;x<bounds.samplesX;x++)for(let z=0;z<bounds.samplesZ;z++)
    probes.push({point:new THREE.Vector3(THREE.MathUtils.lerp(bounds.min[0],bounds.max[0],x/(bounds.samplesX-1)),y-data.centerOfMassHeight,THREE.MathUtils.lerp(bounds.min[2],bounds.max[2],z/(bounds.samplesZ-1))),wheel:false});
const reach=Math.hypot(Math.max(...vehicle.wheelX.map(Math.abs)),Math.max(...vehicle.wheelZ.map(Math.abs)));
const up=new THREE.Vector3(0,1,0);

/** A contact-driven rigid body: wheel and hull impulses create lift and rotation. */
export class StuntDynamics {
  readonly rotation=new THREE.Quaternion();
  readonly angularVelocity=new THREE.Vector3();
  active=false;
  airborne=false;
  wheelsOnGround=4;
  private lastHeading=0;
  private damageAfter=0;
  private age=0;
  private overturnedStillTime=0;

  get autoRightReady():boolean {return this.overturnedStillTime+1e-9>=data.autoRight.delay;}

  get upright():number {return up.clone().applyQuaternion(this.rotation).y;}
  get traction():number {return this.active?this.wheelsOnGround/4*Math.max(0,this.upright):1;}

  /** Keep steering and the chase camera aligned with the car after a tumbling landing. */
  groundedHeading():number|null {
    if(!this.active||this.traction===0)return null;
    const forward=new THREE.Vector3(0,0,1).applyQuaternion(this.rotation);
    if(Math.hypot(forward.x,forward.z)<.1)return null;
    this.lastHeading=Math.atan2(forward.x,forward.z);
    return this.lastHeading;
  }

  reset():void {
    this.active=false;this.airborne=false;this.wheelsOnGround=4;
    this.rotation.identity();this.angularVelocity.set(0,0,0);this.damageAfter=0;this.age=0;this.overturnedStillTime=0;
  }

  placeUpright(heading:number):void {
    this.reset();this.active=true;this.lastHeading=heading;
    this.rotation.setFromAxisAngle(up,heading);
  }

  private inverseInertia(torque:THREE.Vector3):THREE.Vector3 {
    return torque.clone().applyQuaternion(this.rotation.clone().invert())
      .divide(new THREE.Vector3(...data.inertia as [number,number,number])).applyQuaternion(this.rotation);
  }

  applyTireImpulse(impulse:THREE.Vector3):void {
    if(!this.active||this.traction===0)return;
    const lever=new THREE.Vector3(0,-data.centerOfMassHeight,0).applyQuaternion(this.rotation);
    this.angularVelocity.addScaledVector(this.inverseInertia(lever.cross(impulse)),data.tireTorqueScale);
  }

  update(dt:number,position:THREE.Vector3,velocity:THREE.Vector3,heading:number,course:DrivingWorld,world?:CollisionWorld):number {
    this.age+=dt;
    const nearRock=world?.hasRockNear(position.x,position.z,reach)??false;
    if(!this.active) {
      if(!nearRock)return 0;
      const dx=Math.sin(heading),dz=Math.cos(heading);
      const pitch=-Math.atan((course.heightAt(position.x+dx,position.z+dz)-course.heightAt(position.x-dx,position.z-dz))/2);
      const roll=Math.atan((course.heightAt(position.x+dz,position.z-dx)-course.heightAt(position.x-dz,position.z+dx))/2);
      this.rotation.setFromEuler(new THREE.Euler(pitch,heading,roll,'YXZ'));
      this.lastHeading=heading;this.active=true;
    }
    this.rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(up,heading-this.lastHeading));
    this.lastHeading=heading;
    velocity.y-=data.gravity*dt;
    position.y+=velocity.y*dt;
    const spin=this.angularVelocity.length();
    if(spin>0)this.rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(this.angularVelocity.clone().divideScalar(spin),spin*dt)).normalize();
    const wheels=new Set<number>();let bodyContact=false,anyContact=false,maxLandingSpeed=0,maxBodySpeed=0;
    for(let iteration=0;iteration<data.solverIterations;iteration++) {
      for(const [index,probe] of probes.entries()) {
        const offset=probe.point.clone().applyQuaternion(this.rotation);
        const point=position.clone().add(offset);point.y+=data.centerOfMassHeight;
        const ground=course.heightAt(point.x,point.z);
        const normal=new THREE.Vector3(course.heightAt(point.x-.5,point.z)-course.heightAt(point.x+.5,point.z),1,course.heightAt(point.x,point.z-.5)-course.heightAt(point.x,point.z+.5)).normalize();
        const surface=world?.surfaceAt(point.x,point.z,ground,normal)??{height:ground,normal,rock:false};
        const penetration=(surface.height-point.y)*surface.normal.y;
        if(penetration < -data.contactSlop)continue;
        const contactVelocity=velocity.clone().add(this.angularVelocity.clone().cross(offset));
        const approach=contactVelocity.dot(surface.normal);
        // A rising wheel at the edge of a ramp releases naturally into free flight.
        if(approach>0&&penetration<=0)continue;
        anyContact=true;
        if(probe.wheel&&this.upright>data.wheelContactMinimumUp)wheels.add(index);
        else if(!probe.wheel)bodyContact=true;
        maxLandingSpeed=Math.max(maxLandingSpeed,-velocity.y);
        if(!probe.wheel)maxBodySpeed=Math.max(maxBodySpeed,-approach);
        const torque=offset.clone().cross(surface.normal);
        const angularResponse=this.inverseInertia(torque);
        const denominator=1+surface.normal.dot(angularResponse.clone().cross(offset));
        const bounce=approach < -data.bounceThreshold?data.restitution:0;
        const bias=Math.min(data.maxBiasSpeed,data.contactBias*Math.max(0,penetration-data.contactSlop)/dt);
        const impulse=Math.max(0,(-(1+bounce)*approach+bias)/denominator);
        velocity.addScaledVector(surface.normal,impulse);
        this.angularVelocity.addScaledVector(angularResponse,impulse);
        if(penetration>data.contactSlop)position.addScaledVector(surface.normal,Math.min(data.maxCorrection,(penetration-data.contactSlop)*data.positionCorrection));
      }
    }
    this.wheelsOnGround=wheels.size;this.airborne=!anyContact;
    this.angularVelocity.multiplyScalar(Math.exp(-(anyContact?data.angularGroundDrag:data.angularAirDrag)*dt));
    if(bodyContact) {
      const friction=Math.exp(-data.bodyDrag*data.surfaceFriction*dt);
      velocity.x*=friction;velocity.z*=friction;
    }
    let damage=0;
    if(anyContact&&this.age>=this.damageAfter) {
      damage=Math.max(0,maxLandingSpeed-data.landingDamageThreshold)**1.4*data.landingDamageScale+
        Math.max(0,maxBodySpeed-data.landingDamageThreshold)**1.4*data.bodyDamageScale;
      if(damage>0)this.damageAfter=this.age+data.damageCooldown;
    }
    const ground=course.heightAt(position.x,position.z);
    if(!nearRock&&this.wheelsOnGround>=3&&this.upright>data.settleUp&&Math.abs(position.y-ground)<data.settleHeight&&Math.abs(velocity.y)<data.settleSpeed&&this.angularVelocity.length()<data.settleAngularSpeed) {
      this.active=false;this.airborne=false;this.wheelsOnGround=4;velocity.y=0;
      position.y=ground;this.angularVelocity.set(0,0,0);
    }
    const stillOverturned=this.active&&!this.airborne&&this.upright<=data.autoRight.maximumUp&&
      velocity.length()<=data.autoRight.maximumLinearSpeed&&this.angularVelocity.length()<=data.autoRight.maximumAngularSpeed;
    this.overturnedStillTime=stillOverturned?this.overturnedStillTime+dt:0;
    return damage;
  }
}
