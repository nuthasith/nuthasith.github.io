# nuthasith.github.io

Personal site, live at https://nuthasith.github.io. Built with [Hugo](https://gohugo.io) 0.145.0 (extended) and the LoveIt theme.

## Layout

| Path | What it is |
| --- | --- |
| `quickstart/` | Hugo source. Edit here. |
| `quickstart/content/` | Page text (About, Awards, Projects, Publications, Visitors) |
| `quickstart/layouts/` | Template overrides and shortcodes |
| `quickstart/static/` | Files copied as-is (images, CAD models, `docs/`) |
| `quickstart/themes/hugo_theme_LoveIt/` | Theme, vendored |
| everything else at the root | Built site that GitHub Pages serves. Don't edit by hand. |
| `deploy.sh` | Builds the site and copies it to the root |
| `cloudflare-worker.js` | Source of the visitor-map counter (runs on Cloudflare, not here) |

## Unlisted docs page

`/docs/` lists paper explainers and talk slides. It is not in the menu or sitemap and asks search engines not to index it, but anyone with the link can open it.

To add a doc, put the file in `quickstart/static/docs/` and add a link in `quickstart/static/docs/index.html`.

## Deploy

```bash
./deploy.sh        # hugo build, then copy quickstart/public/* to the root
git add -A && git commit -m "..." && git push
```
