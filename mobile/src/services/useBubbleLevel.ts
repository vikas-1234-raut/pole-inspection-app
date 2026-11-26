import { useEffect, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { BUBBLE_LEVEL_SETTINGS as settings } from '../constants/bubbleLevel';
import { calculateInclination, InclinationReading } from './inclinationCalculator';
import { LowPassFilter } from './lowPassFilter';
import { StraightHoldController, StraightHoldState } from './straightHoldController';

export interface BubbleLevelState {
  sensorAvailable: boolean | null;
  xAngleDeg: number | null;
  yAngleDeg: number | null;
  totalTiltDeg: number | null;
  isInside: boolean;
  isCentered: boolean;
  canCapture: boolean;
  holdProgress: number;
  hint: string;
}

const UNAVAILABLE_HINT = 'Level sensor unavailable — level check skipped';

const INITIAL_STATE: BubbleLevelState = {
  sensorAvailable: null,
  xAngleDeg: null,
  yAngleDeg: null,
  totalTiltDeg: null,
  isInside: false,
  isCentered: false,
  canCapture: false,
  holdProgress: 0,
  hint: 'Reading level sensor…',
};

const UNAVAILABLE_STATE: BubbleLevelState = {
  ...INITIAL_STATE,
  sensorAvailable: false,
  canCapture: true,
  hint: UNAVAILABLE_HINT,
};

// Capture zone = upper half (yMin..yMax) AND bubble on the vertical line (|X| small).
// After entering, the edges widen by hysteresisDeg so noise does not flicker the zone.
function isInCaptureZone(r: InclinationReading, wasInside: boolean): boolean {
  const margin = wasInside ? settings.hysteresisDeg : 0;
  const yOk = r.yAngleDeg >= settings.yMinDeg - margin && r.yAngleDeg <= settings.yMaxDeg + margin;
  const xOk = Math.abs(r.xAngleDeg) <= settings.xToleranceDeg + margin;
  return yOk && xOk;
}

// Hints describe where the BUBBLE should go, so they stay correct on any phone.
function buildHint(r: InclinationReading, hold: StraightHoldState): string {
  if (hold.canCapture) return 'Bubble on the line — ready to capture';
  if (hold.isInside) return 'Hold steady…';
  if (r.yAngleDeg < settings.yMinDeg) return 'Tilt phone upward — bring the bubble into the upper half';
  if (r.yAngleDeg > settings.yMaxDeg) return 'Tilted too far — lower the phone a little';
  if (r.xAngleDeg > settings.xToleranceDeg) return 'Bubble is right of the line — bring it left onto the vertical line';
  if (r.xAngleDeg < -settings.xToleranceDeg) return 'Bubble is left of the line — bring it right onto the vertical line';
  return 'Hold steady…';
}

// Runs the accelerometer only while the first-photo bubble check is active.
export function useBubbleLevel(enabled: boolean): BubbleLevelState {
  const [state, setState] = useState<BubbleLevelState>(INITIAL_STATE);
  const xFilter = useRef(new LowPassFilter());
  const yFilter = useRef(new LowPassFilter());
  const zFilter = useRef(new LowPassFilter());
  const holdController = useRef(
    new StraightHoldController(settings.holdTimeMs, settings.maximumHoldDriftDeg, settings.exitGraceMs)
  );

  useEffect(() => {
    if (!enabled) {
      setState(INITIAL_STATE);
      return;
    }

    let isMounted = true;
    let generation = 0;
    let sensorMissing = false;
    let subscription: ReturnType<typeof Accelerometer.addListener> | null = null;

    function resetProcessing(): void {
      xFilter.current.reset();
      yFilter.current.reset();
      zFilter.current.reset();
      holdController.current.reset();
    }

    // App paused/backgrounded: stop sensor and reset the hold.
    function stopSensor(): void {
      generation += 1;
      subscription?.remove();
      subscription = null;
      resetProcessing();
      if (isMounted) setState(sensorMissing ? UNAVAILABLE_STATE : INITIAL_STATE);
    }

    async function startSensor(): Promise<void> {
      const activeGeneration = ++generation;
      subscription?.remove(); // never keep two listeners
      subscription = null;
      resetProcessing();
      setState(INITIAL_STATE);

      try {
        const available = await Accelerometer.isAvailableAsync();
        if (!isMounted || activeGeneration !== generation) return;
        if (!available) {
          sensorMissing = true;
          setState(UNAVAILABLE_STATE);
          return;
        }

        Accelerometer.setUpdateInterval(settings.sampleIntervalMs);
        setState((prev) => ({ ...prev, sensorAvailable: true, hint: 'Move phone to level it' }));

        subscription = Accelerometer.addListener(({ x, y, z }) => {
          if (!isMounted || activeGeneration !== generation) return;

          const reading = calculateInclination(
            xFilter.current.filter(x, settings.alpha),
            yFilter.current.filter(y, settings.alpha),
            zFilter.current.filter(z, settings.alpha)
          );
          const inZone = isInCaptureZone(reading, holdController.current.inside);
          const hold = holdController.current.update(inZone, reading.xAngleDeg, reading.yAngleDeg, Date.now());

          if (hold.justEntered) Vibration.vibrate(40);

          setState({
            sensorAvailable: true,
            xAngleDeg: reading.xAngleDeg,
            yAngleDeg: reading.yAngleDeg,
            totalTiltDeg: reading.totalTiltDeg,
            isInside: hold.isInside,
            isCentered:
              Math.abs(reading.xAngleDeg) <= settings.centerToleranceDeg &&
              Math.abs(reading.yAngleDeg) <= settings.centerToleranceDeg,
            canCapture: hold.canCapture,
            holdProgress: hold.holdProgress,
            hint: buildHint(reading, hold),
          });
        });
      } catch {
        if (isMounted && activeGeneration === generation) {
          sensorMissing = true;
          setState(UNAVAILABLE_STATE);
        }
      }
    }

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
      resetProcessing();
    };
  }, [enabled]);

  return state;
}