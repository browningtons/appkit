// Wraps `npm audit --omit=dev --audit-level=low` with retries.
//
// npm's classic audit endpoint (POST /-/npm/v1/security/audits/quick) is
// being retired and intermittently returns a bare 400 unrelated to any real
// finding — observed on deseret-xeriscaping's and debt-snowball-dolphin's
// scheduled Dependency audit runs two days running (2026-09-19, 2026-09-20),
// both times against a lockfile that installed and audited clean moments
// later (deseret-xeriscaping#42). A transient registry error failing the
// gate is a false red, not a dependency-safety signal.
//
// A real finding is deterministic and will still fail every attempt, so
// retrying never hides an actual vulnerability — only registry flakiness.
import { spawnSync } from "node:child_process";

const ATTEMPTS = 3;
const BACKOFF_MS = [5000, 15000];

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  const result = spawnSync(
    "npm",
    ["audit", "--omit=dev", "--audit-level=low"],
    { stdio: "inherit" },
  );

  if (result.status === 0) {
    process.exit(0);
  }

  if (attempt < ATTEMPTS) {
    const wait = BACKOFF_MS[attempt - 1];
    console.error(
      `audit-retry: attempt ${attempt}/${ATTEMPTS} failed, retrying in ${wait / 1000}s...`,
    );
    spawnSync("sleep", [String(wait / 1000)]);
  } else {
    console.error(`audit-retry: attempt ${attempt}/${ATTEMPTS} failed, giving up.`);
    process.exit(result.status ?? 1);
  }
}
