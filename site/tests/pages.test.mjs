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
import { PAGES, markdownSurface } from "../scripts/prepare-content.mjs";
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
