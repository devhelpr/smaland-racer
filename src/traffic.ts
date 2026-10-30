import { drivingProfiles } from './driving.ts';
import type { Vehicle } from './vehicle.ts';
import { type VehicleLighting, type TimeOfDay } from './lighting.ts';
import snowPoleAsset from '../assets/snow-poles.json' with { type: 'json' };
import { trafficRoutes, type TrafficRoute } from './traffic-routes.ts';
import { steerTrafficWheels } from './traffic-wheels.ts';
import { steerTraffic, moveTraffic, type TrafficDriveState } from './traffic-steering.ts';
import farmerPlacement from '../parcours/farmer.json' with { type: 'json' };
import farmerAsset from '../assets/farmer.json' with { type: 'json' };
import { createFarmer, createATractor } from './traffic-model.ts';
import materialAsset from '../assets/materials/traffic.json' with { type: 'json' };
import placement from '../parcours/traffic.json' with { type: 'json' };
import asset from '../assets/traffic.json' with { type: 'json' };
import physics from '../assets/traffic-physics.json' with { type: 'json' };
import * as THREE from 'three';
import { Course, randomGenerator } from './track.ts';
import { CAR_RADIUS, type BoxCollider, type CollisionWorld, type ContactBody } from './collision.ts';

interface TrafficVehicle {
  aggressive: boolean;
  obstructed:boolean;
  stuckTime:number;
  stuckOrigin:THREE.Vector3;
  stuckObjectTime:number;
  recoveryRetryTime:number;
  powertrain?:{acceleration:number;braking:number};
  beacons: THREE.Mesh<THREE.CylinderGeometry,THREE.MeshStandardMaterial>[];
  mesh: THREE.Group;
  lighting: VehicleLighting;
  dippedTime: number;
  wheels: THREE.Group[];
  wheelMounts: THREE.Vector3[];
  collider: BoxCollider;
  distance: number;
  route: TrafficRoute;
  direction: number;
  laneOffset: number;
  laneVelocity: number;
  drive: TrafficDriveState;
  driveDistance: number;
  wheelbase: number;
  pitch: number;
  roll: number;
  baseSpeed: number;
  speed: number;
  active: boolean;
  velocity: THREE.Vector3;
  angularVelocity: number;
  reactionTime: number;
  acceleration: number;
  recovering: boolean;
  stableTime: number;
  gear: number;
  gearTime: number;
  blockedTime: number;
  previousVelocity: THREE.Vector3;
  obstacleLane: number | null;
  obstacleTime: number;
}

interface MeetingRetry {
  vehicles: [TrafficVehicle, TrafficVehicle];
  waiting: number;
  reversing: boolean;
  origins: THREE.Vector3[];
  elapsed: number;
}

/** Ordinary traffic keeps right; one local farmer pursues through the same tire and contact physics. */
export class Traffic {
  readonly vehicles: TrafficVehicle[] = [];
  readonly course: Course;
  private readonly world: CollisionWorld;
  private readonly player?:Pick<Vehicle,'profiles'|'drivingStyle'>;
  private elapsed=0;
  private recoveryFrustum:THREE.Frustum|null=null;
  private readonly farmerLocalBounds=new THREE.Box3();
  private timeOfDay: TimeOfDay = 'day';
  private readonly meetingRetries: MeetingRetry[] = [];

  constructor(course: Course, world: CollisionWorld, group: THREE.Group,player?:Pick<Vehicle,'profiles'|'drivingStyle'>) {
    this.course = course;
    this.world = world;
    this.player=player;

    const random = randomGenerator(course.definition.seed + placement.seedOffset);
    for(const [routeIndex,route] of trafficRoutes(course).entries()) {
      const count = Math.max(placement.minCount, Math.min(placement.maxCount, Math.ceil(route.length / placement.lengthPerVehicle)));
      for (let i=0;i<count+(routeIndex===0?1:0);i++) {
        const aggressive=routeIndex===0&&i===count;
        if(course.definition.setting==='sandsjon'&&!aggressive)continue;
        const model=aggressive?createFarmer():createATractor(materialAsset.paintColors[i%materialAsset.paintColors.length],i);
        const {mesh,wheels,lighting}=model;
        if(aggressive)this.farmerLocalBounds.setFromObject(mesh);
        const baseSpeed=aggressive?this.playerProfile.road.speed*farmerPlacement.speedAdvantage:placement.baseSpeed+random()*placement.speedRange;
        const collider: BoxCollider={id:aggressive?`farmer-${course.definition.id}`:`a-tractor-${route.id}-${i}`,x:0,z:0,...asset.collider,kind:'aTractor',angle:0,active:true,velocity:new THREE.Vector3()};
        const vehicle: TrafficVehicle={
          aggressive,obstructed:false,stuckTime:0,stuckOrigin:new THREE.Vector3(),stuckObjectTime:0,recoveryRetryTime:0,beacons:model.beacons,mesh,wheels,lighting,dippedTime:0,wheelMounts:wheels.map(wheel=>wheel.position.clone()),collider,route,direction:aggressive?1:placement.directions[i%placement.directions.length],
          distance:aggressive?(route.closed?route.length:0)-farmerPlacement.spawnBehindDistance:placement.startDistance+i*(route.length-placement.finishClearance)/count,
          laneOffset:this.normalLaneOffset(route),laneVelocity:0,
          drive:{position:new THREE.Vector3(),heading:0,steering:0},driveDistance:NaN,
          wheelbase:Math.max(...wheels.map(wheel=>wheel.position.z))-Math.min(...wheels.map(wheel=>wheel.position.z)),
          pitch:0,roll:0,baseSpeed,speed:aggressive?farmerPlacement.spawnSpeed:baseSpeed,active:true,
          velocity:new THREE.Vector3(),angularVelocity:0,reactionTime:0,acceleration:0,
          recovering:false,stableTime:0,gear:1,gearTime:0,blockedTime:0,previousVelocity:new THREE.Vector3(),obstacleLane:null,obstacleTime:0
        };
        collider.onPush=(relative,normal,dt,position,body)=>this.push(vehicle,relative,normal,dt,position,body);
        this.vehicles.push(vehicle);world.dynamic.push(collider);group.add(mesh);this.resetDrive(vehicle);this.place(vehicle,0,true);vehicle.stuckOrigin.copy(vehicle.drive.position);
      }
    }
  }

  private get playerProfile() {
    return this.player?this.player.profiles[this.player.drivingStyle]:drivingProfiles.cruising;
  }

  private normalLaneOffset(route:TrafficRoute):number {
    return Math.min(route.width*placement.laneOffset,Math.max(0,route.width/2-asset.collider.halfX));
  }

  private sample(vehicle:TrafficVehicle) {
    const sample=this.routeSample(vehicle,vehicle.distance);
    return {point:sample.point,tangent:sample.tangent.clone().multiplyScalar(vehicle.direction)};
  }

  /** Also supports explicit route repositioning, such as a stage reset. */
  private resetDrive(vehicle:TrafficVehicle):void {
    const {point,tangent}=this.sample(vehicle);
    vehicle.drive.position.copy(point).addScaledVector(new THREE.Vector3(tangent.z,0,-tangent.x),vehicle.laneOffset);
    vehicle.drive.heading=Math.atan2(tangent.x,tangent.z);
    const next=this.routeSample(vehicle,vehicle.distance+vehicle.direction*vehicle.wheelbase).tangent.multiplyScalar(vehicle.direction);
    const nextHeading=Math.atan2(next.x,next.z);
    const bend=Math.atan2(Math.sin(nextHeading-vehicle.drive.heading),Math.cos(nextHeading-vehicle.drive.heading))/vehicle.wheelbase;
    const curvature=bend/(1-bend*vehicle.laneOffset);
    vehicle.drive.steering=THREE.MathUtils.clamp(Math.atan(vehicle.wheelbase*curvature),-physics.driving.maxSteeringAngle,physics.driving.maxSteeringAngle);
    if(Math.abs(curvature)>0)vehicle.speed=Math.min(vehicle.speed,Math.sqrt(physics.driving.maxLateralAcceleration/Math.abs(curvature)));
    vehicle.velocity.copy(tangent).multiplyScalar(vehicle.speed);
    vehicle.angularVelocity=vehicle.speed*Math.tan(vehicle.drive.steering)/vehicle.wheelbase;
    vehicle.previousVelocity.copy(vehicle.velocity);
    vehicle.driveDistance=vehicle.distance;
  }

  private routeSample(vehicle:TrafficVehicle,distance:number) {
    const route=vehicle.route;
    const d=route.closed?THREE.MathUtils.euclideanModulo(distance,route.length):THREE.MathUtils.clamp(distance,0,route.length);
    const sample=route.sample(d);
    // Continue straight beyond open endpoints so the driver does not aim backwards just before exiting.
    if(!route.closed)sample.point.addScaledVector(sample.tangent,distance-d);
    return sample;
  }

  private headingError(vehicle:TrafficVehicle):number {
    const {tangent}=this.sample(vehicle);
    const error=vehicle.drive.heading-Math.atan2(tangent.x,tangent.z);
    return Math.atan2(Math.sin(error),Math.cos(error));
  }

  private recovery(vehicle:TrafficVehicle,targetLane:number,dt:number):void {
    const config=physics.recovery;
    const laneError=targetLane>this.normalLaneOffset(vehicle.route)
      ?Math.max(0,vehicle.laneOffset-targetLane,-vehicle.laneOffset)
      :Math.abs(vehicle.laneOffset-targetLane);
    const headingError=Math.abs(this.headingError(vehicle));
    if(vehicle.reactionTime>0||laneError>config.enterLaneError||headingError>config.enterHeadingError) {
      vehicle.recovering=true;vehicle.stableTime=0;
    } else if(laneError<config.exitLaneError&&headingError<config.exitHeadingError&&Math.abs(vehicle.angularVelocity)<config.exitHeadingError) {
      vehicle.stableTime+=dt;
      if(vehicle.stableTime>config.stableTime)vehicle.recovering=false;
    } else vehicle.stableTime=0;
  }

  private drive(vehicle:TrafficVehicle,targetLane:number,targetSpeed:number,dt:number,meetingReverse?:boolean,pursuit?:THREE.Vector3):void {
    const config=physics.recovery;
    const intendingToMove=targetSpeed>config.shiftSpeed;
    vehicle.reactionTime=Math.max(0,vehicle.reactionTime-dt);
    vehicle.gearTime+=dt;
    const headingError=pursuit
      ?Math.atan2(Math.sin(vehicle.drive.heading-Math.atan2(pursuit.x-vehicle.drive.position.x,pursuit.z-vehicle.drive.position.z)),Math.cos(vehicle.drive.heading-Math.atan2(pursuit.x-vehicle.drive.position.x,pursuit.z-vehicle.drive.position.z)))
      :this.headingError(vehicle);
    const laneError=vehicle.laneOffset-targetLane;
    const roadFraction=THREE.MathUtils.clamp((vehicle.route.width/2-Math.abs(vehicle.laneOffset)+vehicle.collider.halfX)/(2*vehicle.collider.halfX),0,1);
    const onRoad=roadFraction>0.5;
    const preview=vehicle.recovering
      ?Math.max(config.lookAheadMin,Math.abs(vehicle.speed)*physics.driving.lookAheadTime,Math.abs(laneError)*config.crossTrackPreview)
      :Math.max(physics.driving.lookAheadMin,Math.abs(vehicle.speed)*physics.driving.lookAheadTime);
    const aim=this.routeSample(vehicle,vehicle.distance+vehicle.direction*(meetingReverse?-physics.meeting.retry.lookAhead:preview));
    const right=new THREE.Vector3(aim.tangent.z,0,-aim.tangent.x).multiplyScalar(vehicle.direction);
    aim.point.addScaledVector(right,targetLane);
    if(pursuit)aim.point.copy(pursuit);
    if(vehicle.recovering) {
      targetSpeed=Math.min(targetSpeed,onRoad?config.speed:config.shoulderSpeed);
      targetSpeed*=Math.max(config.minSpeedScale,Math.cos(headingError));
    }
    // Hold an avoidance choice until the rear has cleared it, rather than switching sides each frame.
    const sight=this.routeSample(vehicle,vehicle.distance+vehicle.direction*Math.max(preview,config.obstacleLookAhead));
    sight.point.addScaledVector(new THREE.Vector3(sight.tangent.z,0,-sight.tangent.x),vehicle.direction*targetLane);
    if(pursuit)sight.point.copy(vehicle.drive.position).add(pursuit.clone().sub(vehicle.drive.position).setY(0).clampLength(0,config.obstacleLookAhead));
    const hit=this.world.sweep(vehicle.drive.position,sight.point,true,vehicle.collider,['snowPole']);
    if(hit)vehicle.obstructed=true;
    vehicle.obstacleTime=Math.max(0,vehicle.obstacleTime-dt);
    if(vehicle.obstacleTime===0)vehicle.obstacleLane=null;
    if(!meetingReverse&&hit&&hit.collider.kind!=='aTractor'&&(hit.time>0||aim.point.clone().sub(vehicle.drive.position).dot(hit.normal)<0)) {
      let clear=false;
      for(const side of [1,-1]) {
        const lane=THREE.MathUtils.clamp(targetLane+side*config.obstacleOffset,-vehicle.route.width/2+vehicle.collider.halfX,vehicle.route.width/2+physics.meeting.shoulderAllowance-vehicle.collider.halfX);
        const candidate=sight.point.clone().addScaledVector(right,lane-targetLane);
        const obstruction=this.world.sweep(vehicle.drive.position,candidate,true,vehicle.collider,['snowPole']);
        if(!obstruction) {
          vehicle.obstacleLane=lane;vehicle.obstacleTime=config.avoidanceHoldTime;clear=true;break;
        }
      }
      if(!clear)targetSpeed=Math.min(targetSpeed,Math.max(0,(vehicle.drive.position.clone().sub(sight.point).setY(0).length()*hit.time-config.obstacleClearance)*physics.avoidance.speedResponse));
    }
    if(!meetingReverse&&vehicle.obstacleLane!==null) {
      aim.point.addScaledVector(right,vehicle.obstacleLane-targetLane);
      targetSpeed=Math.min(targetSpeed,config.speed);
    }
    let requestedGear=vehicle.gear;
    if(meetingReverse!==undefined)requestedGear=meetingReverse?-1:1;
    else if(vehicle.recovering&&vehicle.reactionTime===0&&vehicle.gearTime>(vehicle.aggressive?farmerPlacement.gearHoldTime:config.gearHoldTime)&&intendingToMove) {
      if(vehicle.gear===1&&(Math.abs(headingError)>config.reverseAngle||vehicle.blockedTime>config.blockedTime))requestedGear=-1;
      else if(vehicle.gear===-1&&(Math.abs(headingError)<config.forwardAngle||vehicle.gearTime>config.reverseTime))requestedGear=1;
    } else if(!vehicle.recovering)requestedGear=1;
    if(requestedGear!==vehicle.gear) {
      targetSpeed=0;
      if(Math.abs(vehicle.speed)<config.shiftSpeed) {vehicle.gear=requestedGear;vehicle.gearTime=0;vehicle.blockedTime=0;}
    } else if(vehicle.gear===-1)targetSpeed=-Math.min(config.reverseSpeed,meetingReverse!==undefined?targetSpeed:config.reverseSpeed);
    if(pursuit&&Math.abs(vehicle.speed)<config.shiftSpeed&&vehicle.blockedTime>config.blockedTime)vehicle.recovering=true;
    if(vehicle.reactionTime===0) {
      const steeringOverride=vehicle.gear===-1&&meetingReverse===undefined?headingError
        :pursuit&&Math.abs(headingError)>config.forwardAngle?-headingError:undefined;
      steerTraffic(vehicle.drive,aim.point,vehicle.wheelbase,dt,steeringOverride);
    }
    if((vehicle.recovering||vehicle.aggressive)&&intendingToMove&&targetSpeed===0&&Math.abs(vehicle.speed)<config.shiftSpeed)vehicle.blockedTime+=dt;
    moveTraffic(vehicle,targetSpeed,roadFraction,dt);
  }

  /** Project only route progress; the physical position and heading are never pulled toward it. */
  private trackPosition(vehicle:TrafficVehicle,dt:number):void {
    for(let i=0;i<3;i++) {
      const sample=this.routeSample(vehicle,vehicle.distance);
      vehicle.distance+=vehicle.drive.position.clone().sub(sample.point).dot(sample.tangent);
    }
    const sample=this.routeSample(vehicle,vehicle.distance);
    const right=new THREE.Vector3(sample.tangent.z,0,-sample.tangent.x).multiplyScalar(vehicle.direction);
    const oldLane=vehicle.laneOffset;
    vehicle.laneOffset=vehicle.drive.position.clone().sub(sample.point).dot(right);
    vehicle.laneVelocity=(vehicle.laneOffset-oldLane)/dt;
  }

  private supportHeight(x:number,z:number):number {
    return this.world.surfaceAt(x,z,this.course.heightAt(x,z)).height;
  }

  private place(vehicle: TrafficVehicle,dt=0,initialize=false): void {
    vehicle.mesh.position.copy(vehicle.drive.position);
    const {x,z}=vehicle.mesh.position;
    const heading=vehicle.drive.heading;
    const forward=new THREE.Vector3(Math.sin(heading),0,Math.cos(heading));
    const side=new THREE.Vector3(forward.z,0,-forward.x);
    // Tire contact, including stone facets, determines the support plane under the body.
    const heights=vehicle.wheelMounts.map(mount=>this.supportHeight(x+side.x*mount.x+forward.x*mount.z,z+side.z*mount.x+forward.z*mount.z));
    const average=(predicate:(mount:THREE.Vector3)=>boolean)=>{
      const samples=heights.filter((_,index)=>predicate(vehicle.wheelMounts[index]));
      return samples.reduce((sum,height)=>sum+height,0)/samples.length;
    };
    const front=average(mount=>mount.z>0),back=average(mount=>mount.z<0);
    const right=average(mount=>mount.x>0),left=average(mount=>mount.x<0);
    const trackWidth=Math.max(...vehicle.wheelMounts.map(mount=>mount.x))-Math.min(...vehicle.wheelMounts.map(mount=>mount.x));
    vehicle.mesh.position.y=Math.max(this.course.heightAt(x,z),heights.reduce((sum,height)=>sum+height,0)/heights.length,this.supportHeight(x,z)-asset.underbodyClearance)+placement.groundOffset;
    const acceleration=dt>0?vehicle.velocity.clone().sub(vehicle.previousVelocity).multiplyScalar(1/dt):new THREE.Vector3();
    const dynamics=physics.dynamics;
    const pitch=-Math.atan((front-back)/vehicle.wheelbase)-THREE.MathUtils.clamp(acceleration.dot(forward)*dynamics.pitchTransfer,-dynamics.maxBodyLean,dynamics.maxBodyLean);
    const roll=Math.atan((right-left)/trackWidth)+THREE.MathUtils.clamp(acceleration.dot(side)*dynamics.rollTransfer,-dynamics.maxBodyLean,dynamics.maxBodyLean);
    if(initialize)vehicle.pitch=pitch;
    else if(dt>0)vehicle.pitch=THREE.MathUtils.damp(vehicle.pitch,pitch,physics.driving.bodyResponse,dt);
    if(initialize)vehicle.roll=roll;
    else if(dt>0)vehicle.roll=THREE.MathUtils.damp(vehicle.roll,roll,physics.driving.bodyResponse,dt);
    vehicle.mesh.rotation.order='YXZ';
    vehicle.mesh.rotation.set(vehicle.pitch,heading,vehicle.roll);
    steerTrafficWheels(vehicle.wheels,vehicle.drive.steering,vehicle.wheelbase);
    vehicle.mesh.updateMatrixWorld(true);
    const up=new THREE.Vector3(0,1,0).applyQuaternion(vehicle.mesh.quaternion);
    for(const [index,wheel] of vehicle.wheels.entries()) {
      wheel.position.copy(vehicle.wheelMounts[index]);wheel.updateWorldMatrix(true,false);
      const center=wheel.getWorldPosition(new THREE.Vector3());
      const axle=new THREE.Vector3(1,0,0).applyQuaternion(wheel.getWorldQuaternion(new THREE.Quaternion()));
      const support=asset.wheelRadius*Math.sqrt(Math.max(0,1-axle.y*axle.y))+asset.wheelHalfWidth*Math.abs(axle.y);
      const ground=this.supportHeight(center.x,center.z)+support;
      wheel.position.y+=THREE.MathUtils.clamp((ground-center.y)/Math.max(up.y,.1),-asset.suspensionTravel,asset.suspensionTravel);
    }
    vehicle.collider.x=x;vehicle.collider.z=z;vehicle.collider.angle=heading;
    vehicle.collider.velocity!.copy(vehicle.velocity);
    vehicle.collider.angularVelocity=vehicle.angularVelocity;
  }

  private mass(vehicle:TrafficVehicle):number {
    return vehicle.aggressive?physics.contact.farmer.mass:physics.contact.mass;
  }

  /** Resolve a planar rigid-body impulse at the actual point of contact. */
  private push(vehicle:TrafficVehicle,relative:THREE.Vector3,normal:THREE.Vector3,dt:number,position?:THREE.Vector3,body?:ContactBody):number {
    if(!vehicle.active||dt<=0)return 0;
    const closing=Math.max(0,-relative.dot(normal));
    if(closing===0)return 0;
    const contact=position??vehicle.mesh.position;
    const rx=contact.x-vehicle.collider.x,rz=contact.z-vehicle.collider.z;
    const lever=rz*normal.x-rx*normal.z;
    const config=physics.contact;
    const mass=this.mass(vehicle);
    const inertia=mass*((vehicle.collider.halfX*2)**2+(vehicle.collider.halfZ*2)**2)/12;
    const profile=vehicle.aggressive?config.farmer:config;
    const playerMass=body?.mass??config.playerMass;
    const playerRotation=body?body.lever*body.lever/body.inertia:0;
    const impulse=Math.min(profile.maxImpulse,(1+profile.restitution)*closing/(1/playerMass+playerRotation+1/mass+lever*lever/inertia));
    vehicle.velocity.addScaledVector(normal,-impulse/mass);
    vehicle.angularVelocity=THREE.MathUtils.clamp(vehicle.angularVelocity-impulse*lever/inertia,-config.maxAngularSpeed,config.maxAngularSpeed);
    vehicle.reactionTime=config.reactionTime;
    vehicle.recovering=true;vehicle.stableTime=0;
    vehicle.speed=vehicle.velocity.dot(new THREE.Vector3(Math.sin(vehicle.drive.heading),0,Math.cos(vehicle.drive.heading)));
    // Publish the impulse immediately; the next physics step integrates its motion.
    this.place(vehicle);
    return impulse/playerMass;
  }

  /** Sweep the whole body in every driving state, including backing up and recovering. */
  private collide(vehicle:TrafficVehicle,previous:THREE.Vector3,heading:number,dt:number):void {
    const destination=vehicle.mesh.position.clone();
    if(this.course.inWater(destination.x,destination.z)) {
      vehicle.drive.position.copy(previous);vehicle.velocity.set(0,0,0);vehicle.angularVelocity=0;vehicle.speed=0;
      vehicle.blockedTime+=dt;vehicle.recovering=true;this.place(vehicle);return;
    }
    let nearest:ReturnType<CollisionWorld['sweep']>=null,contactReach=0;
    for(const end of [-1,0,1]) {
      const reach=end*Math.max(0,vehicle.collider.halfZ-CAR_RADIUS);
      const from=previous.clone().add(new THREE.Vector3(Math.sin(heading)*reach,0,Math.cos(heading)*reach));
      const to=destination.clone().add(new THREE.Vector3(Math.sin(vehicle.collider.angle)*reach,0,Math.cos(vehicle.collider.angle)*reach));
      let hit=this.world.sweep(from,to,true,vehicle.collider);
      // Flexible markers yield at actual body contact; they must not hide a solid obstacle behind them.
      while(hit?.collider.kind==='snowPole'&&vehicle.velocity.lengthSq()>1e-6) {
        hit.collider.active=false;
        hit.collider.onHit?.(vehicle.velocity.clone());
        vehicle.velocity.multiplyScalar(snowPoleAsset.speedRetention);
        vehicle.speed=vehicle.velocity.dot(new THREE.Vector3(Math.sin(vehicle.drive.heading),0,Math.cos(vehicle.drive.heading)));
        this.place(vehicle);
        hit=this.world.sweep(from,to,true,vehicle.collider);
      }
      if(hit&&(hit.time>0||to.clone().sub(from).dot(hit.normal)<0)&&(!nearest||hit.time<nearest.time)) {nearest=hit;contactReach=reach;}
    }
    if(!nearest) {vehicle.blockedTime=Math.max(0,vehicle.blockedTime-dt*physics.recovery.blockedDecay);return;}
    vehicle.obstructed=true;
    const config=physics.contact,normal=nearest.normal;
    const fraction=Math.max(0,nearest.time-.001);
    vehicle.drive.position.copy(previous).lerp(destination,fraction).addScaledVector(normal,config.separation);
    vehicle.drive.heading=THREE.MathUtils.lerp(heading,vehicle.drive.heading,fraction);
    const contact=vehicle.drive.position.clone().add(new THREE.Vector3(Math.sin(vehicle.drive.heading)*contactReach,0,Math.cos(vehicle.drive.heading)*contactReach)).addScaledVector(normal,-CAR_RADIUS);
    const lever=(contact.z-vehicle.drive.position.z)*normal.x-(contact.x-vehicle.drive.position.x)*normal.z;
    const mass=this.mass(vehicle);
    const inertia=mass*((vehicle.collider.halfX*2)**2+(vehicle.collider.halfZ*2)**2)/12;
    const other=this.vehicles.find(candidate=>candidate!==vehicle&&candidate.collider===nearest!.collider);
    const relative=vehicle.velocity.clone().sub(other?.velocity??new THREE.Vector3());
    relative.x+=vehicle.angularVelocity*(contact.z-vehicle.drive.position.z);
    relative.z-=vehicle.angularVelocity*(contact.x-vehicle.drive.position.x);
    let otherLever=0,otherInertia=Infinity;
    if(other) {
      otherLever=(contact.z-other.drive.position.z)*normal.x-(contact.x-other.drive.position.x)*normal.z;
      otherInertia=this.mass(other)*((other.collider.halfX*2)**2+(other.collider.halfZ*2)**2)/12;
      relative.x-=other.angularVelocity*(contact.z-other.drive.position.z);
      relative.z+=other.angularVelocity*(contact.x-other.drive.position.x);
    }
    const closing=Math.max(0,-relative.dot(normal));
    const impulse=(1+config.restitution)*closing/(1/mass+lever*lever/inertia+(other?1/this.mass(other)+otherLever*otherLever/otherInertia:0));
    vehicle.velocity.addScaledVector(normal,impulse/mass);
    vehicle.angularVelocity=THREE.MathUtils.clamp(vehicle.angularVelocity+impulse*lever/inertia,-config.maxAngularSpeed,config.maxAngularSpeed);
    if(other&&impulse>0) {
      other.velocity.addScaledVector(normal,-impulse/this.mass(other));
      other.angularVelocity=THREE.MathUtils.clamp(other.angularVelocity-impulse*otherLever/otherInertia,-config.maxAngularSpeed,config.maxAngularSpeed);
      other.reactionTime=config.reactionTime;other.recovering=true;other.stableTime=0;
      other.speed=other.velocity.dot(new THREE.Vector3(Math.sin(other.drive.heading),0,Math.cos(other.drive.heading)));
      this.place(other);
    }
    vehicle.blockedTime+=dt;vehicle.recovering=true;vehicle.stableTime=0;
    if(closing>config.reactionSpeed)vehicle.reactionTime=config.reactionTime;
    vehicle.speed=vehicle.velocity.dot(new THREE.Vector3(Math.sin(vehicle.drive.heading),0,Math.cos(vehicle.drive.heading)));
    this.place(vehicle);
  }

  /** A shared encounter prevents the two drivers from endlessly yielding to each other. */
  private retryMeetings(dt:number,plans:{targetSpeed:number;targetLane:number}[],playerPosition?:THREE.Vector3):Map<TrafficVehicle,boolean> {
    const config=physics.meeting.retry;
    const controls=new Map<TrafficVehicle,boolean>();
    for(let i=0;i<this.vehicles.length;i++)for(let j=i+1;j<this.vehicles.length;j++) {
      const a=this.vehicles[i],b=this.vehicles[j];
      if(a.aggressive||b.aggressive||!a.active||!b.active||a.baseSpeed<=0||b.baseSpeed<=0)continue;
      const forward=this.sample(a).tangent,otherForward=this.sample(b).tangent;
      const relative=b.drive.position.clone().sub(a.drive.position).setY(0);
      const ahead=relative.dot(forward);
      if(forward.dot(otherForward)>-.5||ahead<=0||ahead>physics.avoidance.lookAhead||relative.length()>physics.avoidance.lookAhead)continue;
      if(Math.abs(relative.dot(new THREE.Vector3(forward.z,0,-forward.x)))>a.collider.halfX+b.collider.halfX+physics.meeting.clearance)continue;
      if(!this.meetingRetries.some(retry=>retry.vehicles.includes(a)&&retry.vehicles.includes(b))) {
        this.meetingRetries.push({vehicles:[a,b],waiting:0,reversing:false,origins:[],elapsed:0});
      }
    }
    for(let i=this.meetingRetries.length-1;i>=0;i--) {
      const retry=this.meetingRetries[i], [a,b]=retry.vehicles;
      const ahead=b.drive.position.clone().sub(a.drive.position).dot(this.sample(a).tangent);
      if(!a.active||!b.active||ahead < -physics.meeting.rearClearance||(!retry.reversing&&ahead>physics.avoidance.lookAhead)||a.baseSpeed<=0||b.baseSpeed<=0) {
        this.meetingRetries.splice(i,1);continue;
      }
      if(retry.vehicles.some(vehicle=>controls.has(vehicle)))continue;
      if(!retry.reversing) {
        const stopped=retry.vehicles.every(vehicle=>Math.abs(vehicle.speed)<config.stoppedSpeed&&plans[this.vehicles.indexOf(vehicle)].targetSpeed<config.stoppedSpeed);
        retry.waiting=stopped?retry.waiting+dt:0;
        if(retry.waiting<config.waitTime)continue;
        retry.reversing=true;retry.elapsed=0;retry.origins=retry.vehicles.map(vehicle=>vehicle.drive.position.clone());
      }
      retry.elapsed+=dt;
      let finished=true;
      for(const [index,vehicle] of retry.vehicles.entries()) {
        const plan=plans[this.vehicles.indexOf(vehicle)];
        plan.targetLane=Math.max(plan.targetLane,Math.min(vehicle.collider.halfX+physics.meeting.clearance/2,vehicle.route.width/2-vehicle.collider.halfX+physics.meeting.shoulderAllowance));
        const backed=retry.origins[index].clone().sub(vehicle.drive.position).dot(this.sample(vehicle).tangent);
        const done=backed>=config.distance||retry.elapsed>=config.timeout;
        controls.set(vehicle,!done);
        plan.targetSpeed=done?0:config.speed;
        if(!done) {
          finished=false;
          // Sweep the full body behind it. Rocks and flexible snow markers remain driveable.
          const backwards=new THREE.Vector3(Math.sin(vehicle.drive.heading),0,Math.cos(vehicle.drive.heading)).negate();
          const right=new THREE.Vector3(backwards.z,0,-backwards.x);
          for(const side of [-1,0,1]) {
            const from=vehicle.drive.position.clone().addScaledVector(right,side*Math.max(0,vehicle.collider.halfX-CAR_RADIUS)).addScaledVector(backwards,vehicle.collider.halfZ-CAR_RADIUS);
            const to=from.clone().addScaledVector(backwards,config.rearGap);
            const hit=this.world.sweep(from,to,true,vehicle.collider,['snowPole']);
            if(hit)plan.targetSpeed=Math.min(plan.targetSpeed,Math.max(0,(config.rearGap*hit.time-physics.contact.separation)*physics.avoidance.speedResponse));
          }
          if(playerPosition) {
            const relative=playerPosition.clone().sub(vehicle.drive.position).setY(0);
            if(relative.dot(backwards)>0&&Math.abs(relative.dot(right))<physics.avoidance.halfWidth)plan.targetSpeed=Math.min(plan.targetSpeed,Math.max(0,(relative.dot(backwards)-physics.avoidance.stoppingGap)*physics.avoidance.speedResponse));
          }
        }
      }
      if(finished&&retry.vehicles.every(vehicle=>Math.abs(vehicle.speed)<physics.recovery.shiftSpeed)) {
        retry.reversing=false;retry.waiting=0;
      }
    }
    return controls;
  }

  setTimeOfDay(time:TimeOfDay,playerPosition?:THREE.Vector3,playerHeading?:number):void {
    this.timeOfDay=time;
    this.updateLighting(0,playerPosition,undefined,playerHeading);
  }

  private updateLighting(dt:number,playerPosition?:THREE.Vector3,playerVelocity?:THREE.Vector3,playerHeading?:number):void {
    const config=physics.lighting;
    const forwards=this.vehicles.map(vehicle=>new THREE.Vector3(Math.sin(vehicle.drive.heading),0,Math.cos(vehicle.drive.heading)));
    const playerForward=playerHeading!==undefined
      ?new THREE.Vector3(Math.sin(playerHeading),0,Math.cos(playerHeading))
      :playerVelocity&&playerVelocity.lengthSq()>.01?playerVelocity.clone().setY(0).normalize():undefined;
    for(const [index,vehicle] of this.vehicles.entries()) {
      const forward=forwards[index];
      const oncoming=(position:THREE.Vector3,otherForward?:THREE.Vector3)=> {
        const relative=position.clone().sub(vehicle.drive.position).setY(0),distance=relative.length();
        if(distance===0||distance>config.dimDistance)return false;
        relative.multiplyScalar(1/distance);
        return forward.dot(relative)>config.forwardCosine&&(!otherForward||forward.dot(otherForward)<config.oncomingCosine);
      };
      const night=this.timeOfDay==='night'&&vehicle.active;
      const approaching=night&&((playerPosition&&oncoming(playerPosition,playerForward))||this.vehicles.some((other,otherIndex)=>other!==vehicle&&other.active&&oncoming(other.drive.position,forwards[otherIndex])));
      // Keep dipped beams briefly after a meeting to avoid flashing on bends or at the detection boundary.
      vehicle.dippedTime=approaching?config.releaseDelay:Math.max(0,vehicle.dippedTime-dt);
      if(!night)vehicle.dippedTime=0;
      const mode=night?(vehicle.aggressive||vehicle.dippedTime>0?'dipped':'led'):'off';
      if(vehicle.lighting.mode!==mode)vehicle.lighting.setMode(mode);
      if(vehicle.aggressive)vehicle.lighting.beam.visible=false;
      for(const [beaconIndex,beacon] of vehicle.beacons.entries()) {
        const flash=(Math.sin(this.elapsed*farmerAsset.beacons.flashRate+beaconIndex*farmerAsset.beacons.phaseOffset)+1)/2;
        beacon.material.emissiveIntensity=THREE.MathUtils.lerp(farmerAsset.beacons.minIntensity,farmerAsset.beacons.maxIntensity,flash);
      }
    }
  }

  update(dt: number, playerPosition?: THREE.Vector3, playerVelocity?:THREE.Vector3,playerHeading?:number,camera?:THREE.Camera): void {
    if (dt<=0) {this.updateLighting(0,playerPosition,playerVelocity,playerHeading);return;}
    this.recoveryFrustum=null;
    if(camera) {
      camera.updateMatrixWorld(true);
      this.recoveryFrustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    }
    // Bound integration steps so steering behaves consistently during a slow frame.
    const steps=Math.ceil(dt/physics.driving.maxStep),step=dt/steps;
    for(let i=0;i<steps;i++)this.step(step,playerPosition,playerVelocity);
    this.updateLighting(dt,playerPosition,playerVelocity,playerHeading);
  }

  private step(dt:number,playerPosition?:THREE.Vector3,playerVelocity?:THREE.Vector3):void {
    this.elapsed+=dt;
    for(const vehicle of this.vehicles)if(vehicle.aggressive) {
      const profile=this.playerProfile;
      vehicle.baseSpeed=profile.road.speed*farmerPlacement.speedAdvantage;
      vehicle.powertrain={acceleration:profile.acceleration*farmerPlacement.accelerationAdvantage,braking:profile.braking*farmerPlacement.brakingAdvantage};
    }
    for(const vehicle of this.vehicles)if(vehicle.active&&vehicle.distance!==vehicle.driveDistance) {
      this.resetDrive(vehicle);this.place(vehicle,0,true);
    }
    // Plan from one shared snapshot so neither driver reacts to a partially updated frame.
    const samples=this.vehicles.map(vehicle=>this.sample(vehicle));
    const travels=this.vehicles.map(vehicle=>vehicle.velocity.lengthSq()>.01?vehicle.velocity.clone().normalize():new THREE.Vector3(Math.sin(vehicle.drive.heading),0,Math.cos(vehicle.drive.heading)).multiplyScalar(vehicle.gear));
    const plans=this.vehicles.map((vehicle,index)=> {
      let targetSpeed=vehicle.baseSpeed,targetLane=this.normalLaneOffset(vehicle.route);
      if(!vehicle.active)return {targetSpeed,targetLane};
      const {tangent}=samples[index],right=new THREE.Vector3(tangent.z,0,-tangent.x);
      let previousTangent=tangent;
      for(let ahead=physics.driving.bendSampleSpacing;ahead<=physics.driving.bendLookAhead;ahead+=physics.driving.bendSampleSpacing) {
        const bend=this.routeSample(vehicle,vehicle.distance+vehicle.direction*ahead).tangent.multiplyScalar(vehicle.direction);
        const bendAngle=Math.acos(THREE.MathUtils.clamp(previousTangent.dot(bend),-1,1));
        if(bendAngle>0)targetSpeed=Math.min(targetSpeed,Math.sqrt((vehicle.aggressive?farmerPlacement.maxLateralAcceleration:physics.driving.maxLateralAcceleration)*physics.driving.bendSampleSpacing/bendAngle));
        previousTangent=bend;
      }
      for(const [otherIndex,other] of this.vehicles.entries()) {
        if(other===vehicle||!other.active)continue;
        const relative=other.mesh.position.clone().sub(vehicle.mesh.position).setY(0);
        if(relative.lengthSq()>physics.meeting.lookAhead**2+vehicle.route.width**2)continue;
        const forward=relative.dot(tangent),lateral=relative.dot(right);
        const alignment=travels[otherIndex].dot(travels[index]);
        const travel=travels[index],travelRight=new THREE.Vector3(travel.z,0,-travel.x);
        const bodyForward=relative.dot(travel),bodyLateral=relative.dot(travelRight);
        const predicted=bodyLateral+other.velocity.clone().sub(vehicle.velocity).dot(travelRight)*physics.avoidance.predictionTime;
        const clearance=vehicle.collider.halfX+other.collider.halfX+physics.avoidance.trafficMargin;
        const crossing=Math.min(bodyLateral,predicted)<clearance&&Math.max(bodyLateral,predicted)>-clearance;
        if(bodyForward>0&&bodyForward<physics.avoidance.lookAhead&&crossing)targetSpeed=Math.min(targetSpeed,Math.max(0,(bodyForward-physics.avoidance.stoppingGap)*physics.avoidance.speedResponse));
        if(alignment<-.5&&forward>-physics.meeting.rearClearance&&forward<physics.meeting.lookAhead&&Math.abs(lateral)<vehicle.route.width+physics.meeting.clearance) {
          const passingOffset=Math.min(vehicle.collider.halfX+physics.meeting.clearance/2,vehicle.route.width/2-vehicle.collider.halfX+physics.meeting.shoulderAllowance);
          targetLane=Math.max(targetLane,passingOffset);
          if(vehicle.route.width<4*vehicle.collider.halfX+physics.meeting.clearance)targetSpeed=Math.min(targetSpeed,physics.meeting.narrowSpeed);
        } else if(alignment>.5&&Math.abs(lateral)<vehicle.collider.halfX+other.collider.halfX+physics.meeting.clearance) {
          let gap=(other.distance-vehicle.distance)*vehicle.direction;
          if(other.route!==vehicle.route||other.direction!==vehicle.direction||other.gear!==vehicle.gear)gap=forward;
          else if(vehicle.route.closed&&gap<0)gap+=vehicle.route.length;
          if(gap>0&&gap<physics.meeting.followingDistance)targetSpeed=Math.min(targetSpeed,Math.max(0,(gap-physics.meeting.followingGap)*physics.meeting.followingResponse));
        }
      }
      return {targetSpeed,targetLane};
    });
    const meetingControls=this.retryMeetings(dt,plans,playerPosition);
    for (const [index,vehicle] of this.vehicles.entries()) {
      if (!vehicle.active) continue;
      let pursuit:THREE.Vector3|undefined;
      if(vehicle.aggressive&&playerPosition) {
        const relative=playerPosition.clone().sub(vehicle.drive.position).setY(0);
        const playerRoad=this.course.nearest(playerPosition.x,playerPosition.z);
        const targetDirection=playerRoad.tangent.clone();
        if(playerVelocity&&playerVelocity.dot(targetDirection)<0)targetDirection.negate();
        const alignment=targetDirection.dot(this.sample(vehicle).tangent);
        if(alignment<0)vehicle.direction*=-1;
        if(relative.length()<farmerPlacement.engageDistance) {
          const lead=(playerVelocity??new THREE.Vector3()).clone().setY(0).multiplyScalar(farmerPlacement.predictionTime).clampLength(0,farmerPlacement.maxLead);
          const side=new THREE.Vector3(targetDirection.z,0,-targetDirection.x);
          // Hit the inward rear quarter, pushing the player toward its nearest road edge.
          const lane=playerPosition.clone().sub(playerRoad.point).dot(side);
          pursuit=playerPosition.clone().add(lead).addScaledVector(side,-(Math.sign(lane)||1)*farmerPlacement.ramOffset);
          const desired=Math.atan2(pursuit.x-vehicle.drive.position.x,pursuit.z-vehicle.drive.position.z);
          const error=Math.abs(Math.atan2(Math.sin(desired-vehicle.drive.heading),Math.cos(desired-vehicle.drive.heading)));
          plans[index].targetSpeed=Math.min(plans[index].targetSpeed,Math.max(farmerPlacement.minimumSpeed,(playerVelocity?.length()??0)*farmerPlacement.speedAdvantage+farmerPlacement.closingSpeed));
          vehicle.recovering=vehicle.reactionTime>0||error>farmerPlacement.reverseAngle||vehicle.blockedTime>physics.recovery.blockedTime;
          if(error>physics.recovery.forwardAngle)plans[index].targetSpeed=Math.min(plans[index].targetSpeed,farmerPlacement.turnSpeed);
        } else {
          // Stay on the authored road while closing a distant gap, including open stages.
          const gap=(playerRoad.progress*this.course.length-vehicle.distance)*vehicle.direction;
          if(gap<0&&!vehicle.route.closed)vehicle.direction*=-1;
        }
      }
      if(!pursuit)this.recovery(vehicle,plans[index].targetLane,dt);
      let {targetSpeed}=plans[index];
      if(playerPosition&&!vehicle.aggressive) {
        const travel=new THREE.Vector3(Math.sin(vehicle.drive.heading),0,Math.cos(vehicle.drive.heading)).multiplyScalar(vehicle.gear);
        const relative=playerPosition.clone().sub(vehicle.mesh.position).setY(0);
        const forward=relative.dot(travel);
        const side=new THREE.Vector3(travel.z,0,-travel.x);
        const lateral=relative.dot(side);
        const predicted=lateral+(playerVelocity?.dot(side)??0)*physics.avoidance.predictionTime;
        const crossing=Math.min(lateral,predicted)<physics.avoidance.halfWidth&&Math.max(lateral,predicted)>-physics.avoidance.halfWidth;
        if(forward>0&&forward<physics.avoidance.lookAhead&&crossing)targetSpeed=Math.min(targetSpeed,Math.max(0,(forward-physics.avoidance.stoppingGap)*physics.avoidance.speedResponse));
      }
      vehicle.obstructed=false;
      const previousPosition=vehicle.mesh.position.clone(),previousHeading=vehicle.collider.angle;
      vehicle.previousVelocity.copy(vehicle.velocity);
      this.drive(vehicle,plans[index].targetLane,targetSpeed,dt,meetingControls.get(vehicle),pursuit);
      this.place(vehicle,dt);
      this.collide(vehicle,previousPosition,previousHeading,dt);
      this.trackPosition(vehicle,dt);
      if(vehicle.distance>=vehicle.route.length||vehicle.distance<0) {
        if(vehicle.route.closed)vehicle.distance=THREE.MathUtils.euclideanModulo(vehicle.distance,vehicle.route.length);
        else if(!vehicle.recovering&&!vehicle.aggressive) {vehicle.active=false;vehicle.collider.active=false;vehicle.mesh.visible=false;continue;}
      }
      vehicle.driveDistance=vehicle.distance;
      if(vehicle.aggressive)this.recoverStuckFarmer(vehicle,dt,playerPosition);
      for(const wheel of vehicle.wheels)for(const child of wheel.children)child.rotation.x+=vehicle.speed*dt/asset.wheelRadius;
    }
  }

  /** The explicit off-camera reset replaces the complete motion state, never a route-following spring. */
  private recoverStuckFarmer(vehicle:TrafficVehicle,dt:number,playerPosition?:THREE.Vector3):void {
    const config=farmerPlacement.stuckRecovery;
    vehicle.stuckObjectTime=vehicle.obstructed?config.obstacleMemory:Math.max(0,vehicle.stuckObjectTime-dt);
    vehicle.recoveryRetryTime=Math.max(0,vehicle.recoveryRetryTime-dt);
    const moved=vehicle.drive.position.clone().sub(vehicle.stuckOrigin).setY(0).lengthSq()>config.movementRadius**2;
    if(moved||!this.recoveryFrustum||vehicle.stuckObjectTime===0) {
      vehicle.stuckTime=0;vehicle.stuckOrigin.copy(vehicle.drive.position);return;
    }
    if(this.recoveryFrustum.intersectsBox(new THREE.Box3().setFromObject(vehicle.mesh).expandByScalar(config.visibilityMargin))) {
      vehicle.stuckTime=0;vehicle.stuckOrigin.copy(vehicle.drive.position);return;
    }
    vehicle.stuckTime+=dt;
    if(vehicle.stuckTime+1e-9<config.delay||vehicle.recoveryRetryTime>0)return;
    vehicle.recoveryRetryTime=config.retryInterval;
    const base=playerPosition?this.course.nearest(playerPosition.x,playerPosition.z).progress*this.course.length-config.behindPlayerDistance:vehicle.distance;
    for(let i=0;i<config.searchSteps;i++) {
      const distance=base+(i===0?0:(i%2?-1:1)*Math.ceil(i/2)*config.searchSpacing);
      if(!vehicle.route.closed&&(distance<vehicle.collider.halfZ+config.clearance||distance>vehicle.route.length-vehicle.collider.halfZ-config.clearance))continue;
      const sample=this.routeSample(vehicle,distance);
      const tangent=sample.tangent.multiplyScalar(vehicle.direction);
      const lane=this.normalLaneOffset(vehicle.route);
      const position=sample.point.addScaledVector(new THREE.Vector3(tangent.z,0,-tangent.x),lane);
      if(this.course.inWater(position.x,position.z)||playerPosition&&position.clone().sub(playerPosition).setY(0).length()<config.playerClearance)continue;
      const heading=Math.atan2(tangent.x,tangent.z);
      if(this.world.overlapsBox({x:position.x,z:position.z,halfX:vehicle.collider.halfX,halfZ:vehicle.collider.halfZ,angle:heading},vehicle.collider,config.clearance,['snowPole']))continue;
      position.y=this.supportHeight(position.x,position.z)+placement.groundOffset;
      const transform=new THREE.Matrix4().makeRotationY(heading).setPosition(position);
      const bounds=this.farmerLocalBounds.clone().applyMatrix4(transform).expandByScalar(config.visibilityMargin);
      if(this.recoveryFrustum.intersectsBox(bounds))continue;
      vehicle.distance=vehicle.route.closed?THREE.MathUtils.euclideanModulo(distance,vehicle.route.length):distance;
      vehicle.laneOffset=lane;vehicle.laneVelocity=0;vehicle.speed=0;vehicle.acceleration=0;
      vehicle.angularVelocity=0;vehicle.reactionTime=0;vehicle.recovering=false;vehicle.stableTime=0;
      vehicle.gear=1;vehicle.gearTime=0;vehicle.blockedTime=0;vehicle.obstacleLane=null;vehicle.obstacleTime=0;
      vehicle.obstructed=false;vehicle.stuckTime=0;vehicle.stuckObjectTime=0;vehicle.recoveryRetryTime=0;
      this.resetDrive(vehicle);this.place(vehicle,0,true);vehicle.stuckOrigin.copy(vehicle.drive.position);
      return;
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
