import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  main as packageCboard,
  verifyPackagedCboard
} from './package-cboard.mjs';

export const FIREBASE_PLUGIN_ID = 'cordova-plugin-firebasex';
export const MEDIA_PLUGIN_ID = 'cordova-plugin-media';
export const SPEECH_PLUGIN_ID = 'cordova-plugin-speechrecognition';
export const TTS_PLUGIN_ID = 'cordova-plugin-cboard-speech-tts';
export const TTS_PACKAGE_ID = 'cboard-speech-tts';
export const TTS_REMOTE_PLUGIN_ID =
  'git+https://github.com/cboard-org/cboard-speech-tts.git';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), '..');

export function parseArguments(args) {
  const options = {
    cordovaCli: process.env.CORDOVA_CLI || null,
    speechPlugin: process.env.CBOARD_SPEECH_PLUGIN || null,
    ttsPlugin: process.env.CBOARD_TTS_PLUGIN || null,
    output: null,
    skipWebBuild: false,
    keepWorkdir: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--cordova-cli') {
      options.cordovaCli = readArgumentValue(args, index, argument);
      index += 1;
    } else if (argument === '--speech-plugin') {
      options.speechPlugin = readArgumentValue(args, index, argument);
      index += 1;
    } else if (argument === '--tts-plugin') {
      options.ttsPlugin = readArgumentValue(args, index, argument);
      index += 1;
    } else if (argument === '--output') {
      options.output = readArgumentValue(args, index, argument);
      index += 1;
    } else if (argument === '--skip-web-build') {
      options.skipWebBuild = true;
    } else if (argument === '--keep-workdir') {
      options.keepWorkdir = true;
    } else if (argument === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function readArgumentValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

export function createCorePackageManifest(packageManifest) {
  const coreManifest = JSON.parse(JSON.stringify(packageManifest));
  for (const dependencyGroup of ['dependencies', 'devDependencies']) {
    if (coreManifest[dependencyGroup]) {
      delete coreManifest[dependencyGroup][FIREBASE_PLUGIN_ID];
      delete coreManifest[dependencyGroup][TTS_PACKAGE_ID];
    }
  }
  if (coreManifest.cordova?.plugins) {
    delete coreManifest.cordova.plugins[FIREBASE_PLUGIN_ID];
    delete coreManifest.cordova.plugins[TTS_PLUGIN_ID];
    delete coreManifest.cordova.plugins[TTS_REMOTE_PLUGIN_ID];
  }
  return coreManifest;
}

function requirePath(candidate, description) {
  if (!candidate || !existsSync(candidate)) {
    throw new Error(`${description} was not found: ${candidate || '<empty>'}`);
  }
  return candidate;
}

export function resolveCordovaCli(repoRoot, requestedCli) {
  const candidates = [
    requestedCli && path.resolve(repoRoot, requestedCli),
    path.join(repoRoot, 'node_modules', 'cordova', 'bin', 'cordova')
  ].filter(Boolean);
  const cordovaCli = candidates.find(existsSync);
  if (!cordovaCli) {
    throw new Error(
      'Cordova CLI was not found. Pass --cordova-cli or set CORDOVA_CLI to ' +
        'the cordova/bin/cordova JavaScript entrypoint.'
    );
  }
  return cordovaCli;
}

export function resolveSpeechPlugin(repoRoot, requestedPlugin) {
  const pluginPath = requestedPlugin
    ? path.resolve(repoRoot, requestedPlugin)
    : path.resolve(repoRoot, '..', 'cboard-speech-recognition');
  requirePath(path.join(pluginPath, 'plugin.xml'), 'Speech plugin.xml');
  const pluginXml = readFileSync(path.join(pluginPath, 'plugin.xml'), 'utf8');
  if (!pluginXml.includes(`id="${SPEECH_PLUGIN_ID}"`)) {
    throw new Error(`Unexpected speech plugin at ${pluginPath}.`);
  }
  return pluginPath;
}

export function resolveTtsPlugin(repoRoot, requestedPlugin) {
  const pluginPath = requestedPlugin
    ? path.resolve(repoRoot, requestedPlugin)
    : path.resolve(repoRoot, '..', 'cboard-speech-tts');
  requirePath(path.join(pluginPath, 'plugin.xml'), 'TTS plugin.xml');
  const pluginXml = readFileSync(path.join(pluginPath, 'plugin.xml'), 'utf8');
  if (!pluginXml.includes(`id="${TTS_PLUGIN_ID}"`)) {
    throw new Error(`Unexpected TTS plugin at ${pluginPath}.`);
  }
  return pluginPath;
}

export function stageCoreProject({ repoRoot, workdir }) {
  const sourceManifestPath = requirePath(
    path.join(repoRoot, 'package.json'),
    'ccboard package.json'
  );
  requirePath(path.join(repoRoot, 'config.xml'), 'ccboard config.xml');
  requirePath(path.join(repoRoot, 'www', 'index.html'), 'packaged CBoard index');
  requirePath(path.join(repoRoot, 'public'), 'Cordova resources');
  const sourceNodeModules = requirePath(
    path.join(repoRoot, 'node_modules'),
    'ccboard node_modules'
  );

  mkdirSync(workdir, { recursive: true });
  copyFileSync(path.join(repoRoot, 'config.xml'), path.join(workdir, 'config.xml'));
  for (const directory of ['public', 'www']) {
    cpSync(path.join(repoRoot, directory), path.join(workdir, directory), {
      recursive: true
    });
  }
  for (const optionalFile of ['settings.json']) {
    const sourcePath = path.join(repoRoot, optionalFile);
    if (existsSync(sourcePath)) {
      copyFileSync(sourcePath, path.join(workdir, optionalFile));
    }
  }

  const sourceManifest = JSON.parse(readFileSync(sourceManifestPath, 'utf8'));
  const coreManifest = createCorePackageManifest(sourceManifest);
  writeFileSync(
    path.join(workdir, 'package.json'),
    `${JSON.stringify(coreManifest, null, 2)}\n`,
    'utf8'
  );

  return {
    coreManifest,
    sourceNodeModules
  };
}

export function assertCorePluginRegistry(registrySource) {
  if (registrySource.includes(FIREBASE_PLUGIN_ID)) {
    throw new Error('Core Android package unexpectedly contains Firebase.');
  }
  if (!registrySource.includes(SPEECH_PLUGIN_ID)) {
    throw new Error('Core Android package is missing speech recognition.');
  }
  if (!registrySource.includes(MEDIA_PLUGIN_ID)) {
    throw new Error('Core Android package is missing personal voice recording.');
  }
  if (!registrySource.includes(TTS_PLUGIN_ID)) {
    throw new Error('Core Android package is missing native text-to-speech.');
  }
}

function runCordova(cordovaCli, args, { cwd, env }) {
  console.log(`cordova ${args.join(' ')}`);
  execFileSync(process.execPath, [cordovaCli, ...args], {
    cwd,
    env,
    stdio: 'inherit'
  });
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function buildCoreReport({ apkPath, registrySource, workdir }) {
  assertCorePluginRegistry(registrySource);
  return {
    format: 'ccboard-android-core-debug',
    firebaseIncluded: false,
    mediaRecordingIncluded: true,
    speechRecognitionIncluded: true,
    speechSynthesisIncluded: true,
    apkFile: path.basename(apkPath),
    apkBytes: statSync(apkPath).size,
    apkSha256: sha256(apkPath),
    temporaryWorkdir: workdir
  };
}

function printHelp() {
  console.log(`Usage: npm run android:core:debug -- [options]

Options:
  --cordova-cli <path>   Cordova CLI JavaScript entrypoint.
  --speech-plugin <path> Local speech-recognition plugin checkout.
  --tts-plugin <path>    Local CBoard TTS plugin checkout.
  --output <path>        Artifact directory (default: artifacts/android-core).
  --skip-web-build       Reuse the existing verified ccboard/www package.
  --keep-workdir         Keep the isolated temporary Cordova project.
  --help                 Show this help.

By default the command first rebuilds the current CBoard fork into ccboard/www,
then stages an isolated project, removes the optional Firebase plugin from the
staged package manifest, replaces the remote TTS dependency with the local
reviewed fork, installs the local on-device speech plugin, and builds a debug
APK. It never edits release config, package-lock.json, generated platforms, or
plugins in the source checkout.`);
}

export function main(args = process.argv.slice(2), repoRoot = defaultRepoRoot) {
  const options = parseArguments(args);
  if (options.help) {
    printHelp();
    return null;
  }

  if (!options.skipWebBuild) {
    packageCboard([], repoRoot);
  } else {
    verifyPackagedCboard(repoRoot);
  }
  const cordovaCli = resolveCordovaCli(repoRoot, options.cordovaCli);
  const speechPlugin = resolveSpeechPlugin(repoRoot, options.speechPlugin);
  const ttsPlugin = resolveTtsPlugin(repoRoot, options.ttsPlugin);
  const outputPath = path.resolve(
    repoRoot,
    options.output || path.join('artifacts', 'android-core')
  );
  const workdir = mkdtempSync(path.join(os.tmpdir(), 'ccboard-android-core-'));
  let completed = false;

  try {
    stageCoreProject({ repoRoot, workdir });
    const env = {
      ...process.env,
      NODE_PATH: [path.join(repoRoot, 'node_modules'), process.env.NODE_PATH]
        .filter(Boolean)
        .join(path.delimiter)
    };
    runCordova(
      cordovaCli,
      ['platform', 'add', 'android@14.0.1', '--noresources', '--nosave'],
      { cwd: workdir, env }
    );
    runCordova(cordovaCli, ['plugin', 'add', speechPlugin, '--nosave'], {
      cwd: workdir,
      env
    });
    runCordova(cordovaCli, ['plugin', 'add', ttsPlugin, '--nosave'], {
      cwd: workdir,
      env
    });
    runCordova(cordovaCli, ['build', 'android', '--debug'], {
      cwd: workdir,
      env
    });

    const registryPath = requirePath(
      path.join(
        workdir,
        'platforms',
        'android',
        'app',
        'src',
        'main',
        'assets',
        'www',
        'cordova_plugins.js'
      ),
      'generated Cordova plugin registry'
    );
    const apkPath = requirePath(
      path.join(
        workdir,
        'platforms',
        'android',
        'app',
        'build',
        'outputs',
        'apk',
        'debug',
        'app-debug.apk'
      ),
      'Android debug APK'
    );
    const report = buildCoreReport({
      apkPath,
      registrySource: readFileSync(registryPath, 'utf8'),
      workdir
    });

    mkdirSync(outputPath, { recursive: true });
    const outputApkPath = path.join(outputPath, 'aaccboard-core-debug.apk');
    copyFileSync(apkPath, outputApkPath);
    const outputReport = {
      ...report,
      apkFile: path.basename(outputApkPath),
      temporaryWorkdir: options.keepWorkdir ? workdir : null
    };
    writeFileSync(
      path.join(outputPath, 'build-report.json'),
      `${JSON.stringify(outputReport, null, 2)}\n`,
      'utf8'
    );
    completed = true;
    console.log(
      `Android core debug package verified: ${report.apkBytes} bytes, ` +
        `SHA-256 ${report.apkSha256}.\nOutput: ${outputApkPath}`
    );
    return outputReport;
  } finally {
    if (!options.keepWorkdir && completed) {
      rmSync(workdir, { recursive: true, force: true });
    } else {
      console.log(`Temporary Android project: ${workdir}`);
    }
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(scriptPath)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
