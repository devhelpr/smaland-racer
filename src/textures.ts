import * as THREE from 'three';
import textureData from '../assets/materials/textures.json' with { type: 'json' };

type RoadMarking={width:number;dashLength:number;dashOffset:number;position?:number;edgeInset?:number;side?:'left'|'right'};
type PatternDefinition={type:'pattern';pattern:'grass'|'grain'|'rings'|'boards'|'birch';direction?:'horizontal'|'vertical';size:number;worldScale:number;anisotropy:number;repeat:number[];base:number;grain:number;frequency:number;wave?:number;groove?:number;patch?:number;patchCells?:number;grainFrequency?:number;warpFrequency?:number;blades?:number;bladeWidth?:number;bladeLength?:number;bladeShade?:number;seamWidth?:number;seamShade?:number};
type FoliageDefinition={type:'foliage';species:'spruce'|'birch';size:number;worldScale:number;anisotropy:number;seed:number;shade:number;shadeRange:number;stemWidth:number;stem:number[];twigStart?:number;twigSpan?:number;twigRise?:number;spreadPower?:number;lengthVariation?:number;needleLengthVariation?:number;needleBackRatio?:number;leafCenter?:number[];leafSpread?:number[];leafStemRatio?:number;leafSizeVariation?:number;twigs?:number;needlesPerTwig?:number;spread?:number;needleLength?:number;needleWidth?:number;leafVeinShade?:number;leafVeinWidth?:number;leafTip?:number;leafBase?:number;twigCount?:number;leafCount?:number;leafRadius?:number[]};
type TextureDefinition=PatternDefinition | FoliageDefinition | {type:'noise';size:number;minShade:number;shadeRange:number;greenRatio:number;blueRatio:number;opacity:number;worldScale:number;anisotropy:number}
  | {type:'image';url:string;worldScale:number;anisotropy:number}
  | {type:'road';width:number;height:number;minShade:number;shadeRange:number;opacity:number;worldScale:number;anisotropy:number;roadWidth:number;markingColor:string;markings:RoadMarking[]};
export const textureDefinitions:Record<string,TextureDefinition>=textureData as Record<string,TextureDefinition>;

/** Image URLs are served from public/ (for example /textures/gravel.jpg). */
export function createConfiguredTexture(name:string,random:()=>number=Math.random):THREE.Texture {
  const config=textureDefinitions[name];if(!config)throw new Error(`Unknown texture: ${name}`);
  let texture:THREE.Texture;
  if(config.type==='image')texture=new THREE.TextureLoader().load(config.url);
  else if(config.type==='foliage')texture=createFoliageTexture(config);
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
      else if(config.pattern==='birch') {
        const cellX=Math.floor(u*config.patchCells!),cellY=Math.floor(v*config.frequency);
        const hash=(Math.sin(cellX*127.1+cellY*311.7)*43758.5453)%1;
        const fraction=Math.abs(hash),across=u*config.patchCells!-cellX,along=v*config.frequency-cellY;
        const scar=Math.abs(along-.5-Math.sin(across*Math.PI)*config.wave!);
        if(scar<config.seamWidth!*(1-fraction)&&across<config.groove!+fraction*(1-config.groove!))shade-=config.seamShade!*(1-fraction/2);
      }
      else if(config.pattern==='rings') {
        const radius=Math.hypot(u-.5,v-.5);
        shade-=Math.pow((1+Math.sin(radius*Math.PI*2*config.frequency+Math.sin(Math.atan2(v-.5,u-.5)*5)*config.wave!))/2,8)*config.groove!;
      } else {
        const across=config.direction==='horizontal'?v:u,along=config.direction==='horizontal'?u:v;
        const phase=across*config.frequency+Math.sin(along*Math.PI*2*config.warpFrequency!)*config.wave!;
        shade-=Math.pow((1+Math.sin(phase*Math.PI*2*config.grainFrequency!))/2,6)*config.groove!;
        if(config.pattern==='boards'&&across<config.seamWidth!)shade-=config.seamShade!;
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
  else if(config.type!=='road'&&config.type!=='foliage')texture.repeat.set(textureDefinitions.gravel.worldScale/config.worldScale,textureDefinitions.gravel.worldScale/config.worldScale);
  texture.name=name;texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=config.type==='road'||config.type==='foliage'?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;texture.wrapT=config.type==='foliage'?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=config.anisotropy;texture.needsUpdate=true;
  return texture;
}

/** Align gable planks with the normalized UVs on the box-shaped walls beneath them. */
export function applyFacadeUVs(geometry:THREE.BufferGeometry,width:number,height:number):void {
  const positions=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
  for(let i=0;i<positions.count;i++)uv.setXY(i,positions.getX(i)/width+.5,positions.getY(i)/height);
}

/** Transparent, deterministic botanical atlases; all styling comes from the texture asset JSON. */
function createFoliageTexture(config:FoliageDefinition):THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=config.size;
  const context=canvas.getContext('2d')!;const size=config.size;
  let seed=config.seed;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const ink=()=>{const shade=Math.floor(config.shade+random()*config.shadeRange);return `rgb(${shade},${shade},${shade})`;};
  const line=(ax:number,ay:number,bx:number,by:number,width:number)=>{
    context.lineWidth=width;context.beginPath();context.moveTo(ax*size,(1-ay)*size);context.lineTo(bx*size,(1-by)*size);context.stroke();
  };
  context.lineCap='round';context.strokeStyle=ink();
  line(config.stem[0],config.stem[1],config.stem[2],config.stem[3],config.stemWidth);
  if(config.species==='spruce') {
    for(let twig=0;twig<config.twigs!;twig++) {
      const t=config.twigStart!+twig/config.twigs!*config.twigSpan!,side=twig%2?1:-1;
      const length=config.spread!*Math.pow(Math.sin(Math.PI*t),config.spreadPower!)*(1-config.lengthVariation!+random()*config.lengthVariation!);
      const ax=config.stem[0],ay=t,bx=ax+side*length,by=t+config.twigRise!;
      context.strokeStyle=ink();line(ax,ay,bx,by,config.stemWidth/2);
      for(let needle=0;needle<config.needlesPerTwig!;needle++) {
        const f=needle/config.needlesPerTwig!,x=ax+(bx-ax)*f,y=ay+(by-ay)*f;
        const reach=config.needleLength!*(1-config.needleLengthVariation!+random()*config.needleLengthVariation!);
        context.strokeStyle=ink();
        line(x,y,x+side*reach,y+reach,config.needleWidth!);
        line(x,y,x+side*reach*config.needleBackRatio!,y-reach,config.needleWidth!);
      }
    }
  } else {
    // Leaves grow from a branching sprig instead of radiating from one central wire.
    const twigs=Array.from({length:config.twigCount!},(_,index)=>{
      const t=(index+1)/(config.twigCount!+1),side=index%2?1:-1;
      const ax=config.stem[0],ay=t;
      const bx=ax+side*config.leafSpread![0]*Math.sin(t*Math.PI),by=t+config.twigRise!;
      context.strokeStyle=ink();line(ax,ay,bx,by,config.stemWidth);return {ax,ay,bx,by};
    });
    for(let leaf=0;leaf<config.leafCount!;leaf++) {
      const twig=twigs[leaf%twigs.length],t=random();
      const x=twig.ax+(twig.bx-twig.ax)*t,y=twig.ay+(twig.by-twig.ay)*t;
      const rx=config.leafRadius![0]*size*(1-config.leafSizeVariation!/2+random()*config.leafSizeVariation!),ry=config.leafRadius![1]*size;
      const angle=random()*Math.PI*2;
      context.save();context.translate(x*size,(1-y)*size);context.rotate(angle);
      context.fillStyle=ink();context.beginPath();context.moveTo(0,ry*config.leafBase!);
      context.bezierCurveTo(-rx,ry,-rx,-ry/2,0,-ry*config.leafTip!);
      context.bezierCurveTo(rx,-ry/2,rx,ry,0,ry*config.leafBase!);context.fill();
      context.strokeStyle=`rgb(${config.leafVeinShade},${config.leafVeinShade},${config.leafVeinShade})`;
      context.lineWidth=config.leafVeinWidth!;context.beginPath();context.moveTo(0,ry*config.leafBase!);context.lineTo(0,-ry);context.stroke();
      context.restore();
    }

  }
  return new THREE.CanvasTexture(canvas);
}
