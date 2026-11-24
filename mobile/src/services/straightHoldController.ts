// export interface StraightHoldState {
//   isInside: boolean;
//   canCapture: boolean;
//   justEntered: boolean;
//   holdProgress: number;
// }

// // Tracks the entry/exit thresholds and continuous hold duration.
// export class StraightHoldController {
//   private isInside = false;
//   private enteredAtMs: number | null = null;
//   private canCapture = false;

//   // Update straight-state and hold progress for the latest total tilt.
//   update(
//     totalTiltDeg: number,
//     nowMs: number,
//     toleranceDeg: number,
//     hysteresisDeg: number,
//     holdTimeMs: number
//   ): StraightHoldState {
//     const wasInside = this.isInside;
//     const exitToleranceDeg = toleranceDeg + hysteresisDeg;

//     if (this.isInside && totalTiltDeg > exitToleranceDeg) {
//       this.isInside = false;
//       this.enteredAtMs = null;
//       this.canCapture = false;
//     } else if (!this.isInside && totalTiltDeg <= toleranceDeg) {
//       this.isInside = true;
//       this.enteredAtMs = nowMs;
//       this.canCapture = holdTimeMs <= 0;
//     }

//     if (this.isInside && this.enteredAtMs !== null) {
//       this.canCapture = nowMs - this.enteredAtMs >= holdTimeMs;
//     }

//     const holdProgress = this.isInside && this.enteredAtMs !== null
//       ? Math.min(1, Math.max(0, (nowMs - this.enteredAtMs) / Math.max(holdTimeMs, 1)))
//       : 0;

//     return {
//       isInside: this.isInside,
//       canCapture: this.canCapture,
//       justEntered: this.isInside && !wasInside,
//       holdProgress,
//     };
//   }

//   // Reset the zone and hold timer, such as when the app pauses.
//   reset(): void {
//     this.isInside = false;
//     this.enteredAtMs = null;
//     this.canCapture = false;
//   }
// }

export interface StraightHoldState {
  isInside: boolean;
  canCapture: boolean;
  justEntered: boolean;
  holdProgress: number;
}

// Tracks the entry/exit thresholds and continuous hold duration.
export class StraightHoldController {
  private isInside = false;
  private enteredAtMs: number | null = null;
  private referenceValueDeg: number | null = null;
  private canCapture = false;

  // Update alignment, hold stability, and the continuous hold timer.
  update(
    alignmentErrorDeg: number,
    nowMs: number,
    toleranceDeg: number,
    hysteresisDeg: number,
    holdTimeMs: number,
    stableValueDeg = 0,
    maximumDriftDeg = Number.POSITIVE_INFINITY,
    eligible = true
  ): StraightHoldState {
    const wasInside = this.isInside;
    const exitToleranceDeg = toleranceDeg + hysteresisDeg;

    if (!eligible || (this.isInside && alignmentErrorDeg > exitToleranceDeg)) {
      this.isInside = false;
      this.enteredAtMs = null;
      this.referenceValueDeg = null;
      this.canCapture = false;
    } else if (!this.isInside && alignmentErrorDeg <= toleranceDeg) {
      this.isInside = true;
      this.enteredAtMs = nowMs;
      this.referenceValueDeg = stableValueDeg;
      this.canCapture = holdTimeMs <= 0;
    }

    // Restart the hold if the aimed-up angle itself changes while aligned.
    if (
      this.isInside &&
      this.referenceValueDeg !== null &&
      Math.abs(stableValueDeg - this.referenceValueDeg) > maximumDriftDeg
    ) {
      this.enteredAtMs = nowMs;
      this.referenceValueDeg = stableValueDeg;
      this.canCapture = holdTimeMs <= 0;
    }

    if (this.isInside && this.enteredAtMs !== null) {
      this.canCapture = nowMs - this.enteredAtMs >= holdTimeMs;
    }

    const holdProgress = this.isInside && this.enteredAtMs !== null
      ? Math.min(1, Math.max(0, (nowMs - this.enteredAtMs) / Math.max(holdTimeMs, 1)))
      : 0;

    return {
      isInside: this.isInside,
      canCapture: this.canCapture,
      justEntered: this.isInside && !wasInside,
      holdProgress,
    };
  }

  // Reset the zone and hold timer, such as when the app pauses.
  reset(): void {
    this.isInside = false;
    this.enteredAtMs = null;
    this.referenceValueDeg = null;
    this.canCapture = false;
  }
}
