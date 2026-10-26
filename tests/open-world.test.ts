import { textureDefinitions } from '../src/textures.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { Vehicle } from '../src/vehicle.ts';
import type { DrivingWorld } from '../src/driving-world.ts';
import { createScenery } from '../src/scenery.ts';
import { CollisionWorld } from '../src/collision.ts';
import { disposeGroup } from '../src/dispose.ts';

const definition=courses.find(c=>c.id==='holmahult-open-world')!;

test('vehicle and stunts drive in a world without a course or race',()=>{
  const world:DrivingWorld={spawn:{point:new THREE.Vector3(),tangent:new THREE.Vector3(0,0,1)},heightAt:()=>0,surfaceAt:()=> 'asphalt',isWater:()=>false,nearestRoad:()=>({point:new THREE.Vector3(),tangent:new THREE.Vector3(0,0,1),width:8,distance:0,progress:0,surface:'asphalt'})};
  const car=new Vehicle(world);
  for(let i=0;i<120;i++)car.update(1/120,{throttle:1,steer:0,handbrake:false,autoDrift:false});
  assert.ok(car.position.z>1);assert.ok(car.onRoad);assert.equal(car.position.y,0);
  car.rightInPlace();assert.ok(Number.isFinite(car.position.y));
  disposeGroup(car.mesh);
});

test('the Course adapter preserves height, road surface, spawn and water on existing levels',()=>{
  for(const definition of courses.filter(c=>!c.openWorld)) {
    const course=new Course(definition);
    for(const t of [0,.25,.5,.75,1]) {
      const {point}=course.sample(t);
      assert.equal(course.heightAt(point.x,point.z),course.height(point.x,point.z));
      assert.equal(course.surfaceAt(point.x,point.z),course.onIce(point.x,point.z)?'ice':'gravel');
      assert.equal(course.isWater(point.x,point.z),course.inWater(point.x,point.z));
    }
    assert.deepEqual(course.spawn,course.sample(0));
  }
});

test('all network roads have grip, stay within the world and have gentle grades',()=>{
  const course=new Course(definition);
  for(const road of course.roadNetwork!.roads)for(const [i,p] of road.points.entries()) {
    assert.notEqual(course.surfaceAt(p.x,p.z),'grass',road.definition.id);
    assert.ok(Math.abs(p.x)<course.worldSize/2-8&&Math.abs(p.z)<course.worldSize/2-8);
    if(i) {
      const a=road.points[i-1],grade=Math.abs(p.y-a.y)/Math.hypot(p.x-a.x,p.z-a.z);
      assert.ok(grade<.12,`${road.definition.id}: grade ${grade}`);
    }
  }
  const heights=course.roadNetwork!.roads.flatMap(r=>r.points.map(p=>p.y));
  assert.ok(Math.max(...heights)-Math.min(...heights)>8);
});

test('every geographic road connects to Holmahult, including Dångebo and the Bro crossing',()=>{
  const course=new Course(definition),roads=course.roadNetwork!.roads;
  const reachable=new Set(['holmahult-village']);
  let changed=true;
  while(changed) {
    changed=false;
    for(const road of roads) {
      if(reachable.has(road.definition.id))continue;
      if(roads.some(other=>reachable.has(other.definition.id)&&road.definition.points.some(p=>other.definition.points.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<(road.definition.width+other.definition.width)/2)))) {
        reachable.add(road.definition.id);changed=true;
      }
    }
  }
  for(const road of roads.filter(r=>r.definition.id.startsWith('osm-')))assert.ok(reachable.has(road.definition.id),`${road.definition.id} disconnected`);
});

test('all road centerlines are clear and the Bro deck is dry above visible roadside water',()=>{
  const course=new Course(definition),scene=new THREE.Group(),collisions=new CollisionWorld();createScenery(scene,course,collisions);
  const blocked=new Set<string>();
  for(const road of course.roadNetwork!.roads)for(let i=1;i<road.points.length;i++) {
    const hit=collisions.sweep(road.points[i-1],road.points[i]);
    if(hit&&!hit.collider.id.startsWith('road-rock-'))blocked.add(`${road.definition.id} blocked by ${hit.collider.id}`);
  }
  assert.deepEqual([...blocked],[]);
  const b=definition.openWorld!.bridge,[x,z]=b.position;
  assert.ok(scene.getObjectByName('bro-bridge'));assert.equal(course.isWater(x,z),false);
  const sideX=x+20*Math.cos(b.angle),sideZ=z-20*Math.sin(b.angle);
  assert.ok(course.isWater(sideX,sideZ));assert.ok(course.height(x,z)-course.height(sideX,sideZ)>2);
  disposeGroup(scene);
});

test('every farm lane connects exactly to its parent road, including the restored western lane',()=>{
  const roads=definition.openWorld!.roads,byId=new Map(roads.map(r=>[r.id,r]));
  for(const join of definition.openWorld!.connections) {
    const p=byId.get(join.road)!.points.at(join.end)!;
    assert.ok(byId.get(join.target)!.points.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<1e-4),`${join.road} has a gap to ${join.target}`);
  }
  const west=byId.get('holmahult-west-lane')!;
  for(const id of ['local-2','local-9','local-6']) {
    const p=byId.get(id)!.points[0];assert.ok(west.points.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<1e-4));
  }
});

test('Bro road sections share both edges at their angled seams',async()=>{
  const {default:fixture}=await import('./fixtures/road-junctions.json',{with:{type:'json'}});
  const course=new Course(definition),network=course.roadNetwork!;
  for(const [aId,aEnd,bId,bEnd] of fixture.broSeams) {
    const a=network.roads.find(r=>r.definition.id===aId)!,b=network.roads.find(r=>r.definition.id===bId)!;
    const ga=network.ribbon(a,0),gb=network.ribbon(b,0),pa=ga.getAttribute('position'),pb=gb.getAttribute('position');
    const ai=aEnd===0?0:(a.points.length-1)*2,bi=bEnd===0?0:(b.points.length-1)*2;
    for(const index of [ai,ai+1]) {
      const p=new THREE.Vector3().fromBufferAttribute(pa,index);
      assert.ok([bi,bi+1].some(j=>p.distanceTo(new THREE.Vector3().fromBufferAttribute(pb,j))<.001),`${aId} / ${bId}: open seam`);
    }
    ga.dispose();gb.dispose();
  }
});

test('rounded road ends render the drivable approach and barn drives reach gravel courtyards',async()=>{
  const {default:fixture}=await import('./fixtures/road-junctions.json',{with:{type:'json'}});
  const {RoadNetwork}=await import('../src/road-network.ts');
  const network=new RoadNetwork(fixture.roads as import('../src/road-network.ts').RoadDefinition[],()=>0,1.5);
  const nearest=network.nearest(...fixture.wideRoadProbe as [number,number]);
  assert.ok(nearest.distance<=nearest.width/2,'a nearby narrow road must not remove grip from a wider road');
  const road=network.roads[0],geometry=network.ribbon(road,0),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  const [x,z]=fixture.capProbe;
  assert.ok(new THREE.Raycaster(new THREE.Vector3(x,10,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length>0,'visible road stops before the end of its grip corridor');
  disposeGroup(new THREE.Group().add(mesh));
  const course=new Course(definition);
  for(const id of ['local-3','local-4','local-7','local-8','local-9']) {
    const [x,z]=course.roadNetwork!.roads.find(r=>r.definition.id===id)!.definition.points.at(-1)!;
    assert.ok(definition.openWorld!.yards.some(([cx,cz,w,d])=>Math.abs(x-cx)<=w/2&&Math.abs(z-cz)<=d/2),`${id}: grass gap before the courtyard`);
  }
});

test('open-world gravel and farmyards retain grain, world-scale UVs and gray seasonal colors',async()=>{
  const {applySeason,seasons}=await import('../src/seasons.ts');
  const scene=new THREE.Group(),course=new Course(definition);createScenery(scene,course,new CollisionWorld());
  const meshes:THREE.Mesh[]=[];
  scene.traverse(object=>{if(object instanceof THREE.Mesh&&object.userData.seasonalSurface==='gravel')meshes.push(object);});
  assert.ok(meshes.length>course.roadNetwork!.roads.filter(r=>r.definition.surface==='gravel').length,'missing gravel farmyards');
  for(const mesh of meshes) {
    const material=mesh.material as THREE.MeshStandardMaterial,map=material.map;
    assert.ok(map instanceof THREE.DataTexture,`${mesh.name}: missing gravel grain`);
    const pixels=map.image.data!;
    assert.ok(new Set(Array.from(pixels)).size>2,'flat texture');
    for(let i=0;i<pixels.length;i+=4)assert.ok(pixels[i]===pixels[i+1]&&pixels[i]===pixels[i+2],'grain adds a yellow tint');
    const positions=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv');
    assert.equal(uv.count,positions.count);
    for(const i of [0,Math.floor(positions.count/2),positions.count-1]) {
      assert.ok(Math.abs(uv.getX(i)-positions.getX(i)/textureDefinitions.gravel.worldScale)<.0001);
      assert.ok(Math.abs(uv.getY(i)-positions.getZ(i)/textureDefinitions.gravel.worldScale)<.0001);
    }
  }
  for(const season of seasons) {
    applySeason(scene,season);
    for(const mesh of meshes) {
      const material=mesh.material as THREE.MeshStandardMaterial;
      assert.ok(material.map instanceof THREE.DataTexture,'season removed texture');
      const hex=material.color.getHexString(),rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
      assert.ok(Math.max(...rgb)-Math.min(...rgb)<18,`${season}: gravel became strongly tinted`);
    }
  }
  disposeGroup(scene);
});

test('the road 120 / Holmahult gravel junction has continuous coverage and stable asphalt priority',async()=>{
  const {createOpenWorldScenery}=await import('../src/open-world-scenery.ts');
  const {createGravelTexture}=await import('../src/gravel.ts');
  const {default:asset}=await import('../assets/open-world.json',{with:{type:'json'}});
  const scene=new THREE.Group(),course=new Course(definition),network=course.roadNetwork!;
  createOpenWorldScenery(scene,course,new CollisionWorld(),createGravelTexture(()=>.5));
  const approach=network.roads.find(r=>r.definition.id==='village-connection-0')!,parent=network.roads.find(r=>r.definition.id==='osm-120074113-0')!;
  const gravel=scene.getObjectByName(approach.definition.id)!,asphalt=scene.getObjectByName(parent.definition.id)!;
  const p=approach.points[0],direction=approach.points[1].clone().sub(p).setY(0).normalize();
  const normal=new THREE.Vector3(-direction.z,0,direction.x);
  let overlaps=0;
  // Walk both road edges and the interior from inside 120 onto the gravel approach.
  for(let along=-parent.definition.width/4;along<=parent.definition.width*2;along+=.25)for(let across=-approach.definition.width/2+.1;across<=approach.definition.width/2-.1;across+=.25) {
    const position=p.clone().addScaledVector(direction,along).addScaledVector(normal,across);
    const ray=new THREE.Raycaster(position.clone().setY(position.y+10),new THREE.Vector3(0,-1,0));
    const a=ray.intersectObject(asphalt),g=ray.intersectObject(gravel);
    assert.ok(a.length||g.length,`gap in the visible road at ${along}, ${across}`);
    if(a.length&&g.length) {
      overlaps++;
      assert.ok(a[0].point.y-g[0].point.y>asset.asphaltElevationOffset/2,'surfaces swap priority or flicker');
    }
  }
  assert.ok(overlaps>100,'junction overlap was not exercised');
  disposeGroup(scene);
});
