import farmerMaterials from '../assets/materials/farmer.json' with { type: 'json' };
import vehicleMaterials from '../assets/materials/vehicle.json' with { type: 'json' };
import farmerAsset from '../assets/farmer.json' with { type: 'json' };
import * as THREE from 'three';
import asset from '../assets/traffic.json' with { type: 'json' };
import vehicleAsset from '../assets/vehicle.json' with { type: 'json' };
import materialAsset from '../assets/materials/traffic.json' with { type: 'json' };
import { VehicleLighting } from './lighting.ts';
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
  const lighting=new VehicleLighting(model.lamp,model.red);
  // Traffic illuminates the road without rendering a forest shadow map for every vehicle.
  lighting.beam.castShadow=false;
  lighting.setMode('off');mesh.add(lighting.root);
  return {mesh,wheels:model.wheels,lighting,beacons:[] as THREE.Mesh<THREE.CylinderGeometry,THREE.MeshStandardMaterial>[]};
}

/** Compact panel van with two independent amber beacons and no auxiliary beam. */
export function createFarmer() {
  const mesh=new THREE.Group();
  const model=createVehicleModel(mesh,{...farmerAsset.model,lettering:{glyphs:vehicleAsset.lettering.glyphs,labels:[]}},farmerAsset.paint,{...vehicleMaterials,...farmerMaterials});
  mesh.name=farmerAsset.name;
  mesh.userData.modelId=farmerAsset.modelId;
  mesh.userData.driver='local-farmer';
  mesh.userData.paintColor=farmerAsset.paint;
  const beacons=farmerAsset.beacons.positions.map(position=>{
    const settings=farmerAsset.beacons;
    const beacon=new THREE.Mesh(new THREE.CylinderGeometry(...settings.geometry as [number,number,number,number]),new THREE.MeshStandardMaterial(settings.material));
    beacon.name='orange-roof-beacon';beacon.position.fromArray(position);mesh.add(beacon);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(...settings.baseGeometry as [number,number,number,number]),new THREE.MeshStandardMaterial(settings.baseMaterial));
    base.position.copy(beacon.position);base.position.y+=settings.baseOffset;mesh.add(base);
    return beacon;
  });
  const lighting=new VehicleLighting(model.lamp,model.red,undefined,{ledBar:false,projectedBeam:false});
  lighting.setMode('off');mesh.add(lighting.root);
  return {mesh,wheels:model.wheels,lighting,beacons};
}
