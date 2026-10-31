import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceMentions } from '../skills/whatishipped/template/server/board.ts';

test('a tsx source keeps its full name and line', () => {
  assert.deepEqual(sourceMentions('src/Home.tsx:1'), [{ text: 'src/Home.tsx:1', file: 'src/Home.tsx', line: 1 }]);
});

test('html and mdx sources keep their full names and lines', () => {
  assert.deepEqual(sourceMentions('index.html; docs/a.mdx:3'), [
    { text: 'index.html', file: 'index.html', line: null },
    { text: 'docs/a.mdx:3', file: 'docs/a.mdx', line: 3 },
  ]);
});

test('native sources read as before', () => {
  assert.deepEqual(sourceMentions('Features/X.swift:88; Y.kt'), [
    { text: 'Features/X.swift:88', file: 'Features/X.swift', line: 88 },
    { text: 'Y.kt', file: 'Y.kt', line: null },
  ]);
});

test('jsx sources keep their full names and lines', () => {
  assert.deepEqual(sourceMentions('src/Home.jsx:7'), [{ text: 'src/Home.jsx:7', file: 'src/Home.jsx', line: 7 }]);
});

test('mjs, mts, cjs and cts sources keep their full names and lines', () => {
  assert.deepEqual(sourceMentions('a/b.mjs:1; c.mts:2; d.cjs:3; e.cts:4'), [
    { text: 'a/b.mjs:1', file: 'a/b.mjs', line: 1 },
    { text: 'c.mts:2', file: 'c.mts', line: 2 },
    { text: 'd.cjs:3', file: 'd.cjs', line: 3 },
    { text: 'e.cts:4', file: 'e.cts', line: 4 },
  ]);
});

test('an objective-c m source reads as before', () => {
  assert.deepEqual(sourceMentions('A.m:5'), [
    { text: 'A.m:5', file: 'A.m', line: 5 },
  ]);
});
