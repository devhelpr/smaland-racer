import type { CourseDefinition } from './track.ts';

// Hand-traced, stylized reference from the user's Google Maps location and aerial view.
// Local axes: +X east, +Z south. Dimensions/height are approximate, not survey data.
export const HOLMAHULT_SOURCE = 'https://maps.app.goo.gl/CznM1o2vWHhMrY8W9';
const mapPoint = (x: number, y: number): [number, number] => [(x - 750) * 100 / 74 - 125, (y - 400) * 100 / 74 - 50];

export const holmahultCourse: CourseDefinition = {
  id: 'holmahult-stage', name: 'Holmahult', setting: 'holmahult', region: 'forest', closed: false,
  width: 6.2, seed: 519, hills: .45, treeDensity: 2400, wildlifeCount: 2,
  points: [[760,195],[767,232],[770,275],[766,315],[761,352],[760,381],
    [760,394],[770,402],[805,405],[850,410],[894,415],[906,418],[914,427],
    [917,449],[920,490],[922,535],[922,570],[926,585],[938,596],[947,606],
    [947,639],[944,669],[941,687]].map(([x,y]) => mapPoint(x,y)),
  lakes: [], medals: {gold: 44, silver: 60, bronze: 85},
};

export interface HolmahultBuilding {
  id: string;
  kind: 'home' | 'barn' | 'shed';
  x: number; z: number; width: number; depth: number; height: number; roofHeight: number; angle: number;
  color: string;
  porch?: boolean;
}

export const holmahultBuildings: HolmahultBuilding[] = [
  {id:'holmahult-25',kind:'home',x:-125,z:-50,width:11.8,depth:10.2,height:3.9,roofHeight:3.0,angle:Math.PI/2,color:'#6d8268',porch:true},
  {id:'north-long-barn',kind:'barn',x:-135,z:-97,width:8.5,depth:27,height:3.7,roofHeight:2.7,angle:Math.PI/2-.10,color:'#913c32'},
  {id:'north-courtyard-barn',kind:'barn',x:-131,z:-144,width:9,depth:25,height:4.4,roofHeight:3.0,angle:Math.PI/2-.13,color:'#853a32'},
  {id:'north-barn-wing',kind:'shed',x:-144,z:-153,width:10,depth:7,height:2.9,roofHeight:1.8,angle:Math.PI/2-.1,color:'#8c4236'},
  {id:'garden-shed',kind:'shed',x:-186,z:-38,width:5.4,depth:4,height:2.3,roofHeight:1.3,angle:-.15,color:'#79594b'},
  {id:'north-neighbor',kind:'home',x:-78,z:-239,width:9,depth:7.4,height:3.6,roofHeight:2.7,angle:Math.PI/2-.18,color:'#9c4036'},
  {id:'north-farm-barn',kind:'barn',x:-10,z:-248,width:12,depth:32,height:4.8,roofHeight:3.1,angle:.38,color:'#8e3b32'},
  {id:'north-farm-shed',kind:'shed',x:6,z:-279,width:14,depth:9,height:3.2,roofHeight:2.1,angle:.38,color:'#934437'},
  {id:'east-neighbor',kind:'home',x:93,z:-112,width:11,depth:9,height:3.9,roofHeight:3.1,angle:-.16,color:'#a04739'},
  {id:'east-neighbor-garage',kind:'shed',x:102,z:-93,width:7.4,depth:6,height:2.8,roofHeight:1.7,angle:-.16,color:'#8e3b32'},
  {id:'south-neighbor',kind:'home',x:77,z:37,width:9.8,depth:8,height:3.8,roofHeight:2.9,angle:Math.PI/2-.1,color:'#a04739'},
  {id:'south-neighbor-barn',kind:'barn',x:126,z:48,width:10,depth:23,height:4.2,roofHeight:2.7,angle:-.04,color:'#8c3a30'},
  {id:'south-farmhouse',kind:'home',x:169,z:221,width:11,depth:8.5,height:3.9,roofHeight:2.8,angle:-Math.PI/2,color:'#994334'},
  {id:'south-farm-barn',kind:'barn',x:163,z:252,width:12,depth:24,height:4.5,roofHeight:2.9,angle:-.08,color:'#86362e'},
  {id:'south-farm-shed',kind:'shed',x:188,z:239,width:8,depth:6,height:2.8,roofHeight:1.8,angle:.08,color:'#9e483a'},
  {id:'south-junction-house',kind:'home',x:209,z:359,width:10.4,depth:8.2,height:3.7,roofHeight:2.9,angle:-.22,color:'#a14636'},
  {id:'south-junction-barn',kind:'barn',x:255,z:351,width:12,depth:26,height:4.4,roofHeight:3,angle:-.13,color:'#89392f'},
  {id:'west-neighbor',kind:'home',x:-247,z:48,width:10,depth:7.7,height:3.5,roofHeight:2.6,angle:Math.PI/2,color:'#a24838'},
];

export interface LocalRoad { points: [number, number][]; width: number; asphalt?: boolean }
export const holmahultSideRoads: LocalRoad[] = [
  // Main road 120 is scenery beside the timed gravel route.
  {points:[[-95,-410],[-129,-330],[-166,-245],[-211,-150],[-263,-50],[-306,50],[-346,160],[-379,278],[-409,400]],width:8.2,asphalt:true},
  {points:[[-131,-340],[-123,-328],[-111,-327]],width:6.2},
  {points:[[-260,-50],[-248,-70],[-229,-95]],width:4.2},
  {points:[[-113,-119],[-59,-112],[9,-104],[66,-98],[102,-94]],width:3.5},
  {points:[[-113,-151],[-113,-185],[-83,-222],[-31,-241],[-10,-248]],width:3.8},
  {points:[[109,63],[161,77],[216,102],[251,111]],width:3.4},
  {points:[[-344,159],[-301,168],[-250,185],[-211,215],[-184,264],[-153,279],[-80,288],[11,313],[91,332],[139,341],[224,359],[314,364]],width:5.2},
  {points:[[-111,-51],[-117,-50],[-119,-46]],width:3},
  {points:[[126,205],[146,211],[169,221]],width:3.2},
  {points:[[-307,50],[-275,39],[-247,48]],width:3.2},
];

export const holmahultFields: [number, number][][] = [
  [[-139,-370],[-128,-165],[-118,-115],[-113,-36],[-211,-53],[-240,-100],[-204,-230]],
  [[-257,-40],[-117,-43],[-117,-2],[-235,-2]],
  [[-143,-370],[135,-370],[209,-299],[222,-183],[118,-142],[-89,-164]],
  [[-101,-112],[94,-91],[96,-19],[-98,-45]],
  [[-113,-34],[93,-10],[99,26],[-159,-7],[-202,-31]],
  [[-202,7],[95,40],[108,163],[-177,131],[-238,70]],
  [[119,-31],[286,-5],[303,120],[227,149],[123,112]],
  [[-232,152],[113,181],[120,299],[-140,259],[-173,214]],
  [[150,118],[281,157],[274,291],[210,301],[147,265]],
];

export function holmahultFieldAt(x: number, z: number): number {
  return holmahultFields.findIndex(polygon => {
    let inside = false;
    for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const [xi,zi]=polygon[i], [xj,zj]=polygon[j];
      if ((zi>z)!==(zj>z) && x<(xj-xi)*(z-zi)/(zj-zi)+xi) inside=!inside;
    }
    return inside;
  });
}

export const holmahultWalls: [number, number][][] = [
  [[-213,-15],[-150,-4],[-72,7],[11,18],[89,28]],
  [[-235,134],[-158,145],[-69,157],[23,173],[104,184]],
  [[-101,-119],[-34,-109],[29,-101],[86,-92]],
];

/** Keep background vegetation off the surrounding lanes as well as the timed route. */
export function onHolmahultSideRoad(x: number, z: number, clearance: number): boolean {
  return holmahultSideRoads.some(road => road.points.slice(1).some(([bx,bz],i) => {
    const [ax,az]=road.points[i],dx=bx-ax,dz=bz-az;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    return Math.hypot(x-ax-dx*t,z-az-dz*t)<road.width/2+clearance+2;
  }));
}
