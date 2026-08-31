import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const asset = (name) => resolve(root, 'assets/brand', name);
const read = (name) => readFileSync(asset(name), 'utf8');
const spec = JSON.parse(read('lockup-spec.json'));
const close = (actual, expected, tolerance = 0.0001) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`
  );

const ink = read('lockup-horizontal-ink.svg');
const reversed = read('lockup-horizontal-reversed.svg');
const source = readFileSync(asset('source/manrope-variable.ttf'));
const sourceHash = createHash('sha256').update(source).digest('hex');

assert.equal(sourceHash, spec.font.sha256);
assert.doesNotMatch(ink, /<text\b/);
assert.match(ink, /Outlined Manrope 690 wordmark/);
assert.equal(ink.replace('#102A4C', '#COLOR'), reversed.replace('#F7F3E9', '#COLOR'));

const viewBox = ink.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
const mark = ink.match(/<path transform="translate\(0 ([\d.]+)\) scale\(([\d.]+)\)"/);
const word = ink.match(/<g transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+) -([\d.]+)\)"/);
assert.ok(viewBox && mark && word, 'canonical lockup transforms are missing');

const [, width, height] = viewBox.map(Number);
const [, markY, markScale] = mark.map(Number);
const [, wordX, baseline, wordScaleX, wordScaleY] = word.map(Number);
const iconCanvas = spec.symbol.sourceCanvas * markScale;
const visibleMarkBottom = markY + spec.symbol.sourceVisibleBottomY * markScale;
const gap = wordX - iconCanvas;
const emSize = wordScaleX * 2000;

close(width, spec.artboard.width);
close(height, spec.artboard.height);
close(markY, spec.symbol.translateY);
close(markScale, spec.symbol.scale);
close(iconCanvas, spec.symbol.renderedCanvas);
close(visibleMarkBottom, baseline);
close(baseline, spec.artboard.baselineY);
close(gap, spec.wordmark.originX - spec.symbol.renderedCanvas);
close(emSize, spec.wordmark.emSize);
close(wordScaleX, wordScaleY);
assert.equal(spec.usage.minimumLockupWidthPx, 96);
assert.equal(spec.usage.minimumMarkPx, 24);

for (const name of ['wordmark-ink.svg', 'wordmark-reversed.svg']) {
  assert.doesNotMatch(read(name), /<text\b/);
  assert.match(read(name), /translate\(0\.0000 68\.0000\)/);
}

for (const name of [
  'lockup-horizontal-ink.svg',
  'lockup-horizontal-reversed.svg',
  'wordmark-ink.svg',
  'wordmark-reversed.svg'
]) {
  const publicCopy = resolve(root, 'static/brand', name);
  if (existsSync(publicCopy)) {
    assert.equal(readFileSync(publicCopy, 'utf8'), read(name), `${name} public copy is stale`);
  }

  const productCopy = resolve(root, 'src/lib/assets/brand', name);
  if (name.startsWith('lockup-horizontal')) {
    assert.ok(existsSync(productCopy), `${name} product copy is missing`);
    assert.equal(readFileSync(productCopy, 'utf8'), read(name), `${name} product copy is stale`);
  }
}

console.log(
  `Groot lockup geometry: baseline ${baseline.toFixed(2)}, visible mark bottom ${visibleMarkBottom.toFixed(2)}, ` +
    `symbol ${iconCanvas.toFixed(2)}, gap ${gap.toFixed(2)}, Manrope ${emSize.toFixed(2)} at weight 690.`
);
