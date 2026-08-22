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
//   * docs.yml is triggered by `push` and `workflow_dispatch` and by NOTHING
//     ELSE — in particular not `release:` and not `create:`.
//   * site-ci.yml is triggered by `pull_request` and by NOTHING ELSE.
//   * site-ci.yml holds EXACTLY the permission `contents: read` and no other,
//     in any spelling.
//   * site-ci.yml uses EXACTLY `actions/checkout` and `actions/setup-node`, and
//     runs EXACTLY `npm ci`, `npm run build` and `npm test` — so it cannot
//     deploy by any action or any shell command, named or unnamed.
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
// AND FOUR OF THOSE ROWS SAY "NOTHING ELSE", WHICH A MATCHER CANNOT SAY. The
// rows above about `startsWith` and `cancel-in-progress: true` name ONE
// forbidden form each, and a regex is the right instrument for them. The four
// rows added last are different in kind: site-ci.yml's comment claims "the
// absence of EVERY Pages deployment action", and docs.yml's claims the trigger
// is "not a tag or release trigger". A blacklist cannot enforce "every" — it
// enforces "every one I thought of", and it was measured failing exactly there:
// `peaceiris/actions-gh-pages`, `JamesIves/github-pages-deploy-action` and
// `run: npx gh-pages -d dist` all deployed straight past a matcher that names
// the three `actions/*` Pages actions, and `pages: 'write'` walked past a
// matcher for `pages: write` because YAML lets you quote a scalar.
//
// So those four rows are enforced as WHITELISTS instead: the set of triggers,
// of permissions, of `uses:` and of `run:` must EQUAL a pinned set. An unknown
// deploy action is not on the list and fires without anyone having named it.
// The cost is deliberate and is the point — adding a legitimate step to
// site-ci.yml now requires editing the pinned set in this file, which is what
// makes the set a decision rather than a description.
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
 * The body of a top-level `key:` BLOCK, or null when there is no such block.
 *
 * Null is a real answer and not an error: `permissions: write-all` is a
 * top-level `permissions` with no block at all, and a caller that treats null
 * as "nothing to check" would pass the single broadest permission grant GitHub
 * offers. Every caller below treats null as FIRING.
 */
export function topBlock(yaml, key) {
  const m = new RegExp(`^${key}:\\n((?:[ \\t].*\\n|\\n)*)`, "m").exec(yaml);
  return m ? m[1] : null;
}

/**
 * The `on:` trigger block, which is the artefact the S8 claim is ABOUT. A
 * `branches:` key elsewhere in the file is a different statement, so the claim
 * is evaluated over the block and not over the whole file.
 */
export function onBlock(yaml) {
  return topBlock(yaml, "on");
}

/**
 * The keys of a block at the block's OWN indent. `branches:` and `paths:` are
 * how a trigger is configured, not triggers themselves, so only the shallowest
 * level counts. The indent is measured rather than assumed, so re-indenting a
 * file does not silently empty the set.
 */
export function blockKeys(body) {
  if (body === null) return null;
  const lines = body.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const base = Math.min(...lines.map((l) => /^[ \t]*/.exec(l)[0].length));
  return lines
    .filter((l) => /^[ \t]*/.exec(l)[0].length === base)
    .map((l) => /^[ \t]*([\w-]+):/.exec(l))
    .filter(Boolean)
    .map((m) => m[1]);
}

/**
 * `permissions:` as normalised `key: value` strings. Quotes and run-together
 * spacing are removed, because `pages: write`, `pages:   write` and
 * `pages: 'write'` are the same grant to GitHub and differ only to a regex.
 */
export function permissionEntries(yaml) {
  const body = topBlock(yaml, "permissions");
  if (body === null) return null;
  return body
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const m = /^[ \t]*([\w-]+):[ \t]*(.*?)[ \t]*$/.exec(l);
      return m ? `${m[1]}: ${m[2].replace(/^['"]|['"]$/g, "")}` : l.trim();
    });
}

/** Every `uses:` value in the file — the actions this workflow can run. */
export function usesValues(yaml) {
  return [...yaml.matchAll(/^[ \t]*-?[ \t]*uses:[ \t]*(\S+)[ \t]*$/gm)].map((m) => m[1]);
}

/**
 * Every `run:` value in the file — the shell this workflow can run. A block
 * scalar (`run: |`) yields `"|"`, which is not on any pinned list and so fires:
 * a multi-line script is exactly where a deploy command would hide, and it
 * should have to be re-pinned deliberately rather than admitted silently.
 */
export function runValues(yaml) {
  return [...yaml.matchAll(/^[ \t]*-?[ \t]*run:[ \t]*(.+?)[ \t]*$/gm)].map((m) => m[1]);
}

/**
 * The whitelist rows. Each is an absence claim of the form "and NOTHING else",
 * enforced as set EQUALITY against a pinned set.
 *
 * Equality, not subset, is also the vacuity guard: an extractor that silently
 * returns nothing fails against a non-empty pinned set, so a broken extractor
 * shows up as RED rather than as a permanent, meaningless green.
 */
const SETS = {
  docsTriggers: { allowed: ["push", "workflow_dispatch"] },
  ciTriggers: { allowed: ["pull_request"] },
  ciPermissions: { allowed: ["contents: read"] },
  ciUses: { allowed: ["actions/checkout@v4", "actions/setup-node@v4"] },
  ciRun: { allowed: ["npm ci", "npm run build", "npm test"] },
};

const sorted = (xs) => [...xs].sort();
const matchesPin = (key, found) =>
  found !== null &&
  JSON.stringify(sorted(found)) === JSON.stringify(sorted(SETS[key].allowed));

/** Assert an extracted set is EXACTLY the pinned set, and record the use. */
function confinedTo(key, found, message) {
  EXERCISED.absent.add(key);
  assert.ok(found !== null, `${message} (the block the claim is about is not there at all)`);
  assert.deepEqual(sorted(found), sorted(SETS[key].allowed), message);
}

/**
 * The positive control: over text that DOES contain the forbidden thing, the
 * same extractor and the same pinned set must FIRE. Null counts as firing,
 * which is what makes `permissions: write-all` a caught defect.
 */
function fires(key, found, message) {
  EXERCISED.present.add(key);
  assert.ok(!matchesPin(key, found), message);
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

test("docs.yml is triggered by push and workflow_dispatch and by NOTHING else", async () => {
  // S1. docs.yml's header says "Do not 'improve' this into a tag or release
  // trigger", and `tagTrigger` enforces only the `tags:` half. `release:` and
  // `create:` were both planted and both deployed green. The claim is a
  // "nothing else", so the trigger SET is what gets pinned.
  const yml = code(await read(DOCS));
  const on = onBlock(yml);
  assert.ok(on !== null, "docs.yml has no top-level `on:` block — the S1 claim has no subject");

  // POSITIVE CONTROLS, one per trigger the header names, planted into the
  // STRIPPED text and checked for having landed.
  for (const [needle, block] of [
    ["release:", "  release:\n    types: [published]"],
    ["create:", "  create: {}"],
  ]) {
    const planted_ = planted(yml.replace(/^on:$/m, `on:\n${block}`), needle, "docs.yml, stripped");
    fires(
      "docsTriggers",
      blockKeys(onBlock(planted_)),
      `control failed: the trigger pin does not see a \`${needle}\` trigger`,
    );
  }

  confinedTo(
    "docsTriggers",
    blockKeys(on),
    "docs.yml's trigger list is not exactly [push, workflow_dispatch]. The header explains " +
      "why this deploy is not tag- or release-triggered: the `github-pages` environment " +
      "rejects `v*` refs, so such a deploy fires at release time and dies at the gate",
  );
});

test("site-ci.yml is triggered by pull_request and by NOTHING else", async () => {
  const yml = code(await read(SITE_CI));
  const on = onBlock(yml);
  assert.ok(on !== null, "site-ci.yml has no top-level `on:` block");

  const planted_ = planted(
    yml.replace(/^on:$/m, "on:\n  push:\n    branches: [main]"),
    "push:",
    "site-ci.yml, stripped",
  );
  fires(
    "ciTriggers",
    blockKeys(onBlock(planted_)),
    "control failed: the trigger pin does not see an added `push:` trigger",
  );

  confinedTo(
    "ciTriggers",
    blockKeys(on),
    "site-ci.yml's trigger list is not exactly [pull_request]. It is the pull-request gate " +
      "and it does not deploy; a second trigger here runs it somewhere its `paths:` filter " +
      "was never reasoned about",
  );
});

test("site-ci.yml holds exactly one permission, in any spelling", async () => {
  // R5, widened. `pagesPermission` matches the literal `pages: write`, and
  // `pages: 'write'` — the same grant, quoted — was measured walking straight
  // past it, as was `pages: read`. Pinning the permission SET closes every
  // spelling at once, including `permissions: write-all`, which removes the
  // `permissions:` block entirely and so has no key for a matcher to find.
  const ci = code(await read(SITE_CI));

  for (const [needle, line] of [
    ["pages: 'write'", "  pages: 'write'"],
    ["pages: read", "  pages: read"],
    ["pages:   write", "  pages:   write"],
  ]) {
    const planted_ = planted(
      ci.replace(/^(permissions:\n)/m, `$1${line}\n`),
      needle,
      "site-ci.yml, stripped",
    );
    fires(
      "ciPermissions",
      permissionEntries(planted_),
      `control failed: the permission pin does not see \`${needle}\``,
    );
  }

  // `write-all` is the null case: there is no block left to read.
  const wideOpen = planted(
    ci.replace(/^permissions:\n(?:[ \t]+.*\n)+/m, "permissions: write-all\n"),
    "permissions: write-all",
    "site-ci.yml, stripped",
  );
  assert.equal(
    topBlock(wideOpen, "permissions"),
    null,
    "control failed: `permissions: write-all` was expected to leave no permissions BLOCK",
  );
  fires(
    "ciPermissions",
    permissionEntries(wideOpen),
    "control failed: the permission pin accepted `permissions: write-all`",
  );

  confinedTo(
    "ciPermissions",
    permissionEntries(ci),
    "site-ci.yml grants a permission other than `contents: read`. It builds and tests and " +
      "does not deploy; any write grant here is what a Pages deployment would need",
  );
});

test("site-ci.yml runs exactly the actions and commands a build-and-test job needs", async () => {
  // S7. site-ci.yml's header claims "the absence of EVERY Pages deployment
  // action". `deployAction` names the three `actions/*` ones, so three
  // third-party deploys were measured landing green — two actions and one
  // plain shell command, which no `uses:` matcher can see at all. Pinning both
  // sets closes the class rather than the three instances.
  const ci = code(await read(SITE_CI));
  const STEP = /^([ \t]+)- name: Check out repository$/m;
  assert.match(ci, STEP, "site-ci.yml has no checkout step to plant a deploy in front of");

  for (const deploy of [
    "uses: peaceiris/actions-gh-pages@v3",
    "uses: JamesIves/github-pages-deploy-action@v4",
  ]) {
    const planted_ = planted(
      ci.replace(STEP, `$1- ${deploy}\n$1- name: Check out repository`),
      deploy,
      "site-ci.yml, stripped",
    );
    fires("ciUses", usesValues(planted_), `control failed: the action pin does not see \`${deploy}\``);
  }

  // The one that is not an action at all, and so is invisible to `uses:`.
  const shellDeploy = planted(
    ci.replace(STEP, "$1- run: npx gh-pages -d dist\n$1- name: Check out repository"),
    "run: npx gh-pages -d dist",
    "site-ci.yml, stripped",
  );
  fires(
    "ciRun",
    runValues(shellDeploy),
    "control failed: the command pin does not see a deploy run as a shell command",
  );

  confinedTo(
    "ciUses",
    usesValues(ci),
    "site-ci.yml uses an action other than checkout and setup-node. It must not be able to " +
      "deploy; deployment is docs.yml, on main",
  );
  confinedTo(
    "ciRun",
    runValues(ci),
    "site-ci.yml runs a command other than `npm ci`, `npm run build` and `npm test`. A deploy " +
      "does not need to be an action — `npx gh-pages -d dist` is a deploy",
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
  //
  // The whitelist rows in `SETS` are adjudicated by the same two checks and for
  // the same reason. A pinned set asserted over a file with no control is the
  // identical failure: an extractor that returns nothing and a file that is
  // genuinely clean produce the same green, and "and NOTHING else" is still an
  // absence claim however it is spelled.
  const unused = [...Object.keys(M), ...Object.keys(SETS)]
    .filter((k) => !EXERCISED.absent.has(k) && !EXERCISED.present.has(k))
    .sort();
  assert.deepEqual(unused, [], `matchers defined but never exercised: ${unused.join(", ")}`);

  // AND THE MIRROR, for the whitelist rows only. The check above catches an
  // absence assertion with no control. It does NOT catch the reverse — a row
  // that is declared in `SETS`, fully positively controlled, and never actually
  // asserted against the real file. That green is the same lie as R6's,
  // photographed from the other side: the register names the row, the controls
  // prove the extractor works, and nothing anywhere checks the shipped file.
  // Deleting one `confinedTo` call was measured leaving the suite at 55/55.
  //
  // This is asserted for `SETS` and not for `M` because every `SETS` row is an
  // absence claim by construction — "and NOTHING else" — whereas a matcher may
  // legitimately exist only to assert that something IS present.
  const unenforced = Object.keys(SETS)
    .filter((k) => !EXERCISED.absent.has(k))
    .sort();
  assert.deepEqual(
    unenforced,
    [],
    `these whitelist rows are declared and controlled but never asserted against the shipped ` +
      `file: ${unenforced.join(", ")}. The register claims them; nothing enforces them.`,
  );
});
