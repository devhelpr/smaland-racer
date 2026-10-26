import * as THREE from 'three';
import textureData from '../assets/materials/textures.json' with { type: 'json' };

type RoadMarking={width:number;dashLength:number;dashOffset:number;position?:number;edgeInset?:number;side?:'left'|'right'};
type PatternDefinition={type:'pattern';pattern:'grass'|'grain'|'rings'|'boards';size:number;worldScale:number;anisotropy:number;repeat:number[];base:number;grain:number;frequency:number;wave?:number;groove?:number;patch?:number;patchCells?:number;grainFrequency?:number;warpFrequency?:number;blades?:number;bladeWidth?:number;bladeLength?:number;bladeShade?:number;seamWidth?:number;seamShade?:number};
type TextureDefinition=PatternDefinition | {type:'noise';size:number;minShade:number;shadeRange:number;greenRatio:number;blueRatio:number;opacity:number;worldScale:number;anisotropy:number}
  | {type:'image';url:string;worldScale:number;anisotropy:number}
  | {type:'road';width:number;height:number;minShade:number;shadeRange:number;opacity:number;worldScale:number;anisotropy:number;roadWidth:number;markingColor:string;markings:RoadMarking[]};
export const textureDefinitions:Record<string,TextureDefinition>=textureData as Record<string,TextureDefinition>;

/** Image URLs are served from public/ (for example /textures/gravel.jpg). */
export function createConfiguredTexture(name:string,random:()=>number=Math.random):THREE.Texture {
  const config=textureDefinitions[name];if(!config)throw new Error(`Unknown texture: ${name}`);
  let texture:THREE.Texture;
  if(config.type==='image')texture=new THREE.TextureLoader().load(config.url);
  else if(config.type==='pattern') {
    const pixels=new Uint8Array(config.size*config.size*4);
    const cells=config.patchCells??0,patches=Array.from({length:cells*cells},()=>random());
    for(let y=0;y<config.size;y++)for(let x=0;x<config.size;x++) {
      const u=x/config.size,v=y/config.size;
      let shade=config.base+(random()-.5)*config.grain;
      if(config.pattern==='grass') {
        const px=u*cells,py=v*cells,ix=Math.floor(px),iy=Math.floor(py);
        const smooth=(n:number)=>n*n*(3-2*n),fx=smooth(px-ix),fy=smooth(py-iy);
        const patch=(x:number,y:number)=>patches[(y%cells)*cells+x%cells];
        shade+=(THREE.MathUtils.lerp(THREE.MathUtils.lerp(patch(ix,iy),patch(ix+1,iy),fx),THREE.MathUtils.lerp(patch(ix,iy+1),patch(ix+1,iy+1),fx),fy)-.5)*config.patch!;
      }
      else if(config.pattern==='rings') {
        const radius=Math.hypot(u-.5,v-.5);
        shade-=Math.pow((1+Math.sin(radius*Math.PI*2*config.frequency+Math.sin(Math.atan2(v-.5,u-.5)*5)*config.wave!))/2,8)*config.groove!;
      } else {
        const phase=u*config.frequency+Math.sin(v*Math.PI*2*config.warpFrequency!)*config.wave!;
        shade-=Math.pow((1+Math.sin(phase*Math.PI*2*config.grainFrequency!))/2,6)*config.groove!;
        if(config.pattern==='boards'&&u<config.seamWidth!)shade-=config.seamShade!;
      }
      const value=THREE.MathUtils.clamp(Math.round(shade),0,255);
      pixels.set([value,value,value,255],(y*config.size+x)*4);
    }
    if(config.pattern==='grass')for(let i=0;i<config.blades!;i++) {
      const x=Math.floor(random()*config.size),y=Math.floor(random()*config.size);
      for(let j=0;j<config.bladeLength!;j++)for(let k=0;k<config.bladeWidth!;k++) {
        const index=(((y+j)%config.size)*config.size+(x+k+Math.floor(j/3))%config.size)*4;
        const value=Math.max(0,pixels[index]-config.bladeShade!*(1-j/config.bladeLength!));
        pixels.set([value,value,value,255],index);
      }
    }
    texture=new THREE.DataTexture(pixels,config.size,config.size);
  }
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
  if(config.type==='pattern')texture.repeat.set(config.repeat[0],config.repeat[1]);
  else if(config.type!=='road')texture.repeat.set(textureDefinitions.gravel.worldScale/config.worldScale,textureDefinitions.gravel.worldScale/config.worldScale);
  texture.name=name;texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=config.type==='road'?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=config.anisotropy;texture.needsUpdate=true;
  return texture;
}

/** Align gable planks with the normalized UVs on the box-shaped walls beneath them. */
export function applyFacadeUVs(geometry:THREE.BufferGeometry,width:number,height:number):void {
  const positions=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
  for(let i=0;i<positions.count;i++)uv.setXY(i,positions.getX(i)/width+.5,positions.getY(i)/height);
}
