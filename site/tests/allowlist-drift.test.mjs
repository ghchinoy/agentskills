// allowlist-drift.test.mjs — proposal §7.1's drift gate, Phase 6 AC3.
//
// THE PREDICATE: every Markdown file the repository declares it publishes (via
// `.goreleaser.yaml`'s `archives.files`) is classified in
// site/scripts/prepare-content.mjs as either PUBLISHED or explicitly DEFERRED
// with a reason. A new `docs/*.md` is therefore in the candidate set, in
// neither table, and RED here until a human decides about it.
//
// THE FAILURE THIS EXISTS TO CATCH is a documentation file that ships to users
// in the release archive and silently never reaches the site, because nobody
// noticed it was added. The symptom of that failure is an absence, and an
// absence is what a test is worst at seeing — so the gate is built as a
// COMPARISON OF TWO ENUMERATIONS (what the repo declares it ships, versus what
// the site has decided about), never as a search for a missing thing.
//
// ── WHAT IS INDEPENDENT HERE, AND WHAT IS NOT ───────────────────────────────
//
// Independent of the module under test:
//   * the filesystem walk (this file uses `readdir(..., {recursive:true})`;
//     prepare-content.mjs uses its own recursive descent with a skip list),
//   * the set difference itself, implemented below and not imported,
//   * the positive controls, which are synthetic populations.
//
// NOT independent, stated rather than glossed: both this file and
// prepare-content.mjs read `archives.files` with a line-oriented matcher. They
// are two implementations of one approach, so their agreement is weak evidence
// about the parse. That is why the parse gets its own control instead: the
// pattern list is pinned against a hand transcription of `.goreleaser.yaml`,
// and each transcribed pattern is required to occur as a real list item in the
// raw file. A parser that returned the wrong list, or a `.goreleaser.yaml` that
// changed underneath the site, fails there — and it fails LOUDLY, because a
// change to the repo's declared published surface is exactly the event the
// site's allowlist is supposed to be derived from.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PAGES,
  DEFERRED,
  GORELEASER,
  classifyDrift,
  markdownSurface,
  parseArchiveFiles,
  inDeclaredSurface,
} from "../scripts/prepare-content.mjs";
import { repoRoot } from "./_helpers.mjs";

// The declared published surface, transcribed BY HAND from `.goreleaser.yaml`'s
// `archives.files` block. This is a control on the parser, derived from the
// declaration rather than from the code that reads it — not a second copy of a
// figure. If the repository changes what it ships, this fails and the site's
// allowlist gets re-derived deliberately instead of moving on its own.
const TRANSCRIBED_SURFACE = ["README.md", "LICENSE*", "docs/**/*", "skills/**/*"];

/** The set difference the gate is. Implemented here, not imported. */
function unclassifiedOf(surface, classified) {
  const known = new Set(classified);
  return surface.filter((f) => !known.has(f)).sort();
}

const CLASSIFIED = [...PAGES.map((p) => p.src), ...Object.keys(DEFERRED)];

test("control: the parser returns the surface the .goreleaser.yaml declares", async () => {
  const raw = await readFile(GORELEASER, "utf8");
  const patterns = parseArchiveFiles(raw);

  // Every transcribed pattern really is a list item in the file (the
  // transcription is faithful, not remembered). Plain line comparison — no
  // pattern matching, so this control cannot fail or pass for a reason to do
  // with a regex.
  const lines = raw.split("\n").map((l) => l.trim());
  for (const p of TRANSCRIBED_SURFACE) {
    assert.ok(
      lines.includes(`- ${p}`),
      `transcribed pattern ${JSON.stringify(p)} is not a list item in ${GORELEASER}`,
    );
  }

  assert.deepEqual(
    patterns,
    TRANSCRIBED_SURFACE,
    `archives.files parsed as ${JSON.stringify(patterns)} but .goreleaser.yaml ` +
      `declares ${JSON.stringify(TRANSCRIBED_SURFACE)}. If the repository ` +
      `deliberately changed what it ships, update the transcription AND ` +
      `re-derive the site's page classification from the new surface.`,
  );
});

test("control: the surface predicate admits and rejects the right kinds of path", () => {
  // Positive control first: without it, every "not in the surface" assertion
  // below would also pass against a predicate that is simply always false.
  for (const yes of ["docs/users_guide.md", "README.md", "skills/agentskills/SKILL.md", "docs/a/b/c.md"]) {
    assert.equal(
      inDeclaredSurface(yes, TRANSCRIBED_SURFACE),
      true,
      `${yes} SHOULD be inside the declared release-archive surface`,
    );
  }
  for (const no of [
    "AGENTS.md",
    "testdata/a2acli_GEMINI.md",
    ".agents/skills/beads/SKILL.md",
    ".beads/notes.md",
    "site/README.md",
    "docsx/other.md",
  ]) {
    assert.equal(
      inDeclaredSurface(no, TRANSCRIBED_SURFACE),
      false,
      `${no} should NOT be inside the declared release-archive surface`,
    );
  }
});

test("the candidate set is re-derivable by an independent walk", async () => {
  // This walk shares no code with prepare-content.mjs's. It prunes nothing by
  // directory name; it filters afterwards, and only for paths that cannot match
  // the surface anyway (site/ holds the site itself and its node_modules).
  const all = await readdir(repoRoot, { recursive: true, withFileTypes: true });
  const mine = all
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath ?? e.path, e.name).slice(repoRoot.length + 1).split("\\").join("/"))
    .filter((f) => !f.startsWith(".git/") && !f.startsWith("site/"))
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .filter((f) => inDeclaredSurface(f, TRANSCRIBED_SURFACE))
    .sort();

  const theirs = await markdownSurface();
  assert.deepEqual(
    theirs,
    mine,
    `the module's candidate set and this test's independent walk disagree.\n` +
      `  module: ${JSON.stringify(theirs)}\n  walk:   ${JSON.stringify(mine)}`,
  );
  // A candidate set of zero would make every assertion below vacuous.
  assert.ok(mine.length > 0, "the candidate set is empty — the gate would check nothing");
});

test("controls: the drift predicate produces a failure when there is drift", async () => {
  // Both arms run over SYNTHETIC populations, deliberately. An earlier draft
  // took the negative arm over the repository's real surface, which made this
  // control fail whenever real drift existed — so planting an unclassified doc
  // to demonstrate the gate turned two tests red and the demonstration could
  // not distinguish "the gate fired" from "the control broke". A control tests
  // the PREDICATE; the repository's current state is what the AC below tests.
  const planted = [...CLASSIFIED, "docs/brand-new-guide.md"].sort();
  assert.deepEqual(
    unclassifiedOf(planted, CLASSIFIED),
    ["docs/brand-new-guide.md"],
    "the drift predicate did not report a planted unclassified source",
  );

  // Negative arm: a population that is classified by construction is clean, so
  // the predicate is not simply always non-empty.
  assert.deepEqual(
    unclassifiedOf([...CLASSIFIED].sort(), CLASSIFIED),
    [],
    "the drift predicate reported drift in a population that is classified by construction",
  );

  // And the module's own decision agrees with this file's independent set
  // difference over the real surface — whatever that surface currently is.
  const surface = await markdownSurface();
  const { unclassified } = await classifyDrift();
  assert.deepEqual(unclassified, unclassifiedOf(surface, CLASSIFIED));
});

test("AC3: every Markdown file in the release archive is classified", async () => {
  const { surface, unclassified, stale } = await classifyDrift();

  assert.deepEqual(
    unclassified,
    [],
    `UNCLASSIFIED: ${unclassified.join(", ")}\n` +
      `Each is shipped to users by .goreleaser.yaml and the site has not ` +
      `decided about it. Add it to PAGES (publish) or to DEFERRED (with a ` +
      `reason) in site/scripts/prepare-content.mjs.`,
  );

  assert.deepEqual(
    stale,
    [],
    `CLASSIFIED BUT GONE: ${stale.join(", ")} — renamed, deleted, or dropped ` +
      `from .goreleaser.yaml while the site still names it.`,
  );

  // The verdict above ranges over the candidate set — the Markdown files
  // matched by .goreleaser.yaml's archives.files — and this pins that the two
  // tables between them account for exactly it, with nothing named twice. The
  // sizes are read from the tables at run time rather than written down here:
  // a hand-copied count is a copy that rots the next time a page is published.
  assert.equal(
    surface.length,
    PAGES.length + Object.keys(DEFERRED).length,
    `candidate set ${surface.length} != classified ${PAGES.length + Object.keys(DEFERRED).length}`,
  );
});
