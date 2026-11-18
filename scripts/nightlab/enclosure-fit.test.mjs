import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../src/shared/nightlab/vendor/three/three.module.js';
import {STLLoader} from '../../src/shared/nightlab/vendor/three/STLLoader.js';
import {fitFrameToDiffuser} from '../../src/shared/nightlab/enclosure-fit.js';

// Independent geometry checks of the real, pinned assets. Raycaster below
// intersects the returned triangles; it does not reuse the fitter's grid,
// seating functions, intended offsets or reported residuals. These samples
// establish a sampled visual joint and material occlusion, not manufacturing
// or whole-surface accuracy. Internal mounting tabs may legitimately overlap
// plastic; a hidden tab must not share its visible outer plane.
const root = new URL('../../src/shared/nightlab/', import.meta.url);
const source = JSON.parse(await readFile(new URL('model-assets/source.json', root), 'utf8'));
const loader = new STLLoader();
const sha = value => createHash('sha256').update(value).digest('hex');
const bounds = geometry => new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position'));
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${label}: ${actual} vs ${expected} (tolerance ${tolerance})`);

async function load(name) {
  const bytes = await readFile(new URL(`model-assets/${name}`, root));
  assert.equal(sha(bytes), source.assets.find(asset => asset.file === name)?.sha256, `Pinned ${name} bytes`);
  return loader.parse(bytes.toString());
}
function geometryHash(geometry) {
  const hash = createHash('sha256');
  for (const name of Object.keys(geometry.attributes).sort()) {
    const attribute = geometry.getAttribute(name), array = attribute.array;
    hash.update(name + ':' + attribute.itemSize + ':' + attribute.count + ':');
    hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  }
  const index = geometry.getIndex();
  if (index) hash.update(Buffer.from(index.array.buffer, index.array.byteOffset, index.array.byteLength));
  return hash.digest('hex');
}
function mesh(geometry, material) {
  const value = new THREE.Mesh(geometry, material);
  value.updateMatrixWorld(true);
  return value;
}
function intersections(object, axis, a, b) {
  const box = object.geometry.boundingBox || bounds(object.geometry);
  const origin = new THREE.Vector3(), direction = new THREE.Vector3();
  origin.setComponent(axis, box.max.getComponent(axis) + 10);
  origin.setComponent((axis + 1) % 3, a);
  origin.setComponent((axis + 2) % 3, b);
  direction.setComponent(axis, -1);
  const hits = new THREE.Raycaster(origin, direction).intersectObject(object)
    .map(hit => hit.point.getComponent(axis)).sort((a, b) => a - b);
  return hits.filter((value, index) => !index || value - hits[index - 1] > 1e-5);
}
function plasticSection(hits, middleZ, label) {
  const lower = hits.filter(value => value < middleZ - 1e-5);
  const upper = hits.filter(value => value > middleZ + 1e-5);
  assert.ok(lower.length >= 2 && upper.length >= 2, `${label}: two separate plastic walls must be intersected`);
  return {outsideLow: lower[0], insideLow: lower.at(-1), insideHigh: upper[0], outsideHigh: upper.at(-1)};
}

const frame = await load('blink1mk2_enclosure_frame_v3k.stl');
const rawPlastic = await load('blink1mk2_enclosure_diffuser_v3k.stl');
const rawPlasticHash = geometryHash(rawPlastic);
const frameBox = bounds(frame), plasticBox = bounds(rawPlastic);
const turn = new THREE.Matrix4().makeRotationY(Math.PI / 2);
const rotatedBox = plasticBox.clone().applyMatrix4(turn);
const offset = frameBox.getCenter(new THREE.Vector3()).sub(rotatedBox.getCenter(new THREE.Vector3()));
offset.y = frameBox.min.y - rotatedBox.min.y;
const plastic = rawPlastic.clone().applyMatrix4(new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z).multiply(turn));
near(bounds(plastic).min.y, frameBox.min.y, 1e-6, 'Common USB/front min-Y datum');
const before = {frame: geometryHash(frame), plastic: geometryHash(plastic)};
const started = performance.now();
const {geometry: fitted} = fitFrameToDiffuser(THREE, frame, plastic);
const elapsed = performance.now() - started;

assert.notEqual(fitted, frame, 'The fitter returns a derivative clone');
assert.notEqual(fitted.getAttribute('position').array, frame.getAttribute('position').array);
assert.equal(geometryHash(frame), before.frame, 'All original frame attributes remain unchanged');
assert.equal(geometryHash(plastic), before.plastic, 'All aligned plastic/engraving attributes remain unchanged');
assert.equal(geometryHash(rawPlastic), rawPlasticHash, 'The raw plastic is unchanged by alignment and fit');
// A derived surface may be retriangulated. Pin the actual source inputs,
// finite surface and aperture instead of locking in the old sparse topology.
const position = fitted.getAttribute('position');
assert.ok(position.count >= 3, 'The fitted frame has an actual surface');
for (let i = 0; i < position.count; i++) {
  for (const value of [position.getX(i), position.getY(i), position.getZ(i)]) assert.ok(Number.isFinite(value));
}
const index = fitted.getIndex(), faceCount = (index?.count ?? position.count) / 3;
assert.ok(Number.isInteger(faceCount));
let area = 0;
for (let face = 0; face < faceCount; face++) {
  const ids = [0, 1, 2].map(corner => index ? index.getX(face * 3 + corner) : face * 3 + corner);
  const points = ids.map(id => new THREE.Vector3().fromBufferAttribute(position, id));
  const cross = points[1].sub(points[0]).cross(points[2].sub(points[0]));
  assert.ok(cross.lengthSq() > 1e-16, `No degenerate derivative triangle ${face}`);
  area += cross.length() / 2;
}
assert.ok(Number.isFinite(area) && area > 100, 'The derivative retains a finite enclosure surface');

const material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
const originalMesh = mesh(frame, material), fittedMesh = mesh(fitted, material), plasticMesh = mesh(plastic, material);
const middleZ = (frameBox.min.z + frameBox.max.z) / 2;
const fittedBox = bounds(fitted);
let openingSamples = 0;
for (const y of [.2, .5, 1]) for (const z of [2, 3, 4]) {
  const original = intersections(originalMesh, 0, y, z), derived = intersections(fittedMesh, 0, y, z);
  assert.equal(original.length, 4, `Original USB aperture sample y=${y} z=${z}`);
  assert.equal(derived.length, 4, `Derived USB aperture remains open y=${y} z=${z}`);
  near(derived[1], original[1], 1e-6, 'USB inner left wall');
  near(derived[2], original[2], 1e-6, 'USB inner right wall');
  near(derived[2] - derived[1], 12.38, 1e-4, 'USB inner width in source units');
  openingSamples++;
}

let seatSamples = 0, frontSamples = 0, maximumAirGap = 0, maximumInternalOverlap = 0;
function checkSeat(x, y, label, front = false) {
  const metal = intersections(fittedMesh, 2, x, y);
  assert.ok(metal.length >= 2, `${label}: derived metal must be intersected`);
  const cap = plasticSection(intersections(plasticMesh, 2, x, y), middleZ, label);
  const metalLow = metal[0], metalHigh = metal.at(-1);
  const gaps = [cap.insideHigh - metalHigh, metalLow - cap.insideLow];
  for (const gap of gaps) {
    maximumAirGap = Math.max(maximumAirGap, gap);
    maximumInternalOverlap = Math.max(maximumInternalOverlap, -gap);
    assert.ok(gap <= .003, `${label}: actual triangle air gap ${gap} exceeds 0.003 source units`);
  }
  // A bounded internal bite is permitted in this screen model. Check that the
  // metal stays beneath the real plastic exterior instead of covering a gap.
  assert.ok(metalHigh < cap.outsideHigh - .015, `${label}: metal must not protrude through the upper plastic exterior`);
  assert.ok(metalLow > cap.outsideLow + .015, `${label}: metal must not protrude through the lower plastic exterior`);
  if (front) frontSamples += 2;
  else seatSamples += 2;
}

// A different, denser phase/spacing than the production fitter's verification.
// It deliberately includes the last few microns omitted by the former coarse
// grid, where an actual 0.14-source-unit tip gap was found independently.
for (const x of [fittedBox.min.x + .01, fittedBox.max.x - .01]) {
  const rear = intersections(plasticMesh, 1, middleZ, x);
  assert.ok(rear.length >= 2, 'The inner and outer rear plastic return must exist');
  const innerTip = rear.at(-2);
  for (let y = 3.337; y < innerTip - .003; y += .037) checkSeat(x, y, `long/back rail x=${x} y=${y}`);
  for (const distance of [.08,.04,.02,.01,.005,.003,.001]) {
    checkSeat(x, innerTip - distance, `last rear tip x=${x}, distance=${distance}`);
  }
}

// USB-corner sections are defined from the *actual fitted* front boundary at
// mid-thickness. Move just 0.025 source units into the wall to avoid tangent
// ambiguity, then require contact without breaching the original plastic skin.
for (const x of [.4,.8,1.3,1.8,2.2,14.8,15.2,15.7,16.2,16.6]) {
  const front = intersections(fittedMesh, 1, middleZ, x)[0];
  assert.ok(Number.isFinite(front), `USB root boundary x=${x}`);
  checkSeat(x, front + .025, `USB root x=${x}`, true);
}

// External material ownership, independently observed on the actual meshes.
// The raw CAD has intentional hidden mounting tabs and shares the plastic's
// outer X planes. The old fitter passed every seating test above while those
// coplanar tabs appeared as teeth in the USB-facing view. For each sampled
// opaque plastic patch on the two exterior planes, require an actual physical
// depth ordering; a depth-buffer bias cannot substitute for this separation.
let occlusionSamples = 0, frontOcclusionSamples = 0, minimumOcclusionClearance = Infinity;
function checkExteriorOcclusion(y, z) {
  const metal = intersections(fittedMesh, 0, y, z), cap = intersections(plasticMesh, 0, y, z);
  if (!metal.length || !cap.length) return;
  for (const side of [-1, 1]) {
    const outside = side < 0 ? cap[0] : cap.at(-1);
    const exteriorPlane = side < 0 ? frameBox.min.x : frameBox.max.x;
    // Limit the assertion to the actual planar exterior plastic skin. Inner
    // cavity faces and curved front lips are not external occluders on X.
    if (Math.abs(outside - exteriorPlane) > .002) continue;
    const hiddenMetal = side < 0 ? metal[0] : metal.at(-1);
    const clearance = side < 0 ? hiddenMetal - outside : outside - hiddenMetal;
    assert.ok(clearance >= .002,
      `Exterior plastic must occlude mounting metal, side=${side} y=${y} z=${z}: clearance ${clearance}`);
    minimumOcclusionClearance = Math.min(minimumOcclusionClearance, clearance);
    occlusionSamples++;
    if (y < 3.7) frontOcclusionSamples++;
  }
}
for (let y = .037; y < 21.6; y += .167) {
  for (let z = -1.6; z < 7.6; z += .137) checkExteriorOcclusion(y, z);
}
// Denser independent phase at the USB root, where the user saw the serrations.
for (let y = .061; y < 4.1; y += .069) {
  for (let z = -.9; z < 6.9; z += .109) checkExteriorOcclusion(y, z);
}
assert.ok(occlusionSamples >= 150, `The exterior test must inspect real overlapping patches, got ${occlusionSamples}`);
assert.ok(frontOcclusionSamples >= 50, `The USB root must be covered, got ${frontOcclusionSamples}`);

// The USB-facing curve needs its own visibility test. Side-plane recession
// alone still leaves metal before the curved plastic by ~0.011 source units,
// creating tall visible teeth despite every side and seating check passing.
// Shoot from the front (-Y) and compare the *first* real triangle intersections.
let frontCurveSamples = 0, minimumFrontClearance = Infinity;
function checkFrontOcclusion(x, z) {
  const metal = intersections(fittedMesh, 1, z, x), cap = intersections(plasticMesh, 1, z, x);
  if (!metal.length || !cap.length || cap[0] > 3.7) return;
  const clearance = metal[0] - cap[0];
  assert.ok(clearance >= .002,
    `USB-facing plastic must occlude mounting metal x=${x} z=${z}: clearance ${clearance}`);
  minimumFrontClearance = Math.min(minimumFrontClearance, clearance);
  frontCurveSamples++;
}
// Concrete previously failing samples from the user's front-view defect.
for (const [x, z] of [[14.696,5.632], [15.518,.321], [1.407,.321], [2.229,5.632]]) checkFrontOcclusion(x, z);
// Different phase than source vertices and the fitter's own rail samples.
for (let x = .037; x < 17; x += .137) {
  for (let z = -1.6; z < 7.6; z += .113) checkFrontOcclusion(x, z);
}
assert.ok(frontCurveSamples >= 1000, `Front plastic/metal overlap must be covered, got ${frontCurveSamples}`);

console.log(`PASS real pinned STL inputs unchanged; ${faceCount} finite nondegenerate derivative triangles`);
console.log(`PASS ${openingSamples} USB aperture sections retain 12.38 width; ${frontSamples} USB-corner seating checks remain beneath the original plastic skin`);
console.log(`PASS independent Three.Raycaster: ${seatSamples} long-side/rear seating checks, including tip−0.001; maximum air gap ${maximumAirGap.toFixed(6)} source units`);
console.log(`PASS ${occlusionSamples} exterior material-order checks (${frontOcclusionSamples} near USB); minimum real plastic-to-metal clearance ${minimumOcclusionClearance.toFixed(6)} source units`);
console.log(`PASS ${frontCurveSamples} USB-facing material-order checks; minimum real plastic-to-metal clearance ${minimumFrontClearance.toFixed(6)} source units`);
console.log(`INFO hidden mounting overlap up to ${maximumInternalOverlap.toFixed(6)} source units; fit ${elapsed.toFixed(1)}ms. Sampled visual evidence only; no manufacturing or whole-surface certification.`);

material.dispose(); fitted.dispose(); plastic.dispose(); frame.dispose(); rawPlastic.dispose();
