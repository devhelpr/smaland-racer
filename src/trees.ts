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

function evergreenShape(point:THREE.Vector3,variant:number):THREE.Vector3 {
  const config=data.evergreen,form=config.variants[variant];
  const bend=Math.sin(point.y*config.trunkBendFrequency)*config.trunkBend;
  return point.set(point.x*form.width+point.y*form.lean+bend,point.y*form.height,point.z*form.width);
}

function boughs(variant:number) {
  const config=data.evergreen,form=config.variants[variant],random=generator(data.seed+variant);
  return config.layers.flatMap(([height,radius],layer)=>{
    const count=config.branchCount-layer%config.branchCountVariation;
    return Array.from({length:count},(_,branch)=>{
      const angle=branch/count*Math.PI*2+layer*config.phase+form.phase+(random()-.5)*config.angleJitter;
      const length=radius*(1+(random()-.5)*config.lengthVariation),y=height+(random()-.5)*config.heightJitter;
      const start=new THREE.Vector3(0,y,0);
      const middle=new THREE.Vector3(Math.cos(angle)*length/2,y-config.droop*length,Math.sin(angle)*length/2);
      const end=new THREE.Vector3(Math.cos(angle)*length,y-(config.droop-config.tipLift)*length,Math.sin(angle)*length);
      return {curve:new THREE.QuadraticBezierCurve3(start,middle,end),angle,length,shade:config.shade+random()*config.shadeRange,present:random()>form.sparse};
    }).filter(branch=>branch.present);
  });
}

/** Small sprays grow from curved boughs instead of forming large intersecting fern planes. */
export function createEvergreenGeometry(variant=0):THREE.BufferGeometry {
  const config=data.evergreen,random=generator(data.seed+variant),parts:THREE.BufferGeometry[]=[];
  const spray=(origin:THREE.Vector3,direction:THREE.Vector3,length:number,width:number,roll:number,value:number)=>{
    const forward=direction.clone().normalize();
    const across=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize().applyAxisAngle(forward,roll);
    const geometry=new THREE.PlaneGeometry(width,length,1,2),positions=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),normals=geometry.getAttribute('normal');
    for(let i=0;i<positions.count;i++) {
      const t=uv.getY(i),point=origin.clone().addScaledVector(forward,t*length).addScaledVector(across,positions.getX(i));
      point.y-=Math.sin(t*Math.PI)*length*config.sprayDroop;
      evergreenShape(point,variant);positions.setXYZ(i,point.x,point.y,point.z);
      const normal=new THREE.Vector3(point.x,config.normalUp,point.z).normalize();normals.setXYZ(i,normal.x,normal.y,normal.z);
    }
    shade(geometry,value);parts.push(geometry);
  };
  for(const bough of boughs(variant)) {
    for(let twig=0;twig<config.twigCount;twig++)for(const side of [-1,1]) {
      const t=config.twigStart+(1-config.twigStart)*twig/config.twigCount;
      const origin=bough.curve.getPoint(t),tangent=bough.curve.getTangent(t).multiplyScalar(config.sprayForward);
      const lateral=new THREE.Vector3(-Math.sin(bough.angle),0,Math.cos(bough.angle)).multiplyScalar(side*config.twigReach);
      const direction=tangent.add(lateral);direction.y-=config.sprayDroop;
      const length=Math.min(bough.length*(1-t)*config.twigReach+config.sprayMinLength,config.sprayLength)*(1+(random()-.5)*config.lengthVariation);
      spray(origin,direction,length,length*config.sprayWidth,(random()-.5)*config.sprayRoll,bough.shade+(random()-.5)*config.needleShadeVariation);
    }
    const endpoint=bough.curve.getPoint(1),tangent=bough.curve.getTangent(1);
    spray(endpoint,tangent,config.sprayMinLength,config.sprayMinLength*config.sprayWidth,random()*Math.PI,bough.shade);
  }
  // Young upright shoots conceal the otherwise bare pole at the very top.
  for(let shoot=0;shoot<config.leaderSprays;shoot++) {
    const t=shoot/config.leaderSprays,height=config.leaderStart+(config.trunk[2]-config.leaderStart)*t,angle=shoot*config.phase;
    spray(new THREE.Vector3(0,height,0),new THREE.Vector3(Math.cos(angle)*(1-t),1,Math.sin(angle)*(1-t)),config.leaderLength*(1-t/2),config.leaderWidth*(1-t/2),angle,config.shade+random()*config.shadeRange);
  }
  return merge(parts);
}

function branchBetween(start:THREE.Vector3,end:THREE.Vector3,radius:number,segments:number,tipRadius=radius/3):THREE.BufferGeometry {
  const direction=end.clone().sub(start);
  const branch=new THREE.CylinderGeometry(tipRadius,radius,direction.length(),segments);
  branch.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
  branch.translate(...start.clone().add(end).multiplyScalar(.5).toArray());return branch;
}

export function createEvergreenTrunkGeometry(variant=0):THREE.BufferGeometry {
  const config=data.evergreen;
  const trunk=new THREE.CylinderGeometry(...config.trunk as [number,number,number,number],config.woodSegments);trunk.translate(0,config.trunkY,0);
  const positions=trunk.getAttribute('position');
  for(let i=0;i<positions.count;i++) {
    const point=evergreenShape(new THREE.Vector3().fromBufferAttribute(positions,i),variant);positions.setXYZ(i,point.x,point.y,point.z);
  }
  trunk.computeVertexNormals();
  const parts:THREE.BufferGeometry[]=[trunk];
  for(const bough of boughs(variant))for(let segment=0;segment<config.woodSegments;segment++) {
    const t=segment/config.woodSegments,next=(segment+1)/config.woodSegments;
    parts.push(branchBetween(evergreenShape(bough.curve.getPoint(t),variant),evergreenShape(bough.curve.getPoint(next),variant),config.branchRadius*(1-t),config.branchSegments,config.branchRadius*(1-next)));
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
