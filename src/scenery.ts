import treeAsset from '../assets/trees.json' with { type: 'json' };
import { createEvergreenGeometry, createEvergreenTrunkGeometry } from './trees.ts';
import { createSurfaceMaterial, createSceneryMaterial } from './materials.ts';
import materialAsset from '../assets/materials/scenery.json' with { type: 'json' };
import { applyGravelUVs, createGravelTexture } from './gravel.ts';
import { createOpenWorldScenery, refineBridgeTerrain } from './open-world-scenery.ts';
import roadRockData from '../parcours/road-rocks.json' with { type: 'json' };
import { createSandsjon } from './sandsjon.ts';
import placement from '../parcours/scenery.json' with { type: 'json' };
import asset from '../assets/scenery.json' with { type: 'json' };
import * as THREE from 'three';
import { Course, lakeContains, shoreDistance, randomGenerator } from './track.ts';
import { CollisionWorld } from './collision.ts';
import { textureDefinitions } from './textures.ts';
import { createLogScenery } from './logs.ts';
import { SnowPoles } from './snow-poles.ts';
import { holmahultBuildings, holmahultFieldAt, onHolmahultSideRoad } from './holmahult-data.ts';
import { createHolmahultScenery } from './holmahult-scenery.ts';

export interface CottageSite {x: number; z: number; angle: number; scale: number; color: number}

export function roadsideCottages(course: Course): CottageSite[] {
  const sites: CottageSite[] = [];
  if (course.definition.setting === 'holmahult') return sites;
  const random = randomGenerator(course.definition.seed + placement.cottages.seedOffset);
  const target = Math.min(placement.cottages.maxCount, Math.max(placement.cottages.minCount, Math.ceil(course.length / placement.cottages.lengthPerCottage)));
  for (let i = 0; i < target * placement.cottages.attemptMultiplier && sites.length < target; i++) {
    const t = placement.cottages.start + (i % (target * 2)) / (target * 2) * placement.cottages.span;
    const sample = course.sample(t);
    for (const side of i % 2 ? [1, -1] : [-1, 1]) {
      let placed = false;
      for (const distance of placement.cottages.offsets) {
        const x = sample.point.x - sample.tangent.z * distance * side;
        const z = sample.point.z + sample.tangent.x * distance * side;
        if (course.nearest(x, z).distance < course.definition.width / 2 + placement.cottages.roadClearance) continue;
        if (course.lakes.some(l => Math.hypot((x - l.x) / (l.rx + placement.cottages.lakeMargin), (z - l.z) / (l.rz + placement.cottages.lakeMargin)) < placement.cottages.lakeClearance)) continue;
        if (sites.some(site => Math.hypot(site.x - x, site.z - z) < placement.cottages.spacing)) continue;
        sites.push({x, z, angle: Math.atan2(sample.point.x - x, sample.point.z - z), scale: placement.cottages.scale + random() * placement.cottages.scaleRange, color: sites.length % materialAsset.cottageColors.length});
        placed = true;
        break;
      }
      if (placed) break;
    }
  }
  return sites;
}

/** Authored road obstacles use route-relative positions on every course. */
export function roadRockPlacements(course:Course) {
  return roadRockData.placements.map((definition,index)=> {
    const sample=course.sample(definition.progress),position=sample.point.clone();
    const offset=definition.offset*course.definition.width;
    position.x+=sample.tangent.z*offset;position.z-=sample.tangent.x*offset;
    position.y=course.height(position.x,position.z)+(course.definition.setting==='sandsjon'?0:asset.roadElevation);
    return {id:`road-rock-${index}`,position,heading:Math.atan2(sample.tangent.x,sample.tangent.z),...definition};
  });
}

export function createScenery(scene: THREE.Group, course: Course, collisions: CollisionWorld): SnowPoles {
  course.drivingSurfaces.clear();
  const random = randomGenerator(course.definition.seed);
  const lakes = course.lakes;
  const ROAD_WIDTH = course.definition.width;
  const terrainHeight = (x: number,z: number) => course.height(x,z);
  const nearestRoad = (x: number,z: number) => course.nearestRoad(x,z);
  const roadRibbon = (width: number,elevation: number) => course.ribbon(width,elevation);
  let groundGeometry:THREE.BufferGeometry = new THREE.PlaneGeometry(course.worldSize, course.worldSize, course.definition.openWorld?.groundSegments??asset.groundSegments, course.definition.openWorld?.groundSegments??asset.groundSegments);
  groundGeometry.rotateX(-Math.PI / 2);
  if(course.definition.openWorld)groundGeometry=refineBridgeTerrain(groundGeometry as THREE.PlaneGeometry,course);
  const vertices = groundGeometry.getAttribute('position');
  const colors: number[] = [];
  const grassColors = materialAsset.grassColors.map(c => new THREE.Color(c));
  const meadowColors = materialAsset.meadowColors.map(c => new THREE.Color(c));
  for (let i = 0; i < vertices.count; i++) {
    vertices.setY(i, terrainHeight(vertices.getX(i), vertices.getZ(i)));
    const variation = random();
    const field = course.definition.setting === 'holmahult' ? holmahultFieldAt(vertices.getX(i), vertices.getZ(i)) : -1;
    const color = field >= 0 ? meadowColors[field % meadowColors.length].clone().multiplyScalar(placement.meadow.shade + variation * placement.meadow.variation) : grassColors[Math.floor(variation * grassColors.length)];
    colors.push(color.r, color.g, color.b);
  }
  groundGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  applyGravelUVs(groundGeometry);
  // Terrain grain uses its own physical scale, independent of the landscape size.
  const grassUV=groundGeometry.getAttribute('uv');
  for(let i=0;i<grassUV.count;i++)grassUV.setXY(i,vertices.getX(i)/textureDefinitions.grass.worldScale,vertices.getZ(i)/textureDefinitions.grass.worldScale);
  groundGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(groundGeometry, createSceneryMaterial('scenery.terrain',materialAsset.terrain));
  terrain.userData.seasonalSurface='grass';
  terrain.receiveShadow = true; scene.add(terrain);
  const gravelTexture = createGravelTexture(random);
  const shoulder = new THREE.Mesh(roadRibbon(ROAD_WIDTH + asset.shoulderExtraWidth, asset.shoulderElevation), createSurfaceMaterial('shoulder',gravelTexture));
  const road = new THREE.Mesh(roadRibbon(ROAD_WIDTH, asset.roadElevation), createSurfaceMaterial('road',gravelTexture));
  road.name='course-road';shoulder.name='course-shoulder';
  applyGravelUVs(road.geometry);applyGravelUVs(shoulder.geometry);
  shoulder.userData.seasonalSurface=road.userData.seasonalSurface='gravel';
  shoulder.receiveShadow = true; road.receiveShadow = true; if(course.definition.openWorld) { shoulder.geometry.dispose();road.geometry.dispose();(shoulder.material as THREE.Material).dispose();(road.material as THREE.Material).dispose();createOpenWorldScenery(scene,course,collisions,gravelTexture); }
  else if(course.definition.setting!=='sandsjon')scene.add(shoulder, road);
  else { shoulder.geometry.dispose();road.geometry.dispose();(shoulder.material as THREE.Material).dispose();(road.material as THREE.Material).dispose();gravelTexture.dispose();createSandsjon(scene,course,collisions); }

  for (const lake of course.definition.setting==='sandsjon'?[]:lakes) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(...asset.waterGeometry as [number, number]), createSceneryMaterial('scenery.waterMaterial',materialAsset.waterMaterial));
    water.userData.seasonalSurface='water';
    water.rotation.x = -Math.PI / 2; water.scale.set(lake.rx, lake.rz, 1); water.position.set(lake.x, lake.level, lake.z); scene.add(water);
    // Thin broken highlights suggest calm water without textures or a water shader.
    const material = new THREE.MeshBasicMaterial(materialAsset.glintMaterial);
    const glints = new THREE.InstancedMesh(new THREE.PlaneGeometry(...asset.glintGeometry as [number, number]), material, asset.glintCount);
    const glint = new THREE.Object3D();
    glint.rotation.x = -Math.PI / 2;
    let visibleGlints = 0;
    for (let i = 0; i < asset.glintCount; i++) {
      const x = (random() * 2 - 1) * lake.rx * asset.glintRadius;
      const z = (random() * 2 - 1) * lake.rz * asset.glintRadius;
      if (Math.hypot(x / lake.rx, z / lake.rz) > asset.glintLimit) continue;
      glint.scale.set(asset.glintMinLength + random() * asset.glintLengthRange, asset.glintWidth, 1);
      glint.position.set(lake.x + x, lake.level + asset.glintElevation, lake.z + z);
      glint.updateMatrix();
      glints.setMatrixAt(visibleGlints++, glint.matrix);
    }
    glints.count = visibleGlints;
    scene.add(glints);
  }

  createLogScenery(scene,course,collisions);
  const cottageSites = roadsideCottages(course);
  const clearScenery = (x: number, z: number, clearance: number) => {
    if(course.definition.openWorld&&(course.inWater(x,z)||course.definition.openWorld.yards.some(([cx,cz,w,d])=>Math.abs(x-cx)<w/2+clearance&&Math.abs(z-cz)<d/2+clearance)))return false;
    const nearest=nearestRoad(x,z);
    if (nearest.distance < nearest.width / 2 + clearance) return false;
    if (course.definition.setting === 'holmahult') {
      if (holmahultFieldAt(x, z) >= 0 || onHolmahultSideRoad(x, z, clearance)) return false;
      if ([...holmahultBuildings,...course.definition.openWorld?.buildings??[]].some(b => Math.hypot(x-b.x, z-b.z) < Math.hypot(b.width, b.depth)/2 + (b.id === 'holmahult-25' ? placement.clearance.holmahultHome : placement.clearance.holmahultBuilding))) return false;
    }
    if(course.definition.setting==='sandsjon'&&lakes.some(l=>lakeContains(l,x,z)||shoreDistance(l,x,z)<course.definition.shore!.sceneryClearance))return false;
    if (course.definition.setting!=='sandsjon' && lakes.some(l => Math.hypot((x - l.x) / l.rx, (z - l.z) / l.rz) < placement.clearance.lake)) return false;
    return !cottageSites.some(c => Math.hypot(x - c.x, z - c.z) < placement.clearance.cottage);
  };
  const treePositions: { x: number; z: number; scale: number; rotation: number }[] = [];
  for (let i = 0; i < course.definition.treeDensity; i++) {
    const x = (random() - 0.5) * (course.definition.openWorld?.treeArea??placement.trees.area); const z = (random() - 0.5) * (course.definition.openWorld?.treeArea??placement.trees.area);
    if (clearScenery(x, z, placement.trees.roadClearance)) treePositions.push({ x, z, scale: placement.trees.scale + random() * placement.trees.scaleRange, rotation: random() * Math.PI * 2 });
  }
  if(course.roadNetwork) {
    const config=course.definition.openWorld!.roadsideTrees;
    for(const road of course.roadNetwork.roads)for(let i=0;i<road.points.length;i+=Math.max(1,Math.round(config.spacing/1.5))) {
      const point=road.points[i],tangent=road.points[Math.min(i+1,road.points.length-1)].clone().sub(road.points[Math.max(0,i-1)]).normalize();
      for(const side of [-1,1])for(let row=0;row<config.rows;row++) {
        const offset=side*(config.offset+random()*config.spread),x=point.x-tangent.z*offset,z=point.z+tangent.x*offset;
        if(clearScenery(x,z,placement.trees.roadClearance))treePositions.push({x,z,scale:placement.trees.scale+random()*placement.trees.scaleRange,rotation:random()*Math.PI*2});
      }
    }
  }
  const trunkMaterial=createSceneryMaterial('scenery.trunkMaterial',materialAsset.trunkMaterial);
  const foliageMaterial=createSceneryMaterial('scenery.foliageMaterial',materialAsset.foliageMaterial);
  const forestVariants=treeAsset.evergreen.variants.map((_,variant)=>{
    const count=Math.max(0,Math.ceil((treePositions.length-variant)/treeAsset.evergreen.variants.length));
    const trunk=new THREE.InstancedMesh(createEvergreenTrunkGeometry(variant),trunkMaterial,count);
    const foliage=new THREE.InstancedMesh(createEvergreenGeometry(variant),foliageMaterial,count);
    trunk.name=`forest-trunks-${variant}`;foliage.name=`forest-boughs-${variant}`;
    foliage.userData.seasonalSurface='evergreen';return {trunk,foliage};
  });
  const dummy = new THREE.Object3D();
  treePositions.forEach((tree, i) => {
    const base = terrainHeight(tree.x, tree.z),variant=forestVariants[i%forestVariants.length],index=Math.floor(i/forestVariants.length);
    collisions.add({id:`tree-${i}`,x:tree.x,z:tree.z,radius:placement.trees.colliderRadius*tree.scale,kind:'tree'});
    dummy.rotation.set(0, tree.rotation, 0); dummy.scale.setScalar(tree.scale);
    dummy.position.set(tree.x, base, tree.z); dummy.updateMatrix();variant.trunk.setMatrixAt(index,dummy.matrix);variant.foliage.setMatrixAt(index,dummy.matrix);
    const color = new THREE.Color().setHSL(materialAsset.foliageColor.hue + random() * materialAsset.foliageColor.hueRange, materialAsset.foliageColor.saturation + random() * materialAsset.foliageColor.saturationRange, materialAsset.foliageColor.lightness + random() * materialAsset.foliageColor.lightnessRange);
    variant.foliage.setColorAt(index,color);
  });
  for(const {trunk,foliage} of forestVariants)for(const mesh of [trunk,foliage]){mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);}

  const rockPositions: THREE.Vector3[] = [];
  for (let i = 0; i < placement.rocks.count; i++) {
    const x = (random() - 0.5) * (course.definition.openWorld?.treeArea??placement.rocks.area); const z = (random() - 0.5) * (course.definition.openWorld?.treeArea??placement.rocks.area);
    if (clearScenery(x, z, placement.rocks.roadClearance)) rockPositions.push(new THREE.Vector3(x, terrainHeight(x, z), z));
  }
  const roadRocks=roadRockPlacements(course);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(...asset.rockGeometry as [number, number]), createSceneryMaterial('scenery.rockMaterial',materialAsset.rockMaterial), rockPositions.length+roadRocks.length);
  rockPositions.forEach((p, i) => {
    dummy.position.copy(p); dummy.rotation.set(random(), random() * placement.rocks.rotationY, random()); dummy.scale.set(placement.rocks.scaleX + random() * placement.rocks.scaleXRange, placement.rocks.scaleY + random() * placement.rocks.scaleYRange, placement.rocks.scaleZ + random() * placement.rocks.scaleZRange); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
    collisions.addRock(`rock-${i}`,rocks.geometry,rocks.material,dummy.matrix);
  });
  roadRocks.forEach((rock,i)=> {
    dummy.position.copy(rock.position);
    dummy.rotation.set(rock.rotation[0],rock.heading+rock.rotation[1],rock.rotation[2],'YXZ');
    dummy.scale.set(...rock.scale as [number,number,number]);dummy.updateMatrix();
    rocks.setMatrixAt(rockPositions.length+i,dummy.matrix);
    collisions.addRock(rock.id,rocks.geometry,rocks.material,dummy.matrix);
  });
  rocks.userData.seasonalSurface='stone';
  rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);

  for (const site of cottageSites) {
    const cottage = new THREE.Group();
    const red = createSceneryMaterial('scenery.cottagePaint',{ color: materialAsset.cottageColors[site.color], ...materialAsset.cottagePaint });
    const white = createSceneryMaterial('scenery.white',materialAsset.white);
    const roofMaterial = createSceneryMaterial('scenery.roofMaterial',materialAsset.roofMaterial);
    const windowMaterial = createSceneryMaterial('scenery.windowMaterial',materialAsset.windowMaterial);
    const part = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; cottage.add(mesh); return mesh;
    };
    part(...asset.cottageBody as [number, number, number, number, number, number], red);
    for (const x of asset.cottageCornerX) for (const z of asset.cottageCornerZ) part(...asset.cornerTrimSize as [number, number, number], x, asset.cornerTrimHeight, z, white);
    for (const x of asset.cottageWindowX) {
      part(...asset.windowFrameSize as [number, number, number], x, ...asset.windowFrameYZ as [number, number], white); part(...asset.windowGlassSize as [number, number, number], x, ...asset.windowGlassYZ as [number, number], windowMaterial);
      part(...asset.verticalMullionSize as [number, number, number], x, ...asset.verticalMullionYZ as [number, number], white); part(...asset.horizontalMullionSize as [number, number, number], x, ...asset.horizontalMullionYZ as [number, number], white);
    }
    part(...asset.doorFrame as [number, number, number, number, number, number], white); part(...asset.door as [number, number, number, number, number, number], roofMaterial);
    const roofShape = new THREE.Shape(); roofShape.moveTo(...asset.roofLeft as [number, number]); roofShape.lineTo(...asset.roofPeak as [number, number]); roofShape.lineTo(...asset.roofRight as [number, number]); roofShape.closePath();
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: asset.roofDepth, bevelEnabled: false }), roofMaterial); roof.position.set(...asset.roofPosition as [number,number,number]); roof.castShadow = true; cottage.add(roof);
    part(...asset.chimney as [number, number, number, number, number, number], roofMaterial);
    cottage.position.set(site.x, terrainHeight(site.x, site.z), site.z); cottage.rotation.y = site.angle; cottage.scale.setScalar(site.scale); scene.add(cottage);
    const collider: import('./collision.ts').BoxCollider={id:`cottage-${site.x}`,x:site.x,z:site.z,radius:asset.cottageCollider.radius*site.scale,kind:'building',halfX:asset.cottageCollider.halfX*site.scale,halfZ:asset.cottageCollider.halfZ*site.scale,angle:site.angle}; collisions.add(collider);
  }

  if (course.definition.setting === 'holmahult') createHolmahultScenery(scene, course, collisions,gravelTexture);
  scene.traverse(object=>{
    if(object instanceof THREE.Mesh&&(object.userData.drivingSurface||object.userData.seasonalSurface==='gravel'))course.drivingSurfaces.add(object);
  });
  return new SnowPoles(course, collisions, scene);
}
