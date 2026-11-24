// PhotoThumbnail.tsx
//
// Answers "what kind of thumbnail shows": each thumbnail carries its own
// pass/fail state as a colored border + small badge row, rather than just
// being a bare image — so a field worker sees at a glance which shots are
// good without opening each one. Green border = tilt check passed at
// capture time. Amber = tilt was off (kept, since we don't silently
// discard real shots) or a quality check is still unchecked (blur/framing,
// pending Phase 2). A duplicate is never added to the list at all (see
// CaptureScreen's dedup call) so there is no "duplicate" badge state here
// — it's rejected before it becomes a thumbnail.

import React from 'react';
import { View, Image, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { PhotoMeta } from '../types';

type Props = {
  photo: PhotoMeta;
  onRemove?: () => void;
};

export default function PhotoThumbnail({ photo, onRemove }: Props) {
  const anyPoor = !photo.quality.tiltOk || photo.quality.blurStatus === 'poor' || photo.quality.framingStatus === 'poor';
  const borderColor = anyPoor ? '#d97706' : '#16a34a';

  const badges: string[] = [];
  badges.push(photo.quality.tiltOk ? '✓ level' : `⚠ ${Math.round(photo.quality.tiltOffVerticalDeg)}°`);
  if (photo.quality.blurStatus === 'poor') badges.push('⚠ blurry');
  if (photo.quality.framingStatus === 'poor') badges.push('⚠ reframe');

  return (
    <View style={[styles.wrap, { borderColor }]}>
      <Image source={{ uri: photo.uri }} style={styles.image} />
      <View style={styles.badgeRow}>
        <Text style={styles.badge} numberOfLines={1}>{badges.join(' · ')}</Text>
      </View>
      {onRemove && (
        <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
          <Text style={styles.removeText}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 84, height: 84, borderRadius: 8, borderWidth: 2, marginRight: 8, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  badgeRow: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  badge: { color: 'white', fontSize: 10, textAlign: 'center', paddingVertical: 2 },
  removeBtn: { position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: 'white', fontSize: 11, lineHeight: 12 },
});
