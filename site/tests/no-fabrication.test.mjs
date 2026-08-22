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
const VERSION_LITERAL = /(?<![\w.])v?\d+\.\d+\.\d+(?![\w.])/;

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
  for (const s of [
    'const version = "1.3.0";',
    "Requires v9.9.9 or later.",
    "agentskills 1.2.1 adds a scan flag",
    "install v1.0.0 from the releases page",
  ]) {
    assert.ok(VERSION_LITERAL.test(s), `matcher missed a planted version literal: ${JSON.stringify(s)}`);
  }
  for (const s of [
    "the CLI version comes from the Releases API",
    "see section 7.4 of the proposal",
    "an IPv4 address like 10.0.0.1 is not a version", // four parts, not three
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
