import { GestureControls } from './gestures.ts';

export interface DriveInput { throttle: number; steer: number; handbrake: boolean }

export class Input {
  private keys = new Set<string>();
  private resetRequested = false;
  private codes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space', 'KeyR']);
  private gestures = new GestureControls();
  private surface?: HTMLElement;
  private drivingEnabled = false;
  usingTouch = (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) || Boolean(window.matchMedia?.('(pointer: coarse)').matches);
  onModeChange?: () => void;

  constructor(surface?: HTMLElement) {
    this.surface = surface;
    window.addEventListener('keydown', event => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (!this.codes.has(event.code) || ['BUTTON', 'SELECT', 'INPUT', 'TEXTAREA'].includes(tag ?? '')) return;
      event.preventDefault();
      this.setMode(false);
      this.keys.add(event.code);
      if (event.code === 'KeyR' && !event.repeat) this.resetRequested = true;
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.clear());
    window.addEventListener('resize', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    if (!surface) return;
    surface.addEventListener('pointerdown', event => {
      if (!this.drivingEnabled || !['touch', 'pen'].includes(event.pointerType)) return;
      event.preventDefault();
      this.setMode(true);
      const bounds = surface.getBoundingClientRect();
      this.gestures.down(event.pointerId, event.clientX, event.clientY, event.timeStamp, bounds.width, bounds.height);
      surface.setPointerCapture(event.pointerId);
    }, {passive: false});
    surface.addEventListener('pointermove', event => {
      if (!this.gestures.has(event.pointerId)) return;
      event.preventDefault();
      this.gestures.move(event.pointerId, event.clientX, event.clientY);
    }, {passive: false});
    surface.addEventListener('pointerup', event => {
      if (!this.gestures.has(event.pointerId)) return;
      event.preventDefault();
      this.gestures.up(event.pointerId, event.clientX, event.clientY, event.timeStamp);
      if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
    });
    const cancel = (event: PointerEvent) => { if (this.gestures.has(event.pointerId)) this.clear(); };
    surface.addEventListener('pointercancel', cancel);
    surface.addEventListener('lostpointercapture', cancel);
    surface.addEventListener('contextmenu', event => { if (this.drivingEnabled && this.usingTouch) event.preventDefault(); });
  }

  private setMode(touch: boolean): void {
    if (this.usingTouch === touch) return;
    this.usingTouch = touch;
    this.onModeChange?.();
  }

  setDrivingEnabled(enabled: boolean): void {
    if (this.drivingEnabled === enabled) return;
    this.drivingEnabled = enabled;
    if (!enabled) this.clear();
  }

  clear(): void {
    this.keys.clear(); this.resetRequested = false;
    const ids = this.gestures.pointerIds;
    this.gestures.clear();
    for (const id of ids) if (this.surface?.hasPointerCapture(id)) this.surface.releasePointerCapture(id);
  }
  reset(): void { this.resetRequested = true; }
  consumeReset(): boolean {
    const gesture = this.gestures.consumeReset();
    const requested = this.resetRequested || gesture;
    this.resetRequested = false;
    return requested;
  }
  read(): DriveInput {
    const held = (...codes: string[]) => codes.some(code => this.keys.has(code)) ? 1 : 0;
    const touch = this.gestures.read();
    return {
      throttle: (held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown')) || touch.throttle,
      steer: (held('KeyA', 'ArrowLeft') - held('KeyD', 'ArrowRight')) || touch.steer,
      handbrake: this.keys.has('Space') || touch.handbrake,
    };
  }
}
