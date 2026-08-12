#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const packageRoot = path.resolve(import.meta.dirname, '..');
const fixtureRoot = path.join(packageRoot, 'fixtures');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stackflow-kit-package-'));

function run(command, args, cwd, options = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
}

try {
  run('npm', ['run', 'build'], packageRoot);
  const packResult = JSON.parse(
    run(
      'npm',
      [
        'pack',
        '--pack-destination',
        temporaryRoot,
        '--ignore-scripts',
        '--json',
      ],
      packageRoot,
      { capture: true }
    )
  );
  const tarballName = packResult[0]?.filename;
  if (!tarballName) throw new Error('npm pack did not return a tarball filename.');
  const tarballPath = path.join(temporaryRoot, tarballName);

  for (const fixtureName of ['next', 'vite']) {
    const fixtureDirectory = path.join(temporaryRoot, fixtureName);
    fs.cpSync(path.join(fixtureRoot, fixtureName), fixtureDirectory, { recursive: true });
    run(
      'npm',
      ['install', '--ignore-scripts', '--package-lock=false', '--no-audit', '--no-fund', tarballPath],
      fixtureDirectory
    );
    run(
      'node',
      [
        '--input-type=module',
        '--eval',
        "const pkg = await import('@happydoran/stackflow-kit'); const lock = await import('@happydoran/stackflow-kit/navigation-lock'); if (pkg.STACK_TRANSITION_DURATION_MS !== 350 || typeof lock.navigationLock?.acquire !== 'function') process.exit(1);",
      ],
      fixtureDirectory
    );
    run('npm', ['run', 'build'], fixtureDirectory);
  }

  console.log('StackFlow kit package verification passed for Next.js and Vite consumers.');
} finally {
  fs.rmSync(temporaryRoot, { force: true, recursive: true });
}
