import test from 'node:test';
import assert from 'node:assert/strict';
import { CheckpointGates } from '../src/checkpoints.ts';
import { Course, courses } from '../src/track.ts';
import { disposeGroup } from '../src/dispose.ts';
import * as THREE from 'three';

test('six visible numbered gantries follow the route; only the passed gantry fades away',()=> {
  const course = new Course(courses[0]), gates = new CheckpointGates(course);
  const gantries = gates.root.children;
  assert.equal(gantries.length,6);
  gantries.forEach((gate,i)=>assert.ok(gate.position.distanceTo(course.checkpoints[i+1].point)<.001));
  gates.pass(1); gates.update(.1);
  assert.ok(gantries[0].visible);
  gates.update(1);
  assert.equal(gantries[0].visible,false);
  assert.ok(gantries.slice(1).every(g=>g.visible));
  disposeGroup(gates.root);
});

test('circuit finish stays hidden at the start and reappears after checkpoint five on every lap',()=> {
  for (const definition of courses.filter(course=>course.closed)) {
    const gates = new CheckpointGates(new Course(definition));
    const gantries = gates.root.children;
    for(let lap=0;lap<2;lap++) {
      assert.ok(gantries.slice(0,5).every(g=>g.visible));
      assert.equal(gantries[5].visible,false);
      for(let i=1;i<=4;i++) {
        gates.pass(i); gates.update(1);
        assert.equal(gantries[5].visible,false);
      }
      gates.pass(5);
      assert.equal(gantries[5].visible,true);
      gates.update(1);
      gates.pass(6,true); gates.update(1);
    }
    disposeGroup(gates.root);
  }
});

test('passed checkpoints disappear within a quarter second',()=> {
  const gates = new CheckpointGates(new Course(courses[0]));
  gates.pass(1); gates.update(.25);
  assert.equal(gates.root.children[0].visible,false);
  disposeGroup(gates.root);
});

test('a simple fade preserves front-surface occlusion without pulse, glow or clipping',()=> {
  const gates = new CheckpointGates(new Course(courses[0]));
  const gantry = gates.root.children[0];
  const materials = new Set<THREE.MeshStandardMaterial>();
  gantry.traverse(object=> {
    if(object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial)materials.add(object.material);
  });
  gates.pass(1); gates.update(.11);
  for(const material of materials) {
    assert.equal(material.transparent,true);
    assert.equal(material.depthWrite,false);
    assert.equal(material.depthTest,true);
    assert.ok(Math.abs(material.opacity-.5)<.001);
    assert.equal(material.emissiveIntensity,1);
    assert.equal(material.emissive.getHex(),0);
    assert.equal(material.clippingPlanes,null);
  }
  let masks=0;
  gantry.traverse(object=> {
    if(!(object instanceof THREE.Mesh) || object.material.colorWrite!==false)return;
    masks++;
    assert.equal(object.parent!.visible,true);
    assert.equal(object.material.depthWrite,true);
    assert.ok(object.renderOrder<(gantry.children[0] as THREE.Mesh).renderOrder);
  });
  assert.ok(masks>0);
  gates.restore(1);
  for(const material of materials) {
    assert.equal(material.opacity,1);
    assert.equal(material.transparent,false);
    assert.equal(material.depthWrite,true);
  }
  disposeGroup(gates.root);
});
