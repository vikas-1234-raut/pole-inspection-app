// import React, { useEffect, useRef } from 'react';
// import { Animated, StyleSheet, Text, View } from 'react-native';
// import { BUBBLE_LEVEL_SETTINGS as settings } from '../constants/bubbleLevel';
// import type { BubbleLevelState } from '../services/useBubbleLevel';

// type Props = { level: BubbleLevelState };

// // Draws the circular vial, target, crosshair, live readings, and bubble.
// export default function CircularBubbleView({ level }: Props) {
//   const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
//   const size = settings.viewSize;
//   const center = size / 2;
//   const bubbleRadius = settings.bubbleDiameter / 2;
//   const vialRadius = center - 8;
//   const travelRadius = vialRadius - bubbleRadius;
//   const targetRadius = (settings.toleranceDeg / settings.maxAngleDeg) * travelRadius;
//   const xValue = level.xAngleDeg ?? 0;
//   const yValue = level.yDeviationDeg ?? 0;
//   // Convert an angle into a bounded vial displacement using the configured axis sign.
//   const scale = (value: number, sign: number) => Math.max(-1, Math.min(1, (value / settings.maxAngleDeg) * sign)) * travelRadius;
//   const bubbleX = scale(xValue, settings.bubbleXSign);
//   const bubbleY = scale(yValue, settings.bubbleYSign);
//   const vectorLength = Math.sqrt(bubbleX * bubbleX + bubbleY * bubbleY);
//   const clampScale = vectorLength > travelRadius ? travelRadius / vectorLength : 1;

//   // Animate toward the latest sensor position instead of jumping between samples.
//   useEffect(() => {
//     Animated.spring(position, {
//       toValue: { x: bubbleX * clampScale, y: bubbleY * clampScale },
//       useNativeDriver: true,
//       speed: 20,
//       bounciness: 0,
//     }).start();
//   }, [bubbleX, bubbleY, clampScale, position]);

//   const straightColor = level.isInside ? '#16a34a' : '#69a56f';

//   return (
//     <View style={styles.panel}>
//       <View style={[styles.vial, { width: size, height: size, borderRadius: center, borderColor: straightColor }]}>
//         <View style={[styles.crosshairHorizontal, { left: 12, right: 12, top: center - 1 }]} />
//         <View style={[styles.crosshairVertical, { top: 12, bottom: 12, left: center - 1 }]} />
//         <View style={[styles.target, {
//           width: targetRadius * 2,
//           height: targetRadius * 2,
//           borderRadius: targetRadius,
//           left: center - targetRadius,
//           top: center - targetRadius,
//           borderColor: straightColor,
//           backgroundColor: level.isInside ? 'rgba(34,197,94,0.16)' : 'transparent',
//         }]} />
//         <Animated.View style={[
//           styles.bubble,
//           { width: settings.bubbleDiameter, height: settings.bubbleDiameter, borderRadius: bubbleRadius, left: center - bubbleRadius, top: center - bubbleRadius },
//           { transform: position.getTranslateTransform() },
//         ]}>
//           <View style={styles.bubbleShine} />
//         </Animated.View>
//       </View>
//       <View style={styles.readings}>
//         <Text style={styles.degreeBox}>X {level.xAngleDeg === null ? '—' : `${level.xAngleDeg.toFixed(1)}°`}</Text>
//         <Text style={styles.degreeBox}>Y {level.yAngleDeg === null ? '—' : `${level.yAngleDeg.toFixed(1)}°`}</Text>
//       </View>
//       <Text style={[styles.hint, { color: level.isInside ? '#15803d' : '#fefce8' }]}>{level.hint}</Text>
//       {level.sensorAvailable === false && <Text style={styles.warning}>Level check skipped; current GPS and tilt checks still apply.</Text>}
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   panel: { alignItems: 'center', padding: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.48)' },
//   vial: { overflow: 'hidden', borderWidth: 4, backgroundColor: 'rgba(190,255,193,0.22)' },
//   crosshairHorizontal: { position: 'absolute', height: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
//   crosshairVertical: { position: 'absolute', width: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
//   target: { position: 'absolute', borderWidth: 2 },
//   bubble: { position: 'absolute', backgroundColor: 'rgba(188,255,250,0.9)', borderWidth: 1, borderColor: '#fff', alignItems: 'flex-start', justifyContent: 'flex-start', elevation: 4 },
//   bubbleShine: { width: 8, height: 5, borderRadius: 4, marginTop: 4, marginLeft: 4, backgroundColor: 'rgba(255,255,255,0.95)' },
//   readings: { flexDirection: 'row', gap: 8, marginTop: 5 },
//   degreeBox: { color: '#fff', fontSize: 12, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.52)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 },
//   hint: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 3 },
//   warning: { color: '#fde68a', fontSize: 10, textAlign: 'center' },
// });

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { BUBBLE_LEVEL_SETTINGS as settings } from '../constants/bubbleLevel';
import type { BubbleLevelState } from '../services/useBubbleLevel';

type Props = { level: BubbleLevelState };

// Draws the circular vial, target, crosshair, live readings, and bubble.
export default function CircularBubbleView({ level }: Props) {
  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const size = settings.viewSize;
  const center = size / 2;
  const bubbleRadius = settings.bubbleDiameter / 2;
  const vialRadius = center - 8;
  const travelRadius = vialRadius - bubbleRadius;
  const targetRadius = (settings.toleranceDeg / settings.maxAngleDeg) * travelRadius;
  const xValue = level.xAngleDeg ?? 0;
  const yValue = level.yDeviationDeg ?? 0;
  // Convert an angle into a bounded vial displacement using the configured axis sign.
  const scale = (value: number, sign: number) => Math.max(-1, Math.min(1, (value / settings.maxAngleDeg) * sign)) * travelRadius;
  const rawBubbleX = scale(xValue, settings.bubbleXSign);
  const rawBubbleY = scale(yValue, settings.bubbleYSign);
  // Ignore sub-pixel jitter so a stationary phone does not make the bubble shimmer.
  const bubbleX = Math.round(rawBubbleX / settings.positionStepPx) * settings.positionStepPx;
  const bubbleY = Math.round(rawBubbleY / settings.positionStepPx) * settings.positionStepPx;
  const vectorLength = Math.sqrt(bubbleX * bubbleX + bubbleY * bubbleY);
  const clampScale = vectorLength > travelRadius ? travelRadius / vectorLength : 1;

  // Animate toward the latest sensor position instead of jumping between samples.
  useEffect(() => {
    Animated.spring(position, {
      toValue: { x: bubbleX * clampScale, y: bubbleY * clampScale },
      useNativeDriver: true,
      speed: settings.animationSpeed,
      bounciness: 0,
    }).start();
  }, [bubbleX, bubbleY, clampScale, position]);

  const straightColor = level.isInside ? '#16a34a' : '#69a56f';

  return (
    <View style={styles.panel}>
      <View style={[styles.vial, { width: size, height: size, borderRadius: center, borderColor: straightColor }]}>
        <View style={[styles.verticalToleranceBand, {
          width: targetRadius * 2,
          left: center - targetRadius,
          top: 12,
          bottom: 12,
          backgroundColor: level.isInside ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)',
        }]} />
        <View style={[styles.crosshairHorizontal, { left: 12, right: 12, top: center - 1 }]} />
        <View style={[styles.crosshairVertical, { top: 12, bottom: 12, left: center - 1, backgroundColor: level.isInside ? '#16a34a' : 'rgba(255,255,255,0.85)' }]} />
        <View style={[styles.target, {
          width: targetRadius * 2,
          height: targetRadius * 2,
          borderRadius: targetRadius,
          left: center - targetRadius,
          top: center - targetRadius,
          borderColor: 'rgba(35,90,40,0.85)',
          backgroundColor: 'transparent',
        }]} />
        <Animated.View style={[
          styles.bubble,
          { width: settings.bubbleDiameter, height: settings.bubbleDiameter, borderRadius: bubbleRadius, left: center - bubbleRadius, top: center - bubbleRadius },
          { transform: position.getTranslateTransform() },
        ]}>
          <View style={styles.bubbleShine} />
        </Animated.View>
      </View>
      <View style={styles.readings}>
        <Text style={styles.degreeBox}>X {level.xAngleDeg === null ? '—' : `${level.xAngleDeg.toFixed(1)}°`}</Text>
        <Text style={styles.degreeBox}>Y {level.yAngleDeg === null ? '—' : `${level.yAngleDeg.toFixed(1)}°`}</Text>
      </View>
      <Text style={[styles.hint, { color: level.isInside ? '#15803d' : '#fefce8' }]}>{level.hint}</Text>
      {level.sensorAvailable === false && <Text style={styles.warning}>Level check skipped; current GPS and tilt checks still apply.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { alignItems: 'center', padding: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.48)' },
  vial: { overflow: 'hidden', borderWidth: 4, backgroundColor: 'rgba(190,255,193,0.22)' },
  crosshairHorizontal: { position: 'absolute', height: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
  crosshairVertical: { position: 'absolute', width: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
  verticalToleranceBand: { position: 'absolute', borderRadius: 4 },
  target: { position: 'absolute', borderWidth: 2 },
  bubble: { position: 'absolute', backgroundColor: 'rgba(188,255,250,0.9)', borderWidth: 1, borderColor: '#fff', alignItems: 'flex-start', justifyContent: 'flex-start', elevation: 4 },
  bubbleShine: { width: 8, height: 5, borderRadius: 4, marginTop: 4, marginLeft: 4, backgroundColor: 'rgba(255,255,255,0.95)' },
  readings: { flexDirection: 'row', gap: 8, marginTop: 5 },
  degreeBox: { color: '#fff', fontSize: 12, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.52)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 },
  hint: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 3 },
  warning: { color: '#fde68a', fontSize: 10, textAlign: 'center' },
});
