import * as THREE from 'three';
import type { Course } from './track.ts';

export type GameState = 'title' | 'select' | 'countdown' | 'racing' | 'paused' | 'finished' | 'crashed';
export type Medal = 'gold' | 'silver' | 'bronze' | 'none';
export interface RaceResult { elapsed: number; damage: number; recoveries: number; total: number; medal: Medal; splits: number[] }
export function score(elapsed: number, damage: number, recoveries: number): number { return elapsed+damage*0.2+recoveries*5; }
export function medalFor(total: number, course: Course): Medal {
  for (const medal of ['gold','silver','bronze'] as const) if (total<=course.definition.medals[medal]) return medal;
  return 'none';
}

export class Race {
  state: GameState = 'title';
  practice = false;
  elapsed = 0;
  countdown = 3;
  nextCheckpoint = 1;
  damage = 0;
  recoveries = 0;
  splits: number[] = [];
  result: RaceResult | null = null;
  private beforePause: 'countdown' | 'racing' = 'racing';
  readonly course: Course;
  constructor(course: Course) { this.course=course; }
  start(practice = false): void {
    this.practice=practice; this.state='countdown'; this.elapsed=0; this.countdown=3;
    this.nextCheckpoint=1; this.damage=0; this.recoveries=0; this.splits=[]; this.result=null;
  }
  elapse(dt: number): void {
    if (this.state==='countdown') {
      this.countdown=Math.max(0,this.countdown-dt);
      if(this.countdown===0) this.state='racing';
    } else if(this.state==='racing') this.elapsed+=dt;
  }
  pause(): void {
    if(this.state==='racing'||this.state==='countdown') { this.beforePause=this.state; this.state='paused'; }
  }
  resume(): void { if(this.state==='paused') this.state=this.beforePause; }
  get total(): number { return score(this.elapsed,this.damage,this.recoveries); }
  get recoveryPoint() { return this.course.checkpoints[Math.max(0,this.nextCheckpoint-1)]; }
  recover(): boolean {
    if(this.state!=='racing') return false;
    this.recoveries++; return true;
  }
  observe(previous: THREE.Vector3, position: THREE.Vector3, damage: number): void {
    if(this.state!=='racing') return;
    this.damage=damage;
    if(damage>=100) { this.state='crashed'; return; }
    const gate=this.course.checkpoints[this.nextCheckpoint];
    if(!gate)return;
    const from=previous.clone().sub(gate.point); const to=position.clone().sub(gate.point);
    const a=from.dot(gate.tangent); const b=to.dot(gate.tangent);
    if(a>0 || b<=0 || a===b) return;
    const crossing=previous.clone().lerp(position,-a/(b-a)).sub(gate.point).setY(0);
    if(crossing.length()>this.course.definition.width/2+1.5) return;
    if(!this.practice)this.splits.push(this.total); this.nextCheckpoint++;
    if(this.nextCheckpoint===this.course.checkpoints.length) {
      if(this.practice) {if(this.course.definition.closed)this.nextCheckpoint=1;return;}
      this.result={elapsed:this.elapsed,damage:this.damage,recoveries:this.recoveries,total:this.total,medal:medalFor(this.total,this.course),splits:[...this.splits]};
      this.state='finished';
    }
  }
}
