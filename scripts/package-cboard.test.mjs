import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';

import {
  CORDOVA_SCRIPT_TAG,
  findRootAbsoluteAssetReferences,
  injectCordovaScript,
  packageCboardBuild,
  parseArguments,
  resolveCboardSource,
  verifyPackagedCboard
} from './package-cboard.mjs';

const temporaryDirectories = [];

function createTemporaryDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'ccboard-package-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createCboardSource(sourcePath, html) {
  mkdirSync(path.join(sourcePath, 'public'), { recursive: true });
  mkdirSync(path.join(sourcePath, 'build', 'static', 'js'), { recursive: true });
  mkdirSync(path.join(sourcePath, 'build', 'static', 'css'), { recursive: true });
  writeFileSync(path.join(sourcePath, 'package.json'), '{}');
  writeFileSync(path.join(sourcePath, 'public', 'index.html'), '<head></head>');
  writeFileSync(path.join(sourcePath, 'build', 'index.html'), html);
  writeFileSync(path.join(sourcePath, 'build', 'static', 'js', 'main.js'), '');
  writeFileSync(path.join(sourcePath, 'build', 'static', 'css', 'main.css'), '');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('parseArguments accepts source and package modes', () => {
  assert.deepEqual(parseArguments(['--source', '../cboard', '--skip-build']), {
    source: '../cboard',
    skipBuild: true,
    verifyOnly: false
  });
  assert.throws(() => parseArguments(['--source']), /requires/);
  assert.throws(() => parseArguments(['--unknown']), /Unknown argument/);
});

test('resolveCboardSource reuses a sibling fork when the submodule is empty', () => {
  const workspace = createTemporaryDirectory();
  const repoRoot = path.join(workspace, 'ccboard');
  const siblingSource = path.join(workspace, 'cboard');
  mkdirSync(path.join(repoRoot, 'cboard'), { recursive: true });
  createCboardSource(siblingSource, '<head></head>');

  assert.equal(resolveCboardSource({ repoRoot }), siblingSource);
});

test('injectCordovaScript is idempotent', () => {
  const initial = '<html><head><title>CBoard</title></head></html>';
  const injected = injectCordovaScript(initial);

  assert.match(injected, /<head><script src="cordova\.js"><\/script>/);
  assert.equal(injectCordovaScript(injected), injected);
  assert.equal(injected.split(CORDOVA_SCRIPT_TAG).length - 1, 1);
});

test('findRootAbsoluteAssetReferences ignores relative and remote assets', () => {
  const html =
    '<script src="/static/app.js"></script>' +
    '<link href="./static/app.css">' +
    '<script src="https://example.test/app.js"></script>';

  assert.deepEqual(findRootAbsoluteAssetReferences(html), ['/static/app.js']);
});

test('packageCboardBuild cleans stale files and produces a verified bundle', () => {
  const workspace = createTemporaryDirectory();
  const repoRoot = path.join(workspace, 'ccboard');
  const sourcePath = path.join(workspace, 'cboard');
  mkdirSync(path.join(repoRoot, 'www'), { recursive: true });
  writeFileSync(path.join(repoRoot, 'www', 'stale.txt'), 'stale');
  createCboardSource(
    sourcePath,
    '<html><head></head><body><script src="./static/js/main.js"></script></body></html>'
  );

  packageCboardBuild({ sourcePath, repoRoot });
  const result = verifyPackagedCboard(repoRoot);
  const packagedHtml = readFileSync(path.join(repoRoot, 'www', 'index.html'), 'utf8');

  assert.match(packagedHtml, /cordova\.js/);
  assert.equal(result.fileCount, 3);
  assert.throws(
    () => readFileSync(path.join(repoRoot, 'www', 'stale.txt')),
    /ENOENT/
  );
});
