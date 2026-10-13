import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CORDOVA_SCRIPT_TAG = '<script src="cordova.js"></script>';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), '..');

export function parseArguments(args) {
  const options = {
    source: null,
    skipBuild: false,
    verifyOnly: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--source') {
      const source = args[index + 1];
      if (!source || source.startsWith('--')) {
        throw new Error('--source requires a CBoard source directory.');
      }
      options.source = source;
      index += 1;
    } else if (argument === '--skip-build') {
      options.skipBuild = true;
    } else if (argument === '--verify-only') {
      options.verifyOnly = true;
    } else if (argument === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function isCboardSource(sourcePath) {
  return (
    existsSync(path.join(sourcePath, 'package.json')) &&
    existsSync(path.join(sourcePath, 'public', 'index.html'))
  );
}

export function resolveCboardSource({
  repoRoot = defaultRepoRoot,
  explicitSource = null,
  environmentSource = process.env.CBOARD_SOURCE || null
} = {}) {
  const requestedSource = explicitSource || environmentSource;
  if (requestedSource) {
    const resolvedSource = path.resolve(repoRoot, requestedSource);
    if (!isCboardSource(resolvedSource)) {
      throw new Error(
        `CBoard source is invalid: ${resolvedSource}. Expected package.json and public/index.html.`
      );
    }
    return resolvedSource;
  }

  const candidates = [
    path.join(repoRoot, 'cboard'),
    path.resolve(repoRoot, '..', 'cboard')
  ];
  const source = candidates.find(isCboardSource);
  if (!source) {
    throw new Error(
      `CBoard source was not found. Checked: ${candidates.join(', ')}. ` +
        'Initialize the official submodule or set CBOARD_SOURCE.'
    );
  }
  return source;
}

function runNpmBuild(sourcePath) {
  const npmExecPath = process.env.npm_execpath;
  const options = {
    cwd: sourcePath,
    env: {
      ...process.env,
      PUBLIC_URL: '.'
    },
    stdio: 'inherit'
  };

  if (npmExecPath && existsSync(npmExecPath)) {
    execFileSync(process.execPath, [npmExecPath, 'run', 'build'], options);
    return;
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npmCommand, ['run', 'build'], {
    ...options,
    shell: process.platform === 'win32'
  });
}

export function injectCordovaScript(html) {
  if (/src=["']cordova\.js["']/i.test(html)) {
    return html;
  }

  const headTag = /<head(?:\s[^>]*)?>/i;
  if (!headTag.test(html)) {
    throw new Error('Built index.html does not contain a <head> element.');
  }

  return html.replace(headTag, (match) => `${match}${CORDOVA_SCRIPT_TAG}`);
}

export function findRootAbsoluteAssetReferences(html) {
  const references = [];
  const attribute = /(?:src|href)=["']\/(?!\/)([^"']+)["']/gi;
  let match = attribute.exec(html);
  while (match) {
    references.push(`/${match[1]}`);
    match = attribute.exec(html);
  }
  return references;
}

function cleanDirectory(directoryPath) {
  mkdirSync(directoryPath, { recursive: true });
  for (const entry of readdirSync(directoryPath)) {
    rmSync(path.join(directoryPath, entry), { recursive: true, force: true });
  }
}

function copyDirectoryContents(sourcePath, targetPath) {
  for (const entry of readdirSync(sourcePath)) {
    cpSync(path.join(sourcePath, entry), path.join(targetPath, entry), {
      recursive: true
    });
  }
}

export function packageCboardBuild({ sourcePath, repoRoot = defaultRepoRoot }) {
  const buildPath = path.join(sourcePath, 'build');
  const sourceIndexPath = path.join(buildPath, 'index.html');
  if (!existsSync(sourceIndexPath)) {
    throw new Error(
      `CBoard build output is missing: ${sourceIndexPath}. Run the build first.`
    );
  }

  const targetPath = path.join(repoRoot, 'www');
  if (path.resolve(targetPath) !== path.resolve(repoRoot, 'www')) {
    throw new Error(`Refusing to clean unexpected package target: ${targetPath}`);
  }

  cleanDirectory(targetPath);
  copyDirectoryContents(buildPath, targetPath);

  const targetIndexPath = path.join(targetPath, 'index.html');
  const html = readFileSync(targetIndexPath, 'utf8');
  writeFileSync(targetIndexPath, injectCordovaScript(html), 'utf8');

  return targetPath;
}

function summarizeDirectory(directoryPath) {
  let fileCount = 0;
  let totalBytes = 0;

  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      const nested = summarizeDirectory(entryPath);
      fileCount += nested.fileCount;
      totalBytes += nested.totalBytes;
    } else if (entry.isFile()) {
      fileCount += 1;
      totalBytes += statSync(entryPath).size;
    }
  }

  return { fileCount, totalBytes };
}

export function verifyPackagedCboard(repoRoot = defaultRepoRoot) {
  const packagePath = path.join(repoRoot, 'www');
  const indexPath = path.join(packagePath, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(`Packaged index.html is missing: ${indexPath}`);
  }

  const html = readFileSync(indexPath, 'utf8');
  if (!/src=["']cordova\.js["']/i.test(html)) {
    throw new Error('Packaged index.html does not load cordova.js.');
  }

  const rootAbsoluteReferences = findRootAbsoluteAssetReferences(html);
  if (rootAbsoluteReferences.length > 0) {
    throw new Error(
      `Cordova package contains root-absolute assets: ${rootAbsoluteReferences.join(', ')}`
    );
  }

  const mainBundles = [
    path.join(packagePath, 'static', 'js'),
    path.join(packagePath, 'static', 'css')
  ];
  for (const bundlePath of mainBundles) {
    if (!existsSync(bundlePath)) {
      throw new Error(`Expected CBoard bundle directory is missing: ${bundlePath}`);
    }
  }

  return {
    packagePath,
    ...summarizeDirectory(packagePath)
  };
}

function printHelp() {
  console.log(`Usage: npm run cboard:package -- [options]

Options:
  --source <path>  Use a specific CBoard source directory.
  --skip-build     Reuse the source directory's existing build output.
  --verify-only    Verify the existing ccboard/www package.
  --help           Show this help.

The source can also be set with CBOARD_SOURCE. Without an override, the
official ./cboard submodule is preferred, followed by the sibling ../cboard fork.`);
}

export function main(args = process.argv.slice(2), repoRoot = defaultRepoRoot) {
  const options = parseArguments(args);
  if (options.help) {
    printHelp();
    return null;
  }

  if (!options.verifyOnly) {
    const sourcePath = resolveCboardSource({
      repoRoot,
      explicitSource: options.source
    });
    console.log(`CBoard source: ${sourcePath}`);
    if (!options.skipBuild) {
      console.log('Building CBoard with PUBLIC_URL=.');
      runNpmBuild(sourcePath);
    }
    packageCboardBuild({ sourcePath, repoRoot });
  }

  const result = verifyPackagedCboard(repoRoot);
  console.log(
    `Cordova web package verified: ${result.fileCount} files, ${result.totalBytes} bytes.\n` +
      `Output: ${result.packagePath}`
  );
  return result;
}

if (path.resolve(process.argv[1] || '') === path.resolve(scriptPath)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
