import * as THREE from 'three';
import physics from '../assets/traffic-physics.json' with { type: 'json' };

export interface TrafficDriveState {
  position: THREE.Vector3;
  heading: number;
  steering: number;
}

/** The driver operates the steering rack; only tire dynamics can move the body. */
export function steerTraffic(state:TrafficDriveState,target:THREE.Vector3,wheelbase:number,dt:number,override?:number,maxAngle=physics.driving.maxSteeringAngle):void {
  const config=physics.driving;
  const dx=target.x-state.position.x,dz=target.z-state.position.z;
  const right=dx*Math.cos(state.heading)-dz*Math.sin(state.heading);
  const curvature=2*right/Math.max(dx*dx+dz*dz,1);
  const desired=THREE.MathUtils.clamp(override??Math.atan(wheelbase*curvature),-maxAngle,maxAngle);
  const smoothed=THREE.MathUtils.damp(state.steering,desired,config.steeringResponse,dt);
  state.steering+=THREE.MathUtils.clamp(smoothed-state.steering,-config.maxSteeringRate*dt,config.maxSteeringRate*dt);
}

export interface TrafficMotion {
  corneringAcceleration?:number;
  powertrain?:{acceleration:number;braking:number};
  drive: TrafficDriveState;
  velocity: THREE.Vector3;
  angularVelocity: number;
  acceleration: number;
  speed: number;
  wheelbase: number;
  reactionTime: number;
}

/** One velocity and heading handle cruising, tire slip, collision momentum and rejoining. */
export function moveTraffic(car:TrafficMotion,targetSpeed:number,roadFraction:number,dt:number):void {
  const config=physics.dynamics,driving=physics.driving;
  const heading=car.drive.heading;
  const forward=new THREE.Vector3(Math.sin(heading),0,Math.cos(heading));
  const right=new THREE.Vector3(forward.z,0,-forward.x);
  let longitudinal=car.velocity.dot(forward),lateral=car.velocity.dot(right);
  const braking=longitudinal*targetSpeed<0||Math.abs(targetSpeed)<Math.abs(longitudinal);
  const limit=braking?(car.powertrain?.braking??driving.braking):(car.powertrain?.acceleration??driving.acceleration);
  const desired=THREE.MathUtils.clamp((targetSpeed-longitudinal)*config.speedResponse,-limit,limit);
  car.acceleration=THREE.MathUtils.damp(car.acceleration,desired,config.accelerationResponse,dt);
  // Engine and brakes act along the body; an impact never becomes a route offset.
  const change=car.acceleration*dt;
  const error=targetSpeed-longitudinal;
  longitudinal+=Math.sign(change)===Math.sign(error)?Math.sign(change)*Math.min(Math.abs(change),Math.abs(error)):change;
  if(targetSpeed===0&&Math.abs(longitudinal)<config.stoppedSpeed) {longitudinal=0;car.acceleration=0;}
  const grip=THREE.MathUtils.lerp(config.shoulderGrip,config.roadGrip,roadFraction);
  lateral*=Math.exp(-grip*dt);
  const rackYaw=longitudinal*Math.tan(car.drive.steering)/car.wheelbase;
  // When the rack asks for more turn than grip supports, the tires understeer instead of spinning the body.
  const maxYaw=car.corneringAcceleration===undefined?Infinity:car.corneringAcceleration/Math.max(Math.abs(longitudinal),1);
  const desiredYaw=THREE.MathUtils.clamp(rackYaw,-maxYaw,maxYaw);
  const response=car.reactionTime>0?config.impactYawDamping:THREE.MathUtils.lerp(config.shoulderYawResponse,config.yawResponse,roadFraction);
  const yaw=THREE.MathUtils.damp(car.angularVelocity,desiredYaw,response,dt);
  const yawChange=THREE.MathUtils.clamp(yaw-car.angularVelocity,-config.maxYawAcceleration*dt,config.maxYawAcceleration*dt);
  const nextYaw=car.angularVelocity+yawChange;
  const turn=(car.angularVelocity+nextYaw)*dt/2;
  car.angularVelocity=nextYaw;
  // The body may spin faster than the tires can redirect its momentum after an impact.
  // Limit the tire force in world space so that grip, rather than body rotation, arrests a slide.
  const powered=forward.clone().multiplyScalar(longitudinal).addScaledVector(right,car.velocity.dot(right));
  const finalHeading=heading+turn;
  const ideal=new THREE.Vector3(Math.sin(finalHeading)*longitudinal+Math.cos(finalHeading)*lateral,0,Math.cos(finalHeading)*longitudinal-Math.sin(finalHeading)*lateral);
  const tireImpulse=ideal.sub(powered);
  const traction=THREE.MathUtils.lerp(config.shoulderGripAcceleration,config.roadGripAcceleration,roadFraction);
  tireImpulse.clampLength(0,traction*dt);
  const previous=car.velocity.clone();
  car.velocity.copy(powered).add(tireImpulse);
  car.drive.position.addScaledVector(previous.add(car.velocity),dt/2);
  car.drive.heading=finalHeading;
  car.speed=car.velocity.dot(new THREE.Vector3(Math.sin(finalHeading),0,Math.cos(finalHeading)));
}
