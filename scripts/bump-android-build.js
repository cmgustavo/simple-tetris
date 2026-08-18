#!/usr/bin/env node
'use strict';

// Bumps only Android's versionCode (the integer Play Console uses to tell
// uploads apart), without touching the app's semver version. Play Store
// requires versionCode to strictly increase on every upload, even when the
// human-readable version (versionName, package.json version) doesn't
// change - so this is a separate lever from npm run patch/minor/major.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

const gradlePath = path.join(root, 'android/app/build.gradle');
if (!fs.existsSync(gradlePath)) {
  console.error('android/app/build.gradle not found. Run "npx cap add android" first.');
  process.exit(1);
}

const dirty = execSync('git status --porcelain', { cwd: root }).toString().trim();
if (dirty) {
  console.error('Working tree is not clean. Commit or stash your changes before bumping the build number.');
  process.exit(1);
}

const content = fs.readFileSync(gradlePath, 'utf8');
const match = content.match(/versionCode\s+(\d+)/);
if (!match) {
  console.error('Could not find a versionCode field in android/app/build.gradle');
  process.exit(1);
}

const newBuildNumber = Number(match[1]) + 1;
fs.writeFileSync(gradlePath, content.replace(/versionCode\s+\d+/, `versionCode ${newBuildNumber}`));

run('git add android/app/build.gradle');
run(`git commit -m "Bump Android build number to ${newBuildNumber}"`);

console.log(`\nAndroid versionCode is now ${newBuildNumber}, committed locally.`);
console.log('Push with: git push');
