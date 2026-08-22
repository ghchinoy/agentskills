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
// AND THE SET IS EXTRACTED BY PARSING, NOT BY REGEX — THIS IS THE ROUND-5 FIX.
// A whitelist is only as honest as the extractor that feeds it. Set-equality
// over a REGEX-extracted set proves nothing about a value the regex could not
// see: an unseen value leaves the extracted set UNCHANGED, so equality still
// holds and the row stays green. That seam was measured open in two places at
// once — a `uses:` behind a trailing `# comment` (invisible to an end-anchored
// regex) and a JOB-level `permissions:` block (invisible to a column-0 regex) —
// which together put a YAML-valid, capability-real Pages deploy into site-ci.yml
// with the whole suite green. Two holes found from sixteen plants is a POPULATED
// class, not two members: quoting (`pages: 'write'`), flow style (`- {uses:
// X}`), indentation and comments are each a spelling a regex extractor must be
// taught one at a time and a parser already knows. So the extractors below PARSE
// the workflow with js-yaml — the parser GitHub Actions itself uses — and read
// `uses:`, `run:`, `permissions:` and the trigger set off the resulting object,
// across EVERY job. A grant nested under `jobs.<id>.permissions`, a quoted
// scalar, a commented action, a flow-mapping step: the parser sees each the way
// GitHub does, so the pinned-set claim becomes a claim about what GitHub would
// RUN rather than about what one regex happened to match. A file the parser
// cannot read at all returns null, and null is FIRING for the same reason a
// missing block is — a workflow the gate cannot understand is not one it passes.
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
import { createRequire } from "node:module";
import { read, repoRoot, siteRoot } from "./_helpers.mjs";

// js-yaml is resolved from the site's own node_modules — the same dependency the
// re-cert's G4 guard used to prove these plants were real deploys and not merely
// strings in a file. It is the parser GitHub Actions itself reads these
// workflows with, so it is the instrument that answers the question every "and
// NOTHING else" claim below is actually about: what would GitHub RUN?
const jsyaml = createRequire(import.meta.url)("js-yaml");

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
 * Parse a workflow's executable YAML into the object GitHub would run, or null
 * when it cannot be parsed at all.
 *
 * Every set-based claim below is ABOUT a property of the parsed workflow — which
 * actions run, which commands run, which permissions are granted, what triggers
 * it — and NOT about the byte string. A regex over the text cannot see a value
 * behind a trailing `# comment`, a scalar in `'quotes'`, a step written in flow
 * style (`- {uses: X}`), or a grant nested under `jobs.<id>.permissions`; the
 * parser sees all four the way GitHub does. Null is a real answer, not an error:
 * a workflow the gate cannot understand is not a workflow it may pass, so every
 * caller treats null as FIRING, exactly as they treat a missing block.
 */
function parseWorkflow(yaml) {
  try {
    const doc = jsyaml.load(yaml);
    return doc && typeof doc === "object" ? doc : null;
  } catch {
    return null;
  }
}

/** Every job in the workflow, as an array (empty when there are none). */
function jobsOf(doc) {
  return doc && doc.jobs && typeof doc.jobs === "object" ? Object.values(doc.jobs) : [];
}

/** Every step across every job — the extraction is file-wide, so a deploy in a
 *  SECOND job is as visible as one in the first. */
function stepsOf(doc) {
  return jobsOf(doc).flatMap((j) => (j && Array.isArray(j.steps) ? j.steps : []));
}

/**
 * The trigger keys — the events this workflow runs on. `on:` may be a mapping
 * (`{push: …}`), a bare string (`on: push`) or a sequence (`on: [push, …]`);
 * all three are the same statement to GitHub and are normalised to a key list
 * here. `branches:` and `paths:` are how a trigger is configured, not triggers
 * themselves, so they never appear — they are nested under a trigger, not
 * alongside one, in the parsed object. Null (no `on:` at all) FIRES.
 */
export function triggerKeys(yaml) {
  const doc = parseWorkflow(yaml);
  if (doc === null) return null;
  const on = doc.on;
  if (on === null || on === undefined) return null;
  if (typeof on === "string") return [on];
  if (Array.isArray(on)) return on.map(String);
  if (typeof on === "object") return Object.keys(on);
  return null;
}

/**
 * `permissions:` as normalised `key: value` strings, gathered from the
 * workflow-level block AND from EVERY job-level block.
 *
 * A job-level `permissions:` block is the grant actually in force for that job,
 * and it is where a Pages deployment hides from a workflow-level check: the
 * old column-0 extractor could not see it at all. The claim "site-ci.yml holds
 * exactly contents: read" is false the moment ANY job grants more, wherever the
 * grant is written, so the extraction is over the whole document. Quoting and
 * spacing are gone for free — the parser has already turned `pages: 'write'`,
 * `pages:   write` and `pages: write` into the one value they are to GitHub.
 *
 * The `write-all` / `read-all` shorthand is a bare string, not a mapping; it is
 * kept as its own entry so it can never equal `contents: read`. Null (no
 * permissions block anywhere) FIRES, for the same reason the old extractor's
 * null did: an absent restriction is not a restriction.
 */
export function permissionEntries(yaml) {
  const doc = parseWorkflow(yaml);
  if (doc === null) return null;
  const blocks = [];
  if (doc && typeof doc === "object" && "permissions" in doc) blocks.push(doc.permissions);
  for (const job of jobsOf(doc)) {
    if (job && typeof job === "object" && "permissions" in job) blocks.push(job.permissions);
  }
  if (blocks.length === 0) return null;
  const entries = new Set();
  for (const block of blocks) {
    if (block === null || block === undefined) continue; // an empty `permissions:` grants nothing
    if (typeof block === "string") {
      entries.add(block); // `write-all` / `read-all` — never equals contents: read
    } else if (typeof block === "object") {
      for (const [k, v] of Object.entries(block)) entries.add(`${k}: ${v}`);
    }
  }
  return [...entries];
}

/**
 * Every `uses:` value in the file — the actions this workflow can run, across
 * ALL jobs and steps. Parsed rather than matched, so a trailing comment, a
 * quoted value or a flow-style step (`- {uses: X}`) cannot hide an action from
 * the pin. Null (an unparseable file) FIRES.
 */
export function usesValues(yaml) {
  const doc = parseWorkflow(yaml);
  if (doc === null) return null;
  return stepsOf(doc)
    .filter((s) => s && typeof s.uses === "string")
    .map((s) => s.uses);
}

/**
 * Every `run:` value in the file — the shell this workflow can run, across all
 * jobs and steps. A block scalar (`run: |`) parses to its whole multi-line
 * script, which is on no pinned list and so fires: a multi-line script is
 * exactly where a deploy command would hide, and it should have to be re-pinned
 * deliberately rather than admitted silently. Null (an unparseable file) FIRES.
 */
export function runValues(yaml) {
  const doc = parseWorkflow(yaml);
  if (doc === null) return null;
  return stepsOf(doc)
    .filter((s) => s && typeof s.run === "string")
    .map((s) => s.run);
}

/**
 * Every place `continue-on-error` is switched ON, at JOB or STEP level, across
 * the whole file — an empty list means the workflow cannot silently swallow a
 * failure.
 *
 * `continue-on-error: true` on a gate step is a "gate that cannot fail": the
 * step runs, fails, and the job goes green anyway. It was asserted absent for
 * docs.yml and NOWHERE for site-ci.yml — yet site-ci.yml IS the pull-request
 * gate, so the same line on its `npm test` step turns the whole guardrail suite
 * into decoration with the check still reporting success. This reads it off the
 * parsed object, so quoting (`'true'`), flow style and a job-level grant are all
 * covered, and a value of literal `false` (the safe, explicit default) is not a
 * grant. Null (an unparseable file) FIRES.
 */
export function continueOnErrorGrants(yaml) {
  const doc = parseWorkflow(yaml);
  if (doc === null) return null;
  const on = (v) => v !== undefined && v !== false && v !== "false";
  const grants = [];
  for (const [name, job] of Object.entries(
    doc.jobs && typeof doc.jobs === "object" ? doc.jobs : {},
  )) {
    if (job && typeof job === "object" && "continue-on-error" in job && on(job["continue-on-error"])) {
      grants.push(`job ${name}`);
    }
    const steps = job && Array.isArray(job.steps) ? job.steps : [];
    steps.forEach((step, i) => {
      if (step && typeof step === "object" && "continue-on-error" in step && on(step["continue-on-error"])) {
        grants.push(`${name}[${i}]${step.name ? ` ${step.name}` : ""}`);
      }
    });
  }
  return grants;
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
  // "and NOTHING may swallow a failure" — the empty set. Pinned for BOTH files
  // rather than docs.yml alone, which is the asymmetry a fix-4-era gate carried:
  // continue-on-error was forbidden on the deploy path and left unmentioned on
  // the pull-request gate that is the whole point of site-ci.yml.
  docsContinueOnError: { allowed: [] },
  ciContinueOnError: { allowed: [] },
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
  // FIX-2, now PARSE-BASED and pinned as an empty set. This absence assertion
  // first stood alone; then it was a substring matcher a trailing comment could
  // false-fire and that could not tell `true` from `false`. It now reads
  // `continue-on-error` off the parsed workflow, at job AND step level, and
  // requires the set of ON grants to be empty. Plant it on the `npm test`
  // step — the one place that would turn the deploy gate into decoration — and
  // require the EXTRACTOR to see it.
  //
  // `run: npm test` occurs EXACTLY ONCE in docs.yml and not in any comment, so
  // this replace cannot land in prose; `planted()` checks that rather than
  // trusting it.
  const decorated = yml.replace("run: npm test", "run: npm test\n        continue-on-error: true");
  planted(decorated, "continue-on-error: true", "docs.yml, stripped");
  fires(
    "docsContinueOnError",
    continueOnErrorGrants(decorated),
    "control failed: the continue-on-error extractor does not see a decorated step",
  );

  confinedTo(
    "docsContinueOnError",
    continueOnErrorGrants(yml),
    "docs.yml carries continue-on-error somewhere: a step that fails but is reported green",
  );
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

  // AND IT CANNOT BE TURNED INTO DECORATION. The continue-on-error claim was
  // enforced for docs.yml's deploy path and NOWHERE for site-ci.yml — yet
  // site-ci.yml IS the pull-request gate, so `continue-on-error: true` on its
  // guardrail-suite step lets `npm test` fail while the check still reports
  // success. That asymmetry was the exposure; the same empty-set claim is
  // enforced here too, parse-based so a quoted or job-level grant is caught.

  // CONTROL, step level: decorate the `npm test` step and require the extractor
  // to see it. `run: npm test` occurs exactly once in site-ci.yml and not in a
  // comment, so the plant cannot land in prose; `planted()` checks that.
  const decorated = planted(
    ci.replace("run: npm test", "run: npm test\n        continue-on-error: true"),
    "continue-on-error: true",
    "site-ci.yml, stripped",
  );
  fires(
    "ciContinueOnError",
    continueOnErrorGrants(decorated),
    "control failed: the continue-on-error extractor does not see the decorated gate step",
  );

  // CONTROL, job level: the same hazard one scope up. A parser sees it; a
  // step-only check would not.
  const jobDecorated = planted(
    ci.replace(/^(  build-test:\n)/m, "$1    continue-on-error: true\n"),
    "continue-on-error: true",
    "site-ci.yml, stripped",
  );
  fires(
    "ciContinueOnError",
    continueOnErrorGrants(jobDecorated),
    "control failed: the continue-on-error extractor does not see a job-level grant",
  );

  confinedTo(
    "ciContinueOnError",
    continueOnErrorGrants(ci),
    "site-ci.yml carries continue-on-error: its pull-request gate would report success on a failed step",
  );
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
  const on = triggerKeys(yml);
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
      triggerKeys(planted_),
      `control failed: the trigger pin does not see a \`${needle}\` trigger`,
    );
  }

  confinedTo(
    "docsTriggers",
    on,
    "docs.yml's trigger list is not exactly [push, workflow_dispatch]. The header explains " +
      "why this deploy is not tag- or release-triggered: the `github-pages` environment " +
      "rejects `v*` refs, so such a deploy fires at release time and dies at the gate",
  );
});

test("site-ci.yml is triggered by pull_request and by NOTHING else", async () => {
  const yml = code(await read(SITE_CI));
  const on = triggerKeys(yml);
  assert.ok(on !== null, "site-ci.yml has no top-level `on:` block");

  const planted_ = planted(
    yml.replace(/^on:$/m, "on:\n  push:\n    branches: [main]"),
    "push:",
    "site-ci.yml, stripped",
  );
  fires(
    "ciTriggers",
    triggerKeys(planted_),
    "control failed: the trigger pin does not see an added `push:` trigger",
  );

  confinedTo(
    "ciTriggers",
    on,
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
