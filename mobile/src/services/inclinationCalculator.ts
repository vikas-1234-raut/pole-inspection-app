import { BUBBLE_LEVEL_SETTINGS as settings } from '../constants/bubbleLevel';

export interface InclinationReading {
  xAngleDeg: number; // + = right edge raised → bubble right, - = bubble left
  yAngleDeg: number; // + = top edge raised → bubble up, - = bubble down
  totalTiltDeg: number;
}

const RAD_TO_DEG = 180 / Math.PI;

// Converts filtered gravity (x, y, z) into signed angles from "phone lying flat".
// Flat: x = 0, y = 0, z = ±1  →  X = 0°, Y = 0°  →  bubble at the centre point.
// Each angle compares one axis with the remaining gravity, so the result is a
// true angle from -90° to +90° and does not depend on whether z is + or -.
export function calculateInclination(x: number, y: number, z: number): InclinationReading {
  const sx = settings.xSensorSign * x;
  const sy = settings.ySensorSign * y;

  const xAngleDeg = Math.atan2(sx, Math.sqrt(y * y + z * z)) * RAD_TO_DEG;
  const yAngleDeg = Math.atan2(sy, Math.sqrt(x * x + z * z)) * RAD_TO_DEG;

  return {
    xAngleDeg,
    yAngleDeg,
    totalTiltDeg: Math.sqrt(xAngleDeg ** 2 + yAngleDeg ** 2),
  };
}