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
  const outDir = path.resolve(process.cwd(), 'qa-screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Start preview server
  const server = await preview({
    preview: { port: 4173 },
  });

  const url = 'http://localhost:4173';
  console.log(`Preview server running at ${url}`);

  let browser;
  try {
    // Try launching with system msedge or chrome first, or standard chromium
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

  console.log('Browser launched. Capturing screenshots across viewports...');

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    // 1. Empty State
    await page.waitForTimeout(500);
    const emptyFile = path.join(outDir, `${vp.name}-01-empty-state.png`);
    await page.screenshot({ path: emptyFile });
    console.log(`Captured: ${emptyFile}`);

    // If desktop viewport, capture interactive states
    if (vp.name.includes('1440x900')) {
      // 2. Click Run to trace default example
      try {
        const runBtn = await page.$('.tracel-btn');
        if (runBtn) {
          await runBtn.click();
          await page.waitForTimeout(1000);
          const midRunFile = path.join(outDir, `${vp.name}-02-mid-run.png`);
          await page.screenshot({ path: midRunFile });
          console.log(`Captured: ${midRunFile}`);
        }
      } catch (e) {
        console.warn('Run click warning:', e);
      }
    }

    await context.close();
  }

  await browser.close();
  await server.close();
  console.log('Visual QA screenshots captured successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

