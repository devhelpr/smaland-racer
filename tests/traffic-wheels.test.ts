import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createATractor } from '../src/traffic-model.ts';
import { steerTrafficWheels } from '../src/traffic-wheels.ts';
import { disposeGroup } from '../src/dispose.ts';
import asset from '../assets/traffic.json' with {type:'json'};
import materials from '../assets/materials/traffic.json' with {type:'json'};

for(const [index,variant] of asset.variants.entries())test(`${variant.id}: rendered tires steer correctly throughout a complete wheel revolution`,()=>{
  const {mesh,wheels}=createATractor(materials.paintColors[index%materials.paintColors.length],index);
  const wheelbase=Math.max(...wheels.map(wheel=>wheel.position.z))-Math.min(...wheels.map(wheel=>wheel.position.z));
  for(const direction of [-1,1]) {
    steerTrafficWheels(wheels,direction*.2,wheelbase);
    const front=wheels.filter(wheel=>wheel.position.z>0);
    const inner=front.find(wheel=>Math.sign(wheel.position.x)===direction)!;
    const outer=front.find(wheel=>Math.sign(wheel.position.x)!==direction)!;
    assert.ok(Math.abs(inner.rotation.y)>Math.abs(outer.rotation.y),'the inner wheel turns further into the corner');
    assert.ok(Math.abs(outer.rotation.y)>.2,'small steering corrections are readable at the game camera distance');
    for(let frame=0;frame<=12;frame++) {
      for(const wheel of wheels)wheel.getObjectByName('wheel-spin')!.rotation.x=frame/12*Math.PI*2;
      mesh.updateMatrixWorld(true);
      for(const wheel of wheels) {
        const tire=wheel.getObjectByName('tire')!;
        const axle=new THREE.Vector3(0,1,0).applyQuaternion(tire.getWorldQuaternion(new THREE.Quaternion()));
        if(axle.x<0)axle.negate();
        const actualAngle=Math.atan2(-axle.z,axle.x);
        assert.ok(Math.abs(actualAngle-wheel.rotation.y)<1e-6,'the rendered tire axle keeps the steering angle while the wheel rolls');
        if(wheel.position.z>0)assert.equal(Math.sign(actualAngle),direction,'visible front tires point into the actual turn');
        else assert.ok(Math.abs(actualAngle)<1e-6,'visible rear tires remain straight');
        assert.ok(Math.abs(axle.y)<1e-6,'rolling does not wobble or tip the wheel axle');
        const tread=wheel.getObjectByName('tire-tread') as THREE.InstancedMesh;
        assert.equal(tread.count,asset.wheelTread.count);
        assert.equal(tread.parent,wheel.getObjectByName('wheel-spin'),'tread rolls with the tire');
      }
    }
  }
  steerTrafficWheels(wheels,0,wheelbase);
  for(const wheel of wheels)assert.equal(wheel.rotation.y,0,'wheels return to straight ahead');
  disposeGroup(mesh);
});
