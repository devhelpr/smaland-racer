import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import data from '../assets/trees.json' with { type: 'json' };

function generator(seed:number):()=>number {
  return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
}

function shade(geometry:THREE.BufferGeometry,value:number):void {
  const colors=new Float32Array(geometry.getAttribute('position').count*3);
  colors.fill(value);geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
}

function merge(parts:THREE.BufferGeometry[]):THREE.BufferGeometry {
  const result=mergeGeometries(parts)!;parts.forEach(part=>part.dispose());return result;
}

function boughs() {
  const config=data.evergreen,random=generator(data.seed);
  return config.layers.flatMap(([height,radius],layer)=>{
    const count=config.branchCount-layer%config.branchCountVariation;
    return Array.from({length:count},(_,branch)=>({
      angle:branch/count*Math.PI*2+layer*config.phase+(random()-.5)*config.angleJitter,
      length:radius*(1+(random()-.5)*config.lengthVariation),
      height:height+(random()-.5)*config.heightJitter,
      shade:config.shade+random()*config.shadeRange
    }));
  });
}

/** Crossed, curved needle sprays have actual gaps and fine silhouettes at every viewing angle. */
export function createEvergreenGeometry():THREE.BufferGeometry {
  const config=data.evergreen,parts:THREE.BufferGeometry[]=[];
  for(const bough of boughs())for(let plane=0;plane<config.cardPlanes;plane++) {
    const geometry=new THREE.PlaneGeometry(bough.length*config.widthRatio*2,bough.length,1,config.cardSegments);
    const positions=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
    const roll=plane/config.cardPlanes*Math.PI;
    for(let i=0;i<positions.count;i++) {
      const t=uv.getY(i),across=positions.getX(i),outward=t*bough.length;
      const side=across*Math.cos(roll);
      const y=bough.height-config.droop*bough.length*Math.sin(t*Math.PI/2)+config.tipLift*bough.length*t*t+across*Math.sin(roll);
      positions.setXYZ(i,Math.cos(bough.angle)*outward-Math.sin(bough.angle)*side,y,Math.sin(bough.angle)*outward+Math.cos(bough.angle)*side);
    }
    geometry.computeVertexNormals();shade(geometry,bough.shade);parts.push(geometry);
  }
  return merge(parts);
}

function branchBetween(start:THREE.Vector3,end:THREE.Vector3,radius:number,segments:number,tipRadius=radius/3):THREE.BufferGeometry {
  const direction=end.clone().sub(start);
  const branch=new THREE.CylinderGeometry(tipRadius,radius,direction.length(),segments);
  branch.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
  branch.translate(...start.clone().add(end).multiplyScalar(.5).toArray());return branch;
}

export function createEvergreenTrunkGeometry():THREE.BufferGeometry {
  const config=data.evergreen;
  const trunk=new THREE.CylinderGeometry(...config.trunk as [number,number,number,number]);trunk.translate(0,config.trunkY,0);
  const parts:THREE.BufferGeometry[]=[trunk];
  for(const bough of boughs()) {
    const end=new THREE.Vector3(Math.cos(bough.angle)*bough.length,bough.height-(config.droop-config.tipLift)*bough.length,Math.sin(bough.angle)*bough.length);
    parts.push(branchBetween(new THREE.Vector3(0,bough.height,0),end,config.branchRadius,config.branchSegments));
  }
  return merge(parts);
}

/** Tapering forks carry smaller twigs and overlapping leaf sprays throughout the crown. */
export function createDeciduousGeometry(variant=0):{crown:THREE.BufferGeometry;branches:THREE.BufferGeometry} {
  const config=data.deciduous,random=generator(data.seed+variant),crowns:THREE.BufferGeometry[]=[],branches:THREE.BufferGeometry[]=[];
  const spread=1+(variant-1)*config.variantSpread,lean=(variant-1)*config.variantLean;
  const shape=(point:THREE.Vector3)=>point.set(point.x*spread+Math.max(0,point.y-config.branchStart)*lean,point.y,point.z/spread);
  const wood=(curve:THREE.CatmullRomCurve3,radius:number,segments=config.curveSegments,sides=config.branchSegments)=>{
    for(let segment=0;segment<segments;segment++) {
      const t=segment/segments;
      branches.push(branchBetween(shape(curve.getPoint(t)),shape(curve.getPoint((segment+1)/segments)),radius*Math.pow(1-t,config.branchTaper)+config.minimumRadius,sides,radius*Math.pow(1-(segment+1)/segments,config.branchTaper)+config.minimumRadius));
    }
  };
  const leaders=config.leaders.map((points,index)=>{
    const curve=new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(...point as [number,number,number])));
    wood(curve,config.leaderRadii[index]);return curve;
  });
  config.clusters.forEach(([x,y,z,sx,sy,sz],cluster)=>{
    const leader=leaders[config.clusterLeaders[cluster]],start=leader.getPoint(config.twigJoin),center=new THREE.Vector3(x,y,z);
    const bend=start.clone().lerp(center,.5);bend.y+=config.branchBend;
    const limb=new THREE.CatmullRomCurve3([start,bend,center]);wood(limb,config.branchRadius);
    for(let twig=0;twig<config.twigCount;twig++) {
      // Equal-area directions avoid the cube-shaped distribution of normalized random XYZ samples.
      const azimuth=random()*Math.PI*2,vertical=random()*2-1,horizontal=Math.sqrt(1-vertical*vertical);
      const direction=new THREE.Vector3(Math.cos(azimuth)*horizontal,vertical,Math.sin(azimuth)*horizontal);
      const endpoint=center.clone().add(new THREE.Vector3(direction.x*sx,direction.y*sy,direction.z*sz).multiplyScalar(Math.cbrt(random())));
      const origin=limb.getPoint(config.twigJoin),middle=origin.clone().lerp(endpoint,.5);middle.y+=config.branchBend;
      wood(new THREE.CatmullRomCurve3([origin,middle,endpoint]),config.twigRadius,config.twigCurveSegments,config.twigRadialSegments);
      for(let spray=0;spray<config.cardsPerTwig;spray++) {
        const geometry=new THREE.PlaneGeometry(config.cardSize[0]+random()*config.cardSizeRange,config.cardSize[1]+random()*config.cardSizeRange,2,2);
        const positions=geometry.getAttribute('position');
        for(let i=0;i<positions.count;i++)positions.setZ(i,config.leafBend*(positions.getX(i)**2+positions.getY(i)**2));
        geometry.rotateX(random()*Math.PI);geometry.rotateY(random()*Math.PI*2);geometry.rotateZ(random()*Math.PI);
        const position=endpoint.clone().add(new THREE.Vector3(random()-.5,random()-.5,random()-.5).multiplyScalar(config.leafSpread));
        geometry.translate(...position.toArray());
        const normals=geometry.getAttribute('normal');
        for(let i=0;i<positions.count;i++) {
          const point=shape(new THREE.Vector3().fromBufferAttribute(positions,i));positions.setXYZ(i,point.x,point.y,point.z);
          // Canopy normals soften the paper-plane lighting while retaining the leaf silhouette.
          const normal=point.clone().sub(shape(center.clone())).normalize().multiplyScalar(config.normalOut);
          normal.y+=config.normalUp;normal.normalize();normals.setXYZ(i,normal.x,normal.y,normal.z);
        }
        shade(geometry,config.shade+random()*config.shadeRange);crowns.push(geometry);
      }
    }
  });
  return {crown:merge(crowns),branches:merge(branches)};
}
