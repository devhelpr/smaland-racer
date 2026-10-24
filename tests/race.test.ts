import test from 'node:test';
import assert from 'node:assert/strict';
import { Course, courses } from '../src/track.ts';
import { Race, medalFor, score } from '../src/race.ts';

function cross(race:Race,index:number,reverse=false,offset=0) {
  const gate=race.course.checkpoints[index];const side=gate.tangent.clone().set(-gate.tangent.z,0,gate.tangent.x).multiplyScalar(offset);
  const a=gate.point.clone().addScaledVector(gate.tangent,-2).add(side),b=gate.point.clone().addScaledVector(gate.tangent,2).add(side);
  race.observe(reverse?b:a,reverse?a:b,race.damage);
}

test('countdown, pause and resume freeze timing and accept ordered forward checkpoints only',()=> {
  const course=new Course(courses[0]),race=new Race(course);race.start();race.elapse(2);
  cross(race,1);assert.equal(race.nextCheckpoint,1);race.pause();race.elapse(100);assert.equal(race.countdown,1);
  race.resume();race.elapse(1);assert.equal(race.state,'racing');race.elapse(3);race.pause();race.elapse(100);assert.equal(race.elapsed,3);
  race.resume();cross(race,2);cross(race,1,true);cross(race,1,false,30);assert.equal(race.nextCheckpoint,1);
  cross(race,1);assert.equal(race.nextCheckpoint,2);
});

test('recovery retains progress, penalties and damage; finish score and medals are correct',()=> {
  const course=new Course(courses[0]),race=new Race(course);race.start();race.elapse(3);race.elapse(25);race.damage=20;
  assert.ok(race.recover());assert.equal(race.nextCheckpoint,1);assert.equal(race.recoveryPoint.progress,0);
  for(let i=1;i<course.checkpoints.length;i++)cross(race,i);
  assert.equal(race.state,'finished');assert.equal(race.result!.total,34);assert.equal(race.result!.damage,20);assert.equal(race.result!.recoveries,1);
  assert.equal(score(20,25,2),35);assert.equal(medalFor(course.definition.medals.bronze,course),'bronze');
  assert.equal(medalFor(course.definition.medals.bronze+.01,course),'none');
});

test('wrecks and practice cannot produce results, and retry starts clean',()=> {
  const course=new Course(courses[0]),race=new Race(course);race.start();race.elapse(3);
  const point=course.sample(.1).point;race.observe(point,point,100);assert.equal(race.state,'crashed');assert.equal(race.result,null);assert.equal(race.recover(),false);
  race.start(true);race.elapse(3);for(let i=1;i<course.checkpoints.length;i++)cross(race,i);
  assert.equal(race.state,'racing');assert.equal(race.result,null);assert.equal(race.damage,0);assert.equal(race.recoveries,0);
});

test('practice recovery follows checkpoints, loops repeat and stages never create results',()=> {
  for(const definition of [courses[0],courses[1]]) {
    const course=new Course(definition),race=new Race(course);race.start(true);race.elapse(3);
    cross(race,1);assert.equal(race.recoveryPoint.progress,course.checkpoints[1].progress);
    for(let i=2;i<course.checkpoints.length;i++)cross(race,i);
    assert.equal(race.state,'racing');assert.equal(race.result,null);
    if(definition.closed)assert.equal(race.nextCheckpoint,1);
    else {assert.equal(race.nextCheckpoint,course.checkpoints.length);assert.equal(race.recoveryPoint.progress,1);}
  }
});
