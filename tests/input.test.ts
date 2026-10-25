import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/input.ts';

test('keyboard aliases, reset edge, blur, and hidden tabs clear controls', () => {
  const windowEvents = new EventTarget();
  const documentEvents = Object.assign(new EventTarget(), { hidden: false });
  Object.assign(globalThis, { window: windowEvents, document: documentEvents, HTMLButtonElement: class {} });
  const input = new Input();
  function key(type: string, code: string, repeat = false) {
    windowEvents.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code, repeat }));
  }
  key('keydown', 'ArrowUp'); key('keydown', 'ArrowLeft'); key('keydown', 'Space');
  assert.deepEqual(input.read(), { throttle: 1, steer: 1, handbrake: true });
  key('keyup', 'ArrowUp'); key('keyup', 'ArrowLeft'); key('keyup', 'Space');
  assert.deepEqual(input.read(), { throttle: 0, steer: 0, handbrake: false });
  key('keydown', 'KeyS'); key('keydown', 'KeyD');
  assert.deepEqual(input.read(), { throttle: -1, steer: -1, handbrake: false });
  key('keydown', 'KeyR'); assert.equal(input.consumeReset(), true); assert.equal(input.consumeReset(), false);
  key('keydown', 'KeyR', true); assert.equal(input.consumeReset(), false);
  windowEvents.dispatchEvent(new Event('blur'));
  assert.deepEqual(input.read(), { throttle: 0, steer: 0, handbrake: false });
  key('keydown', 'KeyW'); key('keydown', 'Space'); documentEvents.hidden = true;
  documentEvents.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(input.read(), { throttle: 0, steer: 0, handbrake: false });
});

test('cursor acceleration and one turn request auto drift; releasing, opposing arrows and WASD do not',()=> {
  const events=new EventTarget();
  Object.assign(globalThis,{window:events,document:Object.assign(new EventTarget(),{hidden:false})});
  const input=new Input();
  const key=(type:string,code:string)=>events.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{code}));
  key('keydown','ArrowUp');assert.equal(input.read().autoDrift,undefined);
  key('keydown','ArrowLeft');assert.equal(input.read().autoDrift,true);assert.equal(input.read().handbrake,false);
  key('keydown','ArrowRight');assert.equal(input.read().autoDrift,undefined);
  key('keyup','ArrowLeft');assert.equal(input.read().autoDrift,true);
  key('keydown','Space');assert.equal(input.read().autoDrift,undefined);assert.equal(input.read().handbrake,true);key('keyup','Space');
  key('keydown','ArrowDown');assert.equal(input.read().autoDrift,undefined);
  key('keyup','ArrowDown');key('keyup','ArrowUp');assert.equal(input.read().autoDrift,undefined);
  input.clear();key('keydown','KeyW');key('keydown','KeyA');assert.equal(input.read().autoDrift,undefined);
  key('keydown','Space');assert.equal(input.read().handbrake,true);
  events.dispatchEvent(new Event('blur'));assert.deepEqual(input.read(),{throttle:0,steer:0,handbrake:false});
});
