import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureControls } from '../src/gestures.ts';
import { Input } from '../src/input.ts';
import { Vehicle } from '../src/vehicle.ts';
import { Course, courses } from '../src/track.ts';

const neutral={throttle:0,steer:0,handbrake:false};
function touchEnvironment(coarse=true) {
  const windowEvents=Object.assign(new EventTarget(),{matchMedia:()=>({matches:coarse})});
  const documentEvents=Object.assign(new EventTarget(),{hidden:false});
  Object.assign(globalThis,{window:windowEvents,document:documentEvents});
  class Surface extends EventTarget {
    captured=new Set<number>();
    getBoundingClientRect(){return {width:390,height:844};}
    setPointerCapture(id:number){this.captured.add(id);}
    hasPointerCapture(id:number){return this.captured.has(id);}
    releasePointerCapture(id:number){
      this.captured.delete(id);
      this.dispatchEvent(Object.assign(new Event('lostpointercapture'),{pointerId:id}));
    }
  }
  const surface=new Surface(),input=new Input(surface as unknown as HTMLElement);
  function pointer(type:string,id:number,x=200,y=500,time=0,pointerType='touch') {
    const event=Object.assign(new Event(type,{cancelable:true}),{pointerId:id,clientX:x,clientY:y,pointerType});
    Object.defineProperty(event,'timeStamp',{value:time});surface.dispatchEvent(event);return event;
  }
  return {windowEvents,documentEvents,surface,input,pointer};
}

test('one-finger diagonal drag combines analog steering and throttle, releasing returns to neutral',()=> {
  const gestures=new GestureControls();gestures.down(1,200,500,0,390,844);
  assert.deepEqual(gestures.read(),neutral);
  gestures.move(1,157,450);
  assert.ok(gestures.read().throttle>0&&gestures.read().throttle<1);
  assert.ok(gestures.read().steer>0&&gestures.read().steer<1);
  gestures.move(1,350,650);assert.deepEqual(gestures.read(),{throttle:-1,steer:-1,handbrake:false});
  gestures.move(1,-500,-500);assert.deepEqual(gestures.read(),{throttle:1,steer:1,handbrake:false});
  gestures.up(1,-500,-500,1000);assert.deepEqual(gestures.read(),neutral);assert.equal(gestures.consumeReset(),false);
});

test('dead zone rejects finger jitter and sensitivity adapts to portrait and landscape',()=> {
  for(const [width,height] of [[390,844],[844,390],[2000,1200],[320,480]]) {
    const gestures=new GestureControls();gestures.down(1,100,200,0,width,height);gestures.move(1,106,194);
    assert.deepEqual(gestures.read(),neutral);
    gestures.move(1,100,90);assert.equal(gestures.read().throttle,1);
    gestures.move(1,220,200);assert.equal(gestures.read().steer,-1);
  }
});

test('second finger holds handbrake and primary finger handoff never retains gas or steering',()=> {
  const gestures=new GestureControls();gestures.down(1,100,500,0,390,844);gestures.move(1,50,390);
  gestures.down(2,300,450,50,390,844);assert.equal(gestures.read().handbrake,true);assert.equal(gestures.read().throttle,1);
  gestures.up(2,300,450,100);assert.equal(gestures.read().handbrake,false);assert.equal(gestures.read().throttle,1);
  gestures.down(2,300,450,150,390,844);gestures.up(1,50,390,200);
  assert.deepEqual(gestures.read(),neutral);gestures.up(2,300,450,250);assert.equal(gestures.consumeReset(),false);
});

test('only a nearby quick double tap recovers; swipes, long holds and multitouch do not',()=> {
  const gestures=new GestureControls();
  function tap(id:number,time:number,x=100,y=400) {gestures.down(id,x,y,time,390,844);gestures.up(id,x,y,time+50);}
  tap(1,0);assert.equal(gestures.consumeReset(),false);tap(2,180);assert.equal(gestures.consumeReset(),true);assert.equal(gestures.consumeReset(),false);
  gestures.clear();tap(1,0);tap(2,500);assert.equal(gestures.consumeReset(),false);
  gestures.clear();tap(1,0);tap(2,150,300);assert.equal(gestures.consumeReset(),false);
  gestures.clear();tap(1,0);gestures.down(2,100,400,150,390,844);gestures.move(2,109,400);gestures.up(2,100,400,190);assert.equal(gestures.consumeReset(),false);
  gestures.clear();tap(1,0);gestures.down(2,100,400,150,390,844);gestures.up(2,100,400,800);assert.equal(gestures.consumeReset(),false);
});

test('canvas binding ignores menus and mouse, captures touch, and clears on interruption',()=> {
  const env=touchEnvironment(),{input,pointer,surface}=env;
  assert.equal(pointer('pointerdown',1).defaultPrevented,false);assert.equal(surface.captured.size,0);
  input.setDrivingEnabled(true);assert.equal(pointer('pointerdown',1,200,500,0,'mouse').defaultPrevented,false);
  assert.equal(pointer('pointerdown',1).defaultPrevented,true);assert.ok(surface.hasPointerCapture(1));
  pointer('pointermove',1,150,350,40);assert.equal(input.read().throttle,1);assert.ok(input.read().steer>0);
  pointer('pointerup',1,150,350,400);assert.deepEqual(input.read(),neutral);assert.equal(surface.captured.size,0);
  for(const interruption of ['cancel','capture','blur','hidden','resize','pause']) {
    input.setDrivingEnabled(true);pointer('pointerdown',1);pointer('pointermove',1,100,350);pointer('pointerdown',2);
    if(interruption==='cancel')pointer('pointercancel',1);
    if(interruption==='capture')surface.releasePointerCapture(1);
    if(interruption==='blur')env.windowEvents.dispatchEvent(new Event('blur'));
    if(interruption==='hidden'){env.documentEvents.hidden=true;env.documentEvents.dispatchEvent(new Event('visibilitychange'));}
    if(interruption==='resize')env.windowEvents.dispatchEvent(new Event('resize'));
    if(interruption==='pause')input.setDrivingEnabled(false);
    assert.deepEqual(input.read(),neutral,interruption);assert.equal(surface.captured.size,0,interruption);
  }
});

test('touch/keyboard mode switches and double-tap recovery pass through the input adapter',()=> {
  const {input,pointer,windowEvents}=touchEnvironment(false);let changed=0;input.onModeChange=()=>changed++;
  input.setDrivingEnabled(true);
  pointer('pointerdown',1,100,400,0);pointer('pointerup',1,100,400,60);
  pointer('pointerdown',2,100,400,180);pointer('pointerup',2,100,400,220);
  assert.equal(input.usingTouch,true);assert.equal(input.consumeReset(),true);assert.equal(input.consumeReset(),false);
  windowEvents.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{code:'KeyW',repeat:false}));
  assert.equal(input.usingTouch,false);assert.equal(changed,2);assert.equal(input.read().throttle,1);
  windowEvents.dispatchEvent(Object.assign(new Event('keyup'),{code:'KeyW'}));assert.deepEqual(input.read(),neutral);
});

test('gesture input accelerates and steers the actual vehicle, then releases to coast',()=> {
  const {input,pointer}=touchEnvironment();input.setDrivingEnabled(true);
  const car=new Vehicle(new Course(courses[0]));car.heading=0;
  pointer('pointerdown',1,200,500,0);pointer('pointermove',1,160,380,50);
  for(let i=0;i<120;i++)car.update(1/120,input.read());
  assert.ok(car.forwardSpeed>4);assert.ok(car.heading>0);
  pointer('pointerdown',2,300,450,1100);assert.equal(input.read().handbrake,true);
  pointer('pointerup',2,300,450,1200);pointer('pointerup',1,160,380,1250);
  const before=car.velocity.length();for(let i=0;i<24;i++)car.update(1/120,input.read());
  assert.ok(car.velocity.length()>0&&car.velocity.length()<before);assert.deepEqual(input.read(),neutral);
});
