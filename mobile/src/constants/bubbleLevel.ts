// // Bubble level tuning values. Keep axis direction switches together here so
// // real-phone direction corrections do not require changes across the feature.
// export const BUBBLE_LEVEL_SETTINGS = {
//   alpha: 0.15,
//   toleranceDeg: 2,
//   hysteresisDeg: 1,
//   holdTimeMs: 1000,
//   maxAngleDeg: 15,
//   sampleIntervalMs: 100,
//   viewSize: 210,
//   bubbleDiameter: 26,
//   xAxisSign: 1,
//   yAxisSign: 1,
//   bubbleXSign: 1,
//   bubbleYSign: -1,
// } as const;

// Bubble level tuning values. Keep axis direction switches together here so
// real-phone direction corrections do not require changes across the feature.
export const BUBBLE_LEVEL_SETTINGS = {
  // Smaller alpha filters more hand/sensor shake. Adjust on the real phone if response feels delayed.
  alpha: 0.06,
  toleranceDeg: 2,
  hysteresisDeg: 1,
  holdTimeMs: 1000,
  maximumHoldDriftDeg: 1,
  maxAngleDeg: 15,
  sampleIntervalMs: 100,
  animationSpeed: 5,
  positionStepPx: 2,
  viewSize: 210,
  bubbleDiameter: 26,
  xAxisSign: 1,
  yAxisSign: 1,
  bubbleXSign: 1,
  // Flip this if upward phone tilt sends the bubble down on screen.
  bubbleYSign: 1,
} as const;

