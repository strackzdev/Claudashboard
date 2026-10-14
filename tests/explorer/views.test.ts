import { expect, test } from 'claude-code/testing'

import { boxTop } from '../../hooks/explorer/views'

// The tab strip as drawn above the box, at its right: its bars must land on the top edge's joints.
const strip = (running: number) => `│ FILES │${running ? ` ⠋ AGENTS (${running}) ` : ' AGENTS '}│`
const bars = (s: string) => [...s].flatMap((ch, i) => ('│┘└┴┤'.includes(ch) ? [i] : []))

test("the box's top edge joins the tabs: every bar of the strip lands on a joint", () => {
  for (const running of [0, 3, 12]) {
    for (const isAgents of [false, true]) {
      const W = 60
      const top = boxTop(W, running, isAgents)
      const row = strip(running).padStart(W)
      expect([...top].length).toBe(W)
      expect(bars(top)).toEqual(bars(row))
    }
  }
  expect(boxTop(30, 0, false)).toBe('╭───────────┘       └────────┤')
  expect(boxTop(30, 0, true)).toBe('╭───────────┴───────┘        │')
})
