import * as THREE from 'three';
import asset from '../assets/traffic.json' with { type: 'json' };
import vehicleAsset from '../assets/vehicle.json' with { type: 'json' };
import materialAsset from '../assets/materials/traffic.json' with { type: 'json' };
import { createVehicleModel } from './vehicle-model.ts';

/** Shared Volvo detailing, with authored estate bodies and distinct series-specific parts. */
export function createATractor(color:string,variantIndex:number) {
  const mesh=new THREE.Group(),variant=asset.variants[variantIndex%asset.variants.length];
  const omitted=new Set([...asset.omitParts,...variant.omitParts]);
  const model=createVehicleModel(mesh,{
    ...variant.overrides,
    staticParts:[...vehicleAsset.staticParts.filter(part=>!omitted.has(part.name)),...asset.commonParts,...variant.parts],
    lettering:{glyphs:{...vehicleAsset.lettering.glyphs,...asset.extraGlyphs},labels:variant.labels}
  },color);
  const treadGeometry=new THREE.BoxGeometry(...asset.wheelTread.size as [number,number,number]);
  const treadMaterial=new THREE.MeshStandardMaterial(materialAsset.tread);
  for(const wheel of model.wheels) {
    const tread=new THREE.InstancedMesh(treadGeometry,treadMaterial,asset.wheelTread.count);
    tread.name='tire-tread';tread.castShadow=true;tread.receiveShadow=true;
    const transform=new THREE.Object3D();
    for(let i=0;i<asset.wheelTread.count;i++) {
      const angle=i/asset.wheelTread.count*Math.PI*2;
      transform.position.set(0,Math.cos(angle)*asset.wheelTread.radius,Math.sin(angle)*asset.wheelTread.radius);
      transform.rotation.x=angle;transform.updateMatrix();tread.setMatrixAt(i,transform.matrix);
    }
    wheel.getObjectByName('wheel-spin')!.add(tread);
  }
  mesh.userData.modelId=variant.id;mesh.userData.bodyStyle='stationwagon';mesh.userData.paintColor=color;
  const triangle=new THREE.Shape();triangle.moveTo(...asset.triangleTop as [number,number]);triangle.lineTo(...asset.triangleLeft as [number,number]);triangle.lineTo(...asset.triangleRight as [number,number]);triangle.closePath();
  const border=new THREE.Mesh(new THREE.ShapeGeometry(triangle),new THREE.MeshBasicMaterial({...materialAsset.border,side:THREE.DoubleSide}));
  border.name='slow-vehicle-triangle';border.position.fromArray(asset.triangleBorderPosition);mesh.add(border);
  const center=new THREE.Mesh(new THREE.ShapeGeometry(triangle),new THREE.MeshBasicMaterial({...materialAsset.center,side:THREE.DoubleSide}));
  center.name='slow-vehicle-triangle-center';center.scale.setScalar(asset.triangleCenterScale);center.position.fromArray(asset.triangleCenterPosition);mesh.add(center);
  return {mesh,wheels:model.wheels};
}
