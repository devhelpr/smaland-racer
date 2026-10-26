import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RoadNetwork, type RoadDefinition } from '../src/road-network.ts';
import fixture from './fixtures/road-curves.json' with { type: 'json' };

const network=new RoadNetwork(fixture.roads as RoadDefinition[],(x,z)=>(x+z)/100,1);

test('road bends are smooth, retain route anchors and share geometry with grip',()=>{
  const road=network.roads[0];
  for(const [x,z] of road.definition.points)assert.ok(road.points.some(p=>Math.hypot(p.x-x,p.z-z)<1e-8));
  let length=0,maxTurn=0;
  const geometry=network.ribbon(road,0),positions=geometry.getAttribute('position');
  for(let i=0;i<road.points.length;i++) {
    const p=road.points[i];
    assert.ok(network.nearest(p.x,p.z).distance<1e-8);
    const left=new THREE.Vector3().fromBufferAttribute(positions,i*2),right=new THREE.Vector3().fromBufferAttribute(positions,i*2+1);
    assert.ok(Math.hypot((left.x+right.x)/2-p.x,(left.z+right.z)/2-p.z)<1e-5);
    if(i)length+=Math.hypot(p.x-road.points[i-1].x,p.z-road.points[i-1].z);
    if(i&&i<road.points.length-1) {
      const incoming=p.clone().sub(road.points[i-1]).setY(0),outgoing=road.points[i+1].clone().sub(p).setY(0);
      maxTurn=Math.max(maxTurn,incoming.angleTo(outgoing));
    }
  }
  assert.ok(maxTurn<.2,`abrupt corner: ${maxTurn} radians`);
  assert.ok(road.points.some(p=>p.x<-1),'the centerline must curve between the authored points');
  assert.ok(Math.abs(length-road.length)<1e-8);
  geometry.dispose();
});

test('straight roads remain straight and connected road sections bend through their seam',()=>{
  assert.ok(network.roads[1].points.every(p=>Math.abs(p.x-100)<1e-8));
  const a=network.roads[2],b=network.roads[3],end=a.points.at(-1)!;
  assert.ok(end.distanceTo(b.points[0])<1e-8);
  const incoming=end.clone().sub(a.points.at(-2)!).setY(0),outgoing=b.points[1].clone().sub(b.points[0]).setY(0);
  assert.ok(incoming.angleTo(outgoing)<.2,'connected sections must share a smooth direction');
});
