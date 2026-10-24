import type { DriveInput } from './input.ts';

interface Finger {
  x: number;
  y: number;
  originX: number;
  originY: number;
  started: number;
  travel: number;
}

/** A drag anywhere in the driving view acts as two independent analog axes. */
export class GestureControls {
  private fingers = new Map<number, Finger>();
  private primary: number | null = null;
  private horizontalRange = 90;
  private verticalRange = 90;
  private multiTouch = false;
  private lastTap: { x: number; y: number; time: number } | null = null;
  private resetRequested = false;

  get pointerIds(): number[] { return [...this.fingers.keys()]; }
  has(id: number): boolean { return this.fingers.has(id); }

  down(id: number, x: number, y: number, time: number, width: number, height: number): void {
    if (this.fingers.has(id)) return;
    this.fingers.set(id, {x, y, originX: x, originY: y, started: time, travel: 0});
    if (this.primary === null) {
      this.primary = id;
      this.horizontalRange = Math.max(55, Math.min(110, width * .24));
      this.verticalRange = Math.max(55, Math.min(100, height * .14));
    }
    if (this.fingers.size > 1) {
      this.multiTouch = true;
      this.lastTap = null;
    }
  }

  move(id: number, x: number, y: number): void {
    const finger = this.fingers.get(id);
    if (!finger) return;
    finger.x = x; finger.y = y;
    finger.travel = Math.max(finger.travel, Math.hypot(x - finger.originX, y - finger.originY));
    if (finger.travel > 8) this.lastTap = null;
  }

  up(id: number, x: number, y: number, time: number): void {
    this.move(id, x, y);
    const finger = this.fingers.get(id);
    if (!finger) return;
    if (!this.multiTouch && finger.travel <= 8 && time - finger.started <= 220) {
      if (this.lastTap && time - this.lastTap.time <= 300 && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) <= 35) {
        this.resetRequested = true;
        this.lastTap = null;
      } else this.lastTap = {x, y, time};
    } else this.lastTap = null;
    this.fingers.delete(id);
    if (this.primary === id) {
      this.primary = this.fingers.keys().next().value ?? null;
      if (this.primary !== null) {
        // Rebase a remaining finger; lifting the steering finger must not leave gas held.
        const next = this.fingers.get(this.primary)!;
        next.originX = next.x; next.originY = next.y;
      }
    }
    if (this.fingers.size === 0) this.multiTouch = false;
  }

  clear(): void {
    this.fingers.clear(); this.primary = null; this.multiTouch = false;
    this.lastTap = null; this.resetRequested = false;
  }

  consumeReset(): boolean {
    const result = this.resetRequested;
    this.resetRequested = false;
    return result;
  }

  read(): DriveInput {
    const finger = this.primary === null ? undefined : this.fingers.get(this.primary);
    if (!finger) return {throttle: 0, steer: 0, handbrake: false};
    const axis = (delta: number, range: number): number => {
      if (Math.abs(delta) <= 8) return 0;
      return Math.sign(delta) * Math.min(1, (Math.abs(delta) - 8) / (range - 8));
    };
    return {
      throttle: axis(finger.originY - finger.y, this.verticalRange),
      steer: axis(finger.originX - finger.x, this.horizontalRange),
      handbrake: this.fingers.size >= 2,
    };
  }
}
