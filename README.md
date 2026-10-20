# F1 design-only static preview

Uses the production-derived frontend from the populated sandbox, with frozen, attributed F1DB 2021 representative API responses. No live backend or production connection.

Run locally with `python -m http.server 8080 --directory static-preview` from the bundle directory, then open http://127.0.0.1:8080/.

For GitHub Pages publish only this `static-preview/` folder to an isolated preview repo/branch. GitHub Pages must be configured to serve the folder as its site root. No Python service, secrets, or SQLite required.

Comparison supports only the four stored pairs; unsupported combinations are deliberately marked unavailable. Starting grid was already absent from the source sandbox. Published URL and UI remain to be browser-verified.

Do not confuse this static preview with the actual production application. See ATTRIBUTION.md.
