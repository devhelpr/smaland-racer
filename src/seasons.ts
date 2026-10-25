import seasonData from '../assets/seasons.json' with { type: 'json' };
import * as THREE from 'three';

export const seasons=['spring','summer','autumn','winter'] as const;
export type Season=typeof seasons[number];
export type SeasonalSurface='grass'|'evergreen'|'deciduous'|'gravel'|'water'|'stone';
export const isSeason=(value:unknown):value is Season=>seasons.includes(value as Season);
export const seasonPalettes:Record<Season,Record<SeasonalSurface|'sky'|'fog',string>>=seasonData.palettes;
const baselines:Record<SeasonalSurface,string>=seasonData.baselines;
const sourceColors=new WeakMap<THREE.BufferAttribute,Float32Array>();
const sourceMaterials=new WeakMap<THREE.Material,THREE.Color>();
const luminance=(color:THREE.Color)=>color.r*.2126+color.g*.7152+color.b*.0722;

/** Only tagged environmental colors change. Geometry, transforms, physics and assets stay intact. */
export function applySeason(root:THREE.Object3D,season:Season):void {
  const seenMaterials=new Set<THREE.Material>();
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const role=object.userData.seasonalSurface as SeasonalSurface|undefined;if(!role)return;
    const target=new THREE.Color(seasonPalettes[season][role]);
    const reference=luminance(new THREE.Color(baselines[role]));
    const tint=(base:THREE.Color)=>target.clone().multiplyScalar(THREE.MathUtils.clamp(luminance(base)/reference,.5,1.5));
    // Preserve the original color variation, even after repeated season switches.
    const attribute=object instanceof THREE.InstancedMesh&&object.instanceColor?object.instanceColor:role==='grass'?object.geometry.getAttribute('color'):null;
    if(attribute instanceof THREE.BufferAttribute) {
      if(!sourceColors.has(attribute))sourceColors.set(attribute,new Float32Array(attribute.array));
      const original=sourceColors.get(attribute)!;
      for(let i=0;i<attribute.count;i++) {
        const c=tint(new THREE.Color().fromArray(original,i*3));attribute.setXYZ(i,c.r,c.g,c.b);
      }
      attribute.needsUpdate=true;
    } else {
      for(const material of Array.isArray(object.material)?object.material:[object.material]) {
        if(seenMaterials.has(material)||!('color' in material)||!(material.color instanceof THREE.Color))continue;
        seenMaterials.add(material);
        if(!sourceMaterials.has(material))sourceMaterials.set(material,material.color.clone());
        material.color.copy(tint(sourceMaterials.get(material)!));
      }
    }
  });
}
