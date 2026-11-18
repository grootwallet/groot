export const REQUIRED_BROWSER_SHARDS = Object.freeze({
  desktop: Object.freeze({ browser: 'chromium', shards: 2 }),
  mobile: Object.freeze({ browser: 'webkit', shards: 4 })
});

export function assertBrowserShardPlan(rows, expected = REQUIRED_BROWSER_SHARDS) {
  if (!Array.isArray(rows)) throw new Error('Browser shard matrix must be an array');
  const seen = new Set();

  for (const row of rows) {
    if (!row || typeof row !== 'object') throw new Error('Browser shard row must be an object');
    const required = expected[row.project];
    if (!required) throw new Error(`Unexpected browser project: ${String(row.project)}`);
    if (row.browser !== required.browser) {
      throw new Error(`${row.project} must use ${required.browser}`);
    }
    if (row.shards !== required.shards) {
      throw new Error(`${row.project} must declare ${required.shards} shards`);
    }
    if (!Number.isInteger(row.shard) || row.shard < 1 || row.shard > row.shards) {
      throw new Error(`${row.project} has an invalid shard index: ${String(row.shard)}`);
    }
    const key = `${row.project}:${row.shard}/${row.shards}`;
    if (seen.has(key)) throw new Error(`Browser shard overlaps another matrix row: ${key}`);
    seen.add(key);
  }

  for (const [project, required] of Object.entries(expected)) {
    for (let shard = 1; shard <= required.shards; shard++) {
      const key = `${project}:${shard}/${required.shards}`;
      if (!seen.has(key)) throw new Error(`Browser shard matrix is missing ${key}`);
    }
  }
  return rows.length;
}

export function parsePlaywrightList(output, project) {
  const escapedProject = project.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s*\\[${escapedProject}\\] › (.+)$`, 'gm');
  return [...output.matchAll(pattern)].map((match) => match[1]);
}

export function assertCompleteShardInventory(fullInventory, shardInventories) {
  if (!Array.isArray(fullInventory) || fullInventory.length === 0) {
    throw new Error('Full browser inventory must not be empty');
  }
  const full = new Set(fullInventory);
  if (full.size !== fullInventory.length) {
    throw new Error('Full browser inventory contains duplicate test identifiers');
  }
  if (!Array.isArray(shardInventories) || shardInventories.length === 0) {
    throw new Error('Browser shard inventories must not be empty');
  }

  const owner = new Map();
  for (const inventory of shardInventories) {
    if (!inventory || typeof inventory.label !== 'string' || !Array.isArray(inventory.tests)) {
      throw new Error('Browser shard inventory is malformed');
    }
    if (inventory.tests.length === 0) {
      throw new Error(`Browser shard ${inventory.label} is empty`);
    }
    for (const identifier of inventory.tests) {
      if (!full.has(identifier)) {
        throw new Error(`Browser shard ${inventory.label} contains unexpected test: ${identifier}`);
      }
      const previous = owner.get(identifier);
      if (previous) {
        throw new Error(
          `Browser shard overlap for ${identifier}: ${previous} and ${inventory.label}`
        );
      }
      owner.set(identifier, inventory.label);
    }
  }

  const missing = fullInventory.filter((identifier) => !owner.has(identifier));
  if (missing.length > 0) {
    throw new Error(`Browser shard inventory is missing ${missing.length} test(s): ${missing[0]}`);
  }
  return owner.size;
}
