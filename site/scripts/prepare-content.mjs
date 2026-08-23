// prepare-content.mjs — the build-time TEMPLATING step for the agentskills CLI
// docs site (proposal §7.1).
//
// It takes the repository's already-authored Markdown and copies it into
// src/content/docs/_generated/, prepending only the Starlight frontmatter each
// page needs to render. It is deliberately NOT a generator: it runs no binary,
// invents no fact, and writes no prose. docs/ stays the single source of truth.
//
// ── THE ALLOWLIST IS LIFTED, NOT INVENTED ───────────────────────────────────
//
// Which files MAY be published is not a decision this file makes. It is read at
// build time out of `.goreleaser.yaml`'s `archives.files` — the list the repo
// already maintains to decide what ships to users in the release archive:
//
//     files:
//       - README.md
//       - LICENSE*
//       - docs/**/*
//       - skills/**/*
//
// `AGENTS.md`, `testdata/`, `.agents/`, `.beads/` and `.codex/` are not in it,
// so they are not publishable — not because this file lists them as excluded
// (a list of exclusions is a list somebody has to remember to extend), but
// because they never enter the candidate set in the first place. The repo drew
// that line for a reason that has nothing to do with the site, so it will not
// rot when the site is forgotten.
//
// ── AND EVERY CANDIDATE MUST BE CLASSIFIED ──────────────────────────────────
//
// Every Markdown file inside that declared surface must appear in exactly one
// of PAGES (published) or DEFERRED (explicitly not published, with a reason).
// A new `docs/*.md` therefore lands in the candidate set, matches neither
// table, and FAILS the build and `tests/allowlist-drift.test.mjs` until a human
// classifies it. Silence is not a classification.
//
// Phase 6 is the vertical slice: ONE published page, `docs/users_guide.md`.
// The other five candidates are DEFERRED to Phase 7 with their §7.2 destination
// recorded, so the deferral is a decision on the record rather than an
// omission.

import { readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const siteRoot = join(here, "..");
export const repoRoot = join(siteRoot, "..");
const outRoot = join(siteRoot, "src", "content", "docs");
const genRoot = join(outRoot, "_generated");

/** The repo's own declaration of what it publishes. Read, never assumed. */
export const GORELEASER = join(repoRoot, ".goreleaser.yaml");

// ── The classification tables ───────────────────────────────────────────────

// PUBLISHED. One entry per page.
//  - `src`   : path under the repo root. Must be inside the declared surface.
//  - `out`   : path under the gitignored _generated/ staging dir.
//  - `slug`  : the PUBLISHED clean URL, decoupled from `out` so the staging
//              prefix never reaches the public URL space.
//  - `label` : the SIDEBAR label — short plain text, site chrome (Q9). The page
//              TITLE is not here: it is the source H1, read verbatim from the
//              file at build time (Q9), so it cannot be typed wrong here.
export const PAGES = [
  {
    src: "docs/users_guide.md",
    out: "users-guide.md",
    slug: "users-guide",
    label: "User's Guide",
    group: "Start",
  },
];

// NOT PUBLISHED (yet). Every entry needs a reason, and the reason is read by a
// human, not by a matcher — this table exists so that "not on the site" is a
// recorded decision rather than an oversight. Destinations are proposal §7.2.
export const DEFERRED = {
  "README.md":
    "Phase 7 (§7.2): the landing page `/` and `/install/` are built from README " +
    "sections. Phase 6 is a one-doc vertical slice and does not split README.",
  "docs/development.md":
    "Phase 7 (§7.2): publishes at /project/development/.",
  "docs/releasing.md":
    "Phase 7 (§7.2): publishes at /project/releasing/.",
  "docs/process.md":
    "Phase 7 (§7.2, J2): publishes at /project/process/ — it is an engineering " +
    "log, so it goes under Project rather than in the user path.",
  "skills/agentskills/SKILL.md":
    "Phase 7 (§7.2, §7.3): publishes at /skill/ under the §6.4 field contract.",
};

// ── Reading the declared surface out of .goreleaser.yaml ────────────────────

// Extract `archives[].files` entries. Deliberately narrow: it reads the
// `files:` block that sits under `archives:` and stops at the next top-level
// key. If the file's shape changes, this throws rather than silently returning
// a short list — an empty or partial surface would make the drift gate pass by
// having nothing to check, which is the failure mode that matters here.
export function parseArchiveFiles(yamlText) {
  const lines = yamlText.split("\n");
  const patterns = [];
  let inArchives = false;
  let filesIndent = -1;
  for (const line of lines) {
    if (/^\S/.test(line)) inArchives = /^archives:\s*$/.test(line);
    if (!inArchives) {
      filesIndent = -1;
      continue;
    }
    const m = /^(\s*)(?:-\s+)?files:\s*$/.exec(line);
    if (m) {
      filesIndent = m[1].length;
      continue;
    }
    if (filesIndent >= 0) {
      const item = /^(\s*)-\s+(.+?)\s*$/.exec(line);
      if (item && item[1].length > filesIndent) {
        patterns.push(item[2].replace(/^["']|["']$/g, ""));
        continue;
      }
      if (line.trim() !== "") filesIndent = -1;
    }
  }
  if (patterns.length === 0) {
    throw new Error(
      `prepare-content: no archives.files entries found in ${GORELEASER}. ` +
        `The site's page allowlist is LIFTED from that list (proposal §7.1); ` +
        `an empty surface would silently disable the drift gate rather than ` +
        `publish nothing, so this is a hard error.`,
    );
  }
  return patterns;
}

/** Translate one goreleaser file pattern into an anchored RegExp. */
export function patternToRegExp(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        // `**` crosses directory separators; `**/` may also match zero dirs.
        i++;
        if (pattern[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

/** True when `relPath` (repo-relative, "/"-separated) is in the release archive. */
export function inDeclaredSurface(relPath, patterns) {
  return patterns.some((p) => patternToRegExp(p).test(relPath));
}

// Directories that hold no publishable source and that walking would be either
// slow or meaningless. NOTE: this is NOT the exclusion list — `.goreleaser.yaml`
// is. Every path below is already outside the declared surface; skipping them
// only avoids walking large trees. tests/allowlist-drift.test.mjs re-derives
// the candidate set with its own walk that does not share this list.
//
// ── PRUNING IS ANCHORED AT THE REPO ROOT, AND THAT IS LOAD-BEARING ──────────
//
// These are paths, not names. An earlier form of this list was matched against
// each directory's BASENAME at every depth, which quietly took `docs/bin/`,
// `docs/dist/` and `docs/site/` out of the walk — directories that are inside
// `docs/**/*`, i.e. inside the surface `.goreleaser.yaml` declares it ships. A
// Markdown file planted at `docs/bin/hidden.md` was therefore shipped to users,
// classified by neither table, and `npm run build` still exited 0: the gate
// this module documents two paragraphs above could not fail for that input.
//
// Pruning may only ever remove paths that CANNOT be in the declared surface.
// Anchoring at the root is what guarantees that: `docs/` and `skills/` are not
// in this list, so nothing beneath them can be pruned, whatever a subdirectory
// happens to be called.
const SKIP_ROOT_DIRS = new Set([".git", "node_modules", "site", "bin", "dist"]);

/**
 * True when a directory may be skipped by the walk. `relDirPath` is
 * repo-relative and "/"-separated, so a top-level directory is exactly a name
 * with no separator in it — and a nested one can never compare equal.
 */
export function isPrunedDir(relDirPath) {
  return SKIP_ROOT_DIRS.has(relDirPath);
}

/** Every tracked-looking file under the repo, repo-relative, "/"-separated. */
async function walkRepo(dir = repoRoot) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name);
    const rel = relative(repoRoot, abs).split(sep).join("/");
    if (ent.isDirectory()) {
      if (isPrunedDir(rel)) continue;
      out.push(...(await walkRepo(abs)));
    } else {
      out.push(rel);
    }
  }
  return out;
}

/**
 * The CANDIDATE SET: every Markdown file the repo declares it publishes.
 * This is the population the drift gate ranges over.
 */
export async function markdownSurface() {
  const patterns = parseArchiveFiles(await readFile(GORELEASER, "utf8"));
  const files = await walkRepo();
  return files
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .filter((f) => inDeclaredSurface(f, patterns))
    .sort();
}

/**
 * THE DRIFT DECISION, made in exactly one place so every caller reads the same
 * one (the build, and the test). Returns both directions of drift:
 *  - `unclassified`: in the declared surface, in neither table  → a new doc
 *    nobody has decided about. This is what §7.1's drift test is for.
 *  - `stale`: classified but gone from the surface → a renamed or deleted doc
 *    still named by a table, which would otherwise fail later and vaguer.
 */
export async function classifyDrift() {
  const surface = await markdownSurface();
  const classified = new Set([...PAGES.map((p) => p.src), ...Object.keys(DEFERRED)]);
  return {
    surface,
    unclassified: surface.filter((f) => !classified.has(f)),
    stale: [...classified].filter((f) => !surface.includes(f)).sort(),
  };
}

// ── Rendering ───────────────────────────────────────────────────────────────

/**
 * The page TITLE is the source's own H1, verbatim, emoji included (Q9, §7.2).
 * Never invented, never defaulted: a source with no leading H1 is a hard error,
 * because the alternative is putting a plausible string on a page.
 */
export function extractH1(body, srcLabel) {
  const m = /^﻿?#[ \t]+(.+?)[ \t]*$/m.exec(body);
  if (!m || body.slice(0, m.index).trim() !== "") {
    throw new Error(
      `prepare-content: no leading H1 found in ${srcLabel}. The page title is ` +
        `the source H1 verbatim (proposal §7.2, Q9); there is no default and ` +
        `nothing to guess. Add an H1 to the source or remove it from PAGES.`,
    );
  }
  return { title: m[1], rest: body.slice(m.index + m[0].length).replace(/^\n+/, "") };
}

/** YAML-escape a scalar. Titles carry emoji, colons and apostrophes. */
function yamlString(s) {
  return JSON.stringify(String(s));
}

export function withFrontmatter({ title, slug }, body) {
  return (
    ["---", `title: ${yamlString(title)}`, `slug: ${yamlString(slug)}`, "---", ""].join("\n") +
    body
  );
}

async function main() {
  const { unclassified, stale, surface } = await classifyDrift();
  if (unclassified.length > 0 || stale.length > 0) {
    const parts = [];
    if (unclassified.length > 0) {
      parts.push(
        `UNCLASSIFIED source(s) in the release archive surface:\n  ` +
          unclassified.join("\n  ") +
          `\nEvery Markdown file .goreleaser.yaml ships must be either published ` +
          `(PAGES) or explicitly deferred with a reason (DEFERRED) in ` +
          `site/scripts/prepare-content.mjs.`,
      );
    }
    if (stale.length > 0) {
      parts.push(
        `CLASSIFIED but no longer in the surface:\n  ` +
          stale.join("\n  ") +
          `\nThe file was renamed, deleted, or dropped from .goreleaser.yaml.`,
      );
    }
    throw new Error(
      `prepare-content: allowlist drift.\n\n${parts.join("\n\n")}\n\n` +
        `(candidate set: ${surface.length} Markdown file(s) matched by ` +
        `.goreleaser.yaml archives.files)`,
    );
  }

  // Start clean so a removed or renamed page cannot leave a stale copy behind.
  await rm(genRoot, { recursive: true, force: true });
  await mkdir(genRoot, { recursive: true });

  for (const page of PAGES) {
    const srcPath = join(repoRoot, page.src);
    if (!existsSync(srcPath)) {
      throw new Error(
        `prepare-content: source doc not found: ${srcPath}. This step only ` +
          `copies existing docs; it never invents content.`,
      );
    }
    const raw = await readFile(srcPath, "utf8");
    const { title, rest } = extractH1(raw, page.src);
    const outPath = join(genRoot, page.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, withFrontmatter({ title, slug: page.slug }, rest), "utf8");
    console.log(
      `prepared ${page.src} -> _generated/${page.out} ` +
        `(published at /${page.slug}/, title from source H1: ${JSON.stringify(title)})`,
    );
  }

  console.log(
    `prepare-content: ${PAGES.length} page(s) written; ` +
      `${Object.keys(DEFERRED).length} source(s) deferred; ` +
      `candidate set ${surface.length} Markdown file(s) in the ` +
      `.goreleaser.yaml archive surface.`,
  );
}

// Only run when invoked directly. astro.config.mjs and the tests import the
// tables and the drift decision from this module, and must not trigger a build
// step by doing so.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(String(err && err.message ? err.message : err));
    process.exit(1);
  });
}
