import * as THREE from 'three';
import { Course, randomGenerator } from './track.ts';
import { CollisionWorld, type BoxCollider } from './collision.ts';
import { holmahultBuildings, holmahultSideRoads, holmahultWalls, type HolmahultBuilding } from './holmahult-data.ts';

/** Authored farmyards rather than the random roadside cottages used by other routes. */
export function createHolmahultScenery(scene: THREE.Group, course: Course, collisions: CollisionWorld): void {
  const white = new THREE.MeshStandardMaterial({color:'#eeeadd',roughness:.85});
  const roof = new THREE.MeshStandardMaterial({color:'#414441',roughness:1});
  const glass = new THREE.MeshStandardMaterial({color:'#79989c',roughness:.35,metalness:.15});
  const timber = new THREE.MeshStandardMaterial({color:'#493d32',roughness:1});
  const stone = new THREE.MeshStandardMaterial({color:'#939187',roughness:1,flatShading:true});
  const unitBox = new THREE.BoxGeometry(1,1,1);
  const box = (group:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material) => {
    const mesh=new THREE.Mesh(unitBox,material);
    mesh.scale.set(w,h,d);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  const gable = (group:THREE.Group,w:number,d:number,h:number,y:number,material:THREE.Material) => {
    const shape=new THREE.Shape();shape.moveTo(-w/2,0);shape.lineTo(0,h);shape.lineTo(w/2,0);shape.closePath();
    const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false}),material);
    mesh.position.set(0,y,-d/2);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  };
  const window = (group:THREE.Group,x:number,y:number,z:number,angle:number,w=1.3,h=1.55) => {
    const frame=new THREE.Group();frame.position.set(x,y,z);frame.rotation.y=angle;group.add(frame);
    box(frame,w+.22,h+.22,.13,0,0,0,white);
    box(frame,w,h,.15,0,0,.05,glass);
    box(frame,.07,h,.17,0,0,.07,white);box(frame,w,.07,.17,0,0,.07,white);
  };
  const building = (site:HolmahultBuilding) => {
    const group=new THREE.Group();group.name=site.id;
    group.position.set(site.x,course.height(site.x,site.z),site.z);group.rotation.y=site.angle;scene.add(group);
    const {width:w,depth:d,height:h,roofHeight:rh}=site;
    const paint=new THREE.MeshStandardMaterial({color:site.color,roughness:1});
    box(group,w+.2,.4,d+.2,0,.08,0,stone);
    box(group,w,h,d,0,h/2,0,paint);
    // Painted gables sit below two thin roof slopes, leaving visible timber at both ends.
    gable(group,w,d,rh,h,paint);
    const slope=Math.atan2(rh,w/2),length=Math.hypot(w/2+.45,rh+.15);
    for(const side of [-1,1]) {
      const panel=box(group,length,.18,d+.9,side*(w/4+.2),h+rh/2,0,roof);
      panel.rotation.z=-side*slope;
      const fascia=box(group,length,.18,.18,side*(w/4+.2),h+rh/2,d/2+.47,white);fascia.rotation.z=-side*slope;
      const back=fascia.clone();back.position.z=-d/2-.47;group.add(back);
    }
    for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])box(group,.18,h+.1,.18,x,h/2,z,white);
    box(group,w+.15,.16,d+.15,0,.38,0,white);
    if(site.kind==='home') {
      for(const z of [-d/2-.08,d/2+.08]) {
        const facing=z>0?0:Math.PI;
        for(const x of [-w*.3,w*.3])window(group,x,h*.59,z,facing);
        window(group,0,h+rh*.38,z,facing,1.0,1.0);
      }
      for(const side of [-1,1])for(const z of [-d*.27,d*.27])window(group,side*(w/2+.08),h*.59,z,side*Math.PI/2);
      box(group,1.5,2.55,.18,0,1.28,d/2+.07,white);
      box(group,1.22,2.36,.20,0,1.20,d/2+.13,timber);
      box(group,.78,.72,.08,0,1.81,d/2+.27,glass);
      box(group,.7,2,1, w*.21,h+rh*.74,-d*.16,roof);
      if(site.porch) {
        box(group,3.8,.24,2.5,0,.15,d/2+1.1,stone);
        box(group,4.1,.22,2.7,0,2.85,d/2+1.1,roof);
        for(const x of [-1.7,1.7])box(group,.15,2.8,.15,x,1.5,d/2+2.15,white);
        // Small geometric number plaque; no text texture or external asset is needed.
        const plaque=new THREE.Group();plaque.position.set(1.5,1.95,d/2+.17);group.add(plaque);
        box(plaque,.65,.42,.06,0,0,0,white);
        const segments=[[0,.12,.13,.025],[.065,.065,.025,.1],[0,0,.13,.025],[-.065,-.065,.025,.1],[0,-.12,.13,.025]];
        for(const [digit,mirror] of [[-.15,1],[.15,-1]])for(const [x,y,sw,sh] of segments)box(plaque,sw,sh,.025,digit+x*mirror,y,.05,timber);
      }
    } else {
      const doorWidth=Math.min(w*.55,4.6),doorHeight=Math.min(h-.3,3.5);
      box(group,doorWidth+.24,doorHeight+.18,.18,0,doorHeight/2,d/2+.08,white);
      box(group,doorWidth,doorHeight,.2,0,doorHeight/2,d/2+.17,timber);
      box(group,.08,doorHeight,.22,0,doorHeight/2,d/2+.2,white);
      for(const x of [-w*.34,w*.34])if(Math.abs(x)>doorWidth/2+.55)window(group,x,h*.65,d/2+.08,0,.8,.8);
      if(site.kind==='barn'&&d>w*1.8)for(const z of [-d*.26,d*.26]) {
        const doors=new THREE.Group();doors.position.set(-w/2-.07,0,z);doors.rotation.y=-Math.PI/2;group.add(doors);
        box(doors,3.9,3.45,.15,0,1.72,0,white);box(doors,3.65,3.25,.18,0,1.63,.06,timber);
        box(doors,.07,3.25,.2,0,1.63,.09,white);
      }
      // Vertical boards give the long red barns a different silhouette from the houses.
      for(let x=-w/2+.65;x<w/2;x+=.9)for(const z of [-d/2-.025,d/2+.025]) {
        if(z>0&&Math.abs(x)<doorWidth/2+.15)continue;
        box(group,.045,h-.2,.035,x,h/2,z,timber);
      }
    }
    // Batch the repeated boxes per material to keep the detailed farmyards light on mobile.
    group.updateMatrixWorld(true);
    const batches=new Map<THREE.Material,THREE.Mesh[]>();
    group.traverse(object=>{
      if(object instanceof THREE.Mesh&&object.geometry===unitBox) {
        const material=object.material as THREE.Material;
        const meshes=batches.get(material)??[];meshes.push(object);batches.set(material,meshes);
      }
    });
    const inverse=group.matrixWorld.clone().invert();
    for(const [material,meshes] of batches) {
      const instances=new THREE.InstancedMesh(unitBox,material,meshes.length);
      meshes.forEach((mesh,i)=>{instances.setMatrixAt(i,new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld));mesh.removeFromParent();});
      instances.castShadow=true;instances.receiveShadow=true;group.add(instances);
    }
    const collider:BoxCollider={id:site.id,x:site.x,z:site.z,kind:'building',halfX:w/2+.25,halfZ:d/2+.25,angle:site.angle,radius:Math.hypot(w/2+.25,d/2+.25)};
    collisions.add(collider);
    if(site.porch) {
      const localZ=d/2+1.1,halfX=1.95,halfZ=1.3;
      collisions.add({id:`${site.id}-porch`,x:site.x+Math.sin(site.angle)*localZ,z:site.z+Math.cos(site.angle)*localZ,kind:'building',halfX,halfZ,angle:site.angle,radius:Math.hypot(halfX,halfZ)} as BoxCollider);
    }
  };
  holmahultBuildings.forEach(building);

  const gravel=new THREE.MeshStandardMaterial({color:'#b5a68b',roughness:1,side:THREE.DoubleSide});
  const asphalt=new THREE.MeshStandardMaterial({color:'#777972',roughness:1,side:THREE.DoubleSide});
  for(const [x,z,w,d] of [[-137,-82,24,18],[-131,-132,22,14],[101,-98,14,16],[169,239,24,27]]) {
    const geometry=new THREE.PlaneGeometry(w,d,8,8);geometry.rotateX(-Math.PI/2);
    const positions=geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++) {
      const px=positions.getX(i)+x,pz=positions.getZ(i)+z;
      positions.setXYZ(i,px,course.height(px,pz)+.07,pz);
    }
    geometry.computeVertexNormals();const yard=new THREE.Mesh(geometry,gravel);yard.receiveShadow=true;scene.add(yard);
  }
  for(const [index,road] of holmahultSideRoads.entries()) {
    const curve=new THREE.CatmullRomCurve3(road.points.map(([x,z])=>new THREE.Vector3(x,0,z)),false,'centripetal');
    const count=Math.ceil(curve.getLength()/1.5),positions:number[]=[],indices:number[]=[];
    for(let i=0;i<=count;i++) {
      const p=curve.getPointAt(i/count),t=curve.getTangentAt(i/count);
      for(const side of [-1,1]) {
        const x=p.x-t.z*road.width/2*side,z=p.z+t.x*road.width/2*side;
        positions.push(x,course.height(x,z)+.09,z);
      }
      if(i<count){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,road.asphalt?asphalt:gravel);mesh.name=`holmahult-side-road-${index}`;mesh.receiveShadow=true;scene.add(mesh);
  }

  const random=randomGenerator(250519);
  const wallPositions:THREE.Vector3[]=[];
  for(const points of holmahultWalls)for(let j=1;j<points.length;j++) {
    const [ax,az]=points[j-1],[bx,bz]=points[j],length=Math.hypot(bx-ax,bz-az);
    for(let d=0;d<length;d+=1.1) {
      const x=ax+(bx-ax)*d/length,z=az+(bz-az)*d/length;
      if(course.nearest(x,z).distance<course.definition.width/2+2)continue;
      wallPositions.push(new THREE.Vector3(x,course.height(x,z)+.3,z));
    }
  }
  const walls=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),stone,wallPositions.length);walls.name='holmahult-stone-walls';
  const dummy=new THREE.Object3D();
  wallPositions.forEach((p,i)=>{
    dummy.position.copy(p);dummy.rotation.set(random()*.5,random()*6,random()*.3);dummy.scale.set(.6+random()*.2,.4+random()*.2,.5+random()*.2);dummy.updateMatrix();walls.setMatrixAt(i,dummy.matrix);
    collisions.add({id:`holmahult-wall-${i}`,x:p.x,z:p.z,radius:.7,kind:'rock'});
  });
  walls.castShadow=true;walls.receiveShadow=true;scene.add(walls);

  // Birch and broadleaf trees along field boundaries and in the gardens.
  const sites:[number,number][]=[[-147,-52],[-155,-72],[-165,-30],[-99,-74],[-148,-115],[-96,-132],[76,-120],[89,-127],[69,21],[59,38],[179,205],[195,228]];
  for(const wall of holmahultWalls)for(let i=0;i<wall.length-1;i++) {
    const [a,b]=[wall[i],wall[i+1]];
    for(let t=.15;t<1;t+=.28)sites.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t+2.2]);
  }
  const clear=sites.filter(([x,z])=>course.nearest(x,z).distance>course.definition.width/2+4&&!holmahultBuildings.some(b=>Math.hypot(x-b.x,z-b.z)<Math.hypot(b.width,b.depth)/2+2));
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.2,.3,6,5),white,clear.length);
  const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:'#79945b',roughness:1,flatShading:true}),clear.length);
  clear.forEach(([x,z],i)=>{
    const base=course.height(x,z),s=.85+random()*.5;dummy.rotation.set(0,random()*6,0);
    dummy.position.set(x,base+3*s,z);dummy.scale.set(s,s,s);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    dummy.position.y=base+6*s;dummy.scale.set(3*s,3.8*s,2.7*s);dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);
    collisions.add({id:`holmahult-birch-${i}`,x,z,radius:.3*s,kind:'tree'});
  });
  for(const mesh of [trunks,crowns]){mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);}
}
