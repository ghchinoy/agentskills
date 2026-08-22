// pages.test.mjs — Phase 6 AC4, plus the link/asset resolution that makes the
// enumeration mean something.
//
// ── AC4 IS AN ENUMERATION, NOT A SEARCH ─────────────────────────────────────
//
// The criterion is "no page derived from `AGENTS.md`, `testdata/` or
// `.agents/`". The tempting instrument is a grep over dist/ for a phrase from
// one of those files. It is the wrong instrument, and not by a little: a grep
// that returns nothing looks exactly the same whether the content is absent or
// the selector is dead, and a dead selector is the more likely of the two the
// moment anyone edits the source it was copied from.
//
// So this file enumerates. EXPECTED_PAGES below names every HTML file the build
// may emit and where each one came from; the test asserts the built set equals
// it EXACTLY. An exhaustive enumeration has no zero in it for a dead selector
// to produce: an extra page fails, a missing page fails, and a page whose
// declared source is not what actually rendered fails the provenance check.
//
// The structural half is stronger still, and it is the half that will still be
// true in Phase 7: a page can only exist for a source in PAGES, and
// prepare-content.mjs refuses to run unless every source in PAGES is inside the
// release-archive surface declared by `.goreleaser.yaml` — which does not
// contain `AGENTS.md`, `testdata/` or `.agents/`. See allowlist-drift.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { DEFERRED, PAGES, markdownSurface } from "../scripts/prepare-content.mjs";
import {
  BASE,
  dist,
  distHtmlFiles,
  headings,
  innerHtml,
  markdownHeadings,
  read,
  readDist,
  repoRoot,
  siteRoot,
  toText,
} from "./_helpers.mjs";

// EVERY page the build emits, and its source. Hand-declared, deliberately:
// this is the statement being tested, so deriving it from the build would make
// it unfalsifiable.
//
//   kind "repo-doc"      — templated from a repository document by
//                          scripts/prepare-content.mjs.
//   kind "site-authored" — prose written for the site and tracked in the site
//                          tree. Site B has exactly one (proposal §8.3 keeps
//                          this class deliberately small).
//   kind "framework"     — emitted by Starlight itself with no repository
//                          source at all.
const EXPECTED_PAGES = [
  { file: "404.html", kind: "framework", source: "@astrojs/starlight built-in 404" },
  { file: "index.html", kind: "site-authored", source: "site/src/content/docs/index.md" },
  { file: "users-guide/index.html", kind: "repo-doc", source: "docs/users_guide.md" },
];

// The three trees Phase 6 AC4 names, as path prefixes.
const FORBIDDEN_SOURCE_PREFIXES = ["AGENTS.md", "testdata/", ".agents/"];

/** The gate AC4 is: does any enumerated source come out of a forbidden tree? */
function forbiddenSources(sources) {
  return sources.filter((s) =>
    FORBIDDEN_SOURCE_PREFIXES.some((p) => s === p || s.startsWith(p)),
  );
}

test("dist/ exists (the build ran before the suite)", () => {
  assert.ok(existsSync(dist), "dist/ not found — run `npm run build` first");
});

test("AC4: the built page set is exactly the enumerated one", async () => {
  const built = await distHtmlFiles();
  assert.deepEqual(
    built,
    EXPECTED_PAGES.map((p) => p.file).sort(),
    `the built page set differs from the enumeration in this file. Every page ` +
      `on this site is accounted for by name and by source; add or remove the ` +
      `entry deliberately rather than widening the assertion.`,
  );
});

test("AC4: every repo-derived page's source is a classified, published source", async () => {
  const derived = EXPECTED_PAGES.filter((p) => p.kind === "repo-doc").map((p) => p.source).sort();
  assert.deepEqual(
    derived,
    PAGES.map((p) => p.src).sort(),
    "the enumerated repo-derived sources and prepare-content.mjs's PAGES table disagree",
  );

  // Each published page really is at the URL its slug claims.
  for (const p of PAGES) {
    assert.ok(
      existsSync(join(dist, p.slug, "index.html")),
      `PAGES declares slug ${JSON.stringify(p.slug)} but dist/${p.slug}/index.html does not exist`,
    );
  }
});

test("AC4: no enumerated source lies in AGENTS.md, testdata/ or .agents/", async () => {
  const sources = EXPECTED_PAGES.filter((p) => p.kind !== "framework").map((p) => p.source);

  // Positive control FIRST. Without it, a verdict of "none" is equally
  // consistent with a predicate that can never say anything.
  assert.deepEqual(
    forbiddenSources([...sources, "AGENTS.md", "testdata/a2acli_GEMINI.md", ".agents/skills/beads/SKILL.md"]),
    ["AGENTS.md", "testdata/a2acli_GEMINI.md", ".agents/skills/beads/SKILL.md"],
    "the AC4 predicate failed to flag planted forbidden sources",
  );

  assert.deepEqual(
    forbiddenSources(sources),
    [],
    `a page is derived from a tree the release archive does not ship`,
  );

  // And the structural reason it cannot happen by accident: none of those trees
  // is in the candidate set at all.
  const surface = await markdownSurface();
  assert.deepEqual(
    surface.filter((f) => FORBIDDEN_SOURCE_PREFIXES.some((p) => f === p || f.startsWith(p))),
    [],
    "a forbidden tree appeared in the release-archive candidate set",
  );
});

test("provenance: each page's rendered content comes from the source claimed for it", async () => {
  for (const page of EXPECTED_PAGES) {
    const html = await readDist(page.file);

    if (page.kind === "repo-doc") {
      // The page's H1 is the source's H1, so the H1 identifies the source. A
      // page that had been templated from a different file would render a
      // different H1 and fail here.
      const src = await read(join(repoRoot, page.source));
      const srcH1 = markdownHeadings(src).find((h) => h.level === 1);
      assert.ok(srcH1, `${page.source} has no H1`);
      const rendered = headings(html).find((h) => h.id === "_top");
      assert.ok(rendered, `${page.file} has no page title heading`);
      assert.equal(
        rendered.text,
        srcH1.text,
        `${page.file} renders a title that is not ${page.source}'s H1`,
      );
    }

    if (page.kind === "site-authored") {
      const src = await read(join(siteRoot, page.source.replace(/^site\//, "")));
      assert.ok(src.length > 0, `${page.source} is empty`);
      // A distinctive clause from the tracked source must be on the page.
      const marker = "Not to be confused with";
      assert.ok(src.includes(marker), `${page.source} no longer contains ${JSON.stringify(marker)}`);
      assert.ok(
        toText(html).includes(marker),
        `${page.file} does not render ${page.source} (marker missing)`,
      );
    }
  }
});

test("Q7: the landing page carries the not-to-be-confused-with note and both spec links", async () => {
  const html = await readDist("index.html");
  const body = innerHtml(html, '<div class="sl-markdown-content"');
  assert.ok(body, "landing page has no rendered markdown region");
  const text = toText(body);

  assert.match(text, /Not to be confused with/i);
  // The two repositories the name collides with (proposal §2.1), and the two
  // standards' sites the note is required to link.
  for (const href of [
    "https://github.com/agentskills/agentskills",
    "https://github.com/ghchinoy/agent-skills",
    "https://agentskills.io",
    "https://agent-plugins.org",
  ]) {
    assert.ok(
      body.includes(`href="${href}"`),
      `the landing page's disambiguation note does not link ${href}`,
    );
  }
});

test("every internal link and asset reference resolves inside dist/", async () => {
  const files = await distHtmlFiles();
  const refs = [];
  for (const file of files) {
    const html = await readDist(file);
    const pageUrl = new URL(
      `${BASE}/${file.replace(/(^|\/)index\.html$/, "$1")}`,
      "https://ghchinoy.github.io",
    );
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const raw = m[1];
      if (/^(https?:|mailto:|data:|#)/.test(raw)) continue;
      const resolved = new URL(raw, pageUrl);
      if (resolved.origin !== pageUrl.origin) continue;
      refs.push({ file, raw, path: resolved.pathname });
    }
  }

  // Positive control: the resolver maps a page-relative link to the same place
  // an absolute one lands, so a broken relative link cannot pass by being
  // resolved against the wrong page.
  assert.equal(
    new URL("./users-guide/", "https://ghchinoy.github.io/agentskills/").pathname,
    "/agentskills/users-guide/",
  );

  const broken = [];
  for (const ref of refs) {
    assert.ok(
      ref.path.startsWith(`${BASE}/`),
      `${ref.file}: ${ref.raw} resolves to ${ref.path}, outside the ${BASE}/ base path`,
    );
    const rel = ref.path.slice(BASE.length + 1);
    const candidates = rel === "" || rel.endsWith("/")
      ? [join(dist, rel, "index.html")]
      : [join(dist, rel), join(dist, rel, "index.html")];
    if (!candidates.some((c) => existsSync(c))) broken.push(`${ref.file}: ${ref.raw} -> ${ref.path}`);
  }
  assert.deepEqual(broken, [], `unresolvable internal references:\n  ${broken.join("\n  ")}`);
  assert.ok(refs.length > 0, "no internal references were checked — the crawl found nothing");
});

test("the published sources contain no relative Markdown link (none to rewrite yet)", async () => {
  // Phase 6 ships no link rewriter, because the one published document has no
  // internal links to rewrite. That is a fact about the corpus, not a promise,
  // so it is enumerated and pinned: the moment a published source gains a
  // relative link, this fails and the rewriter (proposal §7.1's
  // SLUG_BY_BASENAME) has to be built rather than silently shipping a link
  // that 404s under the /agentskills/ base path.
  const relative = [];
  let total = 0;
  for (const page of PAGES) {
    const src = await read(join(repoRoot, page.src));
    for (const m of src.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)/g)) {
      total++;
      const target = m[1].replace(/^<|>$/g, "");
      if (!/^(https?:|mailto:|#)/.test(target)) relative.push(`${page.src}: ${target}`);
    }
  }
  assert.deepEqual(
    relative,
    [],
    `relative Markdown link(s) in a published source, with no rewriter to ` +
      `resolve them:\n  ${relative.join("\n  ")}`,
  );
  assert.ok(total > 0, "no Markdown links found at all — the matcher is dead, not the corpus empty");
});

// ── FIX-4: THE LANDING PAGE'S DEFERRAL CLAIM ────────────────────────────────
//
// The landing page tells the reader what is NOT here. That sentence had no gate
// at all: replacing it with a flat contradiction left the suite fully green, so
// every property below was free to rot silently, and two of them already had.
//
// The sentence made two claims and both were false. It said the remaining
// documentation "is in docs/" — but README.md and skills/agentskills/SKILL.md
// are deferred and neither is under docs/. And it ranged over THE REPOSITORY,
// while the register behind it ranges only over the release-archive surface, so
// AGENTS.md, .beads/README.md, .agents/skills/beads/SKILL.md and four testdata
// files were silently claimed as "recorded" by a register that cannot hold them.
//
// The repair scopes the sentence to the surface the register actually covers,
// and this gate holds it there. Note which way the checks run: the page is
// measured AGAINST THE REGISTER, and the register against .goreleaser.yaml via
// the build's own markdownSurface — never the reverse. A gate that read its
// expectations off the page would certify whatever the page happened to say.
const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** Tracked Markdown, so "outside the surface" is a measured set, not a belief. */
function trackedMarkdown() {
  return execFileSync("git", ["ls-files", "*.md"], { cwd: repoRoot })
    .toString().trim().split("\n").filter(Boolean);
}

/** Every directory that actually exists in the repository, derived from git. */
function realDirectories() {
  const dirs = new Set();
  for (const f of execFileSync("git", ["ls-files"], { cwd: repoRoot }).toString().trim().split("\n")) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  return dirs;
}

/** The rendered <p> elements, so a claim can be scoped to its own paragraph. */
function paragraphs(body) {
  return [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => ({
    html: m[1],
    text: toText(m[1]).replace(/\s+/g, " ").trim(),
  }));
}

/**
 * Every place a passage says the deferred documents ARE.
 *
 * KEYED TO THE CLAIM, NOT TO LINK SYNTAX. An earlier version read only
 * `tree/` hrefs, so the identical falsehood written as plain prose — "they all
 * remain in the docs/ directory" — sailed through green, and a `blob/` URL
 * evaded it the same way. Both forms are read here, and the prose side is
 * anchored to directories that REALLY EXIST in this repository so that ordinary
 * words are not mistaken for locations.
 */
export function locativeClaims(passage, realDirs) {
  // Keyed by dir so the same place claimed twice is one claim, but the FORM is
  // carried through: a link and a prose mention are different defects to fix
  // and must not produce the same failure message.
  const out = new Map();
  for (const m of passage.html.matchAll(
    /href="https:\/\/github\.com\/[^/"]+\/[^/"]+\/(?:tree|blob)\/[^/"]+\/([^"]*)"/g,
  )) {
    const p = decodeURIComponent(m[1]).replace(/\/+$/, "");
    if (p && !out.has(p)) out.set(p, { dir: p, via: "a repository link" });
  }
  for (const m of passage.text.matchAll(/(?:^|[\s(`"'])([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)\/(?=[\s,.;:)`"']|$)/g)) {
    if (realDirs.has(m[1]) && !out.has(m[1])) out.set(m[1], { dir: m[1], via: "prose naming a real directory" });
  }
  return [...out.values()];
}

/** Which deferred documents a claimed location fails to contain. */
export const notInside = (dir, keys) => keys.filter((k) => k !== dir && !k.startsWith(`${dir}/`));

test("controls: the locative predicate fires, in prose and in links alike", () => {
  // MEASURED, AND THE REASON THIS CONTROL EXISTS: at the current head the live
  // claim names no directory at all, so the loop in the gate below iterates
  // ZERO times. A verdict of "nothing wrong" over an empty set is not evidence,
  // and without this the locative check would be labelled as the defect that
  // shipped while contributing nothing. Here the predicate is exercised
  // directly, on the shapes the real defect took.
  const dirs = new Set(["docs", "skills", "skills/agentskills"]);
  const keys = ["README.md", "docs/development.md", "skills/agentskills/SKILL.md"];

  // The shipped defect, as a LINK — what the old sentence actually was.
  assert.deepEqual(
    locativeClaims({ html: 'in <a href="https://github.com/ghchinoy/agentskills/tree/main/docs">docs/</a>', text: "" }, dirs)
      .map((c) => c.dir),
    ["docs"],
    "the locative predicate missed a tree link",
  );
  // The same defect as PLAIN PROSE, which the previous version passed green.
  assert.deepEqual(
    locativeClaims({ html: "", text: "they all remain in the docs/ directory on GitHub." }, dirs)
      .map((c) => c.dir),
    ["docs"],
    "the locative predicate missed a prose directory claim",
  );
  // And as a blob URL, which also evaded the link-syntax version.
  assert.deepEqual(
    locativeClaims({ html: 'see <a href="https://github.com/o/r/blob/main/docs">here</a>', text: "" }, dirs)
      .map((c) => c.dir),
    ["docs"],
    "the locative predicate missed a blob link",
  );
  // Ordinary prose naming no real directory must NOT be read as a location,
  // or every sentence becomes a locative claim.
  assert.deepEqual(
    locativeClaims({ html: "", text: "the CLI's release archive and/or its docs." }, dirs),
    [],
    "the locative predicate invented a location out of ordinary prose",
  );

  // …and the verdict half really convicts, rather than returning [] always.
  assert.deepEqual(notInside("docs", keys), ["README.md", "skills/agentskills/SKILL.md"]);
  assert.deepEqual(notInside("", ["README.md"]).length, 1);

  // THE SCOPING PROPERTY, kept as a regression control because losing it is not
  // visible from the live page. A correct claim, plus an unrelated link
  // ELSEWHERE on the page: reading the whole body convicts the correct page,
  // reading the claim's own paragraph does not. This is the reviewer's
  // experiment — a correct page must not fail — made permanent.
  const wholeBody =
    '<p>Only the User\'s Guide is published here so far. They remain in the ' +
    '<a href="https://github.com/ghchinoy/agentskills">repository</a> on GitHub, deferred.</p>' +
    '<p>See the <a href="https://github.com/ghchinoy/agentskills/tree/main/skills">skills directory</a>.</p>';
  const claimPara = paragraphs(wholeBody).find((p) => /\bdeferred\b/i.test(p.text));
  assert.ok(claimPara, "the control's own fixture has no deferral paragraph");
  assert.deepEqual(
    locativeClaims(claimPara, dirs),
    [],
    "a correct deferral claim was convicted by a link that is not part of it",
  );
  assert.deepEqual(
    locativeClaims({ html: wholeBody, text: toText(wholeBody).replace(/\s+/g, " ") }, dirs).map((c) => c.dir),
    ["skills"],
    "the control cannot show the difference scoping makes: the unrelated link is invisible even unscoped",
  );
});

test("FIX-4: the landing page's deferral claim is true, and scoped to what the register covers", async () => {
  const html = await readDist("index.html");
  const body = innerHtml(html, '<div class="sl-markdown-content"');
  assert.ok(body, "landing page has no rendered markdown region");
  const text = toText(body).replace(/\s+/g, " ");

  // VACUITY. Everything below ranges over this passage, so if it is gone the
  // whole test would pass by having nothing to judge.
  //
  // The paragraph is located on "deferred" OR "not published": keying it to
  // "deferred" alone meant the ORIGINAL false sentence — which never used that
  // word — failed here at the vacuity guard instead of at the locative check
  // built for it. The founding defect must reach the assertion written for it.
  const para = paragraphs(body).find((p) => /\bdeferred\b|\bnot published\b/i.test(p.text));
  assert.ok(para, "the landing page no longer makes any deferral claim; this gate has nothing to check");
  const sentence = para.text;

  // 1. THE COUNT. Spelled on the page, derived from the register here. Publish
  //    a sixth page or defer a sixth document and the page's number goes stale.
  const counted = /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b\s+(?:more\s+|other\s+|further\s+)?document/i.exec(sentence);
  assert.ok(counted, `the deferral claim states no count of deferred documents: ${JSON.stringify(sentence)}`);
  assert.equal(
    WORD_NUMBERS[counted[1].toLowerCase()],
    Object.keys(DEFERRED).length,
    `the landing page says ${counted[1]} deferred documents; the register holds ${Object.keys(DEFERRED).length}`,
  );

  // 2. THE LOCATIVE HALF — the defect that shipped. Any location the claim
  //    names must actually contain EVERY deferred document. The old sentence
  //    named docs/, which holds three of the five.
  //
  //    SCOPED TO THE PARAGRAPH, not to the page. Reading hrefs out of the whole
  //    body meant any unrelated link elsewhere on the landing page was judged as
  //    though the deferral claim had pointed at it — a CORRECT page failed. The
  //    guard that was supposed to scope it (`sentence.includes("deferred")`) was
  //    a constant true, because the passage is selected by requiring that word.
  const deferredKeys = Object.keys(DEFERRED);
  for (const { dir, via } of locativeClaims(para, realDirectories())) {
    assert.deepEqual(
      notInside(dir, deferredKeys),
      [],
      `the landing page locates the deferred documents in ${JSON.stringify(dir)} ` +
        `(via ${via}), but these are not inside it: ${notInside(dir, deferredKeys).join(", ")}`,
    );
  }

  // 3. THE STRUCTURAL HALF — and READ THE CAVEAT, because this one assertion is
  //    NOT load-bearing and must not be counted as though it were.
  //
  //    It restates a correspondence prepare-content.mjs already enforces at
  //    build time: every candidate must be in PAGES or DEFERRED, so surface
  //    minus published ALWAYS equals DEFERRED whenever the build succeeds. I
  //    tried to plant against it — dropping a DEFERRED row — and the build
  //    rejected the tree before this test ran, so I have no perturbation that
  //    reaches this line. It is unfalsifiable while that guard stands.
  //
  //    It stays because it is what ties the page's SCOPE to the register, and
  //    if the build guard is ever loosened this becomes live. But it is a
  //    restatement, not a gate, and it is labelled so that nobody reads it as
  //    coverage this file provides.
  const surface = await markdownSurface();
  const published = PAGES.map((p) => p.src);
  assert.deepEqual(
    surface.filter((f) => !published.includes(f)).sort(),
    Object.keys(DEFERRED).sort(),
    "the release-archive surface minus the published pages is not what DEFERRED records, " +
      "so the landing page's scoping sentence no longer describes the register",
  );

  // 4. …and the scoping is LOAD-BEARING rather than decorative. If nothing lay
  //    outside the surface, the sentence disclaiming it would be a true
  //    statement about an empty set and this whole distinction would be noise.
  const outsideSurface = trackedMarkdown().filter((f) => !surface.includes(f) && !f.startsWith("site/"));
  assert.ok(
    outsideSurface.length > 0,
    "no tracked Markdown lies outside the release-archive surface, so the landing page's " +
      "out-of-scope sentence describes an empty set and cannot be load-bearing",
  );
  assert.ok(
    /outside the release\s+archive/i.test(sentence) || /not (?:published here|covered)/i.test(text),
    `the landing page no longer disclaims the ${outsideSurface.length} tracked Markdown file(s) ` +
      `outside the release archive: ${outsideSurface.join(", ")}`,
  );
});
