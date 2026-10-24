# Writing

Short pieces live here as Markdown. To publish one, add a file to `notes/`:

```
---
title: Market note: the evening peak that wasn't
summary: One or two sentences shown in the feed and as the page description.
date: 2026-11-03
tags: markets, trading
kind: market
---

Body in Markdown. Fenced code blocks are highlighted, tables work, and TeX
between $...$ or $$...$$ is rendered by MathJax.
```

Fields: `tags` are keys from `TAGS` in `blog/content.py` (markets, trading,
forecasting, ai, renewables, building; the first is the primary one); `kind`
is `note`, `market` or `essay`; `sample: true` adds a placeholder badge.
The file name (without `.md`) is the URL under `/writing/`, unless `slug:` is set.

The long research posts stay as HTML templates in `templates/posts/` and are
registered in `POSTS` in `blog/content.py`, with their animated cards.
