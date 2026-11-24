// const assert = require('node:assert/strict');
// const { test } = require('node:test');
// const { LowPassFilter } = require('../../../node_modules/.cache/bubble-level-tests/services/lowPassFilter.js');
// const { calculateInclination } = require('../../../node_modules/.cache/bubble-level-tests/services/inclinationCalculator.js');
// const { StraightHoldController } = require('../../../node_modules/.cache/bubble-level-tests/services/straightHoldController.js');

// test('low-pass filter smooths later samples and reset initializes from the next sample', () => {
//   const filter = new LowPassFilter();
//   assert.equal(filter.filter(0, 0.15), 0);
//   assert.equal(filter.filter(10, 0.15), 1.5);
//   filter.reset();
//   assert.equal(filter.filter(6, 0.15), 6);
// });

// test('upright reference reads X near 0 and Y near 90 degrees', () => {
//   const reading = calculateInclination(0, 1, 0);
//   assert.ok(Math.abs(reading.xAngleDeg) < 0.001);
//   assert.ok(Math.abs(reading.yAngleDeg - 90) < 0.001);
//   assert.ok(Math.abs(reading.yDeviationDeg) < 0.001);
//   assert.ok(Math.abs(reading.totalTiltDeg) < 0.001);
// });

// test('side tilt contributes to total tilt while upright Y remains near 90 degrees', () => {
//   const radians = 10 * (Math.PI / 180);
//   const reading = calculateInclination(Math.sin(radians), Math.cos(radians), 0);
//   assert.ok(Math.abs(reading.xAngleDeg - 10) < 0.001);
//   assert.ok(Math.abs(reading.yAngleDeg - 90) < 0.001);
//   assert.ok(Math.abs(reading.totalTiltDeg - 10) < 0.001);
// });

// test('hold controller requires a continuous hold and resets beyond the exit tolerance', () => {
//   const controller = new StraightHoldController();
//   const first = controller.update(1, 1000, 2, 1, 1000);
//   assert.equal(first.isInside, true);
//   assert.equal(first.canCapture, false);
//   assert.equal(first.justEntered, true);

//   const withinHysteresis = controller.update(2.5, 1500, 2, 1, 1000);
//   assert.equal(withinHysteresis.isInside, true);
//   assert.equal(withinHysteresis.canCapture, false);

//   const held = controller.update(1, 2000, 2, 1, 1000);
//   assert.equal(held.canCapture, true);

//   const exited = controller.update(3.01, 2100, 2, 1, 1000);
//   assert.equal(exited.isInside, false);
//   assert.equal(exited.canCapture, false);
//   assert.equal(exited.holdProgress, 0);
// });

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { LowPassFilter } = require('../../../node_modules/.cache/bubble-level-tests/services/lowPassFilter.js');
const { calculateInclination } = require('../../../node_modules/.cache/bubble-level-tests/services/inclinationCalculator.js');
const { StraightHoldController } = require('../../../node_modules/.cache/bubble-level-tests/services/straightHoldController.js');

test('low-pass filter smooths later samples and reset initializes from the next sample', () => {
  const filter = new LowPassFilter();
  assert.equal(filter.filter(0, 0.15), 0);
  assert.equal(filter.filter(10, 0.15), 1.5);
  filter.reset();
  assert.equal(filter.filter(6, 0.15), 6);
});

test('upright reference reads X near 0 and Y near 90 degrees', () => {
  const reading = calculateInclination(0, 1, 0);
  assert.ok(Math.abs(reading.xAngleDeg) < 0.001);
  assert.ok(Math.abs(reading.yAngleDeg - 90) < 0.001);
  assert.ok(Math.abs(reading.yDeviationDeg) < 0.001);
  assert.ok(Math.abs(reading.totalTiltDeg) < 0.001);
});

test('side tilt contributes to total tilt while upright Y remains near 90 degrees', () => {
  const radians = 10 * (Math.PI / 180);
  const reading = calculateInclination(Math.sin(radians), Math.cos(radians), 0);
  assert.ok(Math.abs(reading.xAngleDeg - 10) < 0.001);
  assert.ok(Math.abs(reading.yAngleDeg - 90) < 0.001);
  assert.ok(Math.abs(reading.totalTiltDeg - 10) < 0.001);
});

test('hold controller requires a continuous hold and resets beyond the exit tolerance', () => {
  const controller = new StraightHoldController();
  const first = controller.update(1, 1000, 2, 1, 1000);
  assert.equal(first.isInside, true);
  assert.equal(first.canCapture, false);
  assert.equal(first.justEntered, true);

  const withinHysteresis = controller.update(2.5, 1500, 2, 1, 1000);
  assert.equal(withinHysteresis.isInside, true);
  assert.equal(withinHysteresis.canCapture, false);

  const held = controller.update(1, 2000, 2, 1, 1000);
  assert.equal(held.canCapture, true);

  const exited = controller.update(3.01, 2100, 2, 1, 1000);
  assert.equal(exited.isInside, false);
  assert.equal(exited.canCapture, false);
  assert.equal(exited.holdProgress, 0);
});

test('upward-line hold allows Y aim but resets when aim drifts', () => {
  const controller = new StraightHoldController();
  const first = controller.update(0.5, 1000, 2, 1, 1000, 14.3, 1, true);
  assert.equal(first.isInside, true);
  assert.equal(first.canCapture, false);

  const drifting = controller.update(0.5, 1500, 2, 1, 1000, 15.5, 1, true);
  assert.equal(drifting.isInside, true);
  assert.equal(drifting.canCapture, false);
  assert.equal(drifting.holdProgress, 0);

  const held = controller.update(0.5, 2500, 2, 1, 1000, 15.5, 1, true);
  assert.equal(held.canCapture, true);

  const leftLine = controller.update(3.1, 2600, 2, 1, 1000, 15.5, 1, true);
  assert.equal(leftLine.isInside, false);
  assert.equal(leftLine.canCapture, false);
});
