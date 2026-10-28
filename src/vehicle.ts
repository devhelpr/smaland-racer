import materialAsset from '../assets/materials/vehicle.json' with { type: 'json' };
import { VehicleLighting } from './lighting.ts';
import { StuntDynamics } from './stunts.ts';
import stuntAsset from '../assets/stunts.json' with { type: 'json' };
import { drivingProfiles, type DrivingStyle, type DrivingProfiles } from './driving.ts';
import asset from '../assets/vehicle.json' with { type: 'json' };
import * as THREE from 'three';
import type { DrivingWorld } from './driving-world.ts';
import { CAR_RADIUS, CollisionWorld, impactDamage } from './collision.ts';
import trafficPhysics from '../assets/traffic-physics.json' with { type: 'json' };
import type { DriveInput } from './input.ts';

export class Vehicle {
  readonly mesh = new THREE.Group();
  readonly lighting: VehicleLighting;
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly stunts = new StuntDynamics();
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

  readonly course: DrivingWorld;
  readonly drivingStyle: DrivingStyle;
  readonly profiles: DrivingProfiles;
  constructor(course: DrivingWorld, drivingStyle: DrivingStyle = 'cruising', profiles: DrivingProfiles = drivingProfiles) {
    this.profiles=profiles;
    this.drivingStyle=drivingStyle;
    this.course=course;
    const paint = new THREE.MeshStandardMaterial(materialAsset.paint);
    const trim = new THREE.MeshStandardMaterial(materialAsset.trim);
    const glass = new THREE.MeshStandardMaterial(materialAsset.glass);
    const white = new THREE.MeshStandardMaterial(materialAsset.white);
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
    const lamp = new THREE.MeshStandardMaterial(materialAsset.lamp);
    const red = new THREE.MeshStandardMaterial(materialAsset.red);
    for (const x of asset.lampX) {
      box(...asset.headlampSize as [number, number, number], x, ...asset.headlampYZ as [number, number], lamp);
      box(...asset.tailLampSize as [number, number, number], x, ...asset.tailLampYZ as [number, number], red);
    }
    this.lighting = new VehicleLighting(lamp, red);
    this.mesh.add(this.lighting.root);
    for (const x of asset.wheelX) for (const z of asset.wheelZ) {
      const pivot = new THREE.Group(); pivot.position.set(x, asset.wheelHeight, z);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(...asset.tire as [number, number, number, number]), trim);
      tire.rotation.z = Math.PI / 2; tire.castShadow = true; pivot.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(...asset.hub as [number, number, number, number]), white);
      hub.rotation.z = Math.PI / 2; pivot.add(hub);
      this.mesh.add(pivot); this.wheels.push(pivot);
    }
    const smokeMaterial = new THREE.MeshBasicMaterial(materialAsset.smokeMaterial);
    const smokeGeometry = new THREE.IcosahedronGeometry(...asset.smokeGeometry as [number, number]);
    for(let i=0;i<asset.smokeCount;i++) this.smoke.add(new THREE.Mesh(smokeGeometry,smokeMaterial));
    this.mesh.add(this.smoke);
    // Rotate the model around its center of mass, including during a full rollover.
    const body=new THREE.Group();body.add(...this.mesh.children);
    body.position.y=-stuntAsset.centerOfMassHeight;this.mesh.add(body);
    this.restart();
  }

  restart(): void {
    this.damage=0; this.impact=0; this.age=0; this.contacts.clear();
    const start=this.course.spawn; this.recover(start.point,start.tangent,false);
  }

  recover(point: THREE.Vector3, tangent: THREE.Vector3, advance=true): void {
    this.position.copy(point).addScaledVector(tangent,advance?1.8:0);
    this.position.y=this.course.heightAt(this.position.x,this.position.z);
    this.heading=Math.atan2(tangent.x,tangent.z);
    this.stunts.reset();
    this.velocity.set(0,0,0); this.forwardSpeed=0; this.steering=0; this.onRoad=true; this.contacts.clear(); this.syncMesh();
  }

  /** Right the car at its current X/Z, retaining damage and its facing direction. */
  rightInPlace(collisions?:CollisionWorld):void {
    const sin=Math.sin(this.heading),cos=Math.cos(this.heading);
    let support=this.course.heightAt(this.position.x,this.position.z);
    // Clear stones under either axle or the chassis without shifting sideways.
    const points=[[0,0],...asset.wheelX.flatMap(x=>asset.wheelZ.map(z=>[x,z]))];
    for(const [x,z] of points) {
      const worldX=this.position.x+x*cos+z*sin,worldZ=this.position.z-x*sin+z*cos;
      const terrain=this.course.heightAt(worldX,worldZ);
      support=Math.max(support,collisions?.surfaceAt(worldX,worldZ,terrain).height??terrain);
    }
    this.position.y=Math.max(this.position.y,support);
    this.velocity.set(0,0,0);this.forwardSpeed=0;this.steering=0;this.impact=0;this.contacts.clear();
    this.onRoad=['gravel','asphalt','ice'].includes(this.course.surfaceAt(this.position.x,this.position.z));
    this.stunts.placeUpright(this.heading);this.syncMesh();
  }

  update(dt: number, input: DriveInput, collisions?: CollisionWorld): void {
    this.age+=dt; this.impact=Math.max(0,this.impact-dt*2.5);
    this.onRoad=['gravel','asphalt','ice'].includes(this.course.surfaceAt(this.position.x,this.position.z));
    const forward=new THREE.Vector3(Math.sin(this.heading),0,Math.cos(this.heading));
    const right=new THREE.Vector3(Math.cos(this.heading),0,-Math.sin(this.heading));
    let longitudinal=this.velocity.dot(forward); let lateral=this.velocity.dot(right);
    const profile=this.profiles[this.drivingStyle];
    const handling=profile.handling;
    this.steering=THREE.MathUtils.damp(this.steering,input.steer,handling.steeringResponse,dt);
    const braking=input.throttle!==0&&Math.sign(input.throttle)!==Math.sign(longitudinal)&&Math.abs(longitudinal)>0.8;
    const power=1-Math.max(0,this.damage-50)/50*.25;
    const ice=this.course.surfaceAt(this.position.x,this.position.z)==='ice';
    const surface=ice?this.profiles.ice:this.onRoad?profile.road:profile.grass;
    const traction=this.stunts.traction;
    const verticalSpeed=this.velocity.y;
    const previousVelocity=this.velocity.clone();
    const acceleration=braking?profile.braking*(ice?this.profiles.ice.brakingScale:1):(input.throttle<0?profile.reverseAcceleration:profile.acceleration)*power*(ice?this.profiles.ice.accelerationScale:1);
    // Cursor-key assistance eases into a slide at speed without holding the full handbrake.
    const autoDrift=input.autoDrift&&input.throttle>0&&input.steer!==0
      ?handling.autoDriftStrength*THREE.MathUtils.clamp((longitudinal-handling.autoDriftMinSpeed)/handling.autoDriftFadeInSpeed,0,1):0;
    const topSpeed=(ice?profile.road.speed:surface.speed)*power;
    const driven=longitudinal+input.throttle*acceleration*traction*dt;
    // Surface limits constrain engine power; existing momentum decays through drag.
    longitudinal=THREE.MathUtils.clamp(driven,Math.min(-profile.reverseSpeed,longitudinal),Math.max(topSpeed,longitudinal));
    longitudinal*=Math.exp(-(surface.drag*traction+stuntAsset.airDrag*(1-traction))*dt);
    if(input.handbrake&&traction>0) longitudinal*=Math.exp(-(ice?this.profiles.ice.handbrakeDrag:handling.handbrakeDrag)*dt);
    if(!input.handbrake&&autoDrift>0&&traction>0)longitudinal*=Math.exp(-handling.autoDriftDrag*autoDrift*dt);
    const normalGrip=surface.grip/handling.drift;
    const slideGrip=Math.min(handling.handbrakeGrip,normalGrip);
    const lateralDrag=(input.handbrake?Math.min(handling.handbrakeGrip,surface.grip):THREE.MathUtils.lerp(normalGrip,slideGrip,autoDrift))*traction+stuntAsset.airDrag*(1-traction);
    lateral*=Math.exp(-lateralDrag*dt);
    this.heading+=this.steering*longitudinal*traction*(handling.steeringStrength/(1+Math.abs(longitudinal)*handling.speedSensitivity))*dt*(input.handbrake?handling.handbrakeTurn:THREE.MathUtils.lerp(1,handling.handbrakeTurn,autoDrift));
    this.velocity.copy(forward).multiplyScalar(longitudinal).addScaledVector(right,lateral);
    this.velocity.y=verticalSpeed;
    this.stunts.applyTireImpulse(this.velocity.clone().sub(previousVelocity));
    let remaining=dt;
    const pushed=new Set<string>();
    const bodyAxis=new THREE.Vector3(Math.sin(this.heading),0,Math.cos(this.heading));
    const probes=[0,asset.frontBumper[5]+asset.frontBumper[2]/2-CAR_RADIUS,asset.rearBumper[5]-asset.rearBumper[2]/2+CAR_RADIUS];
    for(let iteration=0;iteration<3&&remaining>0;iteration++) {
      const destination=this.position.clone().addScaledVector(this.velocity,remaining);
      destination.y=this.position.y;
      let hit:ReturnType<CollisionWorld['sweep']>=null;
      let contactOffset=0;
      if(collisions)for(const offset of probes) {
        const probe=bodyAxis.clone().multiplyScalar(offset);
        const candidate=collisions.sweep(this.position.clone().add(probe),destination.clone().add(probe),true);
        if(candidate&&(!hit||candidate.time<hit.time)) {hit=candidate;contactOffset=offset;}
      }
      if(!hit) {this.position.copy(destination);break;}
      if(hit.collider.kind==='snowPole' && this.velocity.lengthSq()>1e-6) {
        hit.collider.active=false;
        hit.collider.onHit?.(this.velocity.clone());
        // Flexible markers yield to the car, without the bounce or damage of solid scenery.
        this.velocity.multiplyScalar(.995);
        continue;
      }
      const contactPoint=this.position.clone().lerp(destination,hit.time).addScaledVector(bodyAxis,contactOffset).addScaledVector(hit.normal,-CAR_RADIUS);
      const relativeVelocity=this.velocity.clone().sub(hit.collider.velocity??new THREE.Vector3());
      const spin=hit.collider.angularVelocity??0;
      relativeVelocity.x-=spin*(contactPoint.z-hit.collider.z);
      relativeVelocity.z+=spin*(contactPoint.x-hit.collider.x);
      const inward=-relativeVelocity.dot(hit.normal);
      if(inward<=0&&hit.time===0) {this.position.copy(destination);break;}
      const softTraffic=hit.collider.kind==='aTractor'&&inward<=trafficPhysics.contact.softSpeed;
      this.position.lerp(destination,Math.max(0,hit.time-.001)).addScaledVector(hit.normal,softTraffic?trafficPhysics.contact.separation:.035);
      if(inward>0) {
        let impulseResponse:number|void=undefined;
        if(!pushed.has(hit.collider.id)) {
          impulseResponse=hit.collider.onPush?.(relativeVelocity,hit.normal,dt,contactPoint);
          pushed.add(hit.collider.id);
        }
        if(this.age-(this.contacts.get(hit.collider.id)??-Infinity)>.65) {
          const damage=softTraffic?0:impactDamage(inward,hit.collider.kind);
          this.damage=Math.min(100,this.damage+damage); this.contacts.set(hit.collider.id,this.age);
          hit.collider.onHit?.(this.velocity.clone());
          if(!softTraffic) {
            this.impact=Math.min(1,inward/15);
            this.heading+=(hit.normal.x*forward.z-hit.normal.z*forward.x)*Math.min(.3,inward*.012);
          }
        }
        if(typeof impulseResponse==='number')this.velocity.addScaledVector(hit.normal,impulseResponse);
        else this.velocity.addScaledVector(hit.normal,inward*(softTraffic?1:1.12)).multiplyScalar(softTraffic?1:.7);
      }
      remaining*=1-hit.time;
    }
    const landingDamage=this.stunts.update(dt,this.position,this.velocity,this.heading,this.course,collisions);
    this.heading=this.stunts.groundedHeading()??this.heading;
    if(landingDamage>0) {this.damage=Math.min(100,this.damage+landingDamage);this.impact=Math.min(1,landingDamage/20);}
    if(!this.stunts.active) {this.position.y=this.course.heightAt(this.position.x,this.position.z);this.velocity.y=0;}
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
    this.mesh.position.copy(this.position).y += stuntAsset.centerOfMassHeight;
    if(this.stunts.active) {this.mesh.quaternion.copy(this.stunts.rotation);return;}
    this.mesh.rotation.order='YXZ';
    this.mesh.rotation.set(0, this.heading, 0);
    const dx = Math.sin(this.heading); const dz = Math.cos(this.heading);
    this.mesh.rotation.x = -Math.atan((this.course.heightAt(this.position.x + dx, this.position.z + dz) - this.course.heightAt(this.position.x - dx, this.position.z - dz)) / 2);
    this.mesh.rotation.z = Math.atan((this.course.heightAt(this.position.x + dz, this.position.z - dx) - this.course.heightAt(this.position.x - dz, this.position.z + dx)) / 2) + this.steering * Math.min(Math.abs(this.forwardSpeed) * 0.002, 0.045);
  }
}
