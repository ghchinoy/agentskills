import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

// Starlight's Content Layer loader reads src/content/docs/. That directory
// holds the site-authored landing page (index.md, tracked) and the _generated/
// copies scripts/prepare-content.mjs makes from the repository's own docs at
// build time (gitignored, rebuilt every build). This collection renders them;
// it generates nothing.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
