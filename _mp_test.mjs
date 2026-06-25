import WebSocket from 'ws';
import puppeteer from 'puppeteer';

const WS = 'ws://localhost:8080';
const ok = [];
const bad = [];
const check = (cond, label) => (cond ? ok : bad).push(label);

// Tiny promise-based ws client with a message waiter.
function client() {
  const sock = new WebSocket(WS + '/ws');
  const inbox = [];
  const waiters = [];
  sock.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    inbox.push(m);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].type === m.type) { waiters[i].resolve(m); waiters.splice(i, 1); }
    }
  });
  const api = {
    sock,
    send: (o) => sock.send(JSON.stringify(o)),
    waitOpen: () => new Promise((r) => sock.on('open', r)),
    wait: (type, ms = 3000) =>
      new Promise((resolve, reject) => {
        const hit = inbox.find((m) => m.type === type);
        if (hit) return resolve(hit);
        const w = { type, resolve };
        waiters.push(w);
        setTimeout(() => reject(new Error('timeout waiting ' + type)), ms);
      }),
    close: () => sock.close(),
  };
  return api;
}

// ============ PART 1: server protocol over raw WebSocket ============
const c1 = client();
await c1.waitOpen();
c1.send({ type: 'create', name: 'Alice' });
const created = await c1.wait('created');
const code = created.code;
const pid1 = created.playerId;
check(!!code && !!pid1, 'P1 create -> code+pid');

// host launches the party (roulette) -> room.started = true, like the real flow
c1.send({ type: 'start' });
await c1.wait('roulette');

// simulate navigation lobby -> racing.html : close, reopen, race-hello
c1.close();
await new Promise((r) => setTimeout(r, 120));
const h1 = client();
await h1.waitOpen();
h1.send({ type: 'race-hello', code, pid: pid1, name: 'Alice' });
const w1 = await h1.wait('race-welcome');
check(w1.you === pid1, 'P1 host reconnect keeps same id');
check(w1.hostId === pid1, 'P1 host still host after reconnect');

// listen for the 2-player roster BEFORE the second player joins
const roster2 = new Promise((resolve) => {
  const onMsg = (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === 'race-roster' && m.players.length === 2) { h1.sock.off('message', onMsg); resolve(m); }
  };
  h1.sock.on('message', onMsg);
});

// second player joins the race directly
const h2 = client();
await h2.waitOpen();
h2.send({ type: 'race-hello', code, pid: '', name: 'Bob' });
const w2 = await h2.wait('race-welcome');
check(w2.you !== pid1 && !!w2.you, 'P1 Bob gets a new id');
const roster = await roster2;
check(roster.players.length === 2, 'P1 host sees 2 players in roster');

// host changes the map -> both notified
h1.send({ type: 'race-setmap', mapIndex: 1 });
const map2 = await h2.wait('race-map');
check(map2.mapIndex === 1, 'P1 race-setmap broadcast');

// non-host cannot start
h2.send({ type: 'race-go' });
// host starts
h1.send({ type: 'race-go' });
const start1 = await h1.wait('race-start');
const start2 = await h2.wait('race-start');
check(start1.mapIndex === 1, 'P1 race-start carries chosen map');
check(start1.players.length === 2, 'P1 race-start lists 2 racers');
check(start1.players.every((p) => p.slot != null), 'P1 racers have slots');

// Bob sends a position -> Alice receives it as a peer
h2.send({ type: 'race-state', s: [10, 20, 0.5, 0.5, 99, 0, 300, 1] });
const peer = await h1.wait('race-peer');
check(peer.id === w2.you && peer.s[4] === 99, 'P1 race-state relayed to others');

// Bob finishes
h2.send({ type: 'race-finish', time: 42.5 });
const fin = await h1.wait('race-finished');
check(fin.id === w2.you && fin.time === 42.5, 'P1 race-finish broadcast');

console.log('--- raw protocol done ---');

// keep a host alive for the browser test, on a fresh room
const host = client();
await host.waitOpen();
host.send({ type: 'create', name: 'HostBot' });
const room = await host.wait('created');
host.send({ type: 'start' });
await host.wait('roulette');
host.close();
await new Promise((r) => setTimeout(r, 120));
const host2 = client();
await host2.waitOpen();
host2.send({ type: 'race-hello', code: room.code, pid: room.playerId, name: 'HostBot' });
await host2.wait('race-welcome');

// ============ PART 2: real browser client via Vite proxy ============
const errors = [];
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--headless=new', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  // ignore resource-load 404 noise (favicon etc.) — only care about real JS errors
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text());
});
page.on('response', (r) => {
  if (r.status() === 404 && !r.url().includes('favicon')) errors.push('404: ' + r.url());
});

const url = `http://localhost:3000/racing.html?room=${room.code}&name=Carol`;
await page.goto(url, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 800));

// waiting room visible, roster shows both HostBot + Carol
const mpVisible = await page.evaluate(() => !document.getElementById('mp-overlay').classList.contains('hidden'));
check(mpVisible, 'P2 waiting room overlay shown');
const names = await page.evaluate(() =>
  [...document.querySelectorAll('#mp-players .pname')].map((e) => e.textContent));
check(names.length === 2, 'P2 roster shows 2 players: ' + JSON.stringify(names));

// host triggers the start
host2.send({ type: 'race-go' });
await new Promise((r) => setTimeout(r, 1200)); // countdown begins
const st1 = await page.evaluate(() => window.__state && window.__state());
// fall back: read via exposed globals isn't set; check countdown element instead
const racing = await page.evaluate(() => {
  // poll a few internal signals exposed on window if present
  return {
    countdownShown: getComputedStyle(document.getElementById('countdown')).display !== 'none',
    hudShown: !document.getElementById('hud').classList.contains('hidden'),
    mpHidden: document.getElementById('mp-overlay').classList.contains('hidden'),
  };
});
check(racing.mpHidden, 'P2 waiting room hidden after start');
check(racing.hudShown, 'P2 HUD shown after start');

// wait for the countdown to elapse and racing to run, then the page should
// emit race-state -> host receives a peer
let gotPeer = false;
host2.sock.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.type === 'race-peer') gotPeer = true;
});
await new Promise((r) => setTimeout(r, 5000));
check(gotPeer, 'P2 browser car broadcasts its position to host');

const peerCount = await page.evaluate(() => window.__peers ? window.__peers() : -1);

await page.screenshot({ path: 'mp_race.png' });
await browser.close();
host2.close();

console.log('\n=== RESULTS ===');
for (const o of ok) console.log('  ok  ', o);
for (const b of bad) console.log('  FAIL', b);
console.log('pageerrors:', errors.length);
for (const e of errors) console.log('  -', e);
process.exit(bad.length === 0 && errors.length === 0 ? 0 : 1);
