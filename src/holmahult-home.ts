import { createSceneryMaterial } from './materials.ts';
import materialAsset from '../assets/materials/holmahult-home.json' with { type: 'json' };
import asset from '../assets/holmahult-home.json' with { type: 'json' };
import * as THREE from 'three';

import type { HolmahultBuilding } from './holmahult-data.ts';

const details=asset.details;

type Box = (group:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material)=>THREE.Mesh;
interface HouseMaterials {white:THREE.Material;roof:THREE.Material;glass:THREE.Material;stone:THREE.Material;paint:THREE.Material}

/** Number 25, modeled from the supplied oblique front photograph. Front is local +Z. */
export function createHolmahultHome(group:THREE.Group,site:HolmahultBuilding,box:Box,materials:HouseMaterials):void {
  const {white,roof,glass,stone,paint}=materials;
  const {width:w,depth:d,height:h,roofHeight:rh}=site;
  const boards=createSceneryMaterial('holmahult-home.boards',{color:new THREE.Color(site.color).multiplyScalar(details.boardShade),...materialAsset.boards});
  const door=createSceneryMaterial('holmahult-home.door',materialAsset.door);
  const part=(ww:number,hh:number,dd:number,x:number,y:number,z:number,material:THREE.Material)=>box(group,ww,hh,dd,x,y,z,material);
  part(w+details.foundationExtra,details.foundationHeight,d+details.foundationExtra,...asset.foundationPosition as [number, number, number],stone);
  part(w,h,d,0,h/2,0,paint);
  // The entrance is on the long eaves facade, not under an attic gable.
  const triangle=new THREE.Shape();triangle.moveTo(-d/2,0);triangle.lineTo(0,rh);triangle.lineTo(d/2,0);triangle.closePath();
  const gables=new THREE.Mesh(new THREE.ExtrudeGeometry(triangle,{depth:w,bevelEnabled:false}),paint);
  gables.rotation.y=Math.PI/2;gables.position.set(-w/2,h,0);gables.castShadow=true;group.add(gables);
  for(let y=details.boardStart;y<h;y+=details.boardSpacing) {
    for(const side of [-1,1]) {
      part(w,...asset.frontCladdingSizeX as [number, number, number],y,side*(d/2+details.boardOffset),boards);
      part(...asset.sideCladdingWidthHeight as [number, number],d,side*(w/2+details.boardOffset),y,0,boards);
    }
  }
  for(let y=details.gableBoardStart;y<rh;y+=details.boardSpacing)for(const side of [-1,1])part(...asset.gableCladdingWidthHeight as [number, number],d*(1-y/rh),side*(w/2+details.boardOffset),h+y,0,boards);
  for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])part(details.cornerTrimWidth,h+details.cornerTrimExtraHeight,details.cornerTrimWidth,x,h/2,z,white);
  part(w+details.baseTrimExtra,details.baseTrimHeight,d+details.baseTrimExtra,...asset.baseTrimPosition as [number, number, number],white);

  const slope=Math.atan2(rh,d/2),overhang=details.overhang,length=Math.hypot(d/2+overhang,rh+overhang*Math.tan(slope));
  for(const side of [-1,1]) {
    const z=side*(d/4+overhang/2),y=h+rh/2-overhang*Math.tan(slope)/2;
    const panel=part(w+details.roofExtraWidth,details.roofThickness,length,0,y,z,roof);panel.rotation.x=side*slope;
    for(const end of [-1,1]) {
      const fascia=part(...asset.fascia as [number, number],length,end*(w/2+details.fasciaOffset),y,z,white);fascia.rotation.x=side*slope;
    }
    part(w+details.roofExtraWidth,...asset.eavesSizeX as [number, number, number],h-details.eavesDrop,side*(d/2+overhang),white);
    // Raised tile seams catch daylight while staying in the same instanced batch as the roof.
    for(let x=-w/2-details.ribStartExtra;x<w/2+details.ribEndExtra;x+=details.ribSpacing) {
      const rib=part(...asset.rib as [number, number],length,x,y+details.ribElevation,z,roof);rib.rotation.x=side*slope;
    }
    for(let distance=details.tileStart;distance<d/2+overhang;distance+=details.tileSpacing)part(w+details.tileExtraWidth,...asset.tileSeamSizeX as [number, number, number],h+rh-distance*Math.tan(slope)+details.tileElevation,side*distance,roof);
  }
  part(w+details.roofExtraWidth,...asset.ridgeSizeX as [number, number, number],h+rh+details.ridgeElevation,0,roof);
  // Two small dark chimney stacks visible on the photographed roof.
  for(const x of details.chimneyX.map(x=>w*x))part(...asset.chimneySize as [number, number, number],x,h+rh-details.chimneyDrop,details.chimneyZ,roof);

  const window=(x:number,y:number,z:number,angle:number,ww=details.windowWidth,hh=details.windowHeight)=>{
    const frame=new THREE.Group();frame.position.set(x,y,z);frame.rotation.y=angle;group.add(frame);
    box(frame,ww+details.frameExtraWidth,hh+details.frameExtraHeight,...asset.windowFrameDepthPosition as [number, number, number, number],white);
    box(frame,ww,hh,...asset.windowGlassDepthPosition as [number, number, number, number],glass);
    for(const offset of [-1,1]) {
      box(frame,details.mullionWidth,hh,details.mullionDepth,offset*ww/6,...asset.verticalMullionYZ as [number, number],white);
      box(frame,ww,...asset.horizontalMullionSizeX as [number, number, number],offset*hh/6,details.mullionZ,white);
    }
    box(frame,ww+details.headerExtraWidth,...asset.windowHeaderSizeX as [number, number, number],hh/2+details.headerOffset,details.headerZ,white);
    box(frame,ww+details.sillExtraWidth,...asset.windowSillSizeX as [number, number, number],-hh/2-details.sillOffset,details.sillZ,white);
  };
  // Four upstairs windows, including the close central pair above the entrance.
  for(const [x,ww] of asset.upperFrontWindows)window(x,details.upperWindowY,d/2+details.windowOffset,0,ww);
  for(const x of asset.lowerFrontWindowX)window(x,details.lowerWindowY,d/2+details.windowOffset,0,details.lowerWindowWidth,details.lowerWindowHeight);
  // Hidden elevations are a restrained continuation of the same building style.
  for(const x of asset.rearWindowX)for(const y of asset.rearWindowY)window(x,y,-d/2-details.windowOffset,Math.PI);
  for(const y of asset.sideWindowY)window(w/2+details.windowOffset,y,details.sideWindowZ,Math.PI/2);

  const entrance=(x:number,z:number,angle:number)=>{
    const frame=new THREE.Group();frame.position.set(x,0,z);frame.rotation.y=angle;group.add(frame);
    box(frame,...asset.doorFrame as [number, number, number, number, number, number],white);box(frame,...asset.doorPanel as [number, number, number, number, number, number],door);
    box(frame,...asset.doorPlaque as [number, number, number, number, number, number],white);box(frame,...asset.doorHandle as [number, number, number, number, number, number],white);
  };
  const entranceX=site.porchOffsetX??0;
  entrance(entranceX,d/2+details.entranceOffset,0);
  // The photographed left gable is mostly blind, with a side door near its front corner.
  entrance(-w/2-details.sideEntranceOffset,d/2-details.sideEntranceZ,-Math.PI/2);
  part(...asset.sideDoorTrimSize as [number, number, number],-w/2-details.sideTrimOffset,details.sideTrimY,d/2-details.sideTrimZ,white).rotation.y=Math.PI/2;

  const pw=site.porchWidth!,pd=site.porchDepth!,px=site.porchOffsetX!,front=d/2+pd;
  part(pw,details.porchBaseHeight,pd,px,details.porchBaseY,d/2+pd/2,stone);
  part(...asset.stepSize as [number, number, number],entranceX,details.stepY,front+details.stepOffset,stone);
  const backY=details.canopyBackY,frontY=details.canopyFrontY;
  const canopy=part(pw+details.canopyExtraWidth,details.canopyThickness,Math.hypot(pd+details.canopyExtraDepth,backY-frontY),px,(backY+frontY)/2,d/2+pd/2,roof);
  canopy.rotation.x=Math.atan2(backY-frontY,pd+details.canopyExtraDepth);
  part(pw+details.canopyExtraWidth,...asset.canopyFasciaHeightDepth as [number, number],px,frontY-details.canopyFasciaDrop,front+details.canopyFasciaOffset,white);
  for(const side of [-1,1]) {
    const beam=part(...asset.beam as [number, number],pd+details.canopyExtraDepth,px+side*(pw/2+details.beamOffset),(backY+frontY)/2-details.beamDrop,d/2+pd/2,white);beam.rotation.x=canopy.rotation.x;
    part(...asset.porchPostSize as [number, number, number],px+side*(pw/2-details.railInset),details.porchPostY,front-details.frontRailInset,white);
    part(...asset.sideRailWidthHeight as [number, number],pd,px+side*(pw/2-details.railInset),details.railY,d/2+pd/2,white);
    for(let z=d/2+details.sideBalusterStart;z<front-details.sideBalusterEnd;z+=details.balusterSpacing)part(...asset.sideBalusterSize as [number, number, number],px+side*(pw/2-details.railInset),details.balusterY,z,white);
  }
  for(const [left,right] of [[px-pw/2,entranceX-details.railOpeningHalfWidth],[entranceX+details.railOpeningHalfWidth,px+pw/2]]) {
    part(right-left,...asset.frontRailHeightDepth as [number, number],(left+right)/2,details.railY,front-details.frontRailInset,white);
    for(let x=left+details.frontBalusterStart;x<right;x+=details.balusterSpacing)part(...asset.frontBalusterSize as [number, number, number],x,details.balusterY,front-details.frontRailInset,white);
  }
  // A small white house-number plaque to the left of the main door.
  part(...asset.numberPlaqueSize as [number, number, number],entranceX-details.plaqueOffsetX,details.plaqueY,d/2+details.plaqueOffsetZ,white);
  const segments=asset.segments;
  for(const [digit,mirror] of asset.numberDigits)for(const [x,y,sw,sh] of segments)part(sw,sh,details.digitDepth,entranceX-details.plaqueOffsetX+digit+x*mirror,details.plaqueY+y,d/2+details.digitOffsetZ,door);
}
