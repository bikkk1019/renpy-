'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const suite of ['regression', 'visual', 'longform']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, '../tests', suite + '.cjs')], {
    stdio: 'inherit', env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
