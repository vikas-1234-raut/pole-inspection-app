// constants/checklist.ts
//
// The 11 inspection items from your priority table — now the single
// source of truth for BOTH the guided capture flow (CaptureScreen steps
// through these in order) and the in-app reviewer (labels use these same
// keys, so nothing has to be re-mapped between capture and review).
//
// minPhotos > 1 for pole_bend because tilt/bend can't be judged
// confidently from one angle — matches the earlier tilt-detection
// discussion (multiple angles needed for reliable geometry).

import { ChecklistItem } from '../types';

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  { key: 'pole_bend', label: 'Pole Bend', priority: 'High', minPhotos: 2, maxPhotos: 4, minAngleSeparationDeg: 80, fullPoleShot: true,
    shotGuidance: 'Full pole, base to top. Hold phone vertical. Capture from 2+ angles — walk around the pole between shots.' },
  { key: 'earthing', label: 'Earthing', priority: 'High', minPhotos: 1, maxPhotos: 3, fullPoleShot: false,
    shotGuidance: 'Close-up at the pole base showing the earthing wire/strip.' },
  { key: 'damaged_insulator', label: 'Damaged Insulator', priority: 'High', minPhotos: 1, maxPhotos: 3, fullPoleShot: false,
    shotGuidance: 'Zoom in on the insulator so it fills most of the frame.' },
  { key: 'stay_wire', label: 'Stay Wire', priority: 'High', minPhotos: 1, maxPhotos: 3, fullPoleShot: false,
    shotGuidance: 'Capture the full wire from the pole attachment to the ground anchor.' },
  { key: 'pole_muffing', label: 'Pole Muffing', priority: 'Medium', minPhotos: 1, maxPhotos: 2, fullPoleShot: false,
    shotGuidance: 'Close-up of the mid-pole marking/collar.' },
  { key: 'danger_board', label: 'Danger Board', priority: 'Medium', minPhotos: 1, maxPhotos: 2, fullPoleShot: false,
    shotGuidance: 'Photograph the board, or the mounting spot if missing.' },
  { key: 'bird_guard', label: 'Bird Guard', priority: 'Medium', minPhotos: 1, maxPhotos: 2, fullPoleShot: false,
    shotGuidance: 'Close-up of the crossarm/insulator top.' },
  { key: 'hardware_tightening', label: 'Hardware Tightening', priority: 'Medium', minPhotos: 1, maxPhotos: 3, fullPoleShot: false,
    shotGuidance: 'Close-up of nuts/bolts/clamps — avoid glare.' },
  { key: 'pole_nomenclature', label: 'Pole Nomenclature', priority: 'Low', minPhotos: 1, maxPhotos: 2, fullPoleShot: false,
    shotGuidance: 'Straight-on close-up of the ID plate/painted number — must be legible.' },
  { key: 'painting', label: 'Painting', priority: 'Low', minPhotos: 1, maxPhotos: 2, fullPoleShot: true,
    shotGuidance: 'Full pole, side-lit, showing overall paint condition.' },
  { key: 'vegetation_clearance', label: 'Vegetation Clearance', priority: 'Low', minPhotos: 1, maxPhotos: 2, fullPoleShot: true,
    shotGuidance: 'Wide shot showing the pole and surrounding trees/branches.' },
];

export function totalRequiredPhotos(): number {
  return CHECKLIST_ITEMS.reduce((sum, item) => sum + item.minPhotos, 0);
}
