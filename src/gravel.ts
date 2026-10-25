import * as THREE from 'three';
import sceneryAsset from '../assets/scenery.json' with { type: 'json' };
import roadAsset from '../assets/road.json' with { type: 'json' };

/** Share the same gravel grain across rally roads, network roads and farmyards. */
export function createGravelTexture(random:()=>number):THREE.DataTexture {
  const config=sceneryAsset.gravelTexture,pixels=new Uint8Array(config.size*config.size*4);
  for(let i=0;i<config.size*config.size;i++) {
    const shade=config.minShade+Math.floor(random()*config.shadeRange);
    pixels.set([shade,Math.round(shade*config.greenRatio),Math.round(shade*config.blueRatio),config.opacity],i*4);
  }
  const texture=new THREE.DataTexture(pixels,config.size,config.size);
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;
  return texture;
}

/** World-space UVs keep grain size and phase continuous through road junctions. */
export function applyGravelUVs(geometry:THREE.BufferGeometry):void {
  const positions=geometry.getAttribute('position'),uvs=new Float32Array(positions.count*2);
  for(let i=0;i<positions.count;i++) {
    uvs[i*2]=positions.getX(i)/roadAsset.textureScale;
    uvs[i*2+1]=positions.getZ(i)/roadAsset.textureScale;
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
}
