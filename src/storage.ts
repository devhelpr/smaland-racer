import { isTimeOfDay, isHeadlightMode, type TimeOfDay, type HeadlightMode } from './lighting.ts';
import { drivingStyles, isDrivingStyle, type DrivingStyle } from './driving.ts';
import { isSeason, type Season } from './seasons.ts';
import { courses } from './track.ts';
import type { RaceResult } from './race.ts';
import { isVehicleId, type VehicleId } from './vehicles.ts';
export type Language = 'en' | 'nl' | 'sv';
export interface Progress { version: 1; language: Language; season: Season; timeOfDay?: TimeOfDay; headlights?: HeadlightMode; drivingStyle?: DrivingStyle; vehicle?: VehicleId; records: Record<string,RaceResult> }
export interface StorageLike { getItem(key: string): string|null; setItem(key: string,value: string): void }
const key='smaland-racer:v1';
const validNumber=(n: unknown): n is number => typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function detectLanguage(locale: string): Language { const lang=locale.toLowerCase().split('-')[0]; return lang==='nl'||lang==='sv'?lang:'en'; }
export function loadProgress(storage: StorageLike|null, locale='en'): Progress {
  const result: Progress={version:1,language:detectLanguage(locale),season:'summer',timeOfDay:'day',headlights:'dipped',drivingStyle:'cruising',vehicle:'volvo-240',records:{}};
  try {
    const data=JSON.parse(storage?.getItem(key)??'null');
    if(!data||data.version!==1) return result;
    if(['en','nl','sv'].includes(data.language)) result.language=data.language;
    if(isDrivingStyle(data.drivingStyle))result.drivingStyle=data.drivingStyle;
    if(isVehicleId(data.vehicle))result.vehicle=data.vehicle;
    if(isTimeOfDay(data.timeOfDay))result.timeOfDay=data.timeOfDay;
    if(isHeadlightMode(data.headlights))result.headlights=data.headlights;
    if(isSeason(data.season))result.season=data.season;
    for(const course of courses) for(const style of drivingStyles) {
      const recordKey=courseRecordKey(course.id,style);
      const r=data.records?.[recordKey];
      if(!r||!validNumber(r.elapsed)||!validNumber(r.damage)||r.damage>=100||!Number.isInteger(r.recoveries)||r.recoveries<0||!validNumber(r.total)||!['none','bronze','silver','gold'].includes(r.medal)||!Array.isArray(r.splits)||!r.splits.every(validNumber)) continue;
      if(Math.abs(r.total-(r.elapsed+r.damage*.2+r.recoveries*5))>0.01) continue;
      // Recompute medals from the current course targets when loading saved records.
      r.medal=r.total<=course.medals.gold?'gold':r.total<=course.medals.silver?'silver':r.total<=course.medals.bronze?'bronze':'none';
      result.records[recordKey]=r;
    }
  } catch { /* A damaged or blocked save must never prevent playing. */ }
  return result;
}
export function saveProgress(storage: StorageLike|null, progress: Progress): boolean {
  try { if(!storage) return false; storage.setItem(key,JSON.stringify(progress)); return true; } catch { return false; }
}
export function isCourseAvailable(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < courses.length;
}
export function courseRecordKey(courseId:string,style:DrivingStyle='cruising'):string {return style==='cruising'?courseId:`${courseId}:${style}`;}
export function recordResult(progress: Progress, courseId: string, result: RaceResult, style:DrivingStyle='cruising'): boolean {
  courseId=courseRecordKey(courseId,style);
  const current=progress.records[courseId];
  if(!current||result.total<current.total) { progress.records[courseId]={...result,splits:[...result.splits]}; return true; }
  return false;
}
