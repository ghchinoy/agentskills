// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

import { PAGES } from "./scripts/prepare-content.mjs";

// Hosting: the DEFAULT project GitHub Pages site at
// https://ghchinoy.github.io/agentskills/ (proposal §10.4, Q3 — no custom
// domain). Project Pages serve from a sub-path, so `site` is the origin and
// `base` is the "/agentskills" prefix. Astro and Starlight make their own links
// and assets base-aware given these two values, so no URL is hand-prefixed.
export default defineConfig({
  site: "https://ghchinoy.github.io",
  base: "/agentskills",

  // ── SMARTYPANTS OFF, AND IT IS LOAD-BEARING HERE ──────────────────────────
  //
  // Astro's markdown renderer runs SmartyPants by default, which rewrites
  // ASCII quotes and dashes into typographic ones. This site's entire claim is
  // that it renders the repository's declared bytes: `docs/users_guide.md`'s
  // own H1 is `# User's Guide: agentskills 📖`, with a U+0027 apostrophe the
  // repository actually contains. Left on, the site would ship a character the
  // source does not have, in the one string Q9 requires be verbatim.
  //
  // Site A (agent-skills) reached the same setting from the same reasoning and
  // measured 34 of its 58 pages differing byte-for-byte with the flag on. This
  // is that decision applied independently, not imported.
  markdown: { smartypants: false },

  integrations: [
    starlight({
      // The SITE title (masthead, and the suffix on every <title>). "agentskills
      // CLI", not "agentskills": the extra word is the cheap half of the fix
      // for the three-way name collision in proposal §2.1 / Q7 — this repo, the
      // owner's `agent-skills` catalog, and the standard's own
      // `agentskills/agentskills`. The other half is the one-line
      // "not to be confused with" note on the landing page.
      title: "agentskills CLI",

      // The brand seam. Copied byte-for-byte from site A's
      // src/styles/tokens.css (Q12: copy, do not package), so the two sites
      // match and drift is a visible, cheap-to-fix diff.
      customCss: ["./src/styles/tokens.css"],

      // Search: left at Starlight's default (on). The searchable thing is this
      // site's own content and the index is built from the bytes on the page,
      // so the box asserts no capability the CLI does not have. (binder
      // disables it because a search box would claim a PRODUCT feature binder
      // lacks — that is a conclusion that does not transfer; the reasoning is
      // what transfers, and here it points the other way.)

      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/ghchinoy/agentskills",
        },
      ],

      // Derived from the one classification table in prepare-content.mjs, so
      // the sidebar cannot list a page the build does not publish, or omit one
      // it does. Labels are short plain text (site chrome); the PAGE titles are
      // the source H1s, verbatim and emoji-bearing (Q9), and are never typed
      // here.
      sidebar: [
        {
          label: "Start",
          items: [
            { label: "What agentskills is", link: "/" },
            ...PAGES.filter((p) => p.group === "Start").map((p) => ({
              label: p.label,
              slug: p.slug,
            })),
          ],
        },
      ],
    }),
  ],
});
