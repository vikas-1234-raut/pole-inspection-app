// import { useEffect, useRef, useState } from 'react';
// import { AppState, Vibration } from 'react-native';
// import { Accelerometer } from 'expo-sensors';
// import { BUBBLE_LEVEL_SETTINGS as settings } from '../constants/bubbleLevel';
// import { calculateInclination } from './inclinationCalculator';
// import { LowPassFilter } from './lowPassFilter';
// import { StraightHoldController } from './straightHoldController';

// export interface BubbleLevelState {
//   sensorAvailable: boolean | null;
//   xAngleDeg: number | null;
//   yAngleDeg: number | null;
//   yDeviationDeg: number | null;
//   totalTiltDeg: number | null;
//   isInside: boolean;
//   canCapture: boolean;
//   holdProgress: number;
//   hint: string;
// }

// const INITIAL_STATE: BubbleLevelState = {
//   sensorAvailable: null,
//   xAngleDeg: null,
//   yAngleDeg: null,
//   yDeviationDeg: null,
//   totalTiltDeg: null,
//   isInside: false,
//   canCapture: false,
//   holdProgress: 0,
//   hint: 'Reading level sensor…',
// };

// // Subscribes to accelerometer samples only while the first-photo bubble is active.
// export function useBubbleLevel(enabled: boolean): BubbleLevelState {
//   const [state, setState] = useState<BubbleLevelState>(INITIAL_STATE);
//   const xFilter = useRef(new LowPassFilter());
//   const yFilter = useRef(new LowPassFilter());
//   const zFilter = useRef(new LowPassFilter());
//   const holdController = useRef(new StraightHoldController());

//   useEffect(() => {
//     if (!enabled) {
//       setState(INITIAL_STATE);
//       return;
//     }

//     let isMounted = true;
//     let generation = 0;
//     let subscription: ReturnType<typeof Accelerometer.addListener> | null = null;

//     // Stop updates and reset the one-second hold when the screen pauses.
//     function stopSensor(): void {
//       generation += 1;
//       subscription?.remove();
//       subscription = null;
//       xFilter.current.reset();
//       yFilter.current.reset();
//       zFilter.current.reset();
//       holdController.current.reset();
//       if (isMounted) {
//         setState((previous) => ({
//           ...INITIAL_STATE,
//           sensorAvailable: previous.sensorAvailable === false ? false : null,
//           hint: previous.sensorAvailable === false ? 'Level sensor unavailable — level check skipped' : INITIAL_STATE.hint,
//           canCapture: previous.sensorAvailable === false,
//         }));
//       }
//     }

//     // Check sensor availability and register the live accelerometer listener.
//     async function startSensor(): Promise<void> {
//       const activeGeneration = ++generation;
//       setState(INITIAL_STATE);
//       try {
//         const available = await Accelerometer.isAvailableAsync();
//         if (!isMounted || activeGeneration !== generation) return;
//         if (!available) {
//           setState({ ...INITIAL_STATE, sensorAvailable: false, canCapture: true, hint: 'Level sensor unavailable — level check skipped' });
//           return;
//         }

//         Accelerometer.setUpdateInterval(settings.sampleIntervalMs);
//         // Filter, calculate, test the hold zone, and publish each sensor sample.
//         subscription = Accelerometer.addListener(({ x, y, z }) => {
//           if (!isMounted || AppState.currentState !== 'active') return;
//           const filteredX = xFilter.current.filter(x, settings.alpha);
//           const filteredY = yFilter.current.filter(y, settings.alpha);
//           const filteredZ = zFilter.current.filter(z, settings.alpha);
//           const inclination = calculateInclination(filteredX, filteredY, filteredZ);
//           const hold = holdController.current.update(
//             inclination.totalTiltDeg,
//             Date.now(),
//             settings.toleranceDeg,
//             settings.hysteresisDeg,
//             settings.holdTimeMs
//           );

//           if (hold.justEntered) Vibration.vibrate(40);
//           const hint = hold.isInside
//             ? hold.canCapture ? 'Straight — ready to capture' : 'Straight — hold steady'
//             : Math.abs(inclination.xAngleDeg) >= Math.abs(inclination.yDeviationDeg)
//               ? inclination.xAngleDeg >= 0 ? 'Tilt left' : 'Tilt right'
//               : inclination.yDeviationDeg >= 0 ? 'Tilt back' : 'Tilt forward';

//           setState({
//             sensorAvailable: true,
//             ...inclination,
//             ...hold,
//             hint,
//           });
//         });
//         setState((previous) => ({ ...previous, sensorAvailable: true, hint: 'Move phone to level it' }));
//       } catch {
//         if (isMounted && activeGeneration === generation) {
//           setState({ ...INITIAL_STATE, sensorAvailable: false, canCapture: true, hint: 'Level sensor unavailable — level check skipped' });
//         }
//       }
//     }

//     // Start and stop sensor updates with the app foreground lifecycle.
//     // Pause sensor work in the background and resume it when the app returns.
//     const appStateSubscription = AppState.addEventListener('change', (nextState) => {
//       if (nextState === 'active') void startSensor();
//       else stopSensor();
//     });
//     if (AppState.currentState === 'active') void startSensor();

//     return () => {
//       isMounted = false;
//       generation += 1;
//       subscription?.remove();
//       appStateSubscription.remove();
//       holdController.current.reset();
//       xFilter.current.reset();
//       yFilter.current.reset();
//       zFilter.current.reset();
//     };
//   }, [enabled]);

//   return state;
// }


import { useEffect, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { BUBBLE_LEVEL_SETTINGS as settings } from '../constants/bubbleLevel';
import { calculateInclination } from './inclinationCalculator';
import { LowPassFilter } from './lowPassFilter';
import { StraightHoldController } from './straightHoldController';

export interface BubbleLevelState {
  sensorAvailable: boolean | null;
  xAngleDeg: number | null;
  yAngleDeg: number | null;
  yDeviationDeg: number | null;
  totalTiltDeg: number | null;
  isInside: boolean;
  canCapture: boolean;
  holdProgress: number;
  hint: string;
}

const INITIAL_STATE: BubbleLevelState = {
  sensorAvailable: null,
  xAngleDeg: null,
  yAngleDeg: null,
  yDeviationDeg: null,
  totalTiltDeg: null,
  isInside: false,
  canCapture: false,
  holdProgress: 0,
  hint: 'Reading level sensor…',
};

// Subscribes to accelerometer samples only while the first-photo bubble is active.
export function useBubbleLevel(enabled: boolean): BubbleLevelState {
  const [state, setState] = useState<BubbleLevelState>(INITIAL_STATE);
  const xFilter = useRef(new LowPassFilter());
  const yFilter = useRef(new LowPassFilter());
  const zFilter = useRef(new LowPassFilter());
  const holdController = useRef(new StraightHoldController());

  useEffect(() => {
    if (!enabled) {
      setState(INITIAL_STATE);
      return;
    }

    let isMounted = true;
    let generation = 0;
    let subscription: ReturnType<typeof Accelerometer.addListener> | null = null;

    // Stop updates and reset the one-second hold when the screen pauses.
    function stopSensor(): void {
      generation += 1;
      subscription?.remove();
      subscription = null;
      xFilter.current.reset();
      yFilter.current.reset();
      zFilter.current.reset();
      holdController.current.reset();
      if (isMounted) {
        setState((previous) => ({
          ...INITIAL_STATE,
          sensorAvailable: previous.sensorAvailable === false ? false : null,
          hint: previous.sensorAvailable === false ? 'Level sensor unavailable — level check skipped' : INITIAL_STATE.hint,
          canCapture: previous.sensorAvailable === false,
        }));
      }
    }

    // Check sensor availability and register the live accelerometer listener.
    async function startSensor(): Promise<void> {
      const activeGeneration = ++generation;
      setState(INITIAL_STATE);
      try {
        const available = await Accelerometer.isAvailableAsync();
        if (!isMounted || activeGeneration !== generation) return;
        if (!available) {
          setState({ ...INITIAL_STATE, sensorAvailable: false, canCapture: true, hint: 'Level sensor unavailable — level check skipped' });
          return;
        }

        Accelerometer.setUpdateInterval(settings.sampleIntervalMs);
        // Filter, calculate, test the hold zone, and publish each sensor sample.
        subscription = Accelerometer.addListener(({ x, y, z }) => {
          if (!isMounted || AppState.currentState !== 'active') return;
          const filteredX = xFilter.current.filter(x, settings.alpha);
          const filteredY = yFilter.current.filter(y, settings.alpha);
          const filteredZ = zFilter.current.filter(z, settings.alpha);
          const inclination = calculateInclination(filteredX, filteredY, filteredZ);
          const hold = holdController.current.update(
            Math.abs(inclination.xAngleDeg),
            Date.now(),
            settings.toleranceDeg,
            settings.hysteresisDeg,
            settings.holdTimeMs,
            inclination.yDeviationDeg,
            settings.maximumHoldDriftDeg
          );

          if (hold.justEntered) Vibration.vibrate(40);
          const hint = hold.isInside
            ? hold.canCapture ? 'Bubble on Y line — ready to capture' : 'Hold steady on the Y line'
            : Math.abs(inclination.xAngleDeg) > settings.toleranceDeg
              ? inclination.xAngleDeg >= 0 ? 'Tilt left' : 'Tilt right'
              : 'Keep bubble on the vertical Y line';

          setState({
            sensorAvailable: true,
            ...inclination,
            ...hold,
            hint,
          });
        });
        setState((previous) => ({ ...previous, sensorAvailable: true, hint: 'Move phone to level it' }));
      } catch {
        if (isMounted && activeGeneration === generation) {
          setState({ ...INITIAL_STATE, sensorAvailable: false, canCapture: true, hint: 'Level sensor unavailable — level check skipped' });
        }
      }
    }

    // Start and stop sensor updates with the app foreground lifecycle.
    // Pause sensor work in the background and resume it when the app returns.
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void startSensor();
      else stopSensor();
    });
    if (AppState.currentState === 'active') void startSensor();

    return () => {
      isMounted = false;
      generation += 1;
      subscription?.remove();
      appStateSubscription.remove();
      holdController.current.reset();
      xFilter.current.reset();
      yFilter.current.reset();
      zFilter.current.reset();
    };
  }, [enabled]);

  return state;
}
