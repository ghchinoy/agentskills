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
//   * site-ci.yml's `pull_request:` trigger carries NO base-branch filter —
//     neither `branches:` nor `branches-ignore:`. A pull request into a working
//     branch must be gated too, so a later phase "tidying" the trigger by
//     adding `branches: [main]` would silently stop gating exactly the pull
//     requests this phase is made of. The comment at the deviation site says
//     so; this file is what makes that comment load-bearing.
//
// Every absence assertion below is paired with a POSITIVE CONTROL that runs the
// same matcher over text which does contain the forbidden thing. "No
// `startsWith` in this file" and "my regex does not match anything" have the
// same evidence signature otherwise.
//
// THAT ROW USED TO BE FALSE, AND NOTHING NOTICED. `continue-on-error` was
// asserted absent with no positive control at all: the matcher could have been
// deleted, or misspelled, and the suite would have reported 7 passed / 0
// failed. A row that describes the file is worth only as much as the mechanism
// that keeps it true, so the pairing is now MECHANICAL. Absence and presence
// assertions go through `absent()` and `present()`, which record which matcher
// was exercised in which direction, and the last test in this file fails —
// naming the matcher — if any matcher is ever asserted absent without also
// being proved alive. Adding an unpaired absence assertion is now a test
// failure rather than a quietly false sentence.
//
// AND THE PLANT ITSELF IS THE UNEXAMINED PREMISE. A positive control that
// string-replaces into the RAW file can land in a prose comment — `docs.yml`
// names `cancel-in-progress: false` at line 53 in prose before setting it at
// line 65 — whereupon the stripper removes the plant, the gate is correctly
// green, and the green is read as a hole in a gate that was never broken.
// Every plant below therefore goes into the STRIPPED text, and `planted()`
// asserts the plant is present in the artefact the matcher actually reads.

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
  // FIX-3 (S8): a base-branch filter on a trigger, in either spelling.
  branchFilter: /^[ \t]+branches(-ignore)?:/m,
};

// Which matchers were asserted ABSENT, and which were proved ALIVE. Recorded as
// the assertions run; adjudicated by the last test in this file.
const EXERCISED = { absent: new Set(), present: new Set() };

/** Assert a matcher does NOT fire, and record that it was used this way. */
function absent(key, text, message) {
  EXERCISED.absent.add(key);
  assert.ok(!M[key].test(text), message);
}

/** Assert a matcher DOES fire — the positive control — and record it. */
function present(key, text, message) {
  EXERCISED.present.add(key);
  assert.ok(M[key].test(text), message);
}

/**
 * Prove a plant is visible in the artefact the matcher will read, BEFORE
 * concluding anything from the matcher's answer.
 *
 * A plant that never landed and a property that genuinely holds produce the
 * identical observation. This is the only thing separating them, and it must
 * run against the post-processing text — the stripped YAML, the extracted
 * block — never against the file on disk.
 */
function planted(artefact, needle, what) {
  assert.ok(
    artefact.includes(needle),
    `control failed: the plant ${JSON.stringify(needle)} is NOT in the text the matcher ` +
      `reads (${what}). Whatever this control reports next is about an absent plant, not ` +
      `about the gate.`,
  );
  return artefact;
}

/**
 * The `on:` trigger block, which is the artefact the S8 claim is ABOUT. A
 * `branches:` key elsewhere in the file is a different statement, so the claim
 * is evaluated over the block and not over the whole file.
 */
export function onBlock(yaml) {
  const m = /^on:\n((?:[ \t].*\n|\n)*)/m.exec(yaml);
  return m ? m[1] : null;
}

test("control: comment stripping keeps the executable YAML and only that", async () => {
  const raw = await read(DOCS);
  const stripped = code(raw);

  // It removes what it is supposed to remove: the raw file DOES name both
  // forbidden forms in prose, and the stripped file does not.
  present("startsWith", raw, "docs.yml no longer explains why startsWith is forbidden");
  absent("startsWith", stripped, "comment stripping left a commented startsWith behind");

  // And it does not remove what it must not: a forbidden form in EXECUTABLE
  // position survives the stripper, so the tests below can still see one.
  const plantedYaml = code(raw.replace(/^(\s*)if: github\.ref.*$/m, "$1if: startsWith(github.ref, 'x')"));
  present("startsWith", plantedYaml, "comment stripping swallowed an executable startsWith");

  // The steps are still there — the stripper did not eat the file.
  assert.match(stripped, /^jobs:$/m);
  assert.match(stripped, /actions\/deploy-pages@/);
});

test("docs.yml: the Pages deploy lets an in-flight deployment finish", async () => {
  const yml = code(await read(DOCS));

  // Control: the same matcher does find `true` when `true` is what is written.
  const mutated = yml.replace("cancel-in-progress: false", "cancel-in-progress: true");
  planted(mutated, "cancel-in-progress: true", "docs.yml, stripped");
  present("cancelTrue", mutated, "control failed: the cancel-in-progress matcher is dead");
  absent("cancelFalse", mutated, "control failed: the false-form matcher accepted true");

  present(
    "cancelFalse",
    yml,
    "docs.yml's top-level concurrency block must set cancel-in-progress: false " +
      "(deliberate deviation from proposal §10.2 — see the comment there)",
  );
  absent("cancelTrue", yml, "docs.yml sets cancel-in-progress: true somewhere");
});

test("docs.yml: the main-only guard is a ref EQUALITY test, not startsWith", async () => {
  const yml = code(await read(DOCS));

  // Controls, both directions: the equality matcher must reject the
  // `startsWith` form, and the `startsWith` matcher must find it.
  const mutated = yml.replace(
    "if: github.ref == 'refs/heads/main'",
    "if: startsWith(github.ref, 'refs/heads/main')",
  );
  planted(mutated, "startsWith(github.ref", "docs.yml, stripped");
  present("startsWith", mutated, "control failed: the startsWith matcher is dead");
  absent("refEquality", mutated, "control failed: the equality matcher accepted startsWith");

  present("refEquality", yml, "docs.yml has no `if: github.ref == 'refs/heads/main'` guard");
  absent(
    "startsWith",
    yml,
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
    planted(mutated, "tags: ['v*']", `${name}, stripped`);
    present("tagTrigger", mutated, `control failed: the tag-trigger matcher is dead for ${name}`);
    absent("tagTrigger", yml, `${name} carries a tag trigger; the github-pages environment rejects v* refs`);
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
  // FIX-2. This absence assertion stood alone: `continue-on-error` appears
  // nowhere in docs.yml, so the matcher returning false proved nothing about
  // the matcher. Plant it on the `npm test` step — the one place that would
  // actually turn the deploy gate into decoration — and require it to be seen.
  //
  // `run: npm test` occurs EXACTLY ONCE in docs.yml and not in any comment, so
  // this replace cannot land in prose; `planted()` checks that rather than
  // trusting it.
  const decorated = yml.replace("run: npm test", "run: npm test\n        continue-on-error: true");
  planted(decorated, "continue-on-error: true", "docs.yml, stripped");
  present("continueOnError", decorated, "control failed: the continue-on-error matcher is dead");

  absent("continueOnError", yml, "docs.yml carries continue-on-error: a gate that cannot fail");
});

test("site-ci.yml cannot deploy", async () => {
  const ci = code(await read(SITE_CI));
  const docs = code(await read(DOCS));

  // Positive control from a REAL file rather than a synthetic one: docs.yml
  // does deploy, so both matchers must fire on it.
  present("pagesPermission", docs, "control failed: the pages-permission matcher is dead");
  present("deployAction", docs, "control failed: the deploy-action matcher is dead");

  absent("pagesPermission", ci, "site-ci.yml grants pages: write");
  absent("deployAction", ci, "site-ci.yml uses a Pages deployment action");
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

test("site-ci.yml gates a pull request into ANY base branch", async () => {
  // FIX-3 (S8). The claim was written at the deviation site and registered
  // nowhere: site-ci.yml's `pull_request:` trigger deliberately carries no
  // base-branch filter, so a pull request into a working branch is gated too.
  // The behaviour is correct and is not being changed — what was missing is the
  // row that stops a later phase "tidying" it into `branches: [main]`, which
  // would silently stop gating exactly the pull requests this phase is made of.
  const ci = code(await read(SITE_CI));
  const on = onBlock(ci);

  // VACUITY. An absence asserted over a block that does not exist is not an
  // absence, it is a typo. Both halves must be real before the claim means
  // anything: the block, and the trigger the claim is about.
  assert.ok(on !== null, "site-ci.yml has no top-level `on:` block — the S8 claim has no subject");
  assert.match(on, /^[ \t]+pull_request:/m, "site-ci.yml has no `pull_request:` trigger to be unfiltered");

  // POSITIVE CONTROLS, one per spelling, because `branches:` and
  // `branches-ignore:` are different keys and a matcher for one is not
  // evidence about the other. Both are planted into the EXTRACTED BLOCK —
  // the artefact the assertion reads — and checked for having landed.
  for (const key of ["branches", "branches-ignore"]) {
    const filtered = on.replace(/^([ \t]+)pull_request:$/m, `$1pull_request:\n$1  ${key}: [main]`);
    planted(filtered, `${key}: [main]`, "site-ci.yml, on: block");
    present("branchFilter", filtered, `control failed: the branch-filter matcher does not see \`${key}:\``);
  }

  // The message names the filter it found. `branches:` and `branches-ignore:`
  // are different defects, and a shared message would make the two
  // indistinguishable in a seeded-failure run — which is the same
  // unattributable-control problem this round is fixing elsewhere.
  const filter = M.branchFilter.exec(on);
  absent(
    "branchFilter",
    on,
    `site-ci.yml's pull_request trigger is filtered by base branch — it carries ` +
      `${JSON.stringify((filter?.[0] ?? "").trim())}. That is a DELIBERATE absence (see the ` +
      `comment at the trigger): a pull request into a working branch must be gated too, and ` +
      `a base-branch filter stops gating them silently.`,
  );
});

test("the register's pairing row is true: no absence assertion stands alone", () => {
  // FIX-2, the durable half. The row above claims every absence assertion is
  // paired with a positive control. It was FALSE — `continue-on-error` had
  // none — and the suite reported 7 passed / 0 failed, because an unpaired
  // absence assertion and a dead matcher are the same observation.
  //
  // This adjudicates the row mechanically, so the next unpaired assertion is a
  // failure rather than a quietly false sentence. It must run last; node's test
  // runner executes a file's tests in source order.
  assert.ok(EXERCISED.absent.size > 0, "no absence assertions ran at all — this adjudicator is vacuous");

  const unpaired = [...EXERCISED.absent].filter((k) => !EXERCISED.present.has(k)).sort();
  assert.deepEqual(
    unpaired,
    [],
    `these matchers are asserted ABSENT with no positive control anywhere in this file: ` +
      `${unpaired.join(", ")}. A dead matcher and a genuine absence produce the same green, ` +
      `so each of these assertions currently proves nothing. Add a control that runs the same ` +
      `matcher over text which does contain the forbidden thing.`,
  );

  // The register row names matchers as the unit of pairing, so every matcher in
  // the table must be exercised at all — one that is never used is a claim the
  // file appears to make and does not.
  const unused = Object.keys(M)
    .filter((k) => !EXERCISED.absent.has(k) && !EXERCISED.present.has(k))
    .sort();
  assert.deepEqual(unused, [], `matchers defined but never exercised: ${unused.join(", ")}`);
});
