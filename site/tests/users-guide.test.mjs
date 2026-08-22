// users-guide.test.mjs — Phase 6 AC2.
//
// "/users-guide/ renders docs/users_guide.md IN FULL, H1 verbatim INCLUDING
//  EMOJI, all emoji-bearing H2 anchors resolving."
//
// What would count as a failure, for each clause:
//
//  * H1 verbatim — the rendered title differs from the source H1 by any
//    character. The live hazard is not the emoji, which nothing touches: it is
//    the APOSTROPHE in "User's Guide". Astro's markdown renderer runs
//    SmartyPants by default, which would ship "User’s" (U+2019) from a source
//    that contains U+0027. astro.config.mjs turns it off; this test is what
//    holds that off, and it fails on exactly one character if it comes back.
//
//  * In full — any heading, paragraph or code line present in the source and
//    absent from the rendered page. Checked by coverage over the source's own
//    lines, not by comparing two totals: a total can match while the content
//    is wrong.
//
//  * Anchors resolving — a heading with no id, or an on-page link whose target
//    id does not exist. Both are enumerated, so the check reports which one.
//
// The heading extraction is FENCE-AWARE and that is load-bearing:
// docs/users_guide.md has four `# …` shell comments inside a ```bash block.
// A naive matcher counts them as headings, then finds them "missing" from the
// page — or, worse, is written to tolerate the mismatch and stops being able
// to see a real one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { PAGES } from "../scripts/prepare-content.mjs";
import {
  headings,
  innerHtml,
  markdownHeadings,
  read,
  readDist,
  repoRoot,
  toText,
} from "./_helpers.mjs";

const PAGE = PAGES.find((p) => p.src === "docs/users_guide.md");
const SOURCE = join(repoRoot, "docs/users_guide.md");

async function loaded() {
  const src = await read(SOURCE);
  const html = await readDist(`${PAGE.slug}/index.html`);
  const body = innerHtml(html, '<div class="sl-markdown-content"');
  assert.ok(body, "no sl-markdown-content region in the rendered page");
  return { src, html, body };
}

test("AC2: the page title is the source H1, verbatim, emoji and apostrophe intact", async () => {
  const { src, html } = await loaded();
  const srcH1 = markdownHeadings(src).find((h) => h.level === 1);
  assert.ok(srcH1, "docs/users_guide.md has no H1");

  // Controls on the SOURCE, so the assertions below cannot pass by ranging over
  // a string that has neither character in it.
  assert.ok(srcH1.text.includes("\u{1F4D6}"), "the source H1 no longer carries the 📖 emoji");
  assert.ok(srcH1.text.includes("'"), "the source H1 no longer carries a straight apostrophe");

  const rendered = headings(html).find((h) => h.id === "_top");
  assert.ok(rendered, "the rendered page has no title heading");
  assert.equal(
    rendered.text,
    srcH1.text,
    "the rendered title is not the source H1 verbatim",
  );
  assert.ok(
    !rendered.text.includes("’"),
    "the rendered title contains a typographic apostrophe (U+2019) the source " +
      "does not have — markdown.smartypants is back on",
  );

  // The document <title> is built from the same string.
  const docTitle = /<title>([\s\S]*?)<\/title>/.exec(html);
  assert.ok(docTitle, "no <title> element");
  assert.ok(
    toText(docTitle[1]).startsWith(srcH1.text),
    `<title> does not open with the source H1: ${JSON.stringify(toText(docTitle[1]))}`,
  );
});

test("AC2: every source heading renders, at its own level and in order", async () => {
  const { src, html, body } = await loaded();
  const source = markdownHeadings(src);

  // The H1 is rendered by Starlight outside the markdown region (it comes from
  // the frontmatter title, which prepare-content.mjs took from this same H1),
  // so the rendered sequence is that title followed by the body's headings.
  const title = headings(html).find((h) => h.id === "_top");
  const rendered = [{ level: 1, text: title.text }, ...headings(body).map((h) => ({ level: h.level, text: h.text }))];

  assert.deepEqual(
    rendered,
    source.map((h) => ({ level: h.level, text: h.text })),
    "the rendered heading sequence differs from the source's",
  );

  // Guard against a vacuous pass, and against the fence bug in the other
  // direction: the four `# …` lines inside the bash block must NOT be here.
  assert.ok(source.length > 1, "fence-aware extraction found no headings");
  assert.ok(
    !source.some((h) => h.text.startsWith("Set your ")),
    "a shell comment inside a fenced block was read as a heading",
  );
});

test("AC2: every heading has an id and every on-page anchor resolves to one", async () => {
  const { html, body } = await loaded();

  const withoutId = headings(body).filter((h) => !h.id).map((h) => h.text);
  assert.deepEqual(withoutId, [], `heading(s) rendered with no id: ${withoutId.join(", ")}`);

  const ids = new Set(headings(html).map((h) => h.id).filter(Boolean));
  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => decodeURIComponent(m[1]));
  assert.ok(anchors.length > 0, "the page carries no on-page anchors at all");
  const dangling = [...new Set(anchors)].filter((a) => !ids.has(a));
  assert.deepEqual(dangling, [], `anchor(s) with no matching id: ${dangling.join(", ")}`);
});

test("AC2: the emoji-bearing H2s each resolve from the on-page table of contents", async () => {
  const { src, html, body } = await loaded();
  const EMOJI = /\p{Extended_Pictographic}/u;

  const emojiH2s = markdownHeadings(src).filter((h) => h.level === 2 && EMOJI.test(h.text));
  // The clause is about emoji-bearing H2s, so a corpus with none would make it
  // vacuous. It has some; this pins that.
  assert.ok(emojiH2s.length > 0, "no emoji-bearing H2 in the source — the clause has no subject");

  const byText = new Map(headings(body).map((h) => [h.text, h]));
  const unresolved = [];
  for (const h2 of emojiH2s) {
    const rendered = byText.get(h2.text);
    if (!rendered || !rendered.id) {
      unresolved.push(`${h2.text}: not rendered with an id`);
      continue;
    }
    // The table of contents links to it, and the link target is the id that
    // actually exists on the heading.
    const href = `href="#${encodeURI(rendered.id)}"`;
    if (!html.includes(href) && !html.includes(`href="#${rendered.id}"`)) {
      unresolved.push(`${h2.text}: id ${JSON.stringify(rendered.id)} has no on-page link`);
    }
  }
  assert.deepEqual(unresolved, [], `emoji-bearing H2 anchors not resolving:\n  ${unresolved.join("\n  ")}`);
});

test("AC2: the page renders the source in full", async (t) => {
  const { src, html, body } = await loaded();
  const pageText = toText(html).replace(/\s+/g, " ");

  // Coverage over the source's own lines. For each line, take its longest run
  // of characters that markdown passes through UNCHANGED, and require that run
  // on the page.
  //
  // The runs are cut by SPLITTING on markdown-significant characters, never by
  // deleting them. Deleting is what an earlier draft of this test did, and it
  // is a fabricating instrument: `./skills_report.md` with `_` deleted becomes
  // `./skills report.md`, a string that exists in neither the source nor the
  // page, and the test then reports "missing content" that was never missing.
  // A needle this measure looks for must be a literal substring of the source.
  //
  // Structural line prefixes — list markers, heading hashes, blockquote marks —
  // are stripped first: they are rendered as structure, not as text, so `1. ` is
  // legitimately absent from the page's text content.
  //
  // Short runs are skipped: they carry no evidence and would match by accident.
  // The number of lines actually checked is asserted, so a change that made
  // every line unmeasurable would fail rather than pass.
  // Parentheses are NOT in the passthrough class, even though a bare `(` in
  // prose does render as `(`. In `[label](url)` they delimit a link
  // destination, and a run allowed to cross one swallows the URL — which the
  // page carries in an href, not in its text. Cutting at every paren costs a
  // little coverage and removes a whole class of false "missing content".
  const PASSTHROUGH = /[^\p{L}\p{N} '".,:;!?/+-]+/u;
  const missing = [];
  let checked = 0;
  for (const [i, line] of src.split("\n").entries()) {
    const stripped = line.replace(/^\s*(?:>\s*)*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)?/, "");
    const runs = stripped
      .split(PASSTHROUGH)
      .map((s) => s.replace(/\s+/g, " ").trim());
    const longest = runs.sort((a, b) => b.length - a.length)[0] ?? "";
    if (longest.length < 24) continue;
    // Self-check on the needle: it must be a literal substring of the raw
    // source line, whitespace-collapsed. If it is not, the extractor invented
    // it and no verdict about the page can be drawn from it.
    assert.ok(
      line.replace(/\s+/g, " ").includes(longest),
      `the coverage extractor produced a needle absent from its own source line ` +
        `${i + 1}: ${JSON.stringify(longest)}`,
    );
    checked++;
    if (!pageText.includes(longest)) missing.push(`line ${i + 1}: ${JSON.stringify(longest)}`);
  }

  // The figure and its population, emitted by the instrument that measured
  // them, so a report can quote a number that was never separately typed.
  const lines = src.split("\n").length;
  const nonBlank = src.split("\n").filter((l) => l.trim()).length;
  t.diagnostic(
    `coverage: ${checked} of ${nonBlank} non-blank source lines (${lines} total) ` +
      `carried a passthrough run of >=24 characters; ${missing.length} of those ${checked} ` +
      `were absent from the rendered page`,
  );

  assert.deepEqual(missing, [], `source content missing from the page:\n  ${missing.join("\n  ")}`);
  assert.ok(
    checked >= 50,
    `only ${checked} source lines were long enough to check — the coverage ` +
      `measure has gone blind, which is not the same as the page being complete`,
  );

  // The body region is not empty and is not a stub: it holds the code blocks
  // the guide is mostly made of.
  assert.ok(body.includes("<pre"), "the rendered body contains no code block");
});
