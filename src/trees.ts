import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import data from '../assets/trees.json' with { type: 'json' };

// Shared, deterministic geometry keeps the forest instanced rather than adding draw calls per bough.
function generator(seed:number):()=>number {
  return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
}

function shade(geometry:THREE.BufferGeometry,value:number):void {
  const colors=new Float32Array(geometry.getAttribute('position').count*3);
  colors.fill(value);geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
}

export function createEvergreenGeometry():THREE.BufferGeometry {
  const config=data.evergreen,random=generator(data.seed),parts:THREE.BufferGeometry[]=[];
  config.layers.forEach(([height,radius],layer)=>{
    const count=config.branchCount-layer%config.branchCountVariation;
    for(let branch=0;branch<count;branch++) {
      const angle=branch/count*Math.PI*2+layer*config.phase+(random()-.5)*config.angleJitter;
      const length=radius*(1+(random()-.5)*config.lengthVariation);
      const geometry=new THREE.SphereGeometry(1,config.radialSegments,config.heightSegments);
      const positions=geometry.getAttribute('position');
      for(let i=0;i<positions.count;i++) {
        // A tapered, drooping spray with an upturned tip, rather than a solid conical skirt.
        const t=(positions.getY(i)+1)/2;
        const ripple=1+config.surfaceNoise*Math.sin(t*config.rippleFrequency+branch);
        const width=length*config.widthRatio*(1-t)*ripple;
        const across=positions.getX(i)*width;
        const outward=t*length;
        const y=height-config.droop*length*Math.sin(t*Math.PI)+config.tipLift*length*t*t+positions.getZ(i)*length*config.depthRatio*(1-t);
        positions.setXYZ(i,Math.cos(angle)*outward-Math.sin(angle)*across,y,Math.sin(angle)*outward+Math.cos(angle)*across);
      }
      geometry.computeVertexNormals();shade(geometry,config.shade+random()*config.shadeRange);parts.push(geometry);
    }
  });
  const [radius,height,segments,rings,x,y,z]=config.leader;
  const leader=new THREE.ConeGeometry(radius,height,segments,rings);leader.translate(x,y,z);shade(leader,1);parts.push(leader);
  const merged=mergeGeometries(parts)!;parts.forEach(part=>part.dispose());return merged;
}

export function createDeciduousGeometry():{crown:THREE.BufferGeometry;branches:THREE.BufferGeometry} {
  const config=data.deciduous,random=generator(data.seed),crowns:THREE.BufferGeometry[]=[],branches:THREE.BufferGeometry[]=[];
  const up=new THREE.Vector3(0,1,0);
  for(const [x,y,z,sx,sy,sz] of config.clusters) {
    const geometry=new THREE.SphereGeometry(1,config.segments[0],config.segments[1]);
    const positions=geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++) {
      const px=positions.getX(i),py=positions.getY(i),pz=positions.getZ(i);
      const ripple=1+config.surfaceNoise*Math.sin(px*config.rippleFrequency[0]+py*config.rippleFrequency[1])*Math.cos(pz*config.rippleFrequency[2]-py*config.rippleFrequency[3]);
      positions.setXYZ(i,x+px*sx*ripple,y+py*sy*ripple,z+pz*sz*ripple);
    }
    geometry.computeVertexNormals();shade(geometry,config.shade+random()*config.shadeRange);crowns.push(geometry);
    const start=new THREE.Vector3(0,config.branchStart,0),end=new THREE.Vector3(x,y,z),direction=end.clone().sub(start);
    const branch=new THREE.CylinderGeometry(config.branchRadius/2,config.branchRadius,direction.length(),config.branchSegments);
    branch.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up,direction.clone().normalize()));
    branch.translate(...start.add(end).multiplyScalar(.5).toArray());branches.push(branch);
  }
  const crown=mergeGeometries(crowns)!,wood=mergeGeometries(branches)!;
  [...crowns,...branches].forEach(part=>part.dispose());return {crown,branches:wood};
}
