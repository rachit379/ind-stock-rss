# India Markets RSS — Static Feed (GitHub Pages)

A consolidated RSS feed for Indian markets, built server-side by GitHub Actions every 5 minutes and rendered as a static site.
- **Auto-refresh:** 60 seconds on the client
- **Manual refresh** button to fetch latest `data/feeds.json`
- **Filters:** full-text search, per-source filter, India/Equity heuristic

## Deploy

1. **Create repo** on GitHub with this folder structure.
2. Enable **Pages**: Settings → Pages → Source = `main` branch, `/ (root)`.
3. The workflow runs every 5 minutes and on any push, generating `data/feeds.json`.
4. Visit `https://<your-username>.github.io/<repo>/` to see the live feed.

## Local dev
```bash
pip install feedparser pyyaml
python scripts/fetch_feeds.py
python -m http.server 8080
# open http://localhost:8080
```

## Notes
- GitHub cron minimum is **5 minutes**. For true 60-second rebuilds, use a small worker/proxy.
- Sources live in `feeds.yml`.
