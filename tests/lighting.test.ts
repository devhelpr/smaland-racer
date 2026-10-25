import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Vehicle } from '../src/vehicle.ts';
import { Course, courses } from '../src/track.ts';
import { headlightModes, nextHeadlightMode } from '../src/lighting.ts';
import { loadProgress, saveProgress } from '../src/storage.ts';
import { disposeGroup } from '../src/dispose.ts';

test('lights switch off completely and stronger beams reach farther with more power', () => {
  const car = new Vehicle(new Course(courses[0]));
  const beam = car.lighting.beam;
  const intensities: number[] = [], distances: number[] = [];
  const position = car.position.clone();
  for (const mode of headlightModes) {
    car.lighting.setMode(mode);
    assert.equal(beam.visible, mode !== 'off');
    if (mode === 'off') {
      assert.equal(beam.intensity, 0);
      car.mesh.traverse(object => {
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial)
          assert.equal(object.material.emissiveIntensity === 0 || object.material.emissive.getHex() === 0, true);
      });
    } else {
      intensities.push(beam.intensity); distances.push(beam.distance);
    }
    assert.deepEqual(car.position, position);
  }
  assert.ok(intensities[0] < intensities[1] && intensities[1] < intensities[2]);
  assert.ok(distances[0] < distances[1] && distances[1] < distances[2]);
  assert.deepEqual(headlightModes.map(nextHeadlightMode), ['dipped', 'beam', 'led', 'off']);
});

test('beam and target follow vehicle position, steering, terrain pitch and rollovers', () => {
  const car = new Vehicle(new Course(courses[0]));
  car.lighting.setMode('led');
  const beam = car.lighting.beam;
  const localDirection = beam.target.position.clone().sub(beam.position).normalize();
  for (const rotation of [[0, 0, 0], [0.2, Math.PI / 2, 0.1], [0, 1, Math.PI]]) {
    car.mesh.position.set(100, 20, -40);
    car.mesh.rotation.set(...rotation as [number, number, number]);
    car.mesh.updateMatrixWorld(true);
    const direction = beam.target.getWorldPosition(new THREE.Vector3()).sub(beam.getWorldPosition(new THREE.Vector3())).normalize();
    const expected = localDirection.clone().transformDirection(beam.parent!.matrixWorld);
    assert.ok(direction.distanceTo(expected) < 1e-8);
  }
  const root = new THREE.Group(); root.add(car.mesh);
  let disposed = false; beam.shadow.dispose = () => { disposed = true; };
  disposeGroup(root); assert.equal(disposed, true);
});

test('night and headlight settings persist, with safe defaults for old or malformed saves', () => {
  let data = '';
  const storage = {getItem: () => data, setItem: (_key: string, value: string) => {data = value;}};
  const progress = loadProgress(storage);
  assert.equal(progress.timeOfDay, 'day'); assert.equal(progress.headlights, 'dipped');
  for (const mode of headlightModes) {
    progress.timeOfDay = 'night'; progress.headlights = mode;
    assert.ok(saveProgress(storage, progress));
    const restored = loadProgress(storage);
    assert.equal(restored.timeOfDay, 'night'); assert.equal(restored.headlights, mode);
  }
  for (const invalid of [undefined, null, 'unknown', 5, {}]) {
    data = JSON.stringify({version: 1, timeOfDay: invalid, headlights: invalid});
    assert.equal(loadProgress(storage).timeOfDay, 'day');
    assert.equal(loadProgress(storage).headlights, 'dipped');
  }
});
