import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rootUrl = new URL('../', import.meta.url);

test('Cordova mobile packages declare the reused native recording support', async () => {
  const [configXml, packageJsonText] = await Promise.all([
    readFile(new URL('config.xml', rootUrl), 'utf8'),
    readFile(new URL('package.json', rootUrl), 'utf8')
  ]);
  const packageJson = JSON.parse(packageJsonText);

  assert.match(configXml, /android\.permission\.RECORD_AUDIO/);
  assert.match(configXml, /NSMicrophoneUsageDescription/);
  assert.equal(
    packageJson.devDependencies['cordova-plugin-media'],
    '^7.0.0'
  );
  assert.ok(packageJson.cordova.plugins['cordova-plugin-media']);
});
