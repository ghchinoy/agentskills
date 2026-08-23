// Shared plumbing for the guardrail suites: paths, a directory walk, and HTML
// text extraction. NOT a test file — `node --test "tests/*.test.mjs"` never
// picks it up.
//
// Deliberately thin. Anything that decides something (what may be published,
// what a page's source is, what counts as a fabricated claim) lives in the test
// that asserts it or in the module under test, not here — a helper that makes
// the decision would let two "independent" tests agree because they asked the
// same function.

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const here = dirname(fileURLToPath(import.meta.url));
export const siteRoot = join(here, "..");
export const repoRoot = join(siteRoot, "..");
export const dist = join(siteRoot, "dist");

/** The Astro `base` prefix (astro.config.mjs). */
export const BASE = "/agentskills";

/** Recursively list every file under `dir`, as absolute paths. */
export async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

/** Every built HTML file, as paths relative to dist/, "/"-separated, sorted. */
export async function distHtmlFiles() {
  return (await walk(dist))
    .filter((f) => f.endsWith(".html"))
    .map((f) => relative(dist, f).split(sep).join("/"))
    .sort();
}

export function read(path) {
  return readFile(path, "utf8");
}

export function readDist(rel) {
  return readFile(join(dist, rel), "utf8");
}

/** Decode the handful of entities Astro emits in text nodes. */
export function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Strip tags to visible text. */
export function toText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Return the inner HTML of the first element opened by `openTag` (a literal
 * substring such as '<div class="sl-markdown-content"'), matched by counting
 * nested `<tag`/`</tag>` pairs so the region ends where the element does and
 * not at the first stray close.
 */
export function innerHtml(html, openTag, tagName = "div") {
  const start = html.indexOf(openTag);
  if (start === -1) return null;
  const bodyStart = html.indexOf(">", start) + 1;
  const open = new RegExp(`<${tagName}\\b`, "gi");
  const close = new RegExp(`</${tagName}>`, "gi");
  let depth = 1;
  let i = bodyStart;
  while (depth > 0) {
    open.lastIndex = i;
    close.lastIndex = i;
    const o = open.exec(html);
    const c = close.exec(html);
    if (!c) return null;
    if (o && o.index < c.index) {
      depth++;
      i = o.index + o[0].length;
    } else {
      depth--;
      i = c.index + c[0].length;
      if (depth === 0) return html.slice(bodyStart, c.index);
    }
  }
  return null;
}

/** Every `<h1>`–`<h6>` in `html`, as `{ level, id, text }`, in document order. */
export function headings(html) {
  return [...html.matchAll(/<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map((m) => {
    const id = /\bid="([^"]*)"/.exec(m[2]);
    return {
      level: Number(m[1][1]),
      id: id ? id[1] : null,
      text: toText(m[3]),
    };
  });
}

/**
 * Markdown headings in `source`, fence-aware, as `{ level, text, line }`.
 *
 * Fence awareness is not decoration here: `docs/users_guide.md` contains four
 * shell comments (`# Set your active Google Cloud Project ID`, …) inside a
 * ```bash block. A line-anchored `^#` matcher reports 30 headings where there
 * are 26, and would then "prove" the page renders in full by finding four
 * headings that were never headings.
 */
export function markdownHeadings(source) {
  const out = [];
  let fence = null;
  source.split("\n").forEach((line, i) => {
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (fence === null) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (fence !== null) return;
    const m = /^(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2], line: i + 1 });
  });
  return out;
}
