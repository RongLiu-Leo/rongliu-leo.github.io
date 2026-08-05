/**
 * The Worker's input handling, which is where the subtle rules live: one page
 * must not split into several keys, and a client-supplied referrer or title
 * must not reach the database unreduced.
 *
 * Run with `npm test`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { pagePath, pageTitle, referrerHost, BOT_PATTERN } from "../src/index.js";

const ALLOWED = ["https://rongliu-leo.github.io"];

test("pagePath folds every spelling of one file into a single key", () => {
  const cases = [
    // GitHub Pages answers to all of these for the same file.
    ["/visitors.html", "/visitors"],
    ["/visitors", "/visitors"],
    ["/visitors/", "/visitors"],
    // A project directory, however it is linked.
    ["/AtomGS/", "/AtomGS"],
    ["/AtomGS", "/AtomGS"],
    ["/AtomGS/index.html", "/AtomGS"],
    // The site root, however it is spelled.
    ["/", "/"],
    ["", "/"],
    [null, "/"],
    [undefined, "/"],
    ["/index.html", "/"],
    ["/index.htm", "/"],
    ["//", "/"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(pagePath(input), expected, `pagePath(${JSON.stringify(input)})`);
  }
});

test("pagePath leaves paths alone that only look like an index or a directory", () => {
  assert.equal(pagePath("/my-index.html"), "/my-index");
  assert.equal(pagePath("/a.b.html"), "/a.b");
  assert.equal(pagePath("/deep/path/page.html"), "/deep/path/page");
  // Paths are case-sensitive on GitHub Pages, so case must survive.
  assert.equal(pagePath("/Case/Sensitive/"), "/Case/Sensitive");
});

test("pagePath reduces whatever the page supplies to a bare, bounded path", () => {
  assert.equal(pagePath("/AtomGS/index.html?utm_source=x#section"), "/AtomGS");
  assert.equal(pagePath("visitors.html"), "/visitors", "a missing leading slash is added");
  assert.equal(pagePath("/" + "a".repeat(300)).length, 100, "long paths are capped");
});

test("pageTitle collapses whitespace and caps the length", () => {
  assert.equal(pageTitle("  Deformable   Beta\n Splatting  "), "Deformable Beta Splatting");
  assert.equal(pageTitle(""), "");
  assert.equal(pageTitle(null), "");
  assert.equal(pageTitle("t".repeat(300)).length, 120);
});

test("referrerHost keeps a bare hostname and nothing more", () => {
  assert.equal(referrerHost("https://github.com/rongliu-leo/AtomGS", ALLOWED), "github.com");
  assert.equal(referrerHost("https://www.google.com/search?q=beta+splatting", ALLOWED), "google.com");
  assert.equal(referrerHost("http://x.com/someone/status/1", ALLOWED), "x.com");
});

test("referrerHost discards anything that is not a real off-site referral", () => {
  const dropped = [
    [null, "nothing supplied"],
    ["", "empty"],
    ["not a url", "unparseable"],
    ["javascript:alert(1)", "not http(s)"],
    ["ftp://files.example.com/x", "not http(s)"],
    ["https://localhost/x", "no dot, so not a public host"],
    ["https://" + "a".repeat(600) + ".com", "absurdly long"],
    ["https://rongliu-leo.github.io/AtomGS/", "our own site is not a referral"],
  ];
  for (const [input, why] of dropped) {
    assert.equal(referrerHost(input, ALLOWED), null, why);
  }
});

test("referrerHost only treats an exact host match as a self-referral", () => {
  // A suffix of our own host still belongs to somebody else.
  assert.equal(referrerHost("https://leo.github.io/page", ALLOWED), "leo.github.io");
  assert.equal(referrerHost("https://someone.github.io/page", ALLOWED), "someone.github.io");
});

test("BOT_PATTERN catches automation and leaves real browsers alone", () => {
  const bots = [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/126.0.0.0 Safari/537.36",
    "curl/8.4.0",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "python-requests/2.31.0",
    "facebookexternalhit/1.1",
    "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  ];
  const people = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  ];
  for (const ua of bots) assert.equal(BOT_PATTERN.test(ua), true, ua);
  for (const ua of people) assert.equal(BOT_PATTERN.test(ua), false, ua);
});
