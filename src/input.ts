export interface DriveInput { throttle: number; steer: number; handbrake: boolean }

export class Input {
  private keys = new Set<string>();
  private resetRequested = false;
  private codes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space', 'KeyR']);

  constructor() {
    window.addEventListener('keydown', event => {
      if (!this.codes.has(event.code) || event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      this.keys.add(event.code);
      if (event.code === 'KeyR' && !event.repeat) this.resetRequested = true;
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
  }

  clear(): void { this.keys.clear(); this.resetRequested = false; }
  reset(): void { this.resetRequested = true; }
  consumeReset(): boolean {
    const requested = this.resetRequested;
    this.resetRequested = false;
    return requested;
  }
  read(): DriveInput {
    const held = (...codes: string[]) => codes.some(code => this.keys.has(code)) ? 1 : 0;
    return {
      throttle: held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown'),
      steer: held('KeyA', 'ArrowLeft') - held('KeyD', 'ArrowRight'),
      handbrake: this.keys.has('Space'),
    };
  }
}
