import puppeteer from 'puppeteer';

const errors = [];
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blacklist', '--enable-webgl'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 760 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('response', (r) => { if (r.status() === 404 && !r.url().includes('favicon')) errors.push('404: ' + r.url()); });

await page.goto('http://localhost:4173/minigolf.html', { waitUntil: 'networkidle0' });
await page.click('#start-btn');
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: '_a_start.png' });

// Straight powerful shot down the bridge.
await page.mouse.move(550, 330);
await page.mouse.down();
await page.mouse.move(550, 560, { steps: 16 });
await page.mouse.up();
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: '_b_mid.png' });
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: '_c_rest.png' });

const strokes = await page.evaluate(() => document.getElementById('hud-strokes')?.textContent);
await browser.close();
console.log('strokes =', strokes);
console.log('errors  =', errors.length);
for (const e of errors) console.log('  -', e);
process.exit(errors.length === 0 ? 0 : 1);
