import test from "node:test";
import assert from "node:assert/strict";

import { enableSqliteDefensiveMode } from "../src/sqlite-compat.ts";

test("sqlite compat enables defensive mode when the runtime supports it", () => {
  let called = false;
  const enabled = enableSqliteDefensiveMode({
    enableDefensive(value) {
      called = value;
    },
  });

  assert.equal(enabled, true);
  assert.equal(called, true);
});

test("sqlite compat tolerates runtimes without enableDefensive", () => {
  const enabled = enableSqliteDefensiveMode({});
  assert.equal(enabled, false);
});
