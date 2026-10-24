import test from 'node:test';
import assert from 'node:assert/strict';
import { Vehicle } from '../src/vehicle.ts';
import { lakes, nearestRoad, ROAD_WIDTH, terrainHeight, trackPoints } from '../src/track.ts';

const neutral = { throttle: 0, steer: 0, handbrake: false };
function drive(car: Vehicle, seconds: number, throttle: number, steer = 0, handbrake = false) {
  for (let i = 0; i < seconds * 120; i++) car.update(1 / 120, { throttle, steer, handbrake });
}

test('closed circuit has consistent projection, elevation, and lake clearance', () => {
  for (const point of trackPoints) {
    const road = nearestRoad(point.x, point.z);
    assert.ok(road.distance < 0.001);
    assert.ok(Math.abs(road.point.y - terrainHeight(point.x, point.z)) < 0.001);
    assert.ok(Math.abs(road.tangent.length() - 1) < 0.001);
    for (const lake of lakes) assert.ok(Math.hypot((point.x - lake.x) / (lake.rx + ROAD_WIDTH), (point.z - lake.z) / (lake.rz + ROAD_WIDTH)) > 1.2);
  }
  const seam = trackPoints[0].clone().lerp(trackPoints.at(-1)!, 0.5);
  assert.ok(nearestRoad(seam.x, seam.z).distance < 0.001);
});

test('accelerates, brakes, reverses, and resets facing along the road', () => {
  const car = new Vehicle();
  drive(car, 1, 1);
  assert.ok(car.forwardSpeed > 10);
  drive(car, 0.5, -1);
  assert.ok(car.forwardSpeed < 2);
  drive(car, 2, -1);
  assert.ok(car.forwardSpeed < -4);
  car.position.x += 18; car.reset();
  const road = nearestRoad(car.position.x, car.position.z);
  assert.ok(road.distance < 0.001);
  assert.equal(car.velocity.length(), 0);
  assert.ok(Math.abs(car.heading - Math.atan2(road.tangent.x, road.tangent.z)) < 0.001);
});

test('grass slows motion more than gravel; handbrake sheds speed', () => {
  const road = new Vehicle(); const grass = new Vehicle();
  grass.position.set(310, terrainHeight(310, 310), 310);
  for (const car of [road, grass]) car.velocity.set(Math.sin(car.heading) * 12, 0, Math.cos(car.heading) * 12);
  for (let i = 0; i < 60; i++) { road.update(1 / 120, neutral); grass.update(1 / 120, neutral); }
  assert.ok(road.onRoad); assert.ok(!grass.onRoad);
  assert.ok(grass.velocity.length() < road.velocity.length() * 0.7);
  const normal = new Vehicle(); const brake = new Vehicle();
  drive(normal, 1, 1); drive(brake, 1, 1);
  drive(normal, 0.4, 0); drive(brake, 0.4, 0, 0, true);
  assert.ok(brake.velocity.length() < normal.velocity.length());
});

test('steering works in forward and reverse, including arrow-equivalent input', () => {
  for (const throttle of [1, -1]) {
    const car = new Vehicle(); const initial = car.heading;
    drive(car, 1.5, throttle, 1);
    assert.equal(Math.sign(car.heading - initial), throttle);
    assert.ok(Math.abs(car.heading - initial) > 0.1);
  }
});

test('can drive a full loop with a look-ahead steering controller', () => {
  const car = new Vehicle(); let travel = 0; let maxDistance = 0;
  for (let i = 0; i < 120 * 110; i++) {
    const road = nearestRoad(car.position.x, car.position.z);
    const target = trackPoints[(Math.floor(road.progress * trackPoints.length) + 12) % trackPoints.length];
    const desired = Math.atan2(target.x - car.position.x, target.z - car.position.z);
    const error = Math.atan2(Math.sin(desired - car.heading), Math.cos(desired - car.heading));
    car.update(1 / 120, { throttle: car.forwardSpeed < 13 ? 1 : 0, steer: Math.max(-1, Math.min(1, error * 3)), handbrake: false });
    travel += car.velocity.length() / 120;
    maxDistance = Math.max(maxDistance, road.distance);
    if (travel > 750 && road.progress < 0.02) break;
  }
  assert.ok(travel > 750, `distance traveled: ${travel}`);
  assert.ok(maxDistance < ROAD_WIDTH / 2, `max deviation: ${maxDistance}`);
});
