// BubbleLevel.tsx — compact circular level for the RIGHT EDGE of the camera,
// so it never hides the pole. Same math as before (bubbleLevel.ts settings,
// flat phone = centre, +Y = bubble up). Ring: white → amber (in zone) → green (ready).
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { BUBBLE_LEVEL_SETTINGS as settings } from '../constants/bubbleLevel';
import type { BubbleLevelState } from '../services/useBubbleLevel';
import { colors, font } from '../theme';

// The tilt hook is the existing useBubbleLevel (sensor, filter, hold timer).
export { useBubbleLevel as useTilt } from '../services/useBubbleLevel';
type Props = { level: BubbleLevelState; size?: number };

const BUBBLE = 18;
const RING = 3;

const fmt = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}°`);

export default function BubbleLevel({ level, size = 112 }: Props) {
  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const center = size / 2;
  const travel = center - RING - BUBBLE / 2 - 2;

  const toPx = (deg: number) => Math.max(-1, Math.min(1, deg / settings.maxAngleDeg)) * travel;
  const snap = (px: number) => Math.round(px / settings.positionStepPx) * settings.positionStepPx;

  // +X → right, +Y → up (screen Y grows downward, so negate Y).
  const rawX = snap(toPx(level.xAngleDeg ?? 0));
  const rawY = snap(-toPx(level.yAngleDeg ?? 0));
  const len = Math.sqrt(rawX * rawX + rawY * rawY);
  const k = len > travel ? travel / len : 1;
  const bx = rawX * k;
  const by = rawY * k;

  useEffect(() => {
    position.stopAnimation();
    Animated.timing(position, {
      toValue: { x: bx, y: by },
      duration: settings.animationDurationMs,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    return () => position.stopAnimation();
  }, [bx, by, position]);

  const ringColor = level.canCapture ? colors.green : level.isInside ? colors.amber : colors.white;
  const bandHalf = Math.max(2, (settings.xToleranceDeg / settings.maxAngleDeg) * travel);

  return (
    <View style={styles.wrap}>
      <View style={[styles.vial, { width: size, height: size, borderRadius: center, borderColor: ringColor }]}>
        {/* Upper half = valid side */}
        <View style={[styles.abs, { left: 0, right: 0, top: 0, height: center, backgroundColor: 'rgba(255,255,255,0.10)' }]} />
        {/* Vertical target band */}
        <View style={[styles.abs, { top: 0, height: center, left: center - RING - bandHalf, width: bandHalf * 2, backgroundColor: level.isInside ? 'rgba(22,163,74,0.35)' : 'rgba(255,255,255,0.16)' }]} />
        <View style={[styles.abs, styles.lineH, { top: center - RING - 0.5 }]} />
        <View style={[styles.abs, styles.lineV, { left: center - RING - 0.5 }]} />
        {/* Centre target */}
        <View
          style={[styles.abs, {
            width: BUBBLE + 8, height: BUBBLE + 8, borderRadius: (BUBBLE + 8) / 2,
            left: center - RING - (BUBBLE + 8) / 2, top: center - RING - (BUBBLE + 8) / 2,
            borderWidth: 1.5, borderColor: level.isCentered ? colors.green : 'rgba(255,255,255,0.8)',
          }]}
        />
        <Animated.View
          style={[styles.bubble, {
            left: center - RING - BUBBLE / 2,
            top: center - RING - BUBBLE / 2,
            backgroundColor: level.canCapture ? colors.green : colors.amber,
            transform: position.getTranslateTransform(),
          }]}
        />
      </View>
      <Text style={styles.readout}>X {fmt(level.xAngleDeg)}</Text>
      <Text style={styles.readout}>Y {fmt(level.yAngleDeg)}</Text>
      {level.sensorAvailable === false && <Text style={styles.warn}>Level skipped</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', padding: 6, borderRadius: 16, backgroundColor: colors.scrimLight },
  vial: { borderWidth: RING, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' },
  abs: { position: 'absolute' },
  lineH: { left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.7)' },
  lineV: { top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.7)' },
  bubble: { position: 'absolute', width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2, borderWidth: 1.5, borderColor: colors.white },
  readout: { color: colors.white, fontSize: font.tiny, fontWeight: '700', marginTop: 2 },
  warn: { color: colors.amber, fontSize: font.tiny, marginTop: 2 },
});
