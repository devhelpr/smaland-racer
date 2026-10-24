import * as THREE from 'three';

export const ROAD_WIDTH = 10;
export const WORLD_SIZE = 850;

export const lakes = [
  { x: -5, z: -5, rx: 47, rz: 37, level: 0.4 },
  { x: 207, z: 20, rx: 48, rz: 75, level: 0.1 },
];

export function terrainHeight(x: number, z: number): number {
  let height = Math.sin(x * 0.013) * 2.4 + Math.cos(z * 0.017) * 1.8 + Math.sin((x + z) * 0.009) * 1.4;
  for (const lake of lakes) {
    const radius = Math.hypot((x - lake.x) / lake.rx, (z - lake.z) / lake.rz);
    const blend = THREE.MathUtils.smoothstep(radius, 0.78, 1.08);
    const shoreline = 1 - THREE.MathUtils.smoothstep(radius, 1.08, 1.3);
    const bank = THREE.MathUtils.lerp(height, Math.max(height, lake.level + 0.6), shoreline);
    height = THREE.MathUtils.lerp(lake.level - 2.5, bank, blend);
  }
  return height;
}

const controlPoints = [
  [-80, -105], [5, -120], [90, -85], [112, -15], [80, 60],
  [15, 110], [-65, 100], [-112, 35], [-110, -35],
].map(([x, z]) => new THREE.Vector3(x, terrainHeight(x, z), z));

export const trackCurve = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.45);
export const trackPoints = trackCurve.getSpacedPoints(640).slice(0, -1).map(p => {
  p.y = terrainHeight(p.x, p.z);
  return p;
});
export const trackLength = trackCurve.getLength();

export interface RoadSample {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  distance: number;
  progress: number;
}

/** Segment projection keeps surface checks and recovery on the rendered centerline. */
export function nearestRoad(x: number, z: number): RoadSample {
  let bestDistanceSq = Infinity;
  let bestIndex = 0;
  let bestT = 0;
  for (let i = 0; i < trackPoints.length; i++) {
    const a = trackPoints[i];
    const b = trackPoints[(i + 1) % trackPoints.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
    const distanceSq = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestIndex = i;
      bestT = t;
    }
  }
  const a = trackPoints[bestIndex];
  const b = trackPoints[(bestIndex + 1) % trackPoints.length];
  const point = a.clone().lerp(b, bestT);
  point.y = terrainHeight(point.x, point.z);
  return { point, tangent: b.clone().sub(a).setY(0).normalize(), distance: Math.sqrt(bestDistanceSq), progress: (bestIndex + bestT) / trackPoints.length };
}

export function roadRibbon(width: number, elevation: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= trackPoints.length; i++) {
    const point = trackPoints[i % trackPoints.length];
    const tangent = trackPoints[(i + 1) % trackPoints.length].clone().sub(trackPoints[(i + trackPoints.length - 1) % trackPoints.length]).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
    for (const sign of [-1, 1]) {
      const x = point.x + side.x * width * 0.5 * sign;
      const z = point.z + side.z * width * 0.5 * sign;
      positions.push(x, terrainHeight(x, z) + elevation, z);
      uvs.push(sign < 0 ? 0 : width / 3, i / trackPoints.length * trackLength / 3);
      const shade = 0.92 + Math.sin(i * 2.71) * 0.045;
      colors.push(shade, shade, shade);
    }
    if (i < trackPoints.length) {
      const n = i * 2;
      indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
