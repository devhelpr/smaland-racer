import test from 'node:test';
import assert from 'node:assert/strict';
import { courses, Course } from '../src/track.ts';
import { detectLanguage, isCourseAvailable, loadProgress, recordResult, saveProgress } from '../src/storage.ts';
import { dictionaries } from '../src/i18n.ts';
import { wildlifePlan } from '../src/wildlife.ts';
import type { RaceResult } from '../src/race.ts';

const result:RaceResult={elapsed:20,damage:10,recoveries:1,total:27,medal:'gold',splits:[10,27]};
test('all courses are available immediately; records improve only and saves reload',()=> {
  let data='';const storage={getItem:()=>data,setItem:(_key:string,value:string)=>{data=value;}};
  const progress=loadProgress(storage,'nl-NL');assert.equal(progress.language,'nl');assert.ok(isCourseAvailable(0));assert.ok(isCourseAvailable(1));
  for(let i=0;i<courses.length;i++)assert.ok(isCourseAvailable(i));
  for(const index of [-1,6,NaN,1.5])assert.equal(isCourseAvailable(index),false);
  assert.ok(recordResult(progress,courses[0].id,result));assert.ok(isCourseAvailable(1));assert.ok(isCourseAvailable(2));
  assert.ok(!recordResult(progress,courses[0].id,{...result,total:30}));assert.equal(progress.records[courses[0].id].total,27);
  assert.ok(saveProgress(storage,progress));const restored=loadProgress(storage,'sv');assert.equal(restored.language,'nl');assert.equal(restored.records[courses[0].id].total,27);assert.ok(isCourseAvailable(1));
});

test('corrupt, outdated and inaccessible saves never prevent play',()=> {
  for(const raw of ['broken','null','{}','{"version":2}','{"version":1,"language":"xx","records":{"forest-loop":{"total":0,"medal":"gold"}}}']) {
    const progress=loadProgress({getItem:()=>raw,setItem:()=>{}},'sv-SE');assert.equal(progress.language,'sv');assert.deepEqual(progress.records,{});
  }
  const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('quota');}};
  assert.equal(saveProgress(blocked,loadProgress(blocked)),false);assert.equal(saveProgress(null,loadProgress(null)),false);
  assert.equal(detectLanguage('fr-FR'),'en');
});

test('all interface keys exist in English, Dutch and Swedish',()=> {
  const keys=Object.keys(dictionaries.en).sort();
  for(const dictionary of Object.values(dictionaries)) {assert.deepEqual(Object.keys(dictionary).sort(),keys);for(const value of Object.values(dictionary))assert.ok(value.trim().length>0);}
});

test('wildlife is reproducible with a seed, variable across attempts and starts clear of the road',()=> {
  for(const definition of courses) {
    const course=new Course(definition);const a=wildlifePlan(course,45),b=wildlifePlan(course,46);
    assert.deepEqual(a,wildlifePlan(course,45));assert.notDeepEqual(a,b);assert.equal(a.length,definition.wildlifeCount);
    for(const plan of a) {
      const center=course.sample(plan.progress),offset=plan.side*(definition.width/2+5);
      const x=center.point.x-center.tangent.z*offset,z=center.point.z+center.tangent.x*offset;
      assert.ok(course.nearest(x,z).distance>definition.width/2+3);assert.ok(!course.inWater(x,z));
    }
  }
});

test('all six course records survive a reload without restricting selection',async()=> {
  const {Race}=await import('../src/race.ts');
  const progress=loadProgress(null,'en');
  for(let i=0;i<courses.length;i++) {
    assert.ok(isCourseAvailable(i));
    const course=new Course(courses[i]),race=new Race(course);race.start();race.elapse(3);race.elapse(courses[i].medals.bronze-2);
    for(const gate of course.checkpoints.slice(1))race.observe(gate.point.clone().addScaledVector(gate.tangent,-1),gate.point.clone().addScaledVector(gate.tangent,1),0);
    assert.equal(race.state,'finished');assert.equal(race.result!.medal,'bronze');recordResult(progress,courses[i].id,race.result!);
  }
  let saved='';saveProgress({getItem:()=>saved,setItem:(_key,value)=>{saved=value;}},progress);
  const restored=loadProgress({getItem:()=>saved,setItem:()=>{}},'en');
  assert.equal(Object.keys(restored.records).length,6);assert.ok(isCourseAvailable(5));
});
