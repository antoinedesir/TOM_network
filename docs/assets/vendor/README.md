# Vendored libraries

Copied here so the site keeps working offline and makes no requests beyond
Google Fonts.

| file | from | licence |
|---|---|---|
| d3-dispatch.min.js | npm `d3-dispatch@3` | ISC |
| d3-quadtree.min.js | npm `d3-quadtree@3` | ISC |
| d3-timer.min.js | npm `d3-timer@3` | ISC |
| d3-force.min.js | npm `d3-force@3` | ISC |

Used by `assets/research.js` for the live network simulation. Load order matters:
dispatch, quadtree, timer, then force.
