import { trafficRoutes, type TrafficRoute } from './traffic-routes.ts';
import { createATractor } from './traffic-model.ts';
import materialAsset from '../assets/materials/traffic.json' with { type: 'json' };
import placement from '../parcours/traffic.json' with { type: 'json' };
import asset from '../assets/traffic.json' with { type: 'json' };
import physics from '../assets/traffic-physics.json' with { type: 'json' };
import * as THREE from 'three';
import { Course, randomGenerator } from './track.ts';
import { CAR_RADIUS, type BoxCollider, type CollisionWorld } from './collision.ts';

interface ATractor {
  mesh: THREE.Group;
  wheels: THREE.Group[];
  collider: BoxCollider;
  distance: number;
  route: TrafficRoute;
  direction: number;
  laneOffset: number;
  laneVelocity: number;
  baseSpeed: number;
  speed: number;
  active: boolean;
  offset: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  angularVelocity: number;
  returnDelay: number;
}

/** Two-way slow traffic keeps right and makes room for oncoming vehicles. */
export class Traffic {
  readonly vehicles: ATractor[] = [];
  readonly course: Course;
  private readonly world: CollisionWorld;

  constructor(course: Course, world: CollisionWorld, group: THREE.Group) {
    this.course = course;
    this.world = world;
    if(course.definition.setting==='sandsjon')return;
    const random = randomGenerator(course.definition.seed + placement.seedOffset);
    for(const route of trafficRoutes(course)) {
      const count = Math.max(placement.minCount, Math.min(placement.maxCount, Math.ceil(route.length / placement.lengthPerVehicle)));
      for (let i=0;i<count;i++) {
        const {mesh,wheels}=createATractor(materialAsset.paintColors[i%materialAsset.paintColors.length],i);
        const baseSpeed=placement.baseSpeed+random()*placement.speedRange;
        const collider: BoxCollider={id:`a-tractor-${route.id}-${i}`,x:0,z:0,...asset.collider,kind:'aTractor',angle:0,active:true,velocity:new THREE.Vector3()};
        const vehicle: ATractor={mesh,wheels,collider,distance:placement.startDistance+i*(route.length-placement.finishClearance)/count,route,direction:placement.directions[i%placement.directions.length],laneOffset:this.normalLaneOffset(route),laneVelocity:0,baseSpeed,speed:baseSpeed,active:true,offset:new THREE.Vector3(),velocity:new THREE.Vector3(),yaw:0,angularVelocity:0,returnDelay:0};
        collider.onPush=(relative,normal,dt,position)=>this.push(vehicle,relative,normal,dt,position);
        this.vehicles.push(vehicle);world.dynamic.push(collider);group.add(mesh);this.place(vehicle);
      }
    }
  }

  private normalLaneOffset(route:TrafficRoute):number {
    return Math.min(route.width*placement.laneOffset,Math.max(0,route.width/2-asset.collider.halfX));
  }

  private sample(vehicle:ATractor) {
    const sample=vehicle.route.sample(vehicle.distance);
    return {point:sample.point,tangent:sample.tangent.clone().multiplyScalar(vehicle.direction)};
  }

  private place(vehicle: ATractor): void {
    const sample=this.sample(vehicle);
    const side=new THREE.Vector3(sample.tangent.z,0,-sample.tangent.x);
    const offset=vehicle.laneOffset;
    vehicle.mesh.position.copy(sample.point).addScaledVector(side,offset).add(vehicle.offset);
    const {x,z}=vehicle.mesh.position;
    vehicle.mesh.position.y=this.course.height(x,z)+placement.groundOffset;
    const heading=Math.atan2(sample.tangent.x,sample.tangent.z)+vehicle.yaw+THREE.MathUtils.clamp(Math.atan2(vehicle.laneVelocity,Math.max(vehicle.speed,1)),-physics.meeting.maxSteeringAngle,physics.meeting.maxSteeringAngle);
    const front=this.course.height(x+sample.tangent.x,z+sample.tangent.z);
    const back=this.course.height(x-sample.tangent.x,z-sample.tangent.z);
    const across=this.course.height(x+side.x,z+side.z)-this.course.height(x-side.x,z-side.z);
    vehicle.mesh.rotation.set(-Math.atan((front-back)/2),heading,-Math.atan(across/2));
    vehicle.collider.x=x;vehicle.collider.z=z;vehicle.collider.angle=heading;
    vehicle.collider.velocity!.copy(sample.tangent).multiplyScalar(vehicle.speed).addScaledVector(side,vehicle.laneVelocity).add(vehicle.velocity);
    vehicle.collider.angularVelocity=vehicle.angularVelocity;
  }

  /** Resolve a planar rigid-body impulse at the actual point of contact. */
  private push(vehicle:ATractor,relative:THREE.Vector3,normal:THREE.Vector3,dt:number,position?:THREE.Vector3):number {
    if(!vehicle.active||dt<=0)return 0;
    const closing=Math.max(0,-relative.dot(normal));
    if(closing===0)return 0;
    const contact=position??vehicle.mesh.position;
    const rx=contact.x-vehicle.collider.x,rz=contact.z-vehicle.collider.z;
    const lever=rz*normal.x-rx*normal.z;
    const config=physics.contact;
    const inertia=config.mass*((vehicle.collider.halfX*2)**2+(vehicle.collider.halfZ*2)**2)/12;
    const impulse=Math.min(config.maxImpulse,(1+config.restitution)*closing/(1/config.playerMass+1/config.mass+lever*lever/inertia));
    vehicle.velocity.addScaledVector(normal,-impulse/config.mass);
    vehicle.angularVelocity=THREE.MathUtils.clamp(vehicle.angularVelocity-impulse*lever/inertia,-config.maxAngularSpeed,config.maxAngularSpeed);
    vehicle.returnDelay=config.returnDelay;
    // Publish the impulse immediately; the next physics step integrates its motion.
    this.place(vehicle);
    return impulse/config.playerMass;
  }

  private integrate(vehicle:ATractor,dt:number):void {
    const config=physics.contact;
    vehicle.returnDelay=Math.max(0,vehicle.returnDelay-dt);
    if(vehicle.returnDelay===0) {
      vehicle.velocity.addScaledVector(vehicle.offset,-config.returnStiffness*dt);
      vehicle.velocity.multiplyScalar(Math.exp(-config.returnDamping*dt));
      const error=Math.atan2(Math.sin(vehicle.yaw),Math.cos(vehicle.yaw));
      vehicle.angularVelocity-=error*config.steeringStiffness*dt;
      vehicle.angularVelocity*=Math.exp(-config.steeringDamping*dt);
    }
    const decay=Math.exp(-config.linearDrag*dt),spinDecay=Math.exp(-config.angularDrag*dt);
    vehicle.offset.addScaledVector(vehicle.velocity,(1-decay)/config.linearDrag);
    vehicle.yaw+=vehicle.angularVelocity*(1-spinDecay)/config.angularDrag;
    vehicle.velocity.multiplyScalar(decay);
    vehicle.angularVelocity*=spinDecay;
  }

  /** Sweep the center and both ends so a struck car cannot slide through scenery. */
  private collide(vehicle:ATractor,previous:THREE.Vector3,heading:number):void {
    const destination=vehicle.mesh.position.clone();
    if(this.course.inWater(destination.x,destination.z)) {
      vehicle.offset.add(previous.clone().sub(destination));vehicle.velocity.set(0,0,0);vehicle.angularVelocity=0;this.place(vehicle);return;
    }
    let nearest:ReturnType<CollisionWorld['sweep']>=null;
    for(const end of [-1,0,1]) {
      const reach=end*Math.max(0,vehicle.collider.halfZ-CAR_RADIUS);
      const from=previous.clone().add(new THREE.Vector3(Math.sin(heading)*reach,0,Math.cos(heading)*reach));
      const to=destination.clone().add(new THREE.Vector3(Math.sin(vehicle.collider.angle)*reach,0,Math.cos(vehicle.collider.angle)*reach));
      const hit=this.world.sweep(from,to,false,vehicle.collider);
      if(hit&&(hit.time>0||to.clone().sub(from).dot(hit.normal)<0)&&(!nearest||hit.time<nearest.time))nearest=hit;
    }
    if(!nearest)return;
    const allowed=previous.clone().lerp(destination,Math.max(0,nearest.time-.001)).addScaledVector(nearest.normal,physics.contact.separation);
    vehicle.offset.add(allowed.sub(destination));
    const velocity=vehicle.collider.velocity!;
    const closing=Math.max(0,-velocity.dot(nearest.normal));
    vehicle.velocity.addScaledVector(nearest.normal,closing*(1+physics.contact.restitution));
    vehicle.angularVelocity*=physics.contact.collisionSpinRetention;
    this.place(vehicle);
  }

  update(dt: number, playerPosition?: THREE.Vector3, playerVelocity?:THREE.Vector3): void {
    if (dt<=0) return;
    // Plan from one shared snapshot so neither driver reacts to a partially updated frame.
    const samples=this.vehicles.map(vehicle=>this.sample(vehicle));
    const plans=this.vehicles.map((vehicle,index)=> {
      let targetSpeed=vehicle.baseSpeed,targetLane=this.normalLaneOffset(vehicle.route);
      if(!vehicle.active)return {targetSpeed,targetLane};
      const {tangent}=samples[index],right=new THREE.Vector3(tangent.z,0,-tangent.x);
      for(const [otherIndex,other] of this.vehicles.entries()) {
        if(other===vehicle||!other.active)continue;
        const relative=other.mesh.position.clone().sub(vehicle.mesh.position).setY(0);
        const forward=relative.dot(tangent),lateral=relative.dot(right);
        const alignment=samples[otherIndex].tangent.dot(tangent);
        if(alignment<-.5&&forward>-physics.meeting.rearClearance&&forward<physics.meeting.lookAhead&&Math.abs(lateral)<vehicle.route.width+physics.meeting.clearance) {
          const passingOffset=Math.min(vehicle.collider.halfX+physics.meeting.clearance/2,vehicle.route.width/2-vehicle.collider.halfX+physics.meeting.shoulderAllowance);
          targetLane=Math.max(targetLane,passingOffset);
          if(vehicle.route.width<4*vehicle.collider.halfX+physics.meeting.clearance)targetSpeed=Math.min(targetSpeed,physics.meeting.narrowSpeed);
        } else if(alignment>.5&&Math.abs(lateral)<vehicle.collider.halfX+other.collider.halfX+physics.meeting.clearance) {
          let gap=(other.distance-vehicle.distance)*vehicle.direction;
          if(other.route!==vehicle.route)gap=forward;
          else if(vehicle.route.closed&&gap<0)gap+=vehicle.route.length;
          if(gap>0&&gap<physics.meeting.followingDistance)targetSpeed=Math.min(targetSpeed,Math.max(0,(gap-physics.meeting.followingGap)*physics.meeting.followingResponse));
        }
      }
      return {targetSpeed,targetLane};
    });
    for (const [index,vehicle] of this.vehicles.entries()) {
      if (!vehicle.active) continue;
      let {targetSpeed}=plans[index];
      if(playerPosition&&vehicle.returnDelay===0) {
        const sample=this.sample(vehicle);
        const relative=playerPosition.clone().sub(vehicle.mesh.position).setY(0);
        const forward=relative.dot(sample.tangent);
        const side=new THREE.Vector3(sample.tangent.z,0,-sample.tangent.x);
        const lateral=relative.dot(side);
        const predicted=lateral+(playerVelocity?.dot(side)??0)*physics.avoidance.predictionTime;
        const crossing=Math.min(lateral,predicted)<physics.avoidance.halfWidth&&Math.max(lateral,predicted)>-physics.avoidance.halfWidth;
        if(forward>asset.collider.halfZ+CAR_RADIUS&&forward<physics.avoidance.lookAhead&&crossing)targetSpeed=Math.min(targetSpeed,Math.max(0,(forward-physics.avoidance.stoppingGap)*physics.avoidance.speedResponse));
      }
      const previousPosition=vehicle.mesh.position.clone(),previousHeading=vehicle.collider.angle;
      const displaced=vehicle.offset.lengthSq()>1e-10||vehicle.velocity.lengthSq()>1e-10||Math.abs(vehicle.yaw)>1e-6||Math.abs(vehicle.angularVelocity)>1e-6;
      this.integrate(vehicle,dt);
      vehicle.speed=THREE.MathUtils.damp(vehicle.speed,targetSpeed,targetSpeed<vehicle.speed?6:2,dt);
      const oldLane=vehicle.laneOffset;
      vehicle.laneOffset=THREE.MathUtils.damp(oldLane,plans[index].targetLane,physics.meeting.steeringResponse,dt);
      vehicle.laneVelocity=(vehicle.laneOffset-oldLane)/dt;
      vehicle.distance+=vehicle.speed*vehicle.direction*dt;
      if(vehicle.distance>=vehicle.route.length||vehicle.distance<0) {
        if(vehicle.route.closed)vehicle.distance=THREE.MathUtils.euclideanModulo(vehicle.distance,vehicle.route.length);
        else {vehicle.active=false;vehicle.collider.active=false;vehicle.mesh.visible=false;continue;}
      }
      this.place(vehicle);
      if(displaced)this.collide(vehicle,previousPosition,previousHeading);
      for(const wheel of vehicle.wheels)for(const child of wheel.children)child.rotation.x+=vehicle.speed*dt/asset.wheelRadius;
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
