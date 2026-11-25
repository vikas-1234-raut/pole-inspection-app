import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { BUBBLE_LEVEL_SETTINGS as settings } from '../constants/bubbleLevel';
import type { BubbleLevelState } from '../services/useBubbleLevel';

type Props = { level: BubbleLevelState };

const formatDeg = (v: number | null): string =>
  v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}°`;

// Draws the vial, upper-half zone, vertical target line, centre target ring, and bubble.
export default function CircularBubbleView({ level }: Props) {
  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const size = settings.viewSize;
  const center = size / 2;
  const inset = 8;
  const bubbleRadius = settings.bubbleDiameter / 2;
  const vialRadius = center - inset;
  const travelRadius = vialRadius - bubbleRadius;
  const pxPerDeg = travelRadius / settings.maxAngleDeg;

  const toPx = (deg: number): number =>
    Math.max(-1, Math.min(1, deg / settings.maxAngleDeg)) * travelRadius;
  const snap = (px: number): number =>
    Math.round(px / settings.positionStepPx) * settings.positionStepPx;

  // +X → right, +Y → UP. Screen Y grows downward, so Y is negated here (only here).
  const rawX = snap(toPx(level.xAngleDeg ?? 0));
  const rawY = snap(-toPx(level.yAngleDeg ?? 0));
  const length = Math.sqrt(rawX * rawX + rawY * rawY);
  const k = length > travelRadius ? travelRadius / length : 1;
  const bubbleX = rawX * k;
  const bubbleY = rawY * k;

  useEffect(() => {
    position.stopAnimation();
    Animated.timing(position, {
      toValue: { x: bubbleX, y: bubbleY },
      duration: settings.animationDurationMs,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    return () => position.stopAnimation();
  }, [bubbleX, bubbleY, position]);

  const green = '#16a34a';
  const vialBorderColor = level.isInside ? green : '#69a56f';
  const lineHalfWidth = Math.max(2, settings.xToleranceDeg * pxPerDeg);
  const targetSize = settings.bubbleDiameter + settings.centerTargetMarginPx * 2;

  return (
    <View style={styles.panel}>
      <View
        style={[
          styles.vial,
          { width: size, height: size, borderRadius: center, borderColor: vialBorderColor },
        ]}
      >
        {/* Upper half = valid side */}
        <View
          style={[
            styles.abs,
            {
              left: inset,
              right: inset,
              top: inset,
              height: center - inset,
              backgroundColor: level.isInside ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)',
            },
          ]}
        />
        {/* Vertical target band (±xToleranceDeg) in the upper half */}
        <View
          style={[
            styles.abs,
            {
              top: inset,
              height: center - inset,
              left: center - lineHalfWidth,
              width: lineHalfWidth * 2,
              backgroundColor: level.isInside ? 'rgba(22,163,74,0.35)' : 'rgba(255,255,255,0.18)',
            },
          ]}
        />
        <View style={[styles.crosshairH, { left: 12, right: 12, top: center - 1 }]} />
        <View
          style={[
            styles.crosshairV,
            {
              top: 12,
              bottom: 12,
              left: center - 1,
              backgroundColor: level.isInside ? green : 'rgba(255,255,255,0.85)',
            },
          ]}
        />
        {/* Centre target ring (0,0) sized to the bubble */}
        <View
          style={[
            styles.abs,
            {
              width: targetSize,
              height: targetSize,
              borderRadius: targetSize / 2,
              left: center - targetSize / 2,
              top: center - targetSize / 2,
              borderWidth: 2,
              borderColor: level.isCentered ? green : 'rgba(255,255,255,0.9)',
            },
          ]}
        />
        <Animated.View
          style={[
            styles.bubble,
            {
              width: settings.bubbleDiameter,
              height: settings.bubbleDiameter,
              borderRadius: bubbleRadius,
              left: center - bubbleRadius,
              top: center - bubbleRadius,
              transform: position.getTranslateTransform(),
            },
          ]}
        >
          <View style={styles.bubbleShine} />
        </Animated.View>
      </View>

      <View style={styles.readings}>
        <Text style={styles.degreeBox}>X {formatDeg(level.xAngleDeg)}</Text>
        <Text style={styles.degreeBox}>Y {formatDeg(level.yAngleDeg)}</Text>
      </View>
      <Text style={[styles.hint, { color: level.isInside ? '#15803d' : '#fefce8' }]}>
        {level.hint}
      </Text>
      {level.sensorAvailable === false && (
        <Text style={styles.warning}>
          Level check skipped; current GPS and tilt checks still apply.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { alignItems: 'center', padding: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.48)' },
  vial: { overflow: 'hidden', borderWidth: 4, backgroundColor: 'rgba(190,255,193,0.22)' },
  abs: { position: 'absolute' },
  crosshairH: { position: 'absolute', height: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
  crosshairV: { position: 'absolute', width: 2 },
  bubble: {
    position: 'absolute',
    backgroundColor: 'rgba(188,255,250,0.9)',
    borderWidth: 1,
    borderColor: '#fff',
    elevation: 4,
  },
  bubbleShine: {
    width: 8,
    height: 5,
    borderRadius: 4,
    marginTop: 4,
    marginLeft: 4,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  readings: { flexDirection: 'row', gap: 8, marginTop: 5 },
  degreeBox: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.52)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  hint: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 3 },
  warning: { color: '#fde68a', fontSize: 10, textAlign: 'center' },
});
