// import { BUBBLE_LEVEL_SETTINGS } from '../constants/bubbleLevel';

// export interface InclinationReading {
//   xAngleDeg: number;
//   yAngleDeg: number;
//   yDeviationDeg: number;
//   totalTiltDeg: number;
// }

// // Converts filtered gravity components into the app's upright-phone angles.
// export function calculateInclination(x: number, y: number, z: number): InclinationReading {
//   const xAngleDeg = Math.atan2(
//     BUBBLE_LEVEL_SETTINGS.xAxisSign * x,
//     Math.sqrt(y * y + z * z)
//   ) * (180 / Math.PI);
//   const yAngleDeg = Math.atan2(
//     BUBBLE_LEVEL_SETTINGS.yAxisSign * y,
//     z
//   ) * (180 / Math.PI);
//   const yDeviationDeg = 90 - yAngleDeg;

//   return {
//     xAngleDeg,
//     yAngleDeg,
//     yDeviationDeg,
//     totalTiltDeg: Math.sqrt(xAngleDeg ** 2 + yDeviationDeg ** 2),
//   };
// }


import { BUBBLE_LEVEL_SETTINGS } from '../constants/bubbleLevel';

export interface InclinationReading {
  xAngleDeg: number;
  yAngleDeg: number;
  yDeviationDeg: number;
  totalTiltDeg: number;
}

// Converts filtered gravity components into sideways tilt and pitch from upright.
export function calculateInclination(x: number, y: number, z: number): InclinationReading {
  const xAngleDeg = Math.atan2(
    BUBBLE_LEVEL_SETTINGS.xAxisSign * x,
    Math.sqrt(y * y + z * z)
  ) * (180 / Math.PI);
  // Measure pitch away from upright directly; capture does not require Y = 90°.
  const yDeviationDeg = Math.atan2(
    z,
    BUBBLE_LEVEL_SETTINGS.yAxisSign * y
  ) * (180 / Math.PI);
  const yAngleDeg = 90 - yDeviationDeg;

  return {
    xAngleDeg,
    yAngleDeg,
    yDeviationDeg,
    totalTiltDeg: Math.sqrt(xAngleDeg ** 2 + yDeviationDeg ** 2),
  };
}
