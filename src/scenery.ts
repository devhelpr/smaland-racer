import * as THREE from 'three';
import { lakes, nearestRoad, ROAD_WIDTH, roadRibbon, terrainHeight, trackPoints, WORLD_SIZE } from './track.ts';

function randomGenerator(seed: number): () => number {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}

export function createScenery(scene: THREE.Scene): void {
  const random = randomGenerator(481);
  const groundGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 200, 200);
  groundGeometry.rotateX(-Math.PI / 2);
  const vertices = groundGeometry.getAttribute('position');
  const colors: number[] = [];
  const grassColors = ['#798b4d', '#829359', '#899961', '#75884b'].map(c => new THREE.Color(c));
  for (let i = 0; i < vertices.count; i++) {
    vertices.setY(i, terrainHeight(vertices.getX(i), vertices.getZ(i)));
    const color = grassColors[Math.floor(random() * grassColors.length)];
    colors.push(color.r, color.g, color.b);
  }
  groundGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  groundGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  terrain.receiveShadow = true; scene.add(terrain);
  const shoulder = new THREE.Mesh(roadRibbon(ROAD_WIDTH + 1.8, 0.075), new THREE.MeshStandardMaterial({ color: '#a69c75', vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  const gravelPixels = new Uint8Array(128 * 128 * 4);
  for (let i = 0; i < 128 * 128; i++) {
    const shade = 160 + Math.floor(random() * 95);
    gravelPixels.set([shade, Math.round(shade * 0.94), Math.round(shade * 0.82), 255], i * 4);
  }
  const gravelTexture = new THREE.DataTexture(gravelPixels, 128, 128);
  gravelTexture.colorSpace = THREE.SRGBColorSpace;
  gravelTexture.wrapS = gravelTexture.wrapT = THREE.RepeatWrapping;
  gravelTexture.magFilter = THREE.LinearFilter; gravelTexture.minFilter = THREE.LinearMipmapLinearFilter;
  gravelTexture.generateMipmaps = true; gravelTexture.anisotropy = 4; gravelTexture.needsUpdate = true;
  const road = new THREE.Mesh(roadRibbon(ROAD_WIDTH, 0.13), new THREE.MeshStandardMaterial({ color: '#e4d1ad', map: gravelTexture, vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  shoulder.receiveShadow = true; road.receiveShadow = true; scene.add(shoulder, road);

  for (const lake of lakes) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: '#6fabb2', metalness: 0.25, roughness: 0.3 }));
    water.rotation.x = -Math.PI / 2; water.scale.set(lake.rx, lake.rz, 1); water.position.set(lake.x, lake.level, lake.z); scene.add(water);
    // Thin broken highlights suggest calm water without textures or a water shader.
    const glints = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: '#bdd7cf', transparent: true, opacity: 0.38 });
    for (let i = 0; i < 65; i++) {
      const x = (random() * 2 - 1) * lake.rx * 0.9;
      const z = (random() * 2 - 1) * lake.rz * 0.9;
      if (Math.hypot(x / lake.rx, z / lake.rz) > 0.88) continue;
      const glint = new THREE.Mesh(new THREE.PlaneGeometry(1.5 + random() * 5, 0.15), material);
      glint.rotation.x = -Math.PI / 2; glint.position.set(lake.x + x, lake.level + 0.025, lake.z + z); glints.add(glint);
    }
    scene.add(glints);
  }

  const cottageSites = [{ x: -62, z: -68, angle: 0.3 }, { x: 139, z: -62, angle: -1.1 }, { x: -142, z: 60, angle: 1.8 }];
  const clearScenery = (x: number, z: number, clearance: number) => {
    if (nearestRoad(x, z).distance < ROAD_WIDTH / 2 + clearance) return false;
    if (lakes.some(l => Math.hypot((x - l.x) / l.rx, (z - l.z) / l.rz) < 1.2)) return false;
    return !cottageSites.some(c => Math.hypot(x - c.x, z - c.z) < 15);
  };
  const treePositions: { x: number; z: number; scale: number; rotation: number }[] = [];
  for (let i = 0; i < 4300; i++) {
    const x = (random() - 0.5) * 740; const z = (random() - 0.5) * 740;
    if (clearScenery(x, z, 6)) treePositions.push({ x, z, scale: 0.7 + random() * 1.25, rotation: random() * Math.PI * 2 });
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.35, 5.5, 5), new THREE.MeshStandardMaterial({ color: '#695b43' }), treePositions.length);
  const foliageMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true });
  const tiers = [new THREE.ConeGeometry(2.7, 5.2, 6), new THREE.ConeGeometry(2.1, 4.8, 6), new THREE.ConeGeometry(1.45, 3.9, 6)].map(geometry => new THREE.InstancedMesh(geometry, foliageMaterial, treePositions.length));
  const dummy = new THREE.Object3D();
  treePositions.forEach((tree, i) => {
    const base = terrainHeight(tree.x, tree.z);
    dummy.rotation.set(0, tree.rotation, 0); dummy.scale.setScalar(tree.scale);
    dummy.position.set(tree.x, base + 2.75 * tree.scale, tree.z); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix);
    const color = new THREE.Color().setHSL(0.37 + random() * 0.035, 0.24 + random() * 0.16, 0.18 + random() * 0.13);
    tiers.forEach((tier, j) => {
      dummy.position.y = base + [4.7, 6.6, 8.3][j] * tree.scale; dummy.updateMatrix(); tier.setMatrixAt(i, dummy.matrix); tier.setColorAt(i, color);
    });
  });
  for (const mesh of [trunk, ...tiers]) { mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); }

  const rockPositions: THREE.Vector3[] = [];
  for (let i = 0; i < 450; i++) {
    const x = (random() - 0.5) * 500; const z = (random() - 0.5) * 500;
    if (clearScenery(x, z, 2)) rockPositions.push(new THREE.Vector3(x, terrainHeight(x, z), z));
  }
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#8a8b7e', roughness: 1, flatShading: true }), rockPositions.length);
  rockPositions.forEach((p, i) => {
    dummy.position.copy(p); dummy.rotation.set(random(), random() * 6, random()); dummy.scale.set(0.6 + random() * 1.7, 0.4 + random(), 0.6 + random() * 1.5); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  });
  rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);

  for (const site of cottageSites) {
    const cottage = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: '#9c4036', roughness: 1 });
    const white = new THREE.MeshStandardMaterial({ color: '#ede8d3' });
    const roofMaterial = new THREE.MeshStandardMaterial({ color: '#414a43', roughness: 1 });
    const windowMaterial = new THREE.MeshStandardMaterial({ color: '#95b5b1', metalness: 0.15, roughness: 0.4 });
    const part = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; cottage.add(mesh); return mesh;
    };
    part(8, 4.8, 6, 0, 2.4, 0, red);
    for (const x of [-3.9, 3.9]) for (const z of [-2.95, 2.95]) part(0.22, 4.9, 0.22, x, 2.45, z, white);
    for (const x of [-2.35, 2.35]) {
      part(1.5, 1.7, 0.15, x, 2.8, 3.05, white); part(1.22, 1.42, 0.16, x, 2.8, 3.14, windowMaterial);
      part(0.08, 1.42, 0.18, x, 2.8, 3.16, white); part(1.22, 0.08, 0.18, x, 2.8, 3.16, white);
    }
    part(1.35, 2.7, 0.16, 0, 1.35, 3.05, white); part(1.1, 2.5, 0.18, 0, 1.25, 3.13, roofMaterial);
    const roofShape = new THREE.Shape(); roofShape.moveTo(-4.5, 0); roofShape.lineTo(0, 2.6); roofShape.lineTo(4.5, 0); roofShape.closePath();
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 7, bevelEnabled: false }), roofMaterial); roof.position.set(0, 4.8, -3.5); roof.castShadow = true; cottage.add(roof);
    part(0.75, 2.3, 0.8, 2, 6.3, -0.8, roofMaterial);
    cottage.position.set(site.x, terrainHeight(site.x, site.z), site.z); cottage.rotation.y = site.angle; scene.add(cottage);
  }

  // Small reflector posts make the road readable through the trees.
  const postMaterial = new THREE.MeshStandardMaterial({ color: '#ece7d7' });
  const reflectorMaterial = new THREE.MeshStandardMaterial({ color: '#c58e42' });
  for (let i = 0; i < trackPoints.length; i += 24) {
    const point = trackPoints[i]; const next = trackPoints[(i + 1) % trackPoints.length];
    const tangent = next.clone().sub(point).normalize();
    for (const sign of [-1, 1]) {
      const x = point.x - tangent.z * 6.3 * sign; const z = point.z + tangent.x * 6.3 * sign;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.15, 0.16), postMaterial); post.position.set(x, terrainHeight(x, z) + 0.575, z); post.castShadow = true;
      const reflector = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), reflectorMaterial); reflector.position.copy(post.position).y += 0.33; scene.add(post, reflector);
    }
  }
}
