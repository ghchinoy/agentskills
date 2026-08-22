// no-fabrication.test.mjs — the machine expression of proposal §12 for site B.
//
// The site renders the repository's own prose, so the fabrication risk is not
// in the copied bytes: it is in the site's own chrome and in the small amount
// of site-authored connective text. Two classes are gated here.
//
// ── 1. RUNTIME SUPPORT FOR AN AGENT (proposal §1.4) ─────────────────────────
//
// `agentskills` READS six rule formats — GEMINI.md, CLAUDE.md, AGENTS.md,
// .cursorrules, .cursor/rules/*.mdc, SYSTEM_PROMPT.md. Reading a file format is
// not supporting the agent that wrote it, and the slide from one to the other
// is the single easiest false claim this site could make: "reads CLAUDE.md"
// becoming "works with Claude". The format NAMES are therefore allowed
// everywhere — they are what the repo declares — while an affirmative
// SUPPORT/COMPATIBILITY claim about a named agent product is not.
//
// "Gemini" is deliberately NOT in the agent list. The CLI genuinely calls
// Gemini via Vertex AI or the Gemini API, so "uses Gemini" is a true statement
// about a real dependency, and a matcher that flagged it would be a matcher
// somebody switches off.
//
// ── 2. A HAND-TYPED CLI VERSION (proposal §7.4) ─────────────────────────────
//
// `cmd/root.go` carries `var Version = "1.3.0"`, which GoReleaser OVERRIDES at
// release time with `-X agentskills/cmd.Version={{.Version}}`. The constant is
// a fallback, not the truth, so a version copied from it onto the site is a
// number that is wrong exactly when it matters. Phase 6 displays no version at
// all; this gate is what stops one from arriving by hand later.
//
// Both detectors carry positive controls. A detector that has never been seen
// to fire is not evidence of anything, and neither of these classes appears in
// the corpus today — the whole population is clean, which is precisely the
// situation in which a dead matcher is invisible.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { dist, distHtmlFiles, read, readDist, siteRoot, toText, walk } from "./_helpers.mjs";

// Agent/vendor products whose rule files the CLI reads. Naming the product is
// fine; claiming to support it is not.
const AGENT = /\b(claude(?: code)?|cursor|copilot|codex|windsurf|cline|aider|anthropic|openai)\b/i;

// Affirmative support/compatibility phrasings.
const SUPPORT_CLAIM =
  /\b(supports?|supported|supporting|works with|integrat(?:es|ed|ion) with|compatible with|compatibility with|runs? (?:on|in)|powered by|certified for)\b/i;

// Genuine disavowals. Kept tight on purpose: a loose disclaimer list is how a
// claim gets excused for co-occurring with a hedge word.
const NEGATION =
  /\b(not|never|cannot|can ?not|can't|isn't|aren't|doesn't|don't|won't|no longer|neither|nor|rather than|instead of)\b/i;

// The permitted, factual predicate: the CLI READS these files.
const READS = /\b(reads?|reading|scans?|scanning|pars(?:es|ing)|discovers?|detects?)\b/i;

function sentences(text) {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}
function clauses(sentence) {
  return sentence
    .split(/[,;:]|\s+(?:and|but|so|while|whereas|however|although|though)\s+/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Clauses that claim runtime support for a named agent product. */
export function agentSupportClaims(text) {
  const out = [];
  for (const s of sentences(text)) {
    for (const c of clauses(s)) {
      if (!AGENT.test(c)) continue;
      if (!SUPPORT_CLAIM.test(c)) continue;
      if (NEGATION.test(c)) continue;
      // "reads CLAUDE.md" and friends: the verb is the honest one.
      if (READS.test(c) && !/\b(supports?|compatible|certified)\b/i.test(c)) continue;
      out.push(c);
    }
  }
  return out;
}

test("controls: the agent-support detector draws the reads/supports line", () => {
  const MUST_CATCH = [
    "agentskills supports Claude Code.",
    "The CLI is compatible with Cursor.",
    "Works with GitHub Copilot out of the box.",
    "agentskills integrates with Anthropic Claude and OpenAI Codex.",
  ];
  for (const s of MUST_CATCH) {
    assert.ok(agentSupportClaims(s).length > 0, `detector MISSED a support claim: ${JSON.stringify(s)}`);
  }

  const MUST_ALLOW = [
    "agentskills reads CLAUDE.md, .cursorrules and AGENTS.md.",
    "It scans rule files written for Claude, Cursor and other agents.",
    "agentskills does not support Claude at runtime; it only reads its rule files.",
    "Rule formats are read rather than executed, so no Cursor runtime is required.",
    "agentskills supports two generative AI backend pathways depending on your credentials:",
  ];
  for (const s of MUST_ALLOW) {
    assert.deepEqual(
      agentSupportClaims(s),
      [],
      `detector WRONGLY flagged an honest statement: ${JSON.stringify(s)}`,
    );
  }
});

test("no built page claims runtime support for an agent product", async () => {
  const files = await distHtmlFiles();
  assert.ok(files.length > 0, "no built pages to check");
  const offenders = [];
  for (const file of files) {
    for (const claim of agentSupportClaims(toText(await readDist(file)))) {
      offenders.push(`${file}: ${JSON.stringify(claim.slice(0, 140))}`);
    }
  }
  assert.deepEqual(offenders, [], `agent-support claims found:\n  ${offenders.join("\n  ")}`);
});

// ── The version gate ────────────────────────────────────────────────────────

// The leading `v?` is not decoration. An earlier form of this matcher was
// `\b\d+\.\d+\.\d+\b`, and it MISSED `v9.9.9` — because there is no word
// boundary between `v` and `9`. This repository writes its versions with the
// `v` (its tags are `v1.0.0` … `v1.3.0`), so the one spelling a person is most
// likely to type by hand was the one spelling the gate could not see. Found by
// planting `Requires v9.9.9 or later.` on the landing page and watching the
// gate stay green.
//
// The trailing lookahead is `(?!\.?\d)`, not `(?![\w.])`, and that is the same
// lesson one layer along. `(?![\w.])` was written to mean "not part of a longer
// dotted number", but what it says is "not followed by punctuation" — so it
// also refused `Current release: v1.3.0.`, a version ending a sentence. That is
// not a hypothetical spelling: `v1.3.0` is this repository's current tag and
// the exact value of `var Version = "1.3.0"` in cmd/root.go, i.e. the one
// string this gate exists to catch. `(?!\.?\d)` expresses the actual intent —
// reject `1.2.3.4`, accept a version followed by anything that is not another
// dotted component.
//
// The LOOKBEHIND is `(?<!\d)(?<!\d\.)`, and it is not the mirror image of the
// lookahead. The two boundaries ask different questions. The trailing question
// is "does what follows END the number", and there ANY dot followed by a digit
// continues it. The leading question is "is this token the TAIL of something
// longer", and only two left-neighbours make it so: a digit, or a dot that
// itself follows a digit. A dot that does NOT follow a digit is an ordinary
// separator and the version after it is a version —
// `agentskills.1.3.0.tar.gz`. So the obvious mirror, `(?<![.\d])`, is wrong on
// that spelling, and the original `(?<![\w.])` was wrong on far more: it
// refused every WORD character, and `_` is a word character. GoReleaser names
// every archive `{{.ProjectName}}_{{.Version}}_{{.Os}}_{{.Arch}}`
// (.goreleaser.yaml:24), so release v1.3.0 ships
// `agentskills_1.3.0_linux_amd64.tar.gz` — a hand-written downloads page is
// the likeliest place a stale version is ever typed, and the underscore made
// the gate blind at precisely its highest-risk input. Enumerating every
// printable-ASCII left-neighbour of `1.3.0` and `v1.3.0`, 916 probes against a
// tokenizer oracle, the old form missed 214 of the 344 it should have caught.
const VERSION_LITERAL = /(?<!\d)(?<!\d\.)v?\d+\.\d+\.\d+(?!\.?\d)/;

/**
 * The population: every site-authored file whose content can reach a rendered
 * page — the Astro config, the site sources, the content pipeline, and the
 * public assets. Enumerated positively rather than by exclusion, so a new
 * directory is out of scope until someone puts it in scope on purpose.
 *
 * Deliberately NOT in the population: `package.json` and `package-lock.json`
 * (their version literals are Astro's, and pinning them is required — see
 * proposal §10.4), and `tests/` (test sources ship nothing to a reader, and
 * this very file quotes `1.3.0` in its own control).
 */
async function siteSourceFiles() {
  const roots = ["src", "scripts", "public"];
  const out = ["astro.config.mjs"];
  for (const r of roots) {
    if (!existsSync(join(siteRoot, r))) continue;
    for (const f of await walk(join(siteRoot, r))) {
      const rel = relative(siteRoot, f);
      if (rel.split(sep).includes("_generated")) continue;
      out.push(rel);
    }
  }
  return out.sort();
}

test("controls: the version-literal matcher fires on a planted version", () => {
  // Both spellings, because both are things a person types.
  //
  // ONE CONTROL PER FOLLOWER CLASS, and the classes come from ENUMERATING what
  // can follow a version literal — not from the last bug. The four original
  // strings all put the version before a space or a quote, which is why they
  // could certify a matcher that was blind to `v1.3.0.` and to `v1.3.0beta`
  // alike: a control set written in the shape of the previous defect tests the
  // instrument only for that shape.
  //
  // The enumeration ran every printable-ASCII character (plus newline, tab and
  // the non-ASCII punctuation these docs use) as the follower of `v1.3.0` and
  // of `1.3.0`, 234 probes, and the `(?![\w.])` matcher was silent on 126 of
  // them. Those 126 are two classes, and one control below stands for each:
  // a `.` not followed by a digit, and a word character. The remaining strings
  // hold the classes that already worked, so a future edit cannot lose them.
  for (const s of [
    'const version = "1.3.0";',                 // followed by a quote
    "Requires v9.9.9 or later.",                // followed by a space
    "agentskills 1.2.1 adds a scan flag",       // followed by a space, bare
    "install v1.0.0 from the releases page",    // followed by a space, v-prefixed
    "Install agentskills v1.3.0.",              // `.` — SENTENCE PERIOD, v-prefixed
    "The fallback constant is 1.3.0.",          // `.` — SENTENCE PERIOD, bare
    "Upgrade notes live in v1.3.0.md",          // `.` then a letter, not a digit
    "Pre-release v1.3.0beta was never shipped", // WORD CHARACTER follower
    "Tagged v1.3.0, built from main.",          // comma
    "Latest release v1.3.0",                    // end of input
    "Latest release v1.3.0\nSee the releases page.", // end of LINE
    // ── LEADING boundary. One control per class, from the enumeration
    //    described above the matcher. ──────────────────────────────────────
    "agentskills_1.3.0_linux_amd64.tar.gz",     // UNDERSCORE — and this is not
    // a synthetic string: it is verbatim one of the six archives published on
    // release v1.3.0, produced by the `name_template` on .goreleaser.yaml:24.
    "agentskills.1.3.0.tar.gz",                 // DOT not preceded by a digit
    "V1.3.0 is the current release",            // LETTER — `v?` is lower-case
    // only and the matcher carries no `i` flag, so a capital V is not the
    // decoration being skipped, it is a left-neighbour that has to be allowed.
  ]) {
    assert.ok(VERSION_LITERAL.test(s), `matcher missed a planted version literal: ${JSON.stringify(s)}`);
  }
  for (const s of [
    "the CLI version comes from the Releases API",
    "see section 7.4 of the proposal",
    "an IPv4 address like 10.0.0.1 is not a version", // four parts, not three
    "the build number is 1.2.3.4 today",              // four parts, mid-sentence
    "10.0.0.1.",                                      // four parts, sentence period
    // BACKTRACK BAIT, and the reason the lookahead is `(?!\.?\d)` rather than
    // the more obvious `(?!\.\d)`: under the obvious form the matcher gives up
    // the whole third component and settles for `1.2.34` inside `1.2.345.6`,
    // reporting a version literal inside a number that has four components.
    "1.2.345.6 is not a version either",
    "192.168.100.7 is a host, not a release",         // same trap, IPv4 spelling
    // Loosening the LOOKBEHIND can only ever add false fires, so the allow
    // side carries the same filename shape with a fourth component, and a dot
    // that IS preceded by a digit — the one dot the lookbehind still refuses.
    "agentskills_1.3.0.4_linux_amd64.tar.gz",
    "127.0.0.1:4321 is the dev server",
  ]) {
    assert.ok(!VERSION_LITERAL.test(s), `matcher fired on clean text: ${JSON.stringify(s)}`);
  }
});

test("no CLI version is hand-typed into a site-authored file", async () => {
  const files = await siteSourceFiles();
  assert.ok(files.length > 0, "the site-source enumeration found no files");
  const offenders = [];
  for (const f of files) {
    const body = await read(join(siteRoot, f));
    for (const [i, line] of body.split("\n").entries()) {
      // The dependency pins in package.json are versions of Astro, not of the
      // CLI, and package.json is excluded above. Anything else is suspect.
      if (VERSION_LITERAL.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `version-shaped literal(s) in site-authored files. The displayed CLI ` +
      `version must be derived (proposal §7.4), never typed:\n  ${offenders.join("\n  ")}`,
  );
});

test("the search box is backed by a real index", async () => {
  // Site B leaves Starlight's search ON, which is honest only while the index
  // it searches actually ships. A search UI with no index is a widget that
  // asserts a capability the built site does not have.
  const html = await readDist("index.html");
  const hasSearchUi = /data-open-modal|role="search"|type="search"/i.test(html);
  const hasIndex = existsSync(join(dist, "pagefind", "pagefind.js"));
  assert.equal(
    hasSearchUi,
    hasIndex,
    hasSearchUi
      ? "a search box is rendered but dist/pagefind/ has no index behind it"
      : "an index shipped but no search UI renders — one of the two is wrong",
  );
});
