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
  FIREBASE_PLUGIN_ID,
  MEDIA_PLUGIN_ID,
  SPEECH_PLUGIN_ID,
  TTS_PACKAGE_ID,
  TTS_PLUGIN_ID,
  TTS_REMOTE_PLUGIN_ID,
  assertCorePluginRegistry,
  createCorePackageManifest,
  parseArguments,
  stageCoreProject
} from './build-android-core.mjs';

const temporaryDirectories = [];

function createTemporaryDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'ccboard-core-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('parseArguments keeps explicit local build inputs', () => {
  assert.deepEqual(
    parseArguments([
      '--cordova-cli',
      'tools/cordova',
      '--speech-plugin',
      '../speech',
      '--tts-plugin',
      '../tts',
      '--output',
      'out',
      '--skip-web-build',
      '--keep-workdir'
    ]),
    {
      cordovaCli: 'tools/cordova',
      speechPlugin: '../speech',
      ttsPlugin: '../tts',
      output: 'out',
      skipWebBuild: true,
      keepWorkdir: true
    }
  );
  assert.throws(() => parseArguments(['--output']), /requires a value/);
  assert.throws(() => parseArguments(['--unknown']), /Unknown argument/);
});

test('createCorePackageManifest removes optional Firebase and remote TTS', () => {
  const source = {
    dependencies: {
      [FIREBASE_PLUGIN_ID]: '19.0.1',
      stable: '1.0.0'
    },
    devDependencies: {
      [FIREBASE_PLUGIN_ID]: '19.0.1',
      [TTS_PACKAGE_ID]: 'github:cboard-org/cboard-speech-tts',
      'cordova-android': '14.0.1'
    },
    cordova: {
      plugins: {
        [FIREBASE_PLUGIN_ID]: { enabled: true },
        [TTS_PLUGIN_ID]: {},
        [TTS_REMOTE_PLUGIN_ID]: {},
        stable: {}
      }
    }
  };

  const core = createCorePackageManifest(source);

  assert.equal(core.dependencies[FIREBASE_PLUGIN_ID], undefined);
  assert.equal(core.devDependencies[FIREBASE_PLUGIN_ID], undefined);
  assert.equal(core.devDependencies[TTS_PACKAGE_ID], undefined);
  assert.equal(core.cordova.plugins[FIREBASE_PLUGIN_ID], undefined);
  assert.equal(core.cordova.plugins[TTS_PLUGIN_ID], undefined);
  assert.equal(core.cordova.plugins[TTS_REMOTE_PLUGIN_ID], undefined);
  assert.equal(core.dependencies.stable, '1.0.0');
  assert.deepEqual(source.cordova.plugins[FIREBASE_PLUGIN_ID], {
    enabled: true
  });
});

test('stageCoreProject leaves source package and dependencies unchanged', () => {
  const workspace = createTemporaryDirectory();
  const repoRoot = path.join(workspace, 'ccboard');
  const workdir = path.join(workspace, 'stage');
  mkdirSync(path.join(repoRoot, 'www'), { recursive: true });
  mkdirSync(path.join(repoRoot, 'public'), { recursive: true });
  mkdirSync(path.join(repoRoot, 'node_modules'), { recursive: true });
  writeFileSync(path.join(repoRoot, 'config.xml'), '<widget />');
  writeFileSync(path.join(repoRoot, 'www', 'index.html'), '<head></head>');
  writeFileSync(path.join(repoRoot, 'public', 'icon.png'), 'icon');
  const sourceText = JSON.stringify({
    devDependencies: { [FIREBASE_PLUGIN_ID]: '19.0.1' },
    cordova: { plugins: { [FIREBASE_PLUGIN_ID]: {} } }
  });
  writeFileSync(path.join(repoRoot, 'package.json'), sourceText);

  const stagedProject = stageCoreProject({ repoRoot, workdir });

  const staged = JSON.parse(readFileSync(path.join(workdir, 'package.json')));
  assert.equal(staged.devDependencies[FIREBASE_PLUGIN_ID], undefined);
  assert.equal(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'), sourceText);
  assert.equal(stagedProject.sourceNodeModules, path.join(repoRoot, 'node_modules'));
  assert.equal(readFileSync(path.join(workdir, 'public', 'icon.png'), 'utf8'), 'icon');
  assert.equal(readFileSync(path.join(workdir, 'www', 'index.html'), 'utf8'), '<head></head>');
});

test('assertCorePluginRegistry requires speech, TTS and recording and rejects Firebase', () => {
  const coreRegistry = `${SPEECH_PLUGIN_ID} ${TTS_PLUGIN_ID} ${MEDIA_PLUGIN_ID}`;
  assert.doesNotThrow(() => assertCorePluginRegistry(coreRegistry));
  assert.throws(
    () => assertCorePluginRegistry(`${coreRegistry} ${FIREBASE_PLUGIN_ID}`),
    /unexpectedly contains Firebase/
  );
  assert.throws(
    () => assertCorePluginRegistry(`${TTS_PLUGIN_ID} ${MEDIA_PLUGIN_ID}`),
    /missing speech/
  );
  assert.throws(
    () => assertCorePluginRegistry(`${SPEECH_PLUGIN_ID} ${TTS_PLUGIN_ID}`),
    /missing personal voice recording/
  );
  assert.throws(
    () => assertCorePluginRegistry(`${SPEECH_PLUGIN_ID} ${MEDIA_PLUGIN_ID}`),
    /missing native text-to-speech/
  );
});
