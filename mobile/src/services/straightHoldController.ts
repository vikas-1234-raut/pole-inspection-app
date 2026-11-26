export interface StraightHoldState {
  isInside: boolean;
  canCapture: boolean;
  justEntered: boolean;
  holdProgress: number; // 0..1
}

// Tracks "bubble in zone" and the steady-hold timer, tolerant of hand shake:
//  - small drift (<= maxDriftDeg) does not restart the timer
//  - brief slips out of the zone (< exitGraceMs) do not cancel the hold
export class StraightHoldController {
  private isInside = false;
  private holdStartMs: number | null = null;
  private refXDeg: number | null = null;
  private refYDeg: number | null = null;
  private outsideSinceMs: number | null = null;

  constructor(
    private readonly holdTimeMs: number,
    private readonly maxDriftDeg: number,
    private readonly exitGraceMs: number = 0
  ) {}

  // Used by the zone check to apply hysteresis only after entering.
  get inside(): boolean {
    return this.isInside;
  }

  update(inZone: boolean, xDeg: number, yDeg: number, nowMs: number): StraightHoldState {
    const wasInside = this.isInside;

    if (!inZone) {
      if (!this.isInside) return this.result(false, nowMs);
      // Brief slip: keep the hold alive during the grace period.
      if (this.outsideSinceMs === null) this.outsideSinceMs = nowMs;
      if (nowMs - this.outsideSinceMs < this.exitGraceMs) return this.result(false, nowMs);
      this.reset();
      return this.result(false, nowMs);
    }

    this.outsideSinceMs = null;

    if (!this.isInside) {
      this.isInside = true;
      this.restartHold(xDeg, yDeg, nowMs);
    } else if (
      this.refXDeg !== null &&
      this.refYDeg !== null &&
      (Math.abs(xDeg - this.refXDeg) > this.maxDriftDeg || Math.abs(yDeg - this.refYDeg) > this.maxDriftDeg)
    ) {
      // Real movement (bigger than hand shake): restart from here.
      this.restartHold(xDeg, yDeg, nowMs);
    }

    return this.result(!wasInside, nowMs);
  }

  reset(): void {
    this.isInside = false;
    this.holdStartMs = null;
    this.refXDeg = null;
    this.refYDeg = null;
    this.outsideSinceMs = null;
  }

  private result(justEntered: boolean, nowMs: number): StraightHoldState {
    if (!this.isInside || this.holdStartMs === null) {
      return { isInside: false, canCapture: false, justEntered: false, holdProgress: 0 };
    }
    const elapsedMs = nowMs - this.holdStartMs;
    const holdProgress = this.holdTimeMs <= 0 ? 1 : Math.min(1, Math.max(0, elapsedMs / this.holdTimeMs));
    return { isInside: true, canCapture: elapsedMs >= this.holdTimeMs, justEntered, holdProgress };
  }

  private restartHold(xDeg: number, yDeg: number, nowMs: number): void {
    this.holdStartMs = nowMs;
    this.refXDeg = xDeg;
    this.refYDeg = yDeg;
  }
}