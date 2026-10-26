import * as THREE from 'three';
import surfaceData from '../assets/materials/surfaces.json' with { type: 'json' };
import seasonData from '../assets/materials/seasons.json' with { type: 'json' };
import { createConfiguredTexture } from './textures.ts';

type Settings=Omit<THREE.MeshStandardMaterialParameters,'map'|'side'> & {map?:string|null;side?:string|THREE.Side;extends?:string};
export type SurfaceMaterial=keyof typeof surfaceData;
type Season=keyof typeof seasonData.materials;
const definitions=surfaceData as Record<string,Settings>;
const seasonal:Record<Season,Record<string,Settings>>=seasonData.materials;
const bindings=new WeakMap<THREE.Material,{ids:string[];base:Settings;previousKeys:string[];textures:Map<string,THREE.Texture>}>();
const defaults=new THREE.MeshStandardMaterial() as unknown as Record<string,unknown>;
const textureSets=new WeakMap<THREE.Texture,Map<string,THREE.Texture>>();

function lineage(id:string):string[] {
  const result:string[]=[];
  while(id) {
    if(result.includes(id))throw new Error(`Circular material inheritance: ${id}`);
    const definition=definitions[id];if(!definition)throw new Error(`Unknown material: ${id}`);
    result.unshift(id);id=definition.extends??'';
  }
  return result;
}

/** Scene-local materials share texture assets; each variant inherits the gravel defaults. */
export function createSurfaceMaterial(id:SurfaceMaterial,gravelTexture:THREE.Texture):THREE.MeshStandardMaterial {
  const material=new THREE.MeshStandardMaterial();
  let textures=textureSets.get(gravelTexture);
  if(!textures){textures=new Map([['gravel',gravelTexture]]);textureSets.set(gravelTexture,textures);}
  const ids=lineage(id);
  bindings.set(material,{ids,base:Object.assign({},...ids.map(id=>definitions[id])),previousKeys:[],textures});
  configure(material);
  return material;
}

/** Other scenery materials can override properties by their namespaced ID each season. */
export function createSceneryMaterial(id:string,settings:Settings):THREE.MeshStandardMaterial {
  const material=new THREE.MeshStandardMaterial();
  bindings.set(material,{ids:[id],base:settings,previousKeys:[],textures:new Map()});
  configure(material);
  return material;
}

function configure(material:THREE.MeshStandardMaterial,season?:Season):boolean {
  const binding=bindings.get(material);if(!binding)return false;
  const {ids,base}=binding;
  const overrides=Object.assign({},...ids.map(id=>season?seasonal[season][id]??{}:{})) as Settings;
  const resets=Object.fromEntries(binding.previousKeys.filter(key=>key in defaults).map(key=>[key,defaults[key]]));
  const {map,side,extends:_parent,...properties}={...resets,...base,...overrides};
  binding.previousKeys=Object.keys(overrides).filter(key=>!['map','side','extends'].includes(key));
  material.setValues(properties);
  if(map) {
    if(!binding.textures.has(map))binding.textures.set(map,createConfiguredTexture(map));
    material.map=binding.textures.get(map)!;
  } else material.map=null;
  material.side=side==='double'||side===THREE.DoubleSide?THREE.DoubleSide:side==='back'||side===THREE.BackSide?THREE.BackSide:THREE.FrontSide;
  material.needsUpdate=true;
  return overrides.color!==undefined;
}

/** Returns true when the seasonal override specifies an exact material color. */
export function applyMaterialSeason(material:THREE.Material,season:Season):boolean {
  return material instanceof THREE.MeshStandardMaterial?configure(material,season):false;
}

/** Include inactive seasonal maps when disposing a scene. */
export function materialTextures(material:THREE.Material):Iterable<THREE.Texture> {
  return bindings.get(material)?.textures.values()??[];
}
