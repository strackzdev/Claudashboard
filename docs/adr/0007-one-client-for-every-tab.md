# 0007: One client module draws every tab

Date: 2026-10-15 · Status: accepted

## Context

The pane's body became two tabs (files, agents), with a finder and a help overlay over them. Keys reach a client module only while a click has given it the focus. Escape hands the focus back to the prompt, and a client that leaves the tree loses it. If each tab were its own client, or the tab bar a row of pane `Button`s, switching tabs would drop the keyboard and the person would have to click again.

## Decision

One client module (`explorer/client.tsx`, key `explorer`) draws the box itself, frame and all, with the tab strip on its top right edge (a `Box` border has no joints, so the frame is text: `views.tsx` `boxTop` joins the edge to the tabs, the active one left open into the box), and whichever body shows: the files, the agents tab, the finder or the help. `bodyProps` (pure) chooses the body from the `view` atom (tab, help, scroll) and the explorer's `finder`, and the drawing for the bodies other than the files lives in `explorer/views.tsx`, which the client imports. `register.tsx` routes each key by what shows: the help first, then `Tab` and `?`, then the agents tab, the finder, the editor and the explorer.

Running agents' timers tick on the client (`surface.every`), as `elapsed.tsx` does for the turn, so the pane doesn't redraw every second.

## Consequences

- Tabs switch with `Tab` or a click without losing the keyboard; the editor's buffer and cursor survive a trip to the agents tab.
- Every body shares the frame (tab strip, border, header, rule, rows, hints). The client turns a pointer's place into one inside the box (`TOP`, `LEFT`), so rows still count from the header.
- The pane draws no border around the client; a picture's absolute place counts the strip and the border.
- `Tab` types where the person is typing (edit mode, a filter); there, only a click switches tabs.
