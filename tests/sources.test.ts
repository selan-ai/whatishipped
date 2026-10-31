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
