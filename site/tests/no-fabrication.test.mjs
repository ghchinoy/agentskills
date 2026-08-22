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
import { dist, distHtmlFiles, read, readDist, repoRoot, siteRoot, toText, walk } from "./_helpers.mjs";

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

// ── THE SHAPE MATCHER IS NOT THE GATE, AND CONFLATING THEM WAS THE DEFECT ───
//
// This test is named "no CLI VERSION is hand-typed"; it asserted "no
// VERSION-SHAPED LITERAL appears". Those are different sentences. The NAME is
// the correct one — the name is the specification, the assertion was the
// implementation, and it is the specification the gate owes a reader.
//
// The gap is not hypothetical. FIVE strings this repository really produces are
// true, are not the CLI's version, and every one of them fired the gate:
//
//     Building the site requires Node >= 22.19.0.   site/package.json engines.node
//     This site is built with Astro 7.2.4.          dependency pin
//     Uses @astrojs/starlight 0.41.7 ...            dependency pin
//     Image handling comes from sharp 0.35.3.       dependency pin
//     We conform to Semantic Versioning 2.0.0.      docs/releasing.md:8
//
// cert §2.8 listed a SIXTH, "Requires Go 1.24.0 or later to build.", sourced to
// go.mod toolchain prose. No such string exists in this repository — the real
// prose is `Go 1.22+` (docs/development.md:9) and `Go 1.22 or higher`
// (docs/users_guide.md:10), both TWO-component and therefore invisible to a
// matcher that requires three. cert withdrew the row on discovering it. It is
// recorded here rather than quietly dropped, because a fabricated row inside
// the finding about a fabrication gate is the most instructive thing in it.
//
// All five measured RED at 02221f55, planted one at a time into this gate's own
// population. Today that population is clean, so the gate is green — but the
// first time anyone documents the Node floor or the SemVer standard, the gate
// blocks a TRUE statement and its message tells the author to derive a CLI
// version they never typed. The likely response is to widen the matcher or to
// switch the gate off, and that is how the CATCHING side gets lost.
//
// So the repair is to the QUESTION, not to the regex. The regex is a correct
// implementation of "is this a version literal" — it is simply not the question
// the name asks. VERSION_LITERAL is therefore retained UNCHANGED, as a
// COMPONENT of the gate rather than as the gate.
//
// ── ATTRIBUTION IS PER-MATCH, AND THAT IS THE LOAD-BEARING PART ─────────────
//
// A per-LINE rule is the obvious encoding and it is silently wrong. On a line
// carrying more than one number, attributing the whole line by its FIRST match
// lets a third-party version standing to the left SWALLOW a real CLI version:
//
//     Node 22.19.0 is required to build agentskills 1.3.0.
//
// A per-line rule excuses that entire line, so a hand-typed CLI version reaches
// a reader with the suite green. Note the DIRECTION: the defect being repaired
// here fails LOUD — it blocks a true statement. A per-line excuse fails SILENT.
// Trading a loud failure for a silent one is strictly worse than doing nothing,
// so every literal on a line is attributed INDEPENDENTLY, against the text
// between the END OF THE PREVIOUS MATCH and its own start. That left bound is
// what stops the second number inheriting the first number's subject.
//
// ── AND ATTRIBUTION REQUIRES ADJACENCY ──────────────────────────────────────
//
// "The nearest named subject to the left", unbounded, hands a writer an excuse
// the width of the line. The subject must be the LAST thing before the number,
// with only whitespace, the word "version", and the characters @ : < > = ~ ^
// between them — the spellings the ecosystem actually uses (`astro@7.2.4`,
// `Node >= 22.19.0`, `^0.35.3`). A subject further left, or to the RIGHT of the
// number, does not attribute it and the gate reports. Reporting is the safe
// direction, so that is where the doubt is sent.
//
// KNOWN AND ACCEPTED ESCAPE HATCH, recorded rather than hidden: a writer who
// puts a third-party name in front of the CLI's own version — `Node 1.3.0` —
// is excused. Using it means stating something false of a DIFFERENT kind, in a
// sentence whose own subject contradicts its number. The alternative is the
// status quo, in which six true statements are blocked and the gate gets
// switched off by the first person who needs to make one of them.

// ── THE SUBJECT SET IS THE ENTIRE EXCUSE SURFACE, SO IT IS LIFTED ───────────
//
// Every EXCUSE this gate grants rests on "is this a named third-party subject",
// so that set decides what the gate is worth. It is a CLOSED list, never an
// open heuristic: a heuristic like "any package-shaped token to the left" would
// let `changelog 1.3.0`, `cli 1.3.0` or `tag 1.3.0` disable the gate by
// phrasing, and silently — the direction that is strictly worse than the loud
// failure being repaired here.
//
// Being closed, it is LIFTED rather than invented, on the same principle that
// made the release-archive allowlist survive review: `.goreleaser.yaml`'s
// `archives.files` is read, not transcribed, so no human can quietly widen it.
// The equivalent authority here is `site/package.json`:
//
//   * `dependencies` and `devDependencies` — each name and its scope-stripped
//     form, so `@astrojs/starlight 0.41.7` and `starlight 0.41.7` both
//     attribute. A dependency added tomorrow is excusable with no edit here.
//   * `engines` — which is where `node` comes from. Not typed.
//
// Note the recursion, which is the neatest part: `package.json` is EXCLUDED
// from the scanned population (see siteSourceFiles) on the ground that its
// version literals are Astro's and not the CLI's. Under this scheme the file
// carved OUT of the question becomes the authority ON it.
//
// ── AND WHAT CANNOT BE LIFTED MUST BE ATTESTED ──────────────────────────────
//
// Two subjects have versions this repository genuinely states and npm cannot
// name. They are written down, so they are the part a human could widen — and
// the control below closes that by requiring each to be REAL: the attesting
// file must actually contain that subject standing immediately left of a
// version literal. `changelog` could be added to this table, but no file in the
// repository says `changelog 1.2.3`, so the control would reject it.
//
// This is why the table is two entries and not five. `goreleaser` and `semver`
// were both candidates and both were DROPPED: the repository names them
// (docs/releasing.md, .goreleaser.yaml) but never states a version FOR them, so
// there is nothing to attest and an entry would be a guess. If the site ever
// needs to write `GoReleaser 2.5.0`, the gate reports it — loudly — and the
// entry gets added then, with the attestation that then exists.
const ATTESTED_SUBJECTS = {
  go: "go.mod", //                          `go 1.26.4`
  "semantic versioning": "docs/releasing.md", // `**Semantic Versioning 2.0.0**`
};

// ── ADJACENCY IS A PROXY; THE PIN IS THE FACT ───────────────────────────────
//
// skills-site-p6-cert attacked the adjacency rule above and broke it, in one
// class, with six lines and one mechanism:
//
//     astro 1.3.0 . Node 1.3.0 . sharp 0.35.3 and astro 1.3.0 .
//     1.2.3 astro 1.3.0 . astro 7.2.4 sharp 1.3.0 . agentskills and astro 1.3.0
//
// Their invariant, stated independently of this code: ADJACENCY ESTABLISHES
// THAT A SUBJECT IS NEXT TO A NUMBER. IT CANNOT ESTABLISH THAT THE NUMBER
// BELONGS TO THAT SUBJECT. The hole was gate-shaped — any hand-typed CLI
// version preceded by a dependency name was permanently invisible, and
// `astro 7.2.4 sharp 1.3.0` is a plausible typo in a dependency list, not an
// exotic construction. Note the last line: naming the CLI does not help,
// because `astro` is what sits adjacent.
//
// The repository already knows the answer, so nothing has to be invented:
// package.json PINS every subject it declares. So attribution is now two
// facts, not one — a named subject stands adjacent, AND the version it is
// pinned at is the version written down. Cert measured this variant at 6 of 6
// closed, 0 of 9 legitimate lines changed.
//
// THE NEW COUPLING, NAMED HONESTLY. This ties the gate to dependency versions:
// an `npm update` turns previously-legal prose into a violation until the prose
// is updated. That is a deliberate ruling and not an accident. For a drift gate
// it is the correct direction — prose stating `Astro 7.2.4` after the pin moves
// to 7.3.0 is no longer true, and a gate that stays quiet about it is the same
// failure in a different costume.
//
// ── THERE IS NO CARVE-OUT, AND THERE ALMOST WAS ────────────────────────────
//
// `go` has no pin in package.json, so it was briefly exempted from the check
// above and kept adjacency-only — which left `Go 1.3.0` excused. The stated
// justification was that cert §2.8 required "Requires Go 1.24.0 or later to
// build." to pass, and go.mod declares 1.26.4.
//
// THAT SENTENCE IS NOT IN THIS REPOSITORY. cert grepped for it, found nothing,
// and withdrew the row: the real toolchain prose is two-component (`Go 1.22+`)
// and never reaches attribution at all. The exemption was justified by a
// fabricated requirement, which is exactly the failure this file gates.
//
// So `go` is pinned like everything else, from go.mod rather than package.json,
// and PIN_EXEMPT IS EMPTY. It is kept — as an empty set with a live control —
// because the next subject that cannot be pinned will want to be added to it,
// and that should be a visible, argued edit rather than a silent fallback to
// adjacency. An empty exempt set is the strongest state this control can be in.
const PIN_EXEMPT = new Set([]);

/** The `x.y.z` core of a declaration — `^7.2.4`, `>=22.19.0`, `v1.3.0` all
 *  carry one. Returns null when a declaration names no version at all. */
function versionCore(declared) {
  const m = /(\d+\.\d+\.\d+)/.exec(String(declared ?? ""));
  return m ? m[1] : null;
}

/**
 * The version this repository states FOR a subject, lifted out of the file
 * that states it. Nothing is typed here: `2.0.0` and `1.26.4` are read from
 * docs/releasing.md and go.mod at run time, so a written-down entry whose
 * attesting file stops stating a version becomes a hard error rather than a
 * stale constant that goes on excusing numbers.
 */
export async function attestedPins() {
  const pins = {};
  for (const [subject, file] of Object.entries(ATTESTED_SUBJECTS)) {
    const body = await read(join(repoRoot, file));
    const re = new RegExp(
      `(?:^|[^\\w@/-])${subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` +
        `[ \\t]*(?:version[ \\t]*)?[@:<>=~^*]*[ \\t]*(\\d+\\.\\d+\\.\\d+)(?!\\.?\\d)`,
      "i",
    );
    const m = re.exec(body);
    if (!m) {
      throw new Error(
        `subject ${JSON.stringify(subject)} claims attestation in ${file}, but no line ` +
          `there states a version for it. An entry nothing attests is a guess, and it ` +
          `widens the set of numbers this gate will excuse.`,
      );
    }
    pins[subject] = m[1];
  }
  return pins;
}

/** The attributable third-party subjects, longest first so the alternation
 *  prefers `@astrojs/starlight` over the bare `starlight`. */
export function thirdPartySubjects(pkg, attested = {}) {
  const subjects = new Map();
  const add = (name, declared) => {
    const key = name.toLowerCase();
    if (!subjects.has(key)) subjects.set(key, { name: key, pin: versionCore(declared) });
  };
  for (const [subject, pin] of Object.entries(attested)) add(subject, pin);
  for (const subject of Object.keys(ATTESTED_SUBJECTS)) add(subject, null);
  for (const [engine, range] of Object.entries(pkg.engines ?? {})) add(engine, range);
  for (const [dep, range] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    add(dep, range);
    add(dep.replace(/^@[^/]+\//, ""), range);
  }
  return [...subjects.values()].sort(
    (a, b) => b.name.length - a.name.length || a.name.localeCompare(b.name),
  );
}

/** The subject names alone, for the controls that ask what is attributable. */
export const subjectNames = (subjects) => subjects.map((s) => s.name);

/**
 * Matches a left-context window that ENDS in a named third-party subject.
 *
 * An empty subject list would make this `(?:)` — an empty alternation that
 * matches everywhere — and the gate would then excuse EVERY version literal in
 * the repository while reporting green. That is the worst available failure, so
 * it is a hard error rather than a default.
 */
function attributedToThirdParty(subjects) {
  if (subjects.length === 0) {
    throw new Error(
      "no third-party subjects were derived from site/package.json. An empty " +
        "list would excuse every version literal on the site, so this is a " +
        "hard error rather than a gate that quietly passes.",
    );
  }
  const alternation = subjects
    .map((s) => s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(
    // The subject must not be the tail of a longer word — `cargo` ends in `go`,
    // and so do Django, Mongo, Logo, Google and Gonzo (cert's B9).
    `(?:^|[^\\w@/-])(${alternation})` +
      // …and it must be the last thing before the number.
      `[ \\t]*(?:version[ \\t]*)?[@:<>=~^]*[ \\t]*$`,
    "i",
  );
}

/**
 * Every version literal on `line` that is NOT attributed to a named third
 * party — i.e. every literal the line hand-types as if it were the CLI's.
 *
 * Per-match, never per-line: each literal is judged against the window running
 * from the END OF THE PREVIOUS MATCH to its own start.
 */
export function handTypedCliVersions(line, subjects) {
  const attributed = attributedToThirdParty(subjects);
  const byName = new Map(subjects.map((s) => [s.name, s]));
  const scan = new RegExp(VERSION_LITERAL.source, "g");
  const out = [];
  let windowStart = 0;
  for (const m of line.matchAll(scan)) {
    const hit = attributed.exec(line.slice(windowStart, m.index));
    windowStart = m.index + m[0].length;
    if (!hit) {
      out.push(m[0]); // nothing named it: the default is that it is the CLI's
      continue;
    }
    const subject = byName.get(hit[1].toLowerCase());
    // Adjacency alone excuses ONLY the subject the specification forces out of
    // the pin check. Everything else must also match what it is pinned at.
    if (PIN_EXEMPT.has(subject.name)) continue;
    if (subject.pin !== null && versionCore(m[0]) === subject.pin) continue;
    out.push(m[0]);
  }
  return out;
}

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

// ── SHAPE controls ──────────────────────────────────────────────────────────
//
// These strings certify the SHAPE COMPONENT — "is there a version-shaped
// literal here" — and NOT the gate. Until this commit they were the gate's only
// controls, because the gate WAS the shape matcher. Changing the predicate
// retires a control set in place while it goes on looking green, so none of
// them was assumed to carry over: each was re-justified individually against
// the new predicate (recorded per string in reports/phase6-fix-2.md), and the
// bridge control below re-runs every must-catch string through the GATE so the
// set is promoted rather than quietly retired.
//
// Naming this test for the component rather than the gate is a remedy proposed
// by skills-site-p6-rev in their review addendum 2.
const SHAPE_MUST_CATCH = [
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
  //
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
  //
  // MULTI-DIGIT COMPONENTS, added this round. skills-site-p6-rev measured that
  // over a single-digit component alphabet the backtracking variant of this
  // matcher is INDISTINGUISHABLE from the shipped form — zero disagreements —
  // and only multi-digit components expose it, at 64. A control population made
  // only of `1.3.0`-shaped strings therefore reports zero and reads as a pass.
  "Release 12.34.567 is not a real tag",
  "agentskills_10.20.30_linux_amd64.tar.gz",
];

const SHAPE_MUST_NOT_CATCH = [
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
];

test("controls: the version-literal SHAPE COMPONENT fires on a planted version", () => {
  for (const s of SHAPE_MUST_CATCH) {
    assert.ok(VERSION_LITERAL.test(s), `matcher missed a planted version literal: ${JSON.stringify(s)}`);
  }
  for (const s of SHAPE_MUST_NOT_CATCH) {
    assert.ok(!VERSION_LITERAL.test(s), `matcher fired on clean text: ${JSON.stringify(s)}`);
  }
});

// ── GATE controls: one per class of the ATTRIBUTION boundary ────────────────
//
// Enumerated from the NEW predicate before any of it was written, at
// evidence/phase6-fix-2/q1-new-boundary-enumeration.md. Each row carries the
// axis label it stands for. The middle column is EXACTLY the literals the gate
// must report, not merely whether it reports something — a per-line rule and a
// per-match rule agree on "did anything fire" and disagree only here.
const GATE_CASES = [
  // ── Axis B — is a named third party attributed to this number? ──
  ["Current release 1.3.0", ["1.3.0"], "B1 no subject named anywhere on the line"],
  ["Image handling comes from sharp 0.35.3.", [], "B2 third-party subject immediately left"],
  ["agentskills 1.3.0 is current", ["1.3.0"], "B3 the CLI itself named immediately left"],
  ["The tag is at 1.3.0", ["1.3.0"], "B4 an ordinary word immediately left"],
  ["Astro powers this site and the release is 1.3.0.", ["1.3.0"], "B5 subject present but NOT adjacent"],
  ["7.2.4 is the Astro pin", ["7.2.4"], "B6 subject to the RIGHT of the number"],
  ["cargo 1.3.0 shipped today", ["1.3.0"], "B7 subject name is the TAIL of a longer word"],
  ["Uses @astrojs/starlight 0.41.7 here.", [], "B8 scoped npm name"],
  ["starlight 0.41.7 renders it", [], "B8 the same dependency, scope stripped"],
  ["We conform to Semantic Versioning 2.0.0.", [], "B9 multi-word subject"],

  // ── Axis C — what may stand between the subject and its number ──
  ["This site is built with Astro 7.2.4.", [], "C1 a single space"],
  ["Building the site requires Node >= 22.19.0.", [], "C2 comparison operator, the real engines.node spelling"],
  ["The pin is sharp ^0.35.3 today", [], "C3 npm range caret"],
  ["Install astro@7.2.4 to reproduce", [], "C4 npm pin spelling"],
  ["astro: 7.2.4", [], "C5 colon"],
  ["Astro version 7.2.4 builds this", [], "C6 the word version"],
  ["Astro v7.2.4 builds this", [], "C7 a v on the number itself"],
  ["go, 1.3.0 is the tag", ["1.3.0"], "C8 punctuation that is NOT a joiner"],
  ["astro7.2.4", [], "C10 no gap at all"],

  // ── Axis D — MULTIPLICITY. This axis is why attribution is per-match. ──
  //
  // The first four rows are cert §12.3's four constructed misses, verbatim.
  // A per-LINE rule excuses every one of them, because each opens with a
  // legitimately-attributed third-party version. Each hides a hand-typed CLI
  // version behind it, and that failure is SILENT.
  ["Node 22.19.0 is required to build agentskills 1.3.0.", ["1.3.0"], "D3 cert miss 1"],
  ["sharp 0.35.3 powers images; the CLI is at 1.3.0.", ["1.3.0"], "D3 cert miss 2"],
  ["Astro 7.2.4 and starlight 0.41.7 build the site for agentskills 1.3.0.", ["1.3.0"], "D3 cert miss 3"],
  ["Built with Go 1.26.4; ships as v1.3.0.", ["v1.3.0"], "D4 cert miss 4, second literal unattributed"],
  ["Astro 7.2.4 and sharp 0.35.3 are both pinned.", [], "D2 two literals, both attributed"],
  ["agentskills 1.3.0 is built with Astro 7.2.4.", ["1.3.0"], "D5 crossed order — report the FIRST only"],
  ["starlight 0.41.7 1.3.0", ["1.3.0"], "D6 the second literal must not inherit the first's subject"],
  ["Astro 7.2.4, sharp 0.35.3 and agentskills 1.3.0", ["1.3.0"], "D7 three literals, mixed"],

  // ── Axis A4 — multi-digit components, at the gate rather than the shape ──
  ["Release 12.34.567 today", ["12.34.567"], "A4 multi-digit, unattributed"],
  ["Astro 12.34.567 today", ["12.34.567"], "A4 multi-digit, adjacent but NOT the pin"],

  // ── Axis F — case and spelling of the subject ──
  ["ASTRO 7.2.4 builds this", [], "F1 subject matching is case-insensitive"],
  ["Node.js 22.19.0 is required", ["22.19.0"], "F2 an UNATTESTED spelling reports — the safe direction"],

  // ── Axis G — the escape hatch that WAS accepted, and is now CLOSED ──
  //
  // This row previously read `[]` and was documented as a known hole: naming a
  // third party over the CLI's own version bought silence. cert's pin check
  // removes it, and the row is kept — inverted — so that a regression to
  // adjacency-only fails HERE, by name, instead of quietly reopening the hole.
  ["Node 1.3.0", ["1.3.0"], "G1 CLOSED: a false attribution no longer excuses"],

  // ── cert's attack class, all six lines, verbatim. One mechanism: a subject
  //    adjacent to a literal that HAPPENS TO EQUAL THE CLI VERSION. These are
  //    cert's controls, not mine, and are marked so.
  ["astro 1.3.0", ["1.3.0"], "cert: adjacent subject, literal is not its pin"],
  ["sharp 0.35.3 and astro 1.3.0", ["1.3.0"], "cert: one real pin launders the next literal"],
  ["1.2.3 astro 1.3.0", ["1.2.3", "1.3.0"], "cert: unattributed then falsely attributed"],
  ["astro 7.2.4 sharp 1.3.0", ["1.3.0"], "cert: a plausible typo in a dependency list"],
  ["agentskills and astro 1.3.0", ["1.3.0"], "cert: naming the CLI does not help; astro is adjacent"],

  // ── cert's B9, SUBSTRING CONTAMINATION. `go` is two characters, so a
  //    subject matched without a word boundary would excuse all of these.
  ["Django 1.3.0", ["1.3.0"], "cert B9: Django ends in go"],
  ["Mongo 1.3.0", ["1.3.0"], "cert B9: Mongo ends in go"],
  ["Google 1.3.0", ["1.3.0"], "cert B9: Google contains go"],
  ["Gonzo 1.3.0", ["1.3.0"], "cert B9: Gonzo begins with go"],
  ["Logo 1.3.0", ["1.3.0"], "cert B9: Logo ends in go"],

  // ── cert's class has NO survivor. `go` is pinned from go.mod, so the last
  //    carve-out is gone. The three rows cert asked to see before the
  //    exemption was dropped:
  ["Go 1.3.0", ["1.3.0"], "cert: the former residual hole, now CLOSED"],
  ["Built with Go 1.26.4 here", [], "go is excused at the version go.mod declares"],
  ["Go 1.22 or higher installed", [], "the REAL prose: two-component, never reaches attribution"],
  ["Go 1.22+ installed", [], "the REAL prose, development.md spelling"],

  // ── skills-site-p6-rev's class: a subject that is not in package.json ──
  //     Their control, not mine. Marked so it is not counted as independent.
  ["changelog 1.3.0", ["1.3.0"], "rev: an ordinary noun is not a subject"],
  ["cli 1.3.0", ["1.3.0"], "rev: an ordinary noun is not a subject"],
  ["build 1.3.0", ["1.3.0"], "rev: an ordinary noun is not a subject"],
  ["tag 1.3.0", ["1.3.0"], "rev: an ordinary noun is not a subject"],
];

test("controls: the gate attributes each version literal, and excuses only a named third party", async () => {
  const pkg = JSON.parse(await read(join(siteRoot, "package.json")));
  const subjects = thirdPartySubjects(pkg, await attestedPins());

  for (const [line, expected, klass] of GATE_CASES) {
    assert.deepEqual(
      handTypedCliVersions(line, subjects),
      expected,
      `[${klass}] the gate disagreed on ${JSON.stringify(line)}`,
    );
  }

  // skills-site-p6-rev's second class: a subject named on a PREVIOUS line
  // cannot attribute a number on this one. The gate is line-oriented, so this
  // must report — and reporting is the safe direction.
  const heading = ["## Astro", "The current release is 1.3.0."];
  assert.deepEqual(
    heading.flatMap((l) => handTypedCliVersions(l, subjects)),
    ["1.3.0"],
    "a third-party subject in a HEADING attributed a version in the body beneath it",
  );
});

test("controls: the third-party subject set is LIFTED, not typed", async () => {
  const pkg = JSON.parse(await read(join(siteRoot, "package.json")));
  const subjects = thirdPartySubjects(pkg, await attestedPins());
  const names = subjectNames(subjects);

  // Vacuity: an empty subject set would excuse every version literal on the
  // site while reporting green. It is the worst failure available here.
  assert.ok(subjects.length > 0, "the derived third-party subject set is empty");
  assert.throws(
    () => handTypedCliVersions("Current release 1.3.0", []),
    /empty list would excuse every version literal/,
    "an empty subject set must be a hard error, never a gate that quietly passes",
  );

  // It really is lifted from package.json: every declared dependency, its
  // scope-stripped form, and every engine.
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    assert.ok(names.includes(dep.toLowerCase()), `${dep} is a declared dependency but is not attributable`);
    assert.ok(
      names.includes(dep.replace(/^@[^/]+\//, "").toLowerCase()),
      `${dep} is declared but its scope-stripped form is not attributable`,
    );
  }
  for (const engine of Object.keys(pkg.engines ?? {})) {
    assert.ok(names.includes(engine.toLowerCase()), `${engine} is a declared engine but is not attributable`);
  }

  // LIVENESS — skills-site-p6-rev's control, marked as theirs. A dependency
  // added to package.json must become excusable with NO edit to this file. This
  // is what catches the set being frozen into a stale literal list later.
  const widened = thirdPartySubjects(
    { ...pkg, dependencies: { ...pkg.dependencies, "@scope/newdep": "3.2.1" } },
    await attestedPins(),
  );
  assert.deepEqual(
    handTypedCliVersions("newdep 3.2.1 is now pinned", widened),
    [],
    "a dependency added to package.json did not become attributable — the subject set is frozen, not lifted",
  );
  assert.deepEqual(
    handTypedCliVersions("newdep 3.2.1 is now pinned", subjects),
    ["3.2.1"],
    "a subject absent from package.json was excused anyway — the subject set is not closed",
  );
});

test("controls: every written-down third-party subject is attested by real repository bytes", async () => {
  // The written-down half of the subject set is the half a human could widen.
  // An entry is admissible only if the repository REALLY states a version for
  // that subject: the attesting file must contain a line where the shape
  // matcher fires and this subject alone attributes every literal on it.
  // `changelog` could be added to the table; no file says `changelog 1.2.3`,
  // so this control would reject it.
  assert.ok(Object.keys(ATTESTED_SUBJECTS).length > 0, "the attested-subject table is empty");
  const pins = await attestedPins();

  for (const [subject, file] of Object.entries(ATTESTED_SUBJECTS)) {
    // attestedPins() throws if the file states no version, so reaching here is
    // already the attestation. What is checked additionally is that the number
    // it lifted is REALLY IN THE FILE — a lift that quietly defaulted would
    // otherwise look identical to a lift that worked.
    const body = await read(join(repoRoot, file));
    assert.ok(pins[subject], `no version was lifted for ${JSON.stringify(subject)} from ${file}`);
    assert.ok(
      body.includes(pins[subject]),
      `the version lifted for ${JSON.stringify(subject)} (${pins[subject]}) does not appear ` +
        `in ${file} at all — it was manufactured, not read`,
    );
  }

  // A subject whose attesting file says nothing about it must be a HARD ERROR,
  // not a silent skip: a table entry nobody attests widens the set of numbers
  // this gate excuses. `changelog` is the standing example — the repository
  // names it constantly and never states `changelog 1.2.3`. Asserted against
  // the real files rather than a mocked one.
  for (const file of new Set(Object.values(ATTESTED_SUBJECTS))) {
    const body = await read(join(repoRoot, file));
    const re = new RegExp(`(?:^|[^\\w@/-])changelog[ \\t]*(?:version[ \\t]*)?[@:<>=~^*]*[ \\t]*\\d+\\.\\d+\\.\\d+`, "i");
    assert.ok(
      !re.test(body),
      `control failed: ${file} now states a version for \`changelog\`, so it is no longer ` +
        `the example of a subject that cannot be attested`,
    );
  }
});

test("controls: every attributable subject is either pinned or named as exempt", async () => {
  // The pin check is what makes attribution more than adjacency. A subject that
  // reaches the gate with no pin and no exemption would fall back to adjacency
  // silently, reopening cert's class for that one name. There is no such
  // subject today; this asserts it stays that way, and names the offender.
  const pkg = JSON.parse(await read(join(siteRoot, "package.json")));
  const subjects = thirdPartySubjects(pkg, await attestedPins());
  assert.ok(subjects.length > 0, "the derived third-party subject set is empty");

  for (const s of subjects) {
    assert.ok(
      s.pin !== null || PIN_EXEMPT.has(s.name),
      `subject ${JSON.stringify(s.name)} is attributable but carries no pin and is not in ` +
        `PIN_EXEMPT. It would be excused by adjacency alone, which is exactly the hole ` +
        `cert measured.`,
    );
  }

  // The exemption list is not a place to quietly park subjects: every name in
  // it must actually BE a subject, and the cost of each is written down above.
  for (const name of PIN_EXEMPT) {
    assert.ok(
      subjectNames(subjects).includes(name),
      `PIN_EXEMPT names ${JSON.stringify(name)}, which is not an attributable subject at all`,
    );
  }
  assert.deepEqual(
    [...PIN_EXEMPT],
    [],
    "the pin exemption list is no longer empty. Every entry is a subject excused by adjacency " +
      "alone, which is the hole cert measured — adding one needs an argument, not a default.",
  );
});

test("controls: B11 — the CLI's own name can never become attributable", async () => {
  // cert's B11, the only FAIL-OPEN class they found. site/package.json is
  // NAMED `agentskills-site`. Nothing reads `name` today, but if the
  // derivation ever widens to it, or tokenises hyphenated names, then
  // `agentskills` enters the excuse list and THE GATE EXCUSES PRECISELY THE
  // FABRICATION IT EXISTS TO CATCH. cert asked for this to trip a named
  // assertion rather than a mysterious diff, so here it is by name.
  const pkg = JSON.parse(await read(join(siteRoot, "package.json")));
  assert.match(pkg.name, /agentskills/, "control failed: package.json no longer carries the CLI's name at all");

  const subjects = thirdPartySubjects(pkg, await attestedPins());
  for (const s of subjectNames(subjects)) {
    assert.ok(
      !/agentskills/i.test(s),
      `the subject set contains ${JSON.stringify(s)}, which names the CLI itself. Every ` +
        `hand-typed CLI version adjacent to it is now excused, and this gate is inert.`,
    );
  }

  // Positive control: the derivation really would carry a name through if one
  // were declared, so the loop above is not passing over an inert mechanism.
  const widened = thirdPartySubjects(
    { ...pkg, dependencies: { ...pkg.dependencies, agentskills: "1.3.0" } },
    await attestedPins(),
  );
  assert.ok(
    subjectNames(widened).includes("agentskills"),
    "control failed: a declared dependency named agentskills did not enter the subject set, " +
      "so the assertion above is not exercising the path it claims to guard",
  );
});

test("controls: the pin check couples the gate to the declared versions", async () => {
  // The new coupling, made load-bearing. If the pin comparison is ever removed
  // and attribution falls back to adjacency, THIS is the test that fails:
  // prose stating a version the repository no longer declares must report.
  const pkg = JSON.parse(await read(join(siteRoot, "package.json")));
  const attested = await attestedPins();
  const subjects = thirdPartySubjects(pkg, attested);

  assert.deepEqual(
    handTypedCliVersions("This site is built with Astro 7.2.4.", subjects),
    [],
    "control failed: the site's real, correctly-pinned Astro version does not pass",
  );

  const bumped = thirdPartySubjects(
    { ...pkg, dependencies: { ...pkg.dependencies, astro: "7.3.0" } },
    attested,
  );
  assert.deepEqual(
    handTypedCliVersions("This site is built with Astro 7.2.4.", bumped),
    ["7.2.4"],
    "prose naming a version the pin has moved away from was excused — the gate is " +
      "checking adjacency only, and cert's six-line class is reopened",
  );
});

test("controls: every SHAPE must-catch string is still caught by the GATE", async () => {
  // THE BRIDGE. Changing the predicate retires a control set in place: the
  // strings above go on passing against the shape matcher while proving nothing
  // whatever about the gate that replaced it. This promotes them — every string
  // the shape component must catch, the GATE must also report, or the new
  // attribution layer has quietly excused something the old gate caught.
  const subjects = thirdPartySubjects(JSON.parse(await read(join(siteRoot, "package.json"))), await attestedPins());
  for (const s of SHAPE_MUST_CATCH) {
    for (const line of s.split("\n")) {
      if (!VERSION_LITERAL.test(line)) continue;
      assert.ok(
        handTypedCliVersions(line, subjects).length > 0,
        `the shape component catches ${JSON.stringify(line)} but the GATE excuses it — ` +
          `the attribution layer has retired a control that still looks green`,
      );
    }
  }
  for (const s of SHAPE_MUST_NOT_CATCH) {
    assert.deepEqual(
      handTypedCliVersions(s, subjects),
      [],
      `the gate reported a literal in text the shape component rejects: ${JSON.stringify(s)}`,
    );
  }
});

test("no CLI version is hand-typed into a site-authored file", async () => {
  const files = await siteSourceFiles();
  assert.ok(files.length > 0, "the site-source enumeration found no files");
  const subjects = thirdPartySubjects(JSON.parse(await read(join(siteRoot, "package.json"))), await attestedPins());
  const offenders = [];
  for (const f of files) {
    const body = await read(join(siteRoot, f));
    for (const [i, line] of body.split("\n").entries()) {
      // Version literals attributed to a named third party are that party's,
      // not the CLI's, and stating them is legitimate. Anything else is suspect.
      for (const hit of handTypedCliVersions(line, subjects)) {
        offenders.push(`${f}:${i + 1}: ${hit} — in: ${line.trim().slice(0, 100)}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `hand-typed CLI version(s) in site-authored files. The displayed CLI ` +
      `version must be derived (proposal §7.4), never typed. A version that ` +
      `belongs to a named dependency is fine; these are attributed to nothing ` +
      `but the CLI:\n  ${offenders.join("\n  ")}`,
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
