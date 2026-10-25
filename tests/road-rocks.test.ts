import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Course, courses } from '../src/track.ts';
import { CollisionWorld } from '../src/collision.ts';
import { createScenery, roadRockPlacements } from '../src/scenery.ts';
import { disposeGroup } from '../src/dispose.ts';
import data from '../parcours/road-rocks.json' with { type: 'json' };

for(const definition of courses)test(`${definition.id}: road rocks include low flat surfaces and are spaced along the drivable route`,()=> {
  const course=new Course(definition),group=new THREE.Group(),world=new CollisionWorld();
  createScenery(group,course,world);
  const rocks=roadRockPlacements(course);
  assert.equal(rocks.length,data.placements.length);assert.ok(rocks.length>=3);
  assert.ok(rocks[0].progress*course.length<45,'first flat stone should be reachable shortly after the start');
  const flat=rocks.filter(rock=>rock.scale[1]<=.12);assert.ok(flat.length>=3);
  for(const [i,rock] of rocks.entries()) {
    assert.ok(course.nearest(rock.position.x,rock.position.z).distance<course.definition.width/2);
    if(i>0)assert.ok(rock.position.distanceTo(rocks[i-1].position)>10);
    const surface=world.surfaceAt(rock.position.x,rock.position.z,rock.position.y);
    assert.ok(surface.rock);assert.ok(surface.height>rock.position.y);
    if(rock.scale[1]<=.12)assert.ok(surface.height-rock.position.y<.2,'flat stones must remain physically low');
  }
  disposeGroup(group);
});
