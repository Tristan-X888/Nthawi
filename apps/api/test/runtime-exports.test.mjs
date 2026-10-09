import assert from 'node:assert/strict';
import test from 'node:test';

const runtimePackages = [
  '@nthawi/contracts',
  '@nthawi/db',
  '@nthawi/db/schema/auth',
  '@nthawi/tooling/env',
];

for (const specifier of runtimePackages) {
  test(`${specifier} resolves and loads compiled JavaScript`, async () => {
    const resolved = import.meta.resolve(specifier);

    assert.match(resolved, /\/dist\/.*\.js$/);
    assert.doesNotMatch(resolved, /\/src\//);

    await import(specifier);
  });
}
