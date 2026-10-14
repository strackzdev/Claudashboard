import { expect, test } from 'claude-code/testing'

import { changedUnder, diffRows, countStatus, diffLines, lineMarks, parseBranch, parsePorcelain, statusLetter } from '../../../hooks/explorer/git/gitdiff'

test('a line diff tells added, modified and deleted lines apart', () => {
  const d = diffLines(['a', 'b', 'c', 'd'], ['a', 'B', 'c', 'x', 'd'])
  expect(d.marks).toEqual([null, 'modified', null, 'added', null])
  const del = diffLines(['a', 'b', 'c'], ['a', 'c'])
  expect(del.marks).toEqual([null, null])
  expect(del.deletedAfter).toEqual([true, false])
  expect(del.deletedCount).toBe(1)
  expect(diffLines(['same'], ['same']).marks).toEqual([null])
})

test('the gutter layers unsaved over unstaged over staged', () => {
  const head = ['one', 'two', 'three', 'four']
  const index = ['one', 'TWO', 'three', 'four'] // staged: line 2
  const disk = ['one', 'TWO', 'three', 'FOUR'] // unstaged: line 4
  const buffer = ['zero', 'one', 'TWO', 'three', 'FOUR'] // unsaved: a new first line
  const { marks, summary } = lineMarks({ head, index, disk, buffer })
  expect(marks.map(m => m.layer)).toEqual(['unsaved', null, 'staged', null, 'unstaged'])
  expect(marks[4]?.change).toBe('modified')
  expect(summary).toEqual({ unsaved: 1, added: 0, modified: 1, deleted: 0, staged: 1 })
})

test('git status letters: staged, modified, untracked, renamed', () => {
  const st = parsePorcelain('M  a.ts\0 M b.ts\0?? c.ts\0R  new.ts\0old.ts\0')
  expect([...st.keys()]).toEqual(['a.ts', 'b.ts', 'c.ts', 'new.ts'])
  expect(statusLetter(st.get('a.ts') ?? '')).toEqual({ letter: 'S', tone: 'staged' })
  expect(statusLetter(st.get('b.ts') ?? '')).toEqual({ letter: 'M', tone: 'modified' })
  expect(statusLetter('MM')).toEqual({ letter: 'M', tone: 'modified' })
  expect(statusLetter('??')).toEqual({ letter: 'U', tone: 'untracked' })
  expect(statusLetter('A ')).toEqual({ letter: 'A', tone: 'staged' })
})

test('the project bar reads the branch, ahead/behind and counts', () => {
  const out = '## main...origin/main [ahead 9, behind 8]\0 M a.ts\0M  b.ts\0?? c.ts\0MM d.ts\0'
  expect(parseBranch(out)).toEqual({ branch: 'main', ahead: 9, behind: 8 })
  expect(parseBranch('## No commits yet on dev\0')).toEqual({ branch: 'dev', ahead: 0, behind: 0 })
  const st = parsePorcelain(out)
  expect(st.has('main...origin/main [ahead 9, behind 8]')).toBe(false)
  expect(countStatus(st)).toEqual({ changed: 3, staged: 2 })
})

test('touched files from git status: paths from the root, deleted files and files outside the root left out', () => {
  const status = new Map([
    ['app/src/a.ts', ' M'],
    ['app/new.ts', '??'],
    ['app/gone.ts', ' D'],
    ['docs/readme.md', 'M '],
  ])
  expect(changedUnder('/repo/app', '/repo', status)).toEqual(['src/a.ts', 'new.ts'])
  expect(changedUnder('/repo', '/repo', status)).toEqual(['app/src/a.ts', 'app/new.ts', 'docs/readme.md'])
})

test('the diff view: hunks with three lines of context, headers as git writes them', () => {
  const a = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
  const b = ['1', '2', '3', '4', 'five', '6', '7', '8', '9', '10', '11', '12', '13']
  const rows = diffRows(a, b)
  expect(rows.map(r => `${r.kind[0]} ${r.text}`)).toEqual([
    'h @@ -2,7 +2,7 @@',
    'c 2',
    'c 3',
    'c 4',
    'd 5',
    'a five',
    'c 6',
    'c 7',
    'c 8',
    'h @@ -10,3 +10,4 @@',
    'c 10',
    'c 11',
    'c 12',
    'a 13',
  ])
  expect(rows.find(r => r.kind === 'add')).toEqual({ kind: 'add', text: 'five', old: null, new: 5 })
  expect(diffRows(a, a)).toEqual([])
  expect(diffRows([], ['x']).map(r => r.text)).toEqual(['@@ -0,0 +1,1 @@', 'x'])
})
