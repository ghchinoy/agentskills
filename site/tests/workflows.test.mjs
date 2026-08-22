// workflows.test.mjs — the two workflow files are part of the deliverable, and
// three of the properties they must have are inherited rulings that a later
// phase, reading only the proposal, would "fix" back into a hazard. A comment
// at the deviation site is one of the three places such a ruling is recorded;
// this file is what makes the comment load-bearing.
//
// Pinned here:
//   * `cancel-in-progress: false` on the Pages deploy — a DELIBERATE deviation
//     from proposal §10.2, so that an in-flight production deployment is
//     allowed to finish.
//   * the main-only guard is a REF EQUALITY test, never `startsWith`, which
//     admits `refs/heads/main-anything`.
//   * no tag trigger anywhere: the `github-pages` environment rejects `v*` tag
//     refs, so a tag-triggered deploy dies at the environment gate.
//   * the deploy path runs the same suite site-ci.yml runs, before it deploys.
//   * site-ci.yml cannot deploy: no Pages action, no `pages:` permission.
//
// Every absence assertion below is paired with a POSITIVE CONTROL that runs the
// same matcher over text which does contain the forbidden thing. "No
// `startsWith` in this file" and "my regex does not match anything" have the
// same evidence signature otherwise.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { read, repoRoot, siteRoot } from "./_helpers.mjs";

const DOCS = join(repoRoot, ".github/workflows/docs.yml");
const SITE_CI = join(repoRoot, ".github/workflows/site-ci.yml");

// Both workflow files EXPLAIN the rulings they obey, in comments, by naming the
// forbidden form: docs.yml says in prose why `startsWith(github.ref, ...)` must
// not be used, and why `cancel-in-progress: true` is wrong. A matcher run over
// the raw file therefore finds the forbidden strings in the one place they are
// harmless, and a document that defines a convention becomes a document that
// appears to violate it.
//
// The predicate these tests care about is a property of the EXECUTABLE YAML, so
// the executable YAML is what they read. Comment lines are removed first — full
// -line comments only, because neither file carries a `#` inside a value and a
// trailing-comment stripper would have to reason about quoting.
export function code(yaml) {
  return yaml
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
}

// Matchers, defined once and applied to both the real file and its control.
const M = {
  cancelFalse: /^concurrency:\n(?:[ \t]+.*\n)*?[ \t]+cancel-in-progress:[ \t]*false[ \t]*$/m,
  cancelTrue: /^[ \t]+cancel-in-progress:[ \t]*true[ \t]*$/m,
  refEquality: /^[ \t]+if:[ \t]*github\.ref[ \t]*==[ \t]*'refs\/heads\/main'[ \t]*$/m,
  startsWith: /startsWith\s*\(/,
  tagTrigger: /^[ \t]+tags:/m,
  pagesPermission: /^[ \t]+pages:[ \t]*write[ \t]*$/m,
  deployAction: /actions\/(deploy-pages|upload-pages-artifact|configure-pages)@/,
  continueOnError: /continue-on-error/,
};

test("control: comment stripping keeps the executable YAML and only that", async () => {
  const raw = await read(DOCS);
  const stripped = code(raw);

  // It removes what it is supposed to remove: the raw file DOES name both
  // forbidden forms in prose, and the stripped file does not.
  assert.ok(M.startsWith.test(raw), "docs.yml no longer explains why startsWith is forbidden");
  assert.ok(!M.startsWith.test(stripped), "comment stripping left a commented startsWith behind");

  // And it does not remove what it must not: a forbidden form in EXECUTABLE
  // position survives the stripper, so the tests below can still see one.
  const planted = code(raw.replace(/^(\s*)if: github\.ref.*$/m, "$1if: startsWith(github.ref, 'x')"));
  assert.ok(M.startsWith.test(planted), "comment stripping swallowed an executable startsWith");

  // The steps are still there — the stripper did not eat the file.
  assert.match(stripped, /^jobs:$/m);
  assert.match(stripped, /actions\/deploy-pages@/);
});

test("docs.yml: the Pages deploy lets an in-flight deployment finish", async () => {
  const yml = code(await read(DOCS));

  // Control: the same matcher does find `true` when `true` is what is written.
  const mutated = yml.replace("cancel-in-progress: false", "cancel-in-progress: true");
  assert.ok(M.cancelTrue.test(mutated), "control failed: the cancel-in-progress matcher is dead");
  assert.ok(!M.cancelFalse.test(mutated), "control failed: the false-form matcher accepted true");

  assert.ok(
    M.cancelFalse.test(yml),
    "docs.yml's top-level concurrency block must set cancel-in-progress: false " +
      "(deliberate deviation from proposal §10.2 — see the comment there)",
  );
  assert.ok(!M.cancelTrue.test(yml), "docs.yml sets cancel-in-progress: true somewhere");
});

test("docs.yml: the main-only guard is a ref EQUALITY test, not startsWith", async () => {
  const yml = code(await read(DOCS));

  // Controls, both directions: the equality matcher must reject the
  // `startsWith` form, and the `startsWith` matcher must find it.
  const mutated = yml.replace(
    "if: github.ref == 'refs/heads/main'",
    "if: startsWith(github.ref, 'refs/heads/main')",
  );
  assert.ok(M.startsWith.test(mutated), "control failed: the startsWith matcher is dead");
  assert.ok(!M.refEquality.test(mutated), "control failed: the equality matcher accepted startsWith");

  assert.ok(M.refEquality.test(yml), "docs.yml has no `if: github.ref == 'refs/heads/main'` guard");
  assert.ok(
    !M.startsWith.test(yml),
    "docs.yml uses startsWith() — it admits refs/heads/main-anything, which deploys a branch",
  );
});

test("neither workflow is triggered by a tag", async () => {
  for (const [name, path] of [["docs.yml", DOCS], ["site-ci.yml", SITE_CI]]) {
    const yml = code(await read(path));
    // Control, planted uniformly in both files rather than at a string only one
    // of them contains: a fallback like "…or the file has no branches: line"
    // lets the control pass for the file it was never exercised on.
    const mutated = yml.replace(/^on:$/m, "on:\n  push:\n    tags: ['v*']");
    assert.notEqual(mutated, yml, `control failed: ${name} has no top-level on: block to plant into`);
    assert.ok(M.tagTrigger.test(mutated), `control failed: the tag-trigger matcher is dead for ${name}`);
    assert.ok(!M.tagTrigger.test(yml), `${name} carries a tag trigger; the github-pages environment rejects v* refs`);
  }
});

test("docs.yml: the deploy path runs the suite, before it deploys", async () => {
  const yml = code(await read(DOCS));
  const test_ = yml.indexOf("run: npm test");
  const configure = yml.indexOf("actions/configure-pages@");
  const deploy = yml.indexOf("actions/deploy-pages@");
  assert.ok(test_ > -1, "docs.yml never runs `npm test` — it deploys untested bytes");
  assert.ok(configure > -1 && deploy > -1, "docs.yml does not deploy at all");
  assert.ok(test_ < configure, "`npm test` runs after Configure Pages");
  assert.ok(test_ < deploy, "`npm test` runs after the deploy");
  assert.ok(!M.continueOnError.test(yml), "docs.yml carries continue-on-error: a gate that cannot fail");
});

test("site-ci.yml cannot deploy", async () => {
  const ci = code(await read(SITE_CI));
  const docs = code(await read(DOCS));

  // Positive control from a REAL file rather than a synthetic one: docs.yml
  // does deploy, so both matchers must fire on it.
  assert.ok(M.pagesPermission.test(docs), "control failed: the pages-permission matcher is dead");
  assert.ok(M.deployAction.test(docs), "control failed: the deploy-action matcher is dead");

  assert.ok(!M.pagesPermission.test(ci), "site-ci.yml grants pages: write");
  assert.ok(!M.deployAction.test(ci), "site-ci.yml uses a Pages deployment action");
  assert.match(ci, /^permissions:\n[ \t]+contents:[ \t]*read[ \t]*$/m);
});

test("both workflows install and test the site the way the site is laid out", async () => {
  const pkg = JSON.parse(await read(join(siteRoot, "package.json")));
  const floor = pkg.engines.node;
  assert.match(floor, /^>=22\./, `site engines.node is ${floor}; the workflows pin node-version 22`);

  for (const [name, path] of [["docs.yml", DOCS], ["site-ci.yml", SITE_CI]]) {
    const yml = code(await read(path));
    assert.match(yml, /node-version:[ \t]*'22'/, `${name} does not pin node-version 22`);
    assert.match(
      yml,
      /cache-dependency-path:[ \t]*site\/package-lock\.json/,
      `${name} does not scope the npm cache to site/ — site/ is a self-contained project, not a workspace`,
    );
    assert.match(yml, /working-directory:[ \t]*site/, `${name} does not run in site/`);
  }
});
