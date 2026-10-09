import { chromium } from 'playwright';
import { preview } from 'vite';
import fs from 'fs';
import path from 'path';

const VIEWPORTS = [
  { name: '1440x900-desktop', width: 1440, height: 900 },
  { name: '1280x800-laptop', width: 1280, height: 800 },
  { name: '1024x768-laptop-compact', width: 1024, height: 768 },
  { name: '820x1180-tablet-portrait', width: 820, height: 1180 },
  { name: '390x844-mobile', width: 390, height: 844 },
];

async function main() {
  const outDir = path.resolve(process.cwd(), 'qa-screenshots', 'blocks-flow');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Start preview server
  const server = await preview({
    preview: { port: 4174 },
  });

  const url = 'http://localhost:4174';
  console.log(`Preview server running at ${url}`);

  let browser;
  try {
    browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    }).catch(() =>
      chromium.launch({
        channel: 'chrome',
        headless: true,
      })
    ).catch(() =>
      chromium.launch({ headless: true })
    );
  } catch (err) {
    console.error('Failed to launch browser:', err);
    await server.close();
    process.exit(1);
  }

  console.log('Browser launched. Capturing screenshots across viewports with block elements and flow animations...');

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    // 1. Empty State
    await page.waitForTimeout(500);
    const emptyFile = path.join(outDir, `${vp.name}-01-empty.png`);
    await page.screenshot({ path: emptyFile });
    console.log(`Captured: ${emptyFile}`);

    // Desktop: Run example to view blocks & flow in action
    if (vp.name.includes('1440x900')) {
      try {
        const runBtn = await page.$('.tracel-btn');
        if (runBtn) {
          await runBtn.click();
          await page.waitForTimeout(1000);
          const activeFile = path.join(outDir, `${vp.name}-02-blocks-active.png`);
          await page.screenshot({ path: activeFile });
          console.log(`Captured: ${activeFile}`);
        }
      } catch (e) {
        console.warn('Run click warning:', e);
      }
    }

    await context.close();
  }

  await browser.close();
  await server.close();
  console.log('All block flow screenshots captured successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
