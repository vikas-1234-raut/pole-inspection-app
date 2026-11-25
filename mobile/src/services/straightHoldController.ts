export interface StraightHoldState {
  isInside: boolean;
  canCapture: boolean;
  justEntered: boolean;
  holdProgress: number; // 0..1
}

// Tracks "bubble in zone" and the continuous steady-hold timer.
export class StraightHoldController {
  private isInside = false;
  private holdStartMs: number | null = null;
  private refXDeg: number | null = null;
  private refYDeg: number | null = null;

  constructor(private readonly holdTimeMs: number, private readonly maxDriftDeg: number) {}

  // Used by the zone check to apply hysteresis only after entering.
  get inside(): boolean {
    return this.isInside;
  }

  update(inZone: boolean, xDeg: number, yDeg: number, nowMs: number): StraightHoldState {
    const wasInside = this.isInside;

    if (!inZone) {
      this.reset();
      return { isInside: false, canCapture: false, justEntered: false, holdProgress: 0 };
    }

    if (!this.isInside) {
      // Just entered the zone: start the hold.
      this.isInside = true;
      this.restartHold(xDeg, yDeg, nowMs);
    } else if (
      this.refXDeg !== null &&
      this.refYDeg !== null &&
      (Math.abs(xDeg - this.refXDeg) > this.maxDriftDeg || Math.abs(yDeg - this.refYDeg) > this.maxDriftDeg)
    ) {
      // Still in zone but the phone moved: restart the hold from here.
      this.restartHold(xDeg, yDeg, nowMs);
    }

    const elapsedMs = nowMs - (this.holdStartMs ?? nowMs);
    const holdProgress = this.holdTimeMs <= 0 ? 1 : Math.min(1, Math.max(0, elapsedMs / this.holdTimeMs));

    return {
      isInside: true,
      canCapture: elapsedMs >= this.holdTimeMs,
      justEntered: !wasInside,
      holdProgress,
    };
  }

  reset(): void {
    this.isInside = false;
    this.holdStartMs = null;
    this.refXDeg = null;
    this.refYDeg = null;
  }

  private restartHold(xDeg: number, yDeg: number, nowMs: number): void {
    this.holdStartMs = nowMs;
    this.refXDeg = xDeg;
    this.refYDeg = yDeg;
  }
}