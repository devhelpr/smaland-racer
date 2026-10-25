import placement from '../parcours/scenery.json' with { type: 'json' };
import asset from '../assets/scenery.json' with { type: 'json' };
import * as THREE from 'three';
import { Course, randomGenerator, WORLD_SIZE } from './track.ts';
import { CollisionWorld } from './collision.ts';
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
        sites.push({x, z, angle: Math.atan2(sample.point.x - x, sample.point.z - z), scale: placement.cottages.scale + random() * placement.cottages.scaleRange, color: sites.length % asset.cottageColors.length});
        placed = true;
        break;
      }
      if (placed) break;
    }
  }
  return sites;
}

export function createScenery(scene: THREE.Group, course: Course, collisions: CollisionWorld): SnowPoles {
  const random = randomGenerator(course.definition.seed);
  const lakes = course.lakes;
  const ROAD_WIDTH = course.definition.width;
  const terrainHeight = (x: number,z: number) => course.height(x,z);
  const nearestRoad = (x: number,z: number) => course.nearest(x,z);
  const roadRibbon = (width: number,elevation: number) => course.ribbon(width,elevation);
  const groundGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, asset.groundSegments, asset.groundSegments);
  groundGeometry.rotateX(-Math.PI / 2);
  const vertices = groundGeometry.getAttribute('position');
  const colors: number[] = [];
  const grassColors = asset.grassColors.map(c => new THREE.Color(c));
  const meadowColors = asset.meadowColors.map(c => new THREE.Color(c));
  for (let i = 0; i < vertices.count; i++) {
    vertices.setY(i, terrainHeight(vertices.getX(i), vertices.getZ(i)));
    const variation = random();
    const field = course.definition.setting === 'holmahult' ? holmahultFieldAt(vertices.getX(i), vertices.getZ(i)) : -1;
    const color = field >= 0 ? meadowColors[field % meadowColors.length].clone().multiplyScalar(placement.meadow.shade + variation * placement.meadow.variation) : grassColors[Math.floor(variation * grassColors.length)];
    colors.push(color.r, color.g, color.b);
  }
  groundGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  groundGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial(asset.terrain));
  terrain.userData.seasonalSurface='grass';
  terrain.receiveShadow = true; scene.add(terrain);
  const shoulder = new THREE.Mesh(roadRibbon(ROAD_WIDTH + asset.shoulderExtraWidth, asset.shoulderElevation), new THREE.MeshStandardMaterial({ ...asset.shoulder, side: THREE.DoubleSide }));
  const gravelPixels = new Uint8Array(asset.gravelTexture.size * asset.gravelTexture.size * 4);
  for (let i = 0; i < asset.gravelTexture.size * asset.gravelTexture.size; i++) {
    const shade = asset.gravelTexture.minShade + Math.floor(random() * asset.gravelTexture.shadeRange);
    gravelPixels.set([shade, Math.round(shade * asset.gravelTexture.greenRatio), Math.round(shade * asset.gravelTexture.blueRatio), asset.gravelTexture.opacity], i * 4);
  }
  const gravelTexture = new THREE.DataTexture(gravelPixels, asset.gravelTexture.size, asset.gravelTexture.size);
  gravelTexture.colorSpace = THREE.SRGBColorSpace;
  gravelTexture.wrapS = gravelTexture.wrapT = THREE.RepeatWrapping;
  gravelTexture.magFilter = THREE.LinearFilter; gravelTexture.minFilter = THREE.LinearMipmapLinearFilter;
  gravelTexture.generateMipmaps = true; gravelTexture.anisotropy = 4; gravelTexture.needsUpdate = true;
  const road = new THREE.Mesh(roadRibbon(ROAD_WIDTH, asset.roadElevation), new THREE.MeshStandardMaterial({ ...asset.road, map: gravelTexture, side: THREE.DoubleSide }));
  shoulder.userData.seasonalSurface=road.userData.seasonalSurface='gravel';
  shoulder.receiveShadow = true; road.receiveShadow = true; scene.add(shoulder, road);

  for (const lake of lakes) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(...asset.waterGeometry as [number, number]), new THREE.MeshStandardMaterial(asset.waterMaterial));
    water.userData.seasonalSurface='water';
    water.rotation.x = -Math.PI / 2; water.scale.set(lake.rx, lake.rz, 1); water.position.set(lake.x, lake.level, lake.z); scene.add(water);
    // Thin broken highlights suggest calm water without textures or a water shader.
    const material = new THREE.MeshBasicMaterial(asset.glintMaterial);
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

  const cottageSites = roadsideCottages(course);
  const clearScenery = (x: number, z: number, clearance: number) => {
    if (nearestRoad(x, z).distance < ROAD_WIDTH / 2 + clearance) return false;
    if (course.definition.setting === 'holmahult') {
      if (holmahultFieldAt(x, z) >= 0 || onHolmahultSideRoad(x, z, clearance)) return false;
      if (holmahultBuildings.some(b => Math.hypot(x-b.x, z-b.z) < Math.hypot(b.width, b.depth)/2 + (b.id === 'holmahult-25' ? placement.clearance.holmahultHome : placement.clearance.holmahultBuilding))) return false;
    }
    if (lakes.some(l => Math.hypot((x - l.x) / l.rx, (z - l.z) / l.rz) < placement.clearance.lake)) return false;
    return !cottageSites.some(c => Math.hypot(x - c.x, z - c.z) < placement.clearance.cottage);
  };
  const treePositions: { x: number; z: number; scale: number; rotation: number }[] = [];
  for (let i = 0; i < course.definition.treeDensity; i++) {
    const x = (random() - 0.5) * placement.trees.area; const z = (random() - 0.5) * placement.trees.area;
    if (clearScenery(x, z, placement.trees.roadClearance)) treePositions.push({ x, z, scale: placement.trees.scale + random() * placement.trees.scaleRange, rotation: random() * Math.PI * 2 });
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(...asset.trunkGeometry as [number, number, number, number]), new THREE.MeshStandardMaterial(asset.trunkMaterial), treePositions.length);
  const foliageMaterial = new THREE.MeshStandardMaterial(asset.foliageMaterial);
  const tiers = [new THREE.ConeGeometry(...asset.lowerFoliage as [number, number, number]), new THREE.ConeGeometry(...asset.middleFoliage as [number, number, number]), new THREE.ConeGeometry(...asset.upperFoliage as [number, number, number])].map(geometry => new THREE.InstancedMesh(geometry, foliageMaterial, treePositions.length));
  const dummy = new THREE.Object3D();
  treePositions.forEach((tree, i) => {
    const base = terrainHeight(tree.x, tree.z);
    collisions.add({id:`tree-${i}`,x:tree.x,z:tree.z,radius:placement.trees.colliderRadius*tree.scale,kind:'tree'});
    dummy.rotation.set(0, tree.rotation, 0); dummy.scale.setScalar(tree.scale);
    dummy.position.set(tree.x, base + asset.trunkHeight * tree.scale, tree.z); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix);
    const color = new THREE.Color().setHSL(asset.foliageColor.hue + random() * asset.foliageColor.hueRange, asset.foliageColor.saturation + random() * asset.foliageColor.saturationRange, asset.foliageColor.lightness + random() * asset.foliageColor.lightnessRange);
    tiers.forEach((tier, j) => {
      dummy.position.y = base + asset.foliageHeights[j] * tree.scale; dummy.updateMatrix(); tier.setMatrixAt(i, dummy.matrix); tier.setColorAt(i, color);
    });
  });
  for(const tier of tiers)tier.userData.seasonalSurface='evergreen';
  for (const mesh of [trunk, ...tiers]) { mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); }

  const rockPositions: THREE.Vector3[] = [];
  for (let i = 0; i < placement.rocks.count; i++) {
    const x = (random() - 0.5) * placement.rocks.area; const z = (random() - 0.5) * placement.rocks.area;
    if (clearScenery(x, z, placement.rocks.roadClearance)) rockPositions.push(new THREE.Vector3(x, terrainHeight(x, z), z));
  }
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(...asset.rockGeometry as [number, number]), new THREE.MeshStandardMaterial(asset.rockMaterial), rockPositions.length);
  rockPositions.forEach((p, i) => {
    dummy.position.copy(p); dummy.rotation.set(random(), random() * placement.rocks.rotationY, random()); dummy.scale.set(placement.rocks.scaleX + random() * placement.rocks.scaleXRange, placement.rocks.scaleY + random() * placement.rocks.scaleYRange, placement.rocks.scaleZ + random() * placement.rocks.scaleZRange); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
    collisions.add({id:`rock-${i}`,x:p.x,z:p.z,radius:Math.max(dummy.scale.x,dummy.scale.z),kind:'rock'});
  });
  rocks.userData.seasonalSurface='stone';
  rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);

  for (const site of cottageSites) {
    const cottage = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: asset.cottageColors[site.color], ...asset.cottagePaint });
    const white = new THREE.MeshStandardMaterial(asset.white);
    const roofMaterial = new THREE.MeshStandardMaterial(asset.roofMaterial);
    const windowMaterial = new THREE.MeshStandardMaterial(asset.windowMaterial);
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

  if (course.definition.setting === 'holmahult') createHolmahultScenery(scene, course, collisions);
  return new SnowPoles(course, collisions, scene);
}
