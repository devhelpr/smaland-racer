import * as THREE from 'three';
import type { HolmahultBuilding } from './holmahult-data.ts';

type Box = (group:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material)=>THREE.Mesh;
interface HouseMaterials {white:THREE.Material;roof:THREE.Material;glass:THREE.Material;stone:THREE.Material;paint:THREE.Material}

/** Number 25, modeled from the supplied oblique front photograph. Front is local +Z. */
export function createHolmahultHome(group:THREE.Group,site:HolmahultBuilding,box:Box,materials:HouseMaterials):void {
  const {white,roof,glass,stone,paint}=materials;
  const {width:w,depth:d,height:h,roofHeight:rh}=site;
  const boards=new THREE.MeshStandardMaterial({color:new THREE.Color(site.color).multiplyScalar(.87),roughness:1});
  const door=new THREE.MeshStandardMaterial({color:'#586260',roughness:.8});
  const part=(ww:number,hh:number,dd:number,x:number,y:number,z:number,material:THREE.Material)=>box(group,ww,hh,dd,x,y,z,material);
  part(w+.15,.38,d+.15,0,.12,0,stone);
  part(w,h,d,0,h/2,0,paint);
  // The entrance is on the long eaves facade, not under an attic gable.
  const triangle=new THREE.Shape();triangle.moveTo(-d/2,0);triangle.lineTo(0,rh);triangle.lineTo(d/2,0);triangle.closePath();
  const gables=new THREE.Mesh(new THREE.ExtrudeGeometry(triangle,{depth:w,bevelEnabled:false}),paint);
  gables.rotation.y=Math.PI/2;gables.position.set(-w/2,h,0);gables.castShadow=true;group.add(gables);
  for(let y=.45;y<h;y+=.19) {
    for(const side of [-1,1]) {
      part(w,.025,.035,0,y,side*(d/2+.015),boards);
      part(.035,.025,d,side*(w/2+.015),y,0,boards);
    }
  }
  for(let y=.16;y<rh;y+=.19)for(const side of [-1,1])part(.035,.025,d*(1-y/rh),side*(w/2+.015),h+y,0,boards);
  for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])part(.19,h+.1,.19,x,h/2,z,white);
  part(w+.12,.16,d+.12,0,.38,0,white);

  const slope=Math.atan2(rh,d/2),overhang=.4,length=Math.hypot(d/2+overhang,rh+overhang*Math.tan(slope));
  for(const side of [-1,1]) {
    const z=side*(d/4+overhang/2),y=h+rh/2-overhang*Math.tan(slope)/2;
    const panel=part(w+.85,.15,length,0,y,z,roof);panel.rotation.x=side*slope;
    for(const end of [-1,1]) {
      const fascia=part(.15,.19,length,end*(w/2+.46),y,z,white);fascia.rotation.x=side*slope;
    }
    part(w+.85,.17,.14,0,h-.16,side*(d/2+overhang),white);
    // Raised tile seams catch daylight while staying in the same instanced batch as the roof.
    for(let x=-w/2-.2;x<w/2+.4;x+=.29) {
      const rib=part(.045,.045,length,x,y+.1,z,roof);rib.rotation.x=side*slope;
    }
    for(let distance=.35;distance<d/2+overhang;distance+=.45)part(w+.8,.045,.07,0,h+rh-distance*Math.tan(slope)+.11,side*distance,roof);
  }
  part(w+.85,.16,.22,0,h+rh+.08,0,roof);
  // Two small dark chimney stacks visible on the photographed roof.
  for(const x of [-w*.34,w*.16])part(.36,.78,.44,x,h+rh-.12,-.35,roof);

  const window=(x:number,y:number,z:number,angle:number,ww=1.25,hh=1.55)=>{
    const frame=new THREE.Group();frame.position.set(x,y,z);frame.rotation.y=angle;group.add(frame);
    box(frame,ww+.25,hh+.24,.14,0,0,0,white);
    box(frame,ww,hh,.16,0,0,.035,glass);
    for(const offset of [-1,1]) {
      box(frame,.045,hh,.19,offset*ww/6,0,.06,white);
      box(frame,ww,.045,.19,0,offset*hh/6,.06,white);
    }
    box(frame,ww+.34,.09,.22,0,hh/2+.15,.02,white);
    box(frame,ww+.22,.09,.22,0,-hh/2-.12,.025,white);
  };
  // Four upstairs windows, including the close central pair above the entrance.
  for(const [x,ww] of [[-3.9,1.3],[-1.0,1.06],[.55,1.06],[4.05,1.3]])window(x,4.95,d/2+.08,0,ww);
  for(const x of [-3.9,4.05])window(x,1.88,d/2+.08,0,1.3,1.65);
  // Hidden elevations are a restrained continuation of the same building style.
  for(const x of [-3.5,3.5])for(const y of [1.88,4.95])window(x,y,-d/2-.08,Math.PI);
  for(const y of [1.88,4.95])window(w/2+.08,y,-1.7,Math.PI/2);

  const entrance=(x:number,z:number,angle:number)=>{
    const frame=new THREE.Group();frame.position.set(x,0,z);frame.rotation.y=angle;group.add(frame);
    box(frame,1.28,2.53,.14,0,1.49,0,white);box(frame,1.04,2.31,.19,0,1.43,.05,door);
    box(frame,.23,.24,.025,0,1.86,.16,white);box(frame,.06,.19,.06,.34,1.38,.19,white);
  };
  const entranceX=site.porchOffsetX??0;
  entrance(entranceX,d/2+.12,0);
  // The photographed left gable is mostly blind, with a side door near its front corner.
  entrance(-w/2-.1,d/2-1.1,-Math.PI/2);
  part(.52,.82,.1,-w/2-.13,1.45,d/2-2.4,white).rotation.y=Math.PI/2;

  const pw=site.porchWidth!,pd=site.porchDepth!,px=site.porchOffsetX!,front=d/2+pd;
  part(pw,.28,pd,px,.27,d/2+pd/2,stone);
  part(1.9,.17,.55,entranceX,.10,front+.25,stone);
  const backY=3.45,frontY=2.95;
  const canopy=part(pw+.4,.16,Math.hypot(pd+.35,backY-frontY),px,(backY+frontY)/2,d/2+pd/2,roof);
  canopy.rotation.x=Math.atan2(backY-frontY,pd+.35);
  part(pw+.4,.23,.18,px,frontY-.02,front+.15,white);
  for(const side of [-1,1]) {
    const beam=part(.16,.23,pd+.35,px+side*(pw/2+.12),(backY+frontY)/2-.06,d/2+pd/2,white);beam.rotation.x=canopy.rotation.x;
    part(.16,2.7,.16,px+side*(pw/2-.08),1.63,front-.05,white);
    part(.12,.12,pd,px+side*(pw/2-.08),1.15,d/2+pd/2,white);
    for(let z=d/2+.15;z<front-.1;z+=.18)part(.075,.75,.07,px+side*(pw/2-.08),.75,z,white);
  }
  for(const [left,right] of [[px-pw/2,entranceX-.85],[entranceX+.85,px+pw/2]]) {
    part(right-left,.12,.12,(left+right)/2,1.15,front-.05,white);
    for(let x=left+.12;x<right;x+=.18)part(.07,.75,.075,x,.75,front-.05,white);
  }
  // A small white house-number plaque to the left of the main door.
  part(.53,.32,.06,entranceX-1.05,1.92,d/2+.15,white);
  const segments=[[0,.09,.1,.02],[.05,.045,.02,.08],[0,0,.1,.02],[-.05,-.045,.02,.08],[0,-.09,.1,.02]];
  for(const [digit,mirror] of [[-.12,1],[.11,-1]])for(const [x,y,sw,sh] of segments)part(sw,sh,.025,entranceX-1.05+digit+x*mirror,1.92+y,d/2+.2,door);
}
