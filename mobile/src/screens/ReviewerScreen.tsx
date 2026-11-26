// ReviewerScreen.tsx
//
// v4: photos are downloaded with the JWT into the phone cache
// (api.authorizedImageSource) and shown from that local file. The <Image>
// no longer depends on sending an Authorization header itself.
// Each photo box shows a spinner while loading, or the HTTP error
// (e.g. "Error 401" / "Error 404") if the server refuses the image.

import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Button, TextInput, Alert } from 'react-native';
import * as api from '../services/api';
import { CHECKLIST_ITEMS } from '../constants/checklist';

export default function ReviewerScreen() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getReviewQueue('pending_review');
      setGroups(data);
    } catch (err: any) {
      Alert.alert('Could not load review queue', err.message || 'Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete(inspectionId: string) {
    try {
      await api.completeInspection(inspectionId);
      load();
    } catch (err: any) {
      Alert.alert('Cannot complete yet', err.message || 'Some photos are still unreviewed.');
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

  if (groups.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No inspections waiting for review.</Text>
        <Button title="Refresh" onPress={load} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Reviewer Queue — {groups.length} pole(s) pending</Text>
      <Button title="Refresh" onPress={load} />

      {groups.map((group) => (
        <View key={group.poleId} style={styles.poleFolder}>
          <Text style={styles.poleHeader}>
            📁 {group.poleName} ({group.poleId}) {group.flagged ? '⚠ FLAGGED' : ''}
          </Text>

          {group.inspections.map((insp: any) => {
            const allReviewed = insp.photos.every((p: any) => p.label_status !== 'unreviewed');
            return (
              <View key={insp.id} style={styles.inspectionCard}>
                <Text style={styles.inspectionHeader}>
                  Inspection {insp.id.slice(0, 12)}… — {insp.photos.length} photos
                  {insp.fraud_flags?.length > 0 ? ` — ⚠ ${insp.fraud_flags.length} flag(s)` : ''}
                </Text>

                {(insp.fraud_flags || []).map((f: any, i: number) => (
                  <Text key={i} style={styles.fraudFlag}>⚠ {f.type}: {f.detail}</Text>
                ))}

                <ScrollView horizontal style={styles.photoRow}>
                  {insp.photos.map((p: any) => (
                    <PhotoCell
                      key={p.id}
                      photo={p}
                      isOpen={openPhotoId === p.id}
                      onToggle={() => setOpenPhotoId(openPhotoId === p.id ? null : p.id)}
                      onSaved={() => load()}
                      inspectionId={insp.id}
                    />
                  ))}
                </ScrollView>

                <Button
                  title={allReviewed ? 'Complete Review' : `Complete Review (${insp.photos.filter((p: any) => p.label_status === 'unreviewed').length} left)`}
                  onPress={() => handleComplete(insp.id)}
                  disabled={!allReviewed}
                />
              </View>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

function PhotoCell({ photo, isOpen, onToggle, onSaved, inspectionId }: any) {
  const [source, setSource] = useState<{ uri: string } | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [faults, setFaults] = useState<string[]>(photo.label_faults || []);
  const [otherOn, setOtherOn] = useState(!!photo.label_other_text);
  const [otherText, setOtherText] = useState(photo.label_other_text || '');
  const [saving, setSaving] = useState(false);

  // Download the protected image (with JWT) into the cache, then show it.
  useEffect(() => {
    let active = true;
    setSource(null);
    setImageError(null);
    api
      .authorizedImageSource(photo.filepath)
      .then((s) => {
        if (active) setSource(s);
      })
      .catch((err: any) => {
        console.log('[review image] load failed', photo.filepath, err?.status, err?.message);
        if (active) setImageError(err?.status ? `Error ${err.status}` : 'Load failed');
      });
    return () => {
      active = false;
    };
  }, [photo.filepath]);

  function toggleFault(key: string) {
    setFaults((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]));
  }

  async function saveHealthy() {
    setSaving(true);
    try {
      await api.labelPhoto(inspectionId, photo.id, { status: 'healthy', faults: [], otherText: undefined });
      onSaved();
    } catch (err: any) {
      Alert.alert('Could not save label', err.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function saveFaulty() {
    if (faults.length === 0 && !otherText.trim()) {
      Alert.alert('Select at least one fault, or use Other with a description.');
      return;
    }
    setSaving(true);
    try {
      await api.labelPhoto(inspectionId, photo.id, {
        status: 'faulty',
        faults,
        otherText: otherText.trim() || undefined,
      });
      onSaved();
    } catch (err: any) {
      Alert.alert('Could not save label', err.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  const statusColor = photo.label_status === 'healthy' ? '#16a34a' : photo.label_status === 'faulty' ? '#dc2626' : '#999';
  const frame = [styles.photo, { borderColor: statusColor, borderWidth: 2 }];

  return (
    <View style={styles.photoCell}>
      <TouchableOpacity onPress={onToggle}>
        {source && !imageError ? (
          <Image
            source={source}
            style={frame}
            resizeMode="cover"
            onError={(e) => {
              console.log('[review image] display error', photo.filepath, e.nativeEvent?.error);
              setImageError('Cannot display');
            }}
          />
        ) : (
          <View style={[frame, styles.photoPlaceholder]}>
            {imageError ? <Text style={styles.photoError}>{imageError}</Text> : <ActivityIndicator />}
          </View>
        )}
        <Text style={styles.photoLabel}>{photo.checklist_key}</Text>
        <Text style={[styles.statusTag, { color: statusColor }]}>{photo.label_status}</Text>
      </TouchableOpacity>

      {isOpen && (
        <View style={styles.labelPanel}>
          <Button title="✓ Mark Healthy" onPress={saveHealthy} />

          <Text style={styles.panelSubhead}>Or select fault(s):</Text>
          <View style={styles.chipWrap}>
            {CHECKLIST_ITEMS.map((ci) => (
              <TouchableOpacity
                key={ci.key}
                style={[styles.chip, faults.includes(ci.key) && styles.chipActive]}
                onPress={() => toggleFault(ci.key)}
              >
                <Text style={[styles.chipText, faults.includes(ci.key) && styles.chipTextActive]}>{ci.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.chip, otherOn && styles.chipActive]}
              onPress={() => setOtherOn((v) => !v)}
            >
              <Text style={[styles.chipText, otherOn && styles.chipTextActive]}>Other</Text>
            </TouchableOpacity>
          </View>

          {otherOn && (
            <TextInput
              style={styles.otherInput}
              placeholder="Describe the issue…"
              value={otherText}
              onChangeText={setOtherText}
              multiline
            />
          )}

          {saving ? <ActivityIndicator /> : <Button title="Save Fault Label" onPress={saveFaulty} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { color: '#888' },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  poleFolder: { marginTop: 16, marginBottom: 6, borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 8, padding: 8 },
  poleHeader: { fontWeight: '700', marginBottom: 6 },
  inspectionCard: { borderTopWidth: 1, borderColor: '#f0f0f0', paddingVertical: 8 },
  inspectionHeader: { fontSize: 13, color: '#333', marginBottom: 4 },
  fraudFlag: { color: '#b91c1c', fontSize: 12, marginVertical: 2 },
  photoRow: { marginVertical: 8 },
  photoCell: { marginRight: 10, width: 140 },
  photo: { width: 120, height: 120, borderRadius: 6 },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' },
  photoError: { color: '#b91c1c', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  photoLabel: { fontSize: 11, color: '#666', marginTop: 2 },
  statusTag: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  labelPanel: { marginTop: 6, width: 260, borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 8 },
  panelSubhead: { fontSize: 12, color: '#555', marginTop: 8, marginBottom: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4 },
  chipActive: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  chipText: { fontSize: 11, color: '#333' },
  chipTextActive: { color: 'white' },
  otherInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 6, marginTop: 6, minHeight: 50 },
});
