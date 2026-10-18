#!/usr/bin/env node
try {
  const { main } = await import("../src/cli.js");
  await main(process.argv.slice(2));
} catch (e) {
  if (process.argv[2] !== "hook") throw e; // hooks fail open
}
