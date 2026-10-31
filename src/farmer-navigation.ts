import * as THREE from 'three';
import { moveTraffic,steerTraffic,type TrafficMotion } from './traffic-steering.ts';
import { CAR_RADIUS,type BoxCollider,type CollisionWorld } from './collision.ts';
import config from '../parcours/farmer.json' with {type:'json'};
import physics from '../assets/traffic-physics.json' with {type:'json'};

interface NavigatingVehicle extends TrafficMotion {
  collider:BoxCollider;
  distance:number;
  laneOffset:number;
  direction:number;
  gear:number;
  blockedTime:number;
  route:{width:number};
}
interface RoadPoint {point:THREE.Vector3;tangent:THREE.Vector3}
export interface FarmerControl {target:THREE.Vector3;speed:number;reverse:boolean;steering:number}

/** Persistent road recovery, planned with the same rack, tire dynamics and body sweeps as driving. */
export class FarmerNavigation {
  mode:'chase'|'rejoin'='chase';
  private stableTime=0;
  private turning=false;
  private detour?:{point:THREE.Vector3;heading:number;preview:number};
  private planTime=0;
  private control?:FarmerControl;
  private reverseOrigin?:THREE.Vector3;

  reset():void {
    this.mode='chase';this.turning=false;this.detour=undefined;this.stableTime=0;this.planTime=0;this.control=undefined;this.reverseOrigin=undefined;
  }

  plan(car:NavigatingVehicle,world:CollisionWorld,sample:(distance:number)=>RoadPoint,lane:number,dt:number,player?:THREE.Vector3,inWater?:(x:number,z:number)=>boolean):FarmerControl|undefined {
    const settings=config.navigation;
    const road=sample(car.distance),forward=road.tangent.clone().multiplyScalar(car.direction);
    const error=Math.abs(Math.atan2(Math.sin(car.drive.heading-Math.atan2(forward.x,forward.z)),Math.cos(car.drive.heading-Math.atan2(forward.x,forward.z))));
    const slip=Math.abs(car.velocity.x*Math.cos(car.drive.heading)-car.velocity.z*Math.sin(car.drive.heading));
    const outside=Math.abs(car.laneOffset)>Math.max(lane,car.route.width/2-car.collider.halfX)+settings.enterMargin;
    if(this.mode==='chase'&&(outside||error>settings.enterHeading||car.blockedTime>physics.recovery.blockedTime||car.reactionTime>0&&(error>settings.impactHeading||slip>settings.impactSlip))) {
      this.mode='rejoin';this.planTime=0;this.stableTime=0;
    }
    if(this.mode==='chase')return;
    // Finish a committed turn before lane centring takes priority again.
    if(error>settings.wrongWayHeading)this.turning=true;
    else if(error<settings.enterHeading)this.turning=false;
    if(this.detour&&car.drive.position.clone().sub(this.detour.point).dot(new THREE.Vector3(Math.sin(this.detour.heading),0,Math.cos(this.detour.heading)))>-1)this.detour=undefined;
    if(!this.detour&&!outside&&car.blockedTime>physics.recovery.blockedTime) {
      const ahead=road.point.clone().addScaledVector(forward,settings.previews[1]);
      const hit=world.sweep(car.drive.position,ahead,true,car.collider,['snowPole']);
      if(hit&&hit.collider.kind!=='aTractor') {
        const obstacle=hit.collider,right=new THREE.Vector3(forward.z,0,-forward.x);
        const heading=Math.atan2(forward.x,forward.z),box='halfX' in obstacle?obstacle as BoxCollider:undefined;
        const angle=(box?.angle??heading)-heading,halfX=box?.halfX??obstacle.radius,halfZ=box?.halfZ??obstacle.radius;
        const across=halfX*Math.abs(Math.cos(angle))+halfZ*Math.abs(Math.sin(angle));
        const along=halfZ*Math.abs(Math.cos(angle))+halfX*Math.abs(Math.sin(angle));
        const centre=new THREE.Vector3(obstacle.x,road.point.y,obstacle.z);
        const candidates=[-1,1].map(side=>({point:centre.clone().addScaledVector(right,side*(across+car.collider.halfX+settings.detourClearance)).addScaledVector(forward,along+car.collider.halfZ+settings.detourClearance),heading,preview:0}));
        candidates.sort((a,b)=>Math.abs(a.point.clone().sub(road.point).dot(right))-Math.abs(b.point.clone().sub(road.point).dot(right)));
        this.detour=candidates.find(goal=>!inWater?.(goal.point.x,goal.point.z)&&!world.overlapsBox({x:goal.point.x,z:goal.point.z,halfX:car.collider.halfX,halfZ:car.collider.halfZ,angle:heading},car.collider,settings.goalClearance,['snowPole','rock']));
      }
    }
    const aligned=!this.detour&&car.gear===1&&car.speed>physics.recovery.shiftSpeed&&Math.abs(car.laneOffset-lane)<settings.exitLaneError&&error<settings.exitHeadingError&&slip<settings.exitSlip;
    this.stableTime=aligned?this.stableTime+dt:0;
    if(this.stableTime>=settings.stableTime){this.reset();return;}
    this.planTime-=dt;
    if(this.control&&this.planTime>0)return this.control;
    this.planTime=settings.replanInterval;
    const goals=this.detour?settings.previews.map(preview=>({...this.detour!,point:this.detour!.point.clone().addScaledVector(forward,preview),preview})):settings.previews.map(preview=>{
      const road=sample(car.distance+car.direction*preview);
      return {point:road.point.addScaledVector(new THREE.Vector3(road.tangent.z,0,-road.tangent.x),car.direction*lane),heading:Math.atan2(road.tangent.x*car.direction,road.tangent.z*car.direction),preview};
    });
    let best:FarmerControl|undefined,bestScore=Infinity;
    const reverseDistance=this.reverseOrigin?car.drive.position.distanceTo(this.reverseOrigin):0;
    for(const reverse of [false,true])for(const steering of settings.steeringAngles) {
      const speed=reverse?physics.recovery.reverseSpeed:settings.speed;
      const motion:TrafficMotion={drive:{position:car.drive.position.clone(),heading:car.drive.heading,steering:car.drive.steering},velocity:car.velocity.clone(),angularVelocity:car.angularVelocity,acceleration:car.acceleration,speed:car.speed,wheelbase:car.wheelbase,reactionTime:car.reactionTime,powertrain:car.powertrain,corneringAcceleration:car.corneringAcceleration};
      let clear=true,travelled=0,gear=car.gear;
      for(let time=0;time<settings.horizon;time+=settings.step) {
        const previous=motion.drive.position.clone(),heading=motion.drive.heading;
        const changing=reverse!==(gear===-1);
        if(changing&&Math.abs(motion.speed)<=physics.recovery.shiftSpeed)gear=reverse?-1:1;
        const desired=reverse!==(gear===-1)?0:(reverse?-speed:speed);
        motion.reactionTime=Math.max(0,motion.reactionTime-settings.step);
        const maxAngle=Math.min(physics.driving.maxSteeringAngle,Math.atan(car.wheelbase*(car.corneringAcceleration??config.maxLateralAcceleration)/Math.max(motion.velocity.lengthSq(),1)));
        steerTraffic(motion.drive,motion.drive.position,car.wheelbase,settings.step,steering,maxAngle);
        moveTraffic(motion,desired,0,settings.step);
        if(!this.clearSweep(car,world,previous,heading,motion.drive.position,motion.drive.heading,player,inWater)){clear=false;break;}
        travelled+=motion.drive.position.distanceTo(previous);
      }
      if(!clear||travelled<settings.minimumTravel)continue;
      for(const goal of goals) {
        if(inWater?.(goal.point.x,goal.point.z))continue;
        if(world.overlapsBox({x:goal.point.x,z:goal.point.z,halfX:car.collider.halfX,halfZ:car.collider.halfZ,angle:goal.heading},car.collider,settings.goalClearance,['snowPole','rock']))continue;
        const headingError=Math.abs(Math.atan2(Math.sin(motion.drive.heading-goal.heading),Math.cos(motion.drive.heading-goal.heading)));
        const initial=car.drive.position.distanceTo(goal.point),remaining=motion.drive.position.distanceTo(goal.point);
        const roadRight=new THREE.Vector3(Math.cos(goal.heading),0,-Math.sin(goal.heading));
        const crossTrack=Math.abs(motion.drive.position.clone().sub(goal.point).dot(roadRight));
        const score=(remaining-initial)*settings.progressWeight+crossTrack*(this.turning?settings.turnLaneWeight:settings.laneWeight)+headingError*(this.turning?settings.turnHeadingWeight:settings.headingWeight)
          +Math.abs(steering-car.drive.steering)*settings.steeringWeight
          +(reverse?settings.reversePenalty:0)+(reverse!==(car.gear===-1)?settings.shiftPenalty:0)
          +(reverse&&reverseDistance>settings.reverseDistance?settings.reverseLimitPenalty:0)
          +goal.preview*settings.previewWeight;
        if(score<bestScore){bestScore=score;best={target:goal.point,speed,reverse,steering};}
      }
    }
    if(best) {
      if(best.reverse&&!this.control?.reverse)this.reverseOrigin=car.drive.position.clone();
      if(!best.reverse)this.reverseOrigin=undefined;
      this.control=best;
    } else {
      // No body-safe manoeuvre is available. Stop and reconsider instead of pushing into the obstacle.
      this.control={target:goals[0].point,speed:0,reverse:car.gear===-1,steering:0};
    }
    return this.control;
  }

  private clearSweep(car:NavigatingVehicle,world:CollisionWorld,from:THREE.Vector3,heading:number,to:THREE.Vector3,nextHeading:number,player?:THREE.Vector3,inWater?:(x:number,z:number)=>boolean):boolean {
    for(const end of [-1,0,1]) {
      const reach=end*Math.max(0,car.collider.halfZ-CAR_RADIUS);
      const start=from.clone().add(new THREE.Vector3(Math.sin(heading)*reach,0,Math.cos(heading)*reach));
      const finish=to.clone().add(new THREE.Vector3(Math.sin(nextHeading)*reach,0,Math.cos(nextHeading)*reach));
      if(inWater?.(finish.x,finish.z))return false;
      const hit=world.sweep(start,finish,true,car.collider,['snowPole']);
      if(hit&&(hit.time>0||finish.clone().sub(start).dot(hit.normal)<-1e-6))return false;
      if(player) {
        const segment=finish.clone().sub(start),length=segment.lengthSq();
        const t=length?THREE.MathUtils.clamp(player.clone().sub(start).dot(segment)/length,0,1):0;
        const before=start.distanceToSquared(player),after=start.clone().addScaledVector(segment,t).distanceToSquared(player);
        if(after<config.navigation.playerClearance**2&&after<before-1e-6)return false;
      }
    }
    return true;
  }
}
