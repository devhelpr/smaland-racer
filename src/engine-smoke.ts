import * as THREE from 'three';
import settings from '../assets/engine-smoke.json' with { type: 'json' };

/** Detached, buoyant smoke: only new particles inherit the bonnet's transform. */
export class EngineSmoke {
  readonly root = new THREE.Group();
  private readonly particles = Array.from({length:settings.capacity},()=>({
    position:new THREE.Vector3(), velocity:new THREE.Vector3(), age:0, life:0,
    size:0, growth:0, opacity:0, angle:0, spin:0,
  }));
  private readonly appearance = new THREE.InstancedBufferAttribute(new Float32Array(settings.capacity*2),2);
  private readonly mesh:THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly source = new THREE.Vector3();
  private accumulator = 0;
  private cursor = 0;
  private time = 0;

  constructor() {
    this.root.name='engine-smoke';
    const geometry=new THREE.PlaneGeometry(1,1);
    geometry.setAttribute('appearance',this.appearance);
    const material=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,fog:true,
      uniforms:{...THREE.UniformsLib.fog,
        lightColor:{value:new THREE.Color(settings.lightColor)},darkColor:{value:new THREE.Color(settings.darkColor)},
        time:{value:0},noiseScale:{value:settings.noiseScale},noiseSpeed:{value:settings.noiseSpeed}},
      vertexShader:`
        attribute vec2 appearance;
        varying vec2 vUv;
        varying float vOpacity;
        #include <fog_pars_vertex>
        void main() {
          vUv=uv; vOpacity=appearance.x;
          float c=cos(appearance.y),s=sin(appearance.y);
          vec2 offset=mat2(c,-s,s,c)*position.xy;
          vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);
          mvPosition.xy+=offset*length(instanceMatrix[0].xyz);
          gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader:`
        uniform vec3 lightColor,darkColor;
        uniform float time,noiseScale,noiseSpeed;
        varying vec2 vUv;
        varying float vOpacity;
        #include <fog_pars_fragment>
        float hash(vec2 p) {return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p) {
          vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
        }
        void main() {
          vec2 p=vUv-0.5;
          float n=noise(vUv*noiseScale+vec2(0.0,-time*noiseSpeed));
          n=0.65*n+0.35*noise(vUv*noiseScale*2.1-time*noiseSpeed);
          float edge=1.0-smoothstep(0.12,0.5,length(p)+(n-0.5)*0.16);
          float alpha=edge*(0.45+0.55*n)*vOpacity;
          if(alpha<0.002)discard;
          gl_FragColor=vec4(mix(darkColor,lightColor,n),alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.mesh=new THREE.InstancedMesh(geometry,material,settings.capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.appearance.setUsage(THREE.DynamicDrawUsage);
    // The particle bounds move independently of the car.
    this.mesh.frustumCulled=false;
    this.root.add(this.mesh);this.reset();
  }

  reset():void {
    this.accumulator=0;this.cursor=0;
    for(const p of this.particles)p.life=0;
    this.mesh.count=0;
  }

  update(dt:number,damage:number,hood:THREE.Object3D,velocity:THREE.Vector3):void {
    this.time+=dt;
    (this.mesh.material as THREE.ShaderMaterial).uniforms.time.value=this.time;
    // Cancel the parent transform so emitted smoke stays in world space, even in a rollover.
    this.root.parent?.updateWorldMatrix(true,false);
    this.root.matrixAutoUpdate=false;
    if(this.root.parent)this.root.matrix.copy(this.root.parent.matrixWorld).invert();
    this.root.matrixWorldNeedsUpdate=true;
    const severity=THREE.MathUtils.clamp((damage-settings.damageThreshold)/(100-settings.damageThreshold),0,1);
    const range=(values:number[])=>THREE.MathUtils.lerp(values[0],values[1],Math.random());
    const rate=THREE.MathUtils.lerp(...settings.emissionRate as [number,number],severity);
    if(severity>0) {
      this.accumulator+=dt*rate;
      hood.updateWorldMatrix(true,false);
      while(this.accumulator>=1) {
        this.accumulator--;
        const p=this.particles[this.cursor];this.cursor=(this.cursor+1)%this.particles.length;
        this.source.set((Math.random()-.5)*settings.sourceWidth,settings.sourceHeight,(Math.random()-.5)*settings.sourceDepth);
        p.position.copy(hood.localToWorld(this.source));
        p.velocity.copy(velocity).multiplyScalar(settings.velocityInheritance);
        p.velocity.y+=range(settings.riseSpeed);
        p.age=0;p.life=range(settings.lifetime);p.size=range(settings.initialSize);p.growth=range(settings.growth);
        p.opacity=THREE.MathUtils.lerp(...settings.opacity as [number,number],severity);
        p.angle=Math.random()*Math.PI*2;p.spin=(Math.random()-.5)*.5;
        // Stagger births within this frame instead of emitting a row of identical puffs.
        p.age=-dt+this.accumulator/rate;
      }
    } else this.accumulator=0;
    let count=0;
    for(const p of this.particles) {
      if(p.life===0)continue;
      p.age+=dt;
      if(p.age>=p.life) {p.life=0;continue;}
      const step=Math.min(dt,p.age);
      const drag=Math.exp(-settings.drag*step);
      p.velocity.x=settings.wind[0]+(p.velocity.x-settings.wind[0])*drag;
      p.velocity.z=settings.wind[2]+(p.velocity.z-settings.wind[2])*drag;
      p.velocity.y+=settings.buoyancy*step;
      p.position.addScaledVector(p.velocity,step);
      const phase=p.age/p.life;
      this.dummy.position.copy(p.position);
      this.dummy.position.x+=Math.sin(p.age*2+p.angle)*settings.turbulence*phase;
      this.dummy.position.z+=Math.cos(p.age*1.7+p.angle)*settings.turbulence*phase;
      this.dummy.scale.setScalar(p.size+p.growth*p.age);this.dummy.updateMatrix();
      this.mesh.setMatrixAt(count,this.dummy.matrix);
      this.appearance.setXY(count,p.opacity*THREE.MathUtils.smoothstep(phase,0,.12)*Math.pow(1-phase,1.4),p.angle+p.spin*p.age);
      count++;
    }
    this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;this.appearance.needsUpdate=true;
  }
}
