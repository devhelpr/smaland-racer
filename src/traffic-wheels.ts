import type * as THREE from 'three';
import asset from '../assets/traffic.json' with { type: 'json' };

/** Ackermann steering, with a modest visual gain so small corrections remain readable in-game. */
export function steerTrafficWheels(wheels:THREE.Group[],steering:number,wheelbase:number):void {
  const display=asset.wheelSteering;
  const angle=Math.max(-display.maxAngle,Math.min(display.maxAngle,steering*display.gain));
  const tangent=Math.tan(angle);
  for(const wheel of wheels) {
    wheel.rotation.y=wheel.position.z>0?Math.atan(wheelbase*tangent/(wheelbase-wheel.position.x*tangent)):0;
  }
}
