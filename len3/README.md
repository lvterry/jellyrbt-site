# Len3 Design System

Static documentation for **01 · Foundations**, **02 · Components**, and **03 · Product Components**. The layout follows the three-column documentation structure of [UI SDK](https://ui-sdk.dev/docs).

From the repository root:

```sh
npm start                             # http://localhost:8000/len3/
node len3/build.mjs                   # regenerate HTML, token CSS and the search index
node --test len3/tests/*.test.mjs      # verify the generated site
```

The generated files are checked in so the site works on a plain static host without Node.js at deploy time. Edit `src/content.mjs` for usage notes and navigation, `src/specimens.mjs` and `assets/specimens.css` for the web examples, and `data/` when reconciling the Figma inventory.

## Sources and coverage

- [LEN3 Design System in Figma](https://www.figma.com/design/vRvQAPYfGk0WDuEX6tNDUO/LEN3-Design-System): the live source of truth. The site links to the Figma pages and known specimen nodes.
- The local `len3-design-explorer` handoff and November 3, 2026 Figma audit provide the component inventory, 82 variables, and the typography and elevation specs. The documented November 24 Input update adds the optional Calendar and Clock specimens.
- Direct live-canvas verification was unavailable during this build. The handoff specifies 11 text styles; the audit counted 13. The two styles without recorded metrics and any other changes after the snapshot still need checking in Figma.
- The examples are browser specimens, not a production component package nor pixel exports from Figma. Patterns, Templates, Guidelines, and Playground are outside this site's scope.
