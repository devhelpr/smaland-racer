import * as THREE from 'three';

export const seasons=['spring','summer','autumn','winter'] as const;
export type Season=typeof seasons[number];
export type SeasonalSurface='grass'|'evergreen'|'deciduous'|'gravel'|'water'|'stone';
export const isSeason=(value:unknown):value is Season=>seasons.includes(value as Season);
export const seasonPalettes:Record<Season,Record<SeasonalSurface|'sky'|'fog',string>>={
  spring:{grass:'#91a966',evergreen:'#5d8b62',deciduous:'#a4b96c',gravel:'#cab494',water:'#81a9aa',stone:'#96998b',sky:'#e6c4a1',fog:'#e4c9ab'},
  summer:{grass:'#879454',evergreen:'#4e7755',deciduous:'#7c9755',gravel:'#cfb58c',water:'#6d9da4',stone:'#949487',sky:'#eac098',fog:'#e5c09d'},
  autumn:{grass:'#a69759',evergreen:'#657856',deciduous:'#cc833c',gravel:'#c3a688',water:'#839b9c',stone:'#9d9487',sky:'#dfae8b',fog:'#dcbc9f'},
  winter:{grass:'#e0e5df',evergreen:'#b0bfb4',deciduous:'#c9cebf',gravel:'#bcbab0',water:'#a9c2c8',stone:'#c6cbc6',sky:'#d6c5c5',fog:'#dfd2c6'},
};
const baselines:Record<SeasonalSurface,string>={grass:'#829359',evergreen:'#78977d',deciduous:'#79945b',gravel:'#cfb58c',water:'#6fabb2',stone:'#8a8b7e'};
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
