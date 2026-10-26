import * as THREE from 'three';
import { createConfiguredTexture, textureDefinitions } from './textures.ts';

/** Share the same gravel grain across rally roads, shoulders, network roads and farmyards. */
export function createGravelTexture(random:()=>number):THREE.Texture {
  return createConfiguredTexture('gravel',random);
}

/** World-space UVs keep grain size and phase continuous through road junctions. */
export function applyGravelUVs(geometry:THREE.BufferGeometry):void {
  const positions=geometry.getAttribute('position'),uvs=new Float32Array(positions.count*2);
  for(let i=0;i<positions.count;i++) {
    uvs[i*2]=positions.getX(i)/textureDefinitions.gravel.worldScale;
    uvs[i*2+1]=positions.getZ(i)/textureDefinitions.gravel.worldScale;
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
}
