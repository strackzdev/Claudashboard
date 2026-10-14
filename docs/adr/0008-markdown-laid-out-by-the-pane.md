# 0008: Markdown laid out by the pane

Date: 2026-10-15 · Status: accepted

## Context

The rendered markdown view drew a window of the file's source lines with the engine's `Markdown` element. That element lays the text out itself: it joins a paragraph's lines, wraps them and draws tables its own way, and says nothing of how many rows it took. A window of source lines therefore drew taller or shorter than its box. The end of a long file was cut off and could not be scrolled to, rows from an earlier draw showed through where it overflowed, scrolling one line could move nothing or re-wrap a whole paragraph, and a window that began inside a table drew it as raw pipes.

## Decision

`explorer/media/markdown.ts` (pure) lays the file out as rows of styled spans at the pane's width: headings, paragraphs joined and wrapped at words, lists with hanging indents, quotes, framed code blocks, rules, and tables with borders, aligned columns and wrapped cells (one cell per row when the pane is too narrow for the columns). Each row knows the source line it came from. The rendered view scrolls by these rows; the client draws each as `Text`.

## Consequences

- The view never overflows its box, scrolls one row at a time to the very end, and keeps its place when `m` switches between the source and the rendered view.
- It draws the markdown the files in a repository use; rarer syntax (nested block quotes, HTML beyond `<details>`/`<summary>`, footnotes, reference links) shows as text.
- Code blocks are not syntax-highlighted in the rendered view; `m` shows the source, which is.
- The layout is kept for the last file and width, so a draw or a key does not lay the file out again.
