import { createSurfaceMaterial, createSceneryMaterial } from './materials.ts';
import materialAsset from '../assets/materials/holmahult-scenery.json' with { type: 'json' };
import roadAsset from '../assets/road.json' with { type: 'json' };
import sceneryAsset from '../assets/scenery.json' with { type: 'json' };
import { applyGravelUVs, createGravelTexture } from './gravel.ts';
import asset from '../assets/holmahult-scenery.json' with { type: 'json' };
import sceneryData from '../parcours/holmahult.json' with { type: 'json' };
import * as THREE from 'three';

import { createHolmahultHome } from './holmahult-home.ts';
import { Course, randomGenerator } from './track.ts';
import { CollisionWorld, type BoxCollider } from './collision.ts';
import { holmahultBuildings, holmahultSideRoads, holmahultWalls, type HolmahultBuilding } from './holmahult-data.ts';

const details=asset.details;

/** Authored farmyards rather than the random roadside cottages used by other routes. */
export function createHolmahultScenery(scene: THREE.Group, course: Course, collisions: CollisionWorld,gravelTexture?:THREE.Texture): void {
  const white = createSceneryMaterial('holmahult-scenery.white',materialAsset.white);
  const roof = createSceneryMaterial('holmahult-scenery.roof',materialAsset.roof);
  const glass = createSceneryMaterial('holmahult-scenery.glass',materialAsset.glass);
  const timber = createSceneryMaterial('holmahult-scenery.timber',materialAsset.timber);
  const stone = createSceneryMaterial('holmahult-scenery.stone',materialAsset.stone);
  const unitBox = new THREE.BoxGeometry(...asset.unitBox as [number, number, number]);
  const box = (group:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material) => {
    const mesh=new THREE.Mesh(unitBox,material);
    mesh.scale.set(w,h,d);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  const gable = (group:THREE.Group,w:number,d:number,h:number,y:number,material:THREE.Material) => {
    const shape=new THREE.Shape();shape.moveTo(-w/2,0);shape.lineTo(0,h);shape.lineTo(w/2,0);shape.closePath();
    const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false}),material);
    mesh.position.set(0,y,-d/2);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  };
  const window = (group:THREE.Group,x:number,y:number,z:number,angle:number,w=details.windowWidth,h=details.windowHeight) => {
    const frame=new THREE.Group();frame.position.set(x,y,z);frame.rotation.y=angle;group.add(frame);
    box(frame,w+details.windowFrameExtra,h+details.windowFrameExtra,...asset.windowFrameDepthPosition as [number, number, number, number],white);
    box(frame,w,h,...asset.windowGlassDepthPosition as [number, number, number, number],glass);
    box(frame,details.mullionWidth,h,...asset.verticalMullionDepthPosition as [number, number, number, number],white);box(frame,w,...asset.horizontalMullionSizePosition as [number, number, number, number, number],white);
  };
  const building = (site:HolmahultBuilding) => {
    const group=new THREE.Group();group.name=site.id;
    group.position.set(site.x,course.height(site.x,site.z),site.z);group.rotation.y=site.angle;scene.add(group);
    const {width:w,depth:d,height:h,roofHeight:rh}=site;
    const paint=createSceneryMaterial('holmahult-scenery.paint',{color:site.color,...materialAsset.paint});
    if(site.id==='holmahult-25') {
      createHolmahultHome(group,site,box,{white,roof,glass,stone,paint});
    } else {
      box(group,w+details.foundationExtra,details.foundationHeight,d+details.foundationExtra,...asset.foundationPosition as [number, number, number],stone);
      box(group,w,h,d,0,h/2,0,paint);
      // Painted gables sit below two thin roof slopes, leaving visible timber at both ends.
      gable(group,w,d,rh,h,paint);
      const slope=Math.atan2(rh,w/2),length=Math.hypot(w/2+details.roofOverhang,rh+details.roofRiseExtra);
      for(const side of [-1,1]) {
        const panel=box(group,length,details.roofThickness,d+details.roofExtraDepth,side*(w/4+details.roofOffsetX),h+rh/2,0,roof);
        panel.rotation.z=-side*slope;
        const fascia=box(group,length,...asset.fascia as [number, number],side*(w/4+details.roofOffsetX),h+rh/2,d/2+details.fasciaOffset,white);fascia.rotation.z=-side*slope;
        const back=fascia.clone();back.position.z=-d/2-details.fasciaOffset;group.add(back);
      }
      for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])box(group,details.cornerWidth,h+details.cornerExtraHeight,details.cornerWidth,x,h/2,z,white);
      box(group,w+details.baseTrimExtra,details.baseTrimHeight,d+details.baseTrimExtra,...asset.baseTrimPosition as [number, number, number],white);
      if(site.kind==='home') {
        for(const z of [-d/2-details.windowOffset,d/2+details.windowOffset]) {
          const facing=z>0?0:Math.PI;
          for(const x of details.frontWindowX.map(x=>w*x))window(group,x,h*details.windowHeightRatio,z,facing);
          window(group,0,h+rh*details.atticWindowHeightRatio,z,facing,1.0,1.0);
        }
        for(const side of [-1,1])for(const z of details.sideWindowZ.map(z=>d*z))window(group,side*(w/2+details.windowOffset),h*details.windowHeightRatio,z,side*Math.PI/2);
        box(group,...asset.doorFrameSizeXY as [number, number, number, number, number],d/2+details.doorFrameOffset,white);
        box(group,...asset.doorSizeXY as [number, number, number, number, number],d/2+details.doorOffset,timber);
        box(group,...asset.doorGlassSizeXY as [number, number, number, number, number],d/2+details.doorGlassOffset,glass);
        box(group,...asset.chimneySize as [number, number, number], w*details.chimneyXRatio,h+rh*details.chimneyHeightRatio,-d*details.chimneyZRatio,roof);
        if(site.porch) {
          box(group,...asset.porchBaseSizeXY as [number, number, number, number, number],d/2+details.porchOffsetZ,stone);
          box(group,...asset.porchRoofSizeXY as [number, number, number, number, number],d/2+details.porchOffsetZ,roof);
          for(const x of asset.porchPostX)box(group,...asset.porchPostSize as [number, number, number],x,details.porchPostY,d/2+details.porchPostZ,white);
          // Small geometric number plaque; no text texture or external asset is needed.
          const plaque=new THREE.Group();plaque.position.set(details.plaqueX,details.plaqueY,d/2+details.plaqueZ);group.add(plaque);
          box(plaque,...asset.numberPlaque as [number, number, number, number, number, number],white);
          const segments=asset.segments;
          for(const [digit,mirror] of asset.numberDigits)for(const [x,y,sw,sh] of segments)box(plaque,sw,sh,details.digitDepth,digit+x*mirror,y,details.digitZ,timber);
        }
      } else {
        const doorWidth=Math.min(w*details.barnDoorWidthRatio,details.barnDoorMaxWidth),doorHeight=Math.min(h-details.barnDoorHeadroom,details.barnDoorMaxHeight);
        box(group,doorWidth+details.barnDoorFrameExtraWidth,doorHeight+details.barnDoorFrameExtraHeight,...asset.barnFrameDepthX as [number, number],doorHeight/2,d/2+details.windowOffset,white);
        box(group,doorWidth,doorHeight,...asset.barnDoorDepthX as [number, number],doorHeight/2,d/2+details.barnDoorOffset,timber);
        box(group,details.barnDoorDividerWidth,doorHeight,...asset.barnDoorDividerDepthX as [number, number],doorHeight/2,d/2+details.barnDoorDividerOffset,white);
        for(const x of details.barnWindowX.map(x=>w*x))if(Math.abs(x)>doorWidth/2+details.barnWindowDoorClearance)window(group,x,h*details.barnWindowHeightRatio,d/2+details.windowOffset,0,details.barnWindowSize,details.barnWindowSize);
        if(site.kind==='barn'&&d>w*details.longBarnRatio)for(const z of details.barnSideDoorZ.map(z=>d*z)) {
          const doors=new THREE.Group();doors.position.set(-w/2-details.barnSideDoorOffset,0,z);doors.rotation.y=-Math.PI/2;group.add(doors);
          box(doors,...asset.sideDoorFrame as [number, number, number, number, number, number],white);box(doors,...asset.sideDoor as [number, number, number, number, number, number],timber);
          box(doors,...asset.sideDoorDivider as [number, number, number, number, number, number],white);
        }
        // Vertical boards give the long red barns a different silhouette from the houses.
        for(let x=-w/2+details.barnBoardStart;x<w/2;x+=details.barnBoardSpacing)for(const z of [-d/2-details.barnBoardOffset,d/2+details.barnBoardOffset]) {
          if(z>0&&Math.abs(x)<doorWidth/2+details.barnBoardDoorClearance)continue;
          box(group,details.barnBoardWidth,h-details.barnBoardEnd,details.barnBoardDepth,x,h/2,z,timber);
        }
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
    const collider:BoxCollider={id:site.id,x:site.x,z:site.z,kind:'building',halfX:w/2+details.colliderPadding,halfZ:d/2+details.colliderPadding,angle:site.angle,radius:Math.hypot(w/2+details.colliderPadding,d/2+details.colliderPadding)};
    collisions.add(collider);
    if(site.porch) {
      const halfX=(site.porchWidth??details.defaultPorchWidth)/2,halfZ=(site.porchDepth??details.defaultPorchDepth)/2;
      const localX=site.porchOffsetX??0,localZ=d/2+halfZ;
      collisions.add({id:`${site.id}-porch`,x:site.x+Math.cos(site.angle)*localX+Math.sin(site.angle)*localZ,z:site.z-Math.sin(site.angle)*localX+Math.cos(site.angle)*localZ,kind:'building',halfX,halfZ,angle:site.angle,radius:Math.hypot(halfX,halfZ)} as BoxCollider);
    }
  };
  [...holmahultBuildings,...(course.definition.openWorld?.buildings??[]) as HolmahultBuilding[]].forEach(building);

  const gravel=createSurfaceMaterial('gravel',gravelTexture??createGravelTexture(randomGenerator(sceneryData.seed)));
  const asphalt=createSceneryMaterial('holmahult-scenery.asphalt',{...materialAsset.asphalt,side:THREE.DoubleSide});
  for(const [x,z,w,d] of course.definition.openWorld?.yards??sceneryData.yards) {
    const geometry=new THREE.PlaneGeometry(w,d,details.yardSegments,details.yardSegments);geometry.rotateX(-Math.PI/2);
    const positions=geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++) {
      const px=positions.getX(i)+x,pz=positions.getZ(i)+z;
      positions.setXYZ(i,px,course.height(px,pz)+details.yardElevation,pz);
    }
    applyGravelUVs(geometry);geometry.computeVertexNormals();const yard=new THREE.Mesh(geometry,gravel);yard.userData.seasonalSurface='gravel';yard.receiveShadow=true;scene.add(yard);
  }
  for(const [index,road] of holmahultSideRoads.entries()) {
    if(course.roadNetwork)continue;
    const curve=new THREE.CatmullRomCurve3(road.points.map(([x,z])=>new THREE.Vector3(x,0,z)),false,'centripetal');
    const count=Math.ceil(curve.getLength()/details.roadSampleSpacing);
    const ribbon=(width:number,elevation:number)=>{
      const positions:number[]=[],indices:number[]=[],colors:number[]=[];
      for(let i=0;i<=count;i++) {
        // Match the race ribbon's first cross-section exactly, including its endpoint tangent.
        const sample=road.joinsCourseStart&&i===count?course.sample(0):null;
        const p=sample?.point??curve.getPointAt(i/count),t=sample?.tangent??curve.getTangentAt(i/count);
        for(const side of [-1,1]) {
          const x=p.x-t.z*width/2*side,z=p.z+t.x*width/2*side;
          positions.push(x,course.height(x,z)+elevation,z);
          colors.push(roadAsset.baseShade,roadAsset.baseShade,roadAsset.baseShade);
        }
        if(i<count){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      if(road.joinsCourseStart)geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      geometry.setIndex(indices);applyGravelUVs(geometry);geometry.computeVertexNormals();return geometry;
    };
    const elevation=road.joinsCourseStart?sceneryAsset.roadElevation:details.roadElevation;
    const material=road.joinsCourseStart?createSurfaceMaterial('road',gravel.map!):road.asphalt?asphalt:gravel;
    const mesh=new THREE.Mesh(ribbon(road.width,elevation),material);mesh.name=`holmahult-side-road-${index}`;if(!road.asphalt)mesh.userData.seasonalSurface='gravel';mesh.receiveShadow=true;scene.add(mesh);
    if(road.joinsCourseStart) {
      const shoulder=new THREE.Mesh(ribbon(road.width+sceneryAsset.shoulderExtraWidth,sceneryAsset.shoulderElevation),createSurfaceMaterial('shoulder',gravel.map!));
      shoulder.name='holmahult-start-shoulder';shoulder.userData.seasonalSurface='gravel';shoulder.receiveShadow=true;scene.add(shoulder);
    }
  }

  const random=randomGenerator(sceneryData.seed);
  const wallPositions:THREE.Vector3[]=[];
  for(const points of holmahultWalls)for(let j=1;j<points.length;j++) {
    const [ax,az]=points[j-1],[bx,bz]=points[j],length=Math.hypot(bx-ax,bz-az);
    for(let d=0;d<length;d+=details.wallSpacing) {
      const x=ax+(bx-ax)*d/length,z=az+(bz-az)*d/length;
      const nearest=course.nearestRoad(x,z);
      if(nearest.distance<nearest.width/2+2)continue;
      wallPositions.push(new THREE.Vector3(x,course.height(x,z)+details.wallElevation,z));
    }
  }
  const walls=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(...asset.wallGeometry as [number, number]),stone,wallPositions.length);walls.name='holmahult-stone-walls';
  const dummy=new THREE.Object3D();
  wallPositions.forEach((p,i)=>{
    dummy.position.copy(p);dummy.rotation.set(random()*details.wallRotation[0],random()*details.wallRotation[1],random()*details.wallRotation[2]);dummy.scale.set(details.wallScale[0]+random()*details.wallScaleRange,details.wallScale[1]+random()*details.wallScaleRange,details.wallScale[2]+random()*details.wallScaleRange);dummy.updateMatrix();walls.setMatrixAt(i,dummy.matrix);
    collisions.add({id:`holmahult-wall-${i}`,x:p.x,z:p.z,radius:details.wallRadius,kind:'rock'});
  });
  walls.userData.seasonalSurface='stone';
  walls.castShadow=true;walls.receiveShadow=true;scene.add(walls);

  // Birch and broadleaf trees along field boundaries and in the gardens.
  const sites:[number,number][]=sceneryData.trees.map(([x,z]):[number,number]=>[x,z]);
  for(const wall of holmahultWalls)for(let i=0;i<wall.length-1;i++) {
    const [a,b]=[wall[i],wall[i+1]];
    for(let t=details.boundaryTreeStart;t<1;t+=details.boundaryTreeSpacing)sites.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t+details.boundaryTreeOffset]);
  }
  const clear=sites.filter(([x,z])=>course.nearestRoad(x,z).distance>course.nearestRoad(x,z).width/2+4&&!holmahultBuildings.some(b=>Math.hypot(x-b.x,z-b.z)<Math.hypot(b.width,b.depth)/2+2));
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(...asset.trunkGeometry as [number, number, number, number]),white,clear.length);
  const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(...asset.crownGeometry as [number, number]),createSceneryMaterial('holmahult-scenery.crownMaterial',materialAsset.crownMaterial),clear.length);
  crowns.userData.seasonalSurface='deciduous';
  clear.forEach(([x,z],i)=>{
    const base=course.height(x,z),s=details.treeScale+random()*details.treeScaleRange;dummy.rotation.set(0,random()*details.treeRotation,0);
    dummy.position.set(x,base+details.trunkY*s,z);dummy.scale.set(s,s,s);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    dummy.position.y=base+details.crownY*s;dummy.scale.set(details.crownScale[0]*s,details.crownScale[1]*s,details.crownScale[2]*s);dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);
    collisions.add({id:`holmahult-birch-${i}`,x,z,radius:details.trunkRadius*s,kind:'tree'});
  });
  for(const mesh of [trunks,crowns]){mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);}
}
