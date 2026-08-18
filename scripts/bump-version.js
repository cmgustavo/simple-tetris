#!/usr/bin/env node
'use strict';

// Bumps the patch version across package.json, package-lock.json and the
// environment files, then commits and tags the result locally (matching the
// "Bump vX.Y.Z" convention used by previous releases). Does not push.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

const dirty = execSync('git status --porcelain', { cwd: root }).toString().trim();
if (dirty) {
  console.error('Working tree is not clean. Commit or stash your changes before bumping the version.');
  process.exit(1);
}

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const [majorStr, minorStr, patchStr] = pkg.version.split('.');
const newVersion = `${majorStr}.${minorStr}.${Number(patchStr) + 1}`;

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

// Updates package.json + package-lock.json without npm's own commit/tag step,
// so they land in the same commit as the environment files below.
run(`npm version ${newVersion} --no-git-tag-version`);

run(`git add package.json package-lock.json ${envFiles.join(' ')}`);
run(`git commit -m "Bump v${newVersion}"`);
run(`git tag v${newVersion}`);

console.log(`\nBumped to v${newVersion}, committed and tagged locally.`);
console.log(`Push with: git push && git push origin v${newVersion}`);
