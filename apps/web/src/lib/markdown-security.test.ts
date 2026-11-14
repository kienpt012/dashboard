import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Markdown } from '../components/Markdown';

// The repository's Node test entry uses classic JSX, while Vite uses react-jsx.
Object.assign(globalThis, { React });

const render = (text: string) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Markdown, { text })));

test('Markdown renders raw tags, event attributes and SVG as escaped text', () => {
  const result = render('<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n<svg onload=alert(1)>');
  assert.ok(result.includes('&lt;script&gt;'));
  assert.ok(result.includes('&lt;img'));
  assert.ok(result.includes('&lt;svg'));
  assert.doesNotMatch(result, /<(script|img|svg)\b/);
  assert.doesNotMatch(result, /<[^>]*\son(?:error|load)=/);
});

test('Markdown never creates images or dangerous link protocols, including disguised schemes', () => {
  for (const target of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,test', 'vbscript:alert(1)',
    'java&#x73;cript:alert(1)', 'javascript%3Aalert(1)', 'java\tscript:alert(1)', '//evil.example', 'https://user:pass@example.com']) {
    const result = render(`[mở](${target}) ![ảnh](${target})`);
    assert.doesNotMatch(result, /<(?:a|img)\b/, target);
  }
});

test('Markdown quotes and HTML in link labels cannot inject attributes', () => {
  const result = render('[<img src=x onerror=alert(1)>](https://example.com/"onclick="bad)');
  assert.doesNotMatch(result, /<img\b/);
  assert.doesNotMatch(result, /<a[^>]*\sonclick=/);
  assert.match(result, /rel="noopener noreferrer"/);
  assert.match(result, /target="_blank"/);
});
