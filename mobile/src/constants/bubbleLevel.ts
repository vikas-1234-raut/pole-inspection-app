import { Platform } from 'react-native';

// Bubble level settings. All direction (sign) corrections live ONLY here.
// Reference: phone lying FLAT, screen facing the sky = X 0°, Y 0°, bubble at centre.
export const BUBBLE_LEVEL_SETTINGS = {
  // ---- Sensor ----
  // Higher alpha = faster bubble, lower alpha = calmer bubble.
  alpha: 0.1,
  sampleIntervalMs: 100,

  // ---- Capture zone ----
  // Y: 0 = flat, + = top edge raised (bubble up), - = top edge lowered (bubble down).
  yMinDeg: 0,
  yMaxDeg: 90,
  // X: how far the bubble may be from the vertical line (degrees).
  xToleranceDeg: 5,
  // Once inside, edges widen by this much so the zone does not flicker.
  hysteresisDeg: 2,

  // ---- Steady hold (hand-held tolerance) ----
  holdTimeMs: 700,
  // Movement beyond this (either axis) restarts the hold. Hand shake is ~1-2°.
  maximumHoldDriftDeg: 3,
  // Bubble may slip out of the zone this long without cancelling the hold.
  exitGraceMs: 400,

  // ---- Display ----
  // Angle that maps to the edge of the circle. Bigger = bubble moves less per degree.
  maxAngleDeg: 30,
  animationDurationMs: 120,
  positionStepPx: 2,
  viewSize: 210,
  bubbleDiameter: 26,
  // Centre target ring = bubble diameter + this margin on each side.
  centerTargetMarginPx: 4,
  // Within this many degrees of (0,0) the centre ring turns green.
  centerToleranceDeg: 1.5,

  // ---- Calibration (flip to -1 if a direction is wrong on your phone) ----
  xSensorSign: Platform.OS === 'ios' ? -1 : 1,
  ySensorSign: Platform.OS === 'ios' ? -1 : 1,
};