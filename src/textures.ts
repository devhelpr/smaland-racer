import * as THREE from 'three';
import textureData from '../assets/materials/textures.json' with { type: 'json' };

type RoadMarking={width:number;dashLength:number;dashOffset:number;position?:number;edgeInset?:number;side?:'left'|'right'};
type TextureDefinition={type:'noise';size:number;minShade:number;shadeRange:number;greenRatio:number;blueRatio:number;opacity:number;worldScale:number;anisotropy:number}
  | {type:'image';url:string;worldScale:number;anisotropy:number}
  | {type:'road';width:number;height:number;minShade:number;shadeRange:number;opacity:number;worldScale:number;anisotropy:number;roadWidth:number;markingColor:string;markings:RoadMarking[]};
export const textureDefinitions:Record<string,TextureDefinition>=textureData as Record<string,TextureDefinition>;

/** Image URLs are served from public/ (for example /textures/gravel.jpg). */
export function createConfiguredTexture(name:string,random:()=>number=Math.random):THREE.Texture {
  const config=textureDefinitions[name];if(!config)throw new Error(`Unknown texture: ${name}`);
  let texture:THREE.Texture;
  if(config.type==='image')texture=new THREE.TextureLoader().load(config.url);
  else if(config.type==='road') {
    const pixels=new Uint8Array(config.width*config.height*4);
    // Hex colors are stored in sRGB, matching the texture's color space.
    const paint=new THREE.Color(config.markingColor).getHex(),rgb=[paint>>16&255,paint>>8&255,paint&255];
    for(let y=0;y<config.height;y++)for(let x=0;x<config.width;x++) {
      const across=(x+.5)/config.width,along=(y+.5)/config.height*config.worldScale;
      const shade=config.minShade+Math.floor(random()*config.shadeRange);
      const painted=config.markings.some(marking=>{
        const center=marking.position??(marking.side==='right'?1-marking.edgeInset!/config.roadWidth:marking.edgeInset!/config.roadWidth);
        const phase=((along+marking.dashOffset)%config.worldScale+config.worldScale)%config.worldScale;
        return Math.abs(across-center)<=marking.width/config.roadWidth/2&&phase<marking.dashLength;
      });
      pixels.set(painted?[...rgb,config.opacity]:[shade,shade,shade,config.opacity],(y*config.width+x)*4);
    }
    texture=new THREE.DataTexture(pixels,config.width,config.height);
  } else {
    const pixels=new Uint8Array(config.size*config.size*4);
    for(let i=0;i<config.size*config.size;i++) {
      const shade=config.minShade+Math.floor(random()*config.shadeRange);
      pixels.set([shade,Math.round(shade*config.greenRatio),Math.round(shade*config.blueRatio),config.opacity],i*4);
    }
    texture=new THREE.DataTexture(pixels,config.size,config.size);
  }
  if(config.type!=='road')texture.repeat.set(textureDefinitions.gravel.worldScale/config.worldScale,textureDefinitions.gravel.worldScale/config.worldScale);
  texture.name=name;texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=config.type==='road'?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=config.anisotropy;texture.needsUpdate=true;
  return texture;
}
