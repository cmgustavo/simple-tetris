#!/usr/bin/env node
'use strict';

// Bumps the app's semver version (patch/minor/major) across package.json,
// package-lock.json and the environment files (which feed the Settings
// screen's "Version" row), and syncs Android's versionName if android/ has
// been generated. Then commits and tags the result locally (matching the
// "Bump vX.Y.Z" convention used by previous releases). Does not push.
//
// This never touches Android's versionCode (the Play Store upload counter)
// - that's a separate lever, bumped independently via
// scripts/bump-android-build.js, since it must increase on every upload
// even when the app version doesn't change.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const releaseType = process.argv[2];
if (!['patch', 'minor', 'major'].includes(releaseType)) {
  console.error('Usage: node scripts/bump-version.js <patch|minor|major>');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

const dirty = execSync('git status --porcelain', { cwd: root }).toString().trim();
if (dirty) {
  console.error('Working tree is not clean. Commit or stash your changes before bumping the version.');
  process.exit(1);
}

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
let [major, minor, patch] = pkg.version.split('.').map(Number);
if (releaseType === 'major') {
  major += 1; minor = 0; patch = 0;
} else if (releaseType === 'minor') {
  minor += 1; patch = 0;
} else {
  patch += 1;
}
const newVersion = `${major}.${minor}.${patch}`;

const envFiles = ['src/environments/environment.ts', 'src/environments/environment.prod.ts'];
for (const file of envFiles) {
  const filePath = path.join(root, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const updated = content.replace(/appVersion: '[\d.]+'/, `appVersion: '${newVersion}'`);
  if (updated === content) {
    console.error(`Could not find an appVersion field to update in ${file}`);
    process.exit(1);
  }
  fs.writeFileSync(filePath, updated);
}

const changedFiles = ['package.json', 'package-lock.json', ...envFiles];

const gradlePath = path.join(root, 'android/app/build.gradle');
if (fs.existsSync(gradlePath)) {
  const content = fs.readFileSync(gradlePath, 'utf8');
  const updated = content.replace(/versionName\s+"[^"]*"/, `versionName "${newVersion}"`);
  if (updated === content) {
    console.error('Could not find a versionName field to update in android/app/build.gradle');
    process.exit(1);
  }
  fs.writeFileSync(gradlePath, updated);
  changedFiles.push('android/app/build.gradle');
} else {
  console.warn('android/app/build.gradle not found - skipping Android versionName sync.');
}

// Updates package.json + package-lock.json without npm's own commit/tag step,
// so they land in the same commit as the other files above.
run(`npm version ${newVersion} --no-git-tag-version`);

run(`git add ${changedFiles.join(' ')}`);
run(`git commit -m "Bump v${newVersion}"`);
run(`git tag v${newVersion}`);

console.log(`\nBumped to v${newVersion} (${releaseType}), committed and tagged locally.`);
console.log(`Push with: git push && git push origin v${newVersion}`);
