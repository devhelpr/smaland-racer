import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import defaultAsset from '../assets/vehicle.json' with { type: 'json' };
import materialAsset from '../assets/materials/vehicle.json' with { type: 'json' };

type Box = [number,number,number,number,number,number];
type Point = [number,number,number];
interface MeshData {vertices:number[][];indices:number[]}
interface ModelPart {
  name:string; material:string; box?:number[]; mesh?:MeshData;
  beam?:{size:number[];from:number[];to:number[]};
  torus?:number[]; position?:number[]; rotation?:number[];
}
export type VehicleAsset = Omit<typeof defaultAsset,'staticParts'|'bodyBevel'|'roundedBoxes'> & {
  staticParts:ModelPart[];
  roundedBoxes?:{segments:number;radius:number};
  bodyBevel?:THREE.ExtrudeGeometryOptions;
  upperBodyMesh?:MeshData;
  wheelParts?:ModelPart[];
  bodyContactBounds?:{min:number[];max:number[];samplesX:number;samplesZ:number};
  lighting?:{beamPosition:number[];ledHousingPosition:number[];ledLensPosition:number[]};
};

/** Bake decorative parts per material; damage panels and turning wheels stay separate. */
function batch(group:THREE.Group):void {
  const batches=new Map<THREE.Material,THREE.Mesh[]>();
  for(const child of group.children)if(child instanceof THREE.Mesh) {
    const material=child.material as THREE.Material;
    const meshes=batches.get(material)??[];meshes.push(child);batches.set(material,meshes);
  }
  for(const [material,meshes] of batches) {
    const geometries=meshes.map(mesh=>{
      mesh.updateMatrix();
      const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrix);geometry.deleteAttribute('uv');
      mesh.geometry.dispose();mesh.removeFromParent();return geometry;
    });
    const geometry=mergeGeometries(geometries);geometries.forEach(part=>part.dispose());
    if(!geometry)throw new Error('Vehicle detail geometry could not be merged');
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
}

export function createVehicleModel(root:THREE.Group,variant:Partial<VehicleAsset>={},color?:string,palette=materialAsset) {
  const asset:VehicleAsset={...defaultAsset,...variant};
  const {smokeMaterial:_,...definitions}=palette;
  const materials=Object.fromEntries(Object.entries(definitions).map(([id,settings])=>[id,new THREE.MeshStandardMaterial(settings)]));
  if(color)materials.paint.color.set(color);
  const decoration=new THREE.Group();decoration.name='vehicle-details';root.add(decoration);
  root.name=asset.name;root.userData.model=asset.name;
  const mesh=(group:THREE.Group,name:string,geometry:THREE.BufferGeometry,material:THREE.Material)=>{
    const part=new THREE.Mesh(geometry,material);part.name=name;part.castShadow=true;part.receiveShadow=true;group.add(part);return part;
  };
  const box=(group:THREE.Group,name:string,values:number[],material:THREE.Material)=>{
    const [w,h,d,x,y,z]=values as Box;
    const rounded=asset.roundedBoxes;
    const geometry=rounded?new RoundedBoxGeometry(w,h,d,rounded.segments,Math.min(rounded.radius,w/2,h/2,d/2)):new THREE.BoxGeometry(w,h,d);
    const part=mesh(group,name,geometry,material);part.position.set(x,y,z);return part;
  };
  const beam=(group:THREE.Group,name:string,size:number[],from:number[],to:number[],material:THREE.Material)=>{
    const a=new THREE.Vector3(...from as Point),b=new THREE.Vector3(...to as Point),direction=b.clone().sub(a);
    const part=mesh(group,name,new THREE.BoxGeometry(size[0],direction.length(),size[1]),material);
    part.position.copy(a).add(b).multiplyScalar(.5);part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return part;
  };
  // The lower silhouette cuts away the wheel arches instead of hiding tires in a box.
  const shape=new THREE.Shape();asset.bodyProfile.forEach(([z,y],i)=>i?shape.lineTo(-z,y):shape.moveTo(-z,y));shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:asset.bodyWidth,bevelEnabled:false,...asset.bodyBevel});
  geometry.translate(0,0,-asset.bodyWidth/2);geometry.rotateY(Math.PI/2);
  const body=mesh(root,'vehicle-body',geometry,materials.paint);
  const hood=box(root,'vehicle-hood',asset.hood,materials.paint);
  const authoredMesh=(group:THREE.Group,name:string,data:MeshData,material:THREE.Material)=>{
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.vertices.flat(),3));
    geometry.setIndex(data.indices);geometry.computeVertexNormals();
    return mesh(group,name,geometry,material);
  };
  if(asset.upperBodyMesh)authoredMesh(decoration,'upper-body',asset.upperBodyMesh,materials.paint);
  else {
    box(decoration,'roof',asset.roof,materials.paint);
    const cabin=new THREE.BufferGeometry();cabin.setAttribute('position',new THREE.Float32BufferAttribute(asset.cabinMesh.vertices.flat(),3));cabin.setIndex(asset.cabinMesh.indices);
    const glass=cabin.toNonIndexed();cabin.dispose();glass.computeVertexNormals();mesh(decoration,'sloped-glazing',glass,materials.glass);
  }
  box(decoration,'front-bumper',asset.frontBumper,materials.trim);box(decoration,'rear-bumper',asset.rearBumper,materials.trim);
  box(decoration,'rear-license-plate',asset.licensePlate,materials.white);
  const addPart=(group:THREE.Group,part:ModelPart)=>{
    if(part.mesh)authoredMesh(group,part.name,part.mesh,materials[part.material]);
    else if(part.box)box(group,part.name,part.box,materials[part.material]);
    else if(part.beam)beam(group,part.name,part.beam.size,part.beam.from,part.beam.to,materials[part.material]);
    else if(part.torus) {
      const ring=mesh(group,part.name,new THREE.TorusGeometry(...part.torus as [number,number,number,number]),materials[part.material]);
      if(part.position)ring.position.fromArray(part.position);
      if(part.rotation)ring.rotation.set(...part.rotation as Point);
    }
  };
  for(const part of asset.staticParts)addPart(decoration,part);
  const glyphs=asset.lettering.glyphs as Record<string,number[][][]>;
  for(const label of asset.lettering.labels) {
    const width=label.text.length*(label.width+label.spacing)-label.spacing;
    const rotation=new THREE.Matrix4().makeRotationY(label.angle),origin=new THREE.Vector3(...label.position as Point);
    for(const [i,letter] of [...label.text].entries())for(const stroke of glyphs[letter]??[])for(let j=1;j<stroke.length;j++) {
      const ends=[stroke[j-1],stroke[j]].map(([x,y])=>new THREE.Vector3(-width/2+i*(label.width+label.spacing)+x*label.width,(y-.5)*label.height,0).applyMatrix4(rotation).add(origin).toArray());
      beam(decoration,'badge-lettering',[label.stroke,label.depth],ends[0],ends[1],materials[label.material]);
    }
  }
  batch(decoration);
  const wheels:THREE.Group[]=[];
  for(const x of asset.wheelX)for(const z of asset.wheelZ) {
    const pivot=new THREE.Group();pivot.name=z>0?'front-wheel':'rear-wheel';pivot.position.set(x,asset.wheelHeight,z);root.add(pivot);wheels.push(pivot);
    const tire=mesh(pivot,'tire',new THREE.CylinderGeometry(...asset.tire as [number,number,number,number]),materials.trim);tire.rotation.z=Math.PI/2;
    const hub=mesh(pivot,'steel-hub',new THREE.CylinderGeometry(...asset.hub as [number,number,number,number]),materials.chrome);hub.rotation.z=Math.PI/2;
    const center=mesh(pivot,'hub-cap',new THREE.CylinderGeometry(...asset.hubCenter as [number,number,number,number]),materials.trim);center.rotation.z=Math.PI/2;
    const detail=new THREE.Group();pivot.add(detail);
    for(const part of asset.wheelParts??[])addPart(detail,part);
    for(const side of [-1,1]) {
      const rim=mesh(detail,'chrome-rim',new THREE.TorusGeometry(...asset.hubRing as [number,number,number,number]),materials.chrome);rim.rotation.y=Math.PI/2;rim.position.x=side*asset.wheelFaceX;
      for(let i=0;i<asset.wheelVent.count;i++) {
        const angle=i/asset.wheelVent.count*Math.PI*2;
        const vent=mesh(detail,'steel-wheel-slot',new THREE.BoxGeometry(...asset.wheelVent.size as Point),materials.trim);
        vent.position.set(side*asset.wheelFaceX,Math.sin(angle)*asset.wheelVent.radius,Math.cos(angle)*asset.wheelVent.radius);vent.rotation.set(angle,Math.PI/2,0);
      }
    }
    batch(detail);
    // Keep rolling around the axle independent from the steering pivot and mesh orientation.
    const spin=new THREE.Group();spin.name='wheel-spin';
    spin.add(...[...pivot.children]);pivot.add(spin);
  }
  // Some estate variants omit lens ribs or chrome strips from the shared palette.
  const used=new Set<THREE.Material>([materials.lamp,materials.red]);
  root.traverse(object=>{if(object instanceof THREE.Mesh)used.add(object.material as THREE.Material);});
  for(const material of Object.values(materials))if(!used.has(material))material.dispose();
  return {panels:[body,hood],wheels,lamp:materials.lamp,red:materials.red};
}
