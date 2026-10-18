'use strict';
/* tiện ích chung cho các test rv_*.js: mỗi test tái hiện một lỗi đã sửa (bản rà soát độc lập 17/10) và phải luôn PASS */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const H = require('./ui_harness');
const EXE = require('./pw_exe');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const SHOTS = process.env.SHOTS || path.join(require('os').tmpdir(), 'b0dy-rv-shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const MOB = { viewport: { width: 393, height: 764 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
let browser, server;
const ERRS = [];
let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 900) : '')); }
}
function info(label, v) { console.log('  INFO  ' + label + (v !== undefined ? '  ' + JSON.stringify(v).slice(0, 1200) : '')); }
async function start() { browser = await chromium.launch({ executablePath: EXE, args: ARGS }); server = await H.startServer(); }
async function stop() { await browser.close(); server.srv.close(); console.log('\n' + pass + ' PASS, ' + fail + ' FAIL'); }
async function open(t, ctxOpt, name, opts) {
  opts = opts || {};
  const ctx = await browser.newContext(ctxOpt);
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  page.on('pageerror', e => ERRS.push(name + ' pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') ERRS.push(name + ' console: ' + m.text()); });
  await H.attach(page, t);
  if (opts.noGoto !== true) await page.goto(server.url);
  page._ctx = ctx;
  return page;
}
const vis = sel => sel + ' >> visible=true';
async function tap(page, sel) { await page.locator(vis(sel)).first().click(); }
async function shot(page, name, wait) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(wait == null ? 900 : wait); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); return path.join(SHOTS, name + '.png'); }
async function login(page, q, pin, desk) {
  await page.waitForSelector('#q');
  await page.fill('#q', q);
  await page.waitForSelector('.rrow');
  await page.locator('.rrow').first().click();
  await page.waitForSelector('#pin');
  await page.keyboard.type(pin);
  await tap(page, desk ? '#vgo' : '#vgoM');
}
async function cell(page, d, h, force) { await page.locator('#wkb .c[data-d="' + d + '"][data-h="' + h + '"]').click(force ? { force: true } : undefined); }
module.exports = { H, start, stop, open, tap, shot, login, cell, sleep, ok, info, DESK, MOB, ERRS, vis, get server() { return server; }, get browser() { return browser; } };
/* per-action delays: t.delayFor = body => ms */
async function attach2(page, t) {
  await page.route(H.API + '**', async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } }); return; }
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch (e) { /* */ }
    t.calls.push(body.action);
    (t.bodies = t.bodies || []).push(body);
    const ms = t.delayFor ? t.delayFor(body) : 0;
    (t.tl = t.tl || []).push([Date.now() % 100000, 'in', body.action]);
    /* compute the answer at ARRIVAL time (server processes immediately), deliver after ms */
    const f = typeof t.fail === 'function' ? t.fail(body) : t.fail;
    if (f === 'net') { if (ms) await new Promise(r => setTimeout(r, ms)); await route.abort('failed'); return; }
    const out = JSON.parse(JSON.stringify(t.env.ltDoPost_(body)));
    if (f === 'net-after') { if (ms) await new Promise(r => setTimeout(r, ms)); await route.abort('failed'); return; }
    if (ms) await new Promise(r => setTimeout(r, ms));
    t.tl.push([Date.now() % 100000, 'out', body.action, out.mode]);
    await route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(out) });
  });
}
async function open2(t, ctxOpt, name, opts) {
  opts = opts || {};
  const ctx = await browser.newContext(ctxOpt);
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  page.on('pageerror', e => ERRS.push(name + ' pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') ERRS.push(name + ' console: ' + m.text()); });
  await attach2(page, t);
  if (opts.noGoto !== true) await page.goto(server.url);
  page._ctx = ctx;
  return page;
}
module.exports.open2 = open2;
module.exports.attach2 = attach2;
