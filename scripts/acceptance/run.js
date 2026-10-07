// Runs each acceptance program in both themes and captures the lens mid-operation.
import { chromium } from 'playwright';
import { preview } from 'vite';
import fs from 'fs';
import path from 'path';
import { PROGRAMS } from './programs.js';

const outDir = path.resolve(process.cwd(), 'qa-screenshots/acceptance');
fs.mkdirSync(outDir, { recursive: true });

const server = await preview({ preview: { port: 4175 } });
const browser = await chromium.launch();

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  await ctx.addInitScript((t) => localStorage.setItem('tracel:theme', t), theme);
  const page = await ctx.newPage();
  await page.goto('http://localhost:4175', { waitUntil: 'networkidle' });

  for (const p of PROGRAMS) {
    await page.getByRole('radio', { name: p.lang, exact: true }).click();
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText(p.code);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    let summary;
    try {
      await page.getByText(/^Step \d+ \/ \d+$/).waitFor({ timeout: 15_000 });
      const pause = page.getByRole('button', { name: /^Pause/ });
      if (await pause.isVisible()) await pause.click();
      const slider = page.getByRole('slider', { name: 'Step' });
      const max = Number(await slider.getAttribute('aria-valuemax'));
      await slider.focus();
      await page.keyboard.press('Home');
      for (let i = 0; i < Math.round(max * p.at); i++) await page.keyboard.press('ArrowRight');
      summary = (await page.locator('footer').innerText()).split('\n').slice(0, 3).join(' | ');
    } catch {
      summary = 'no trace: ' + (await page.locator('footer').innerText()).split('\n')[0];
    }
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, `${p.id}-${theme}.png`) });
    if (theme === 'light') console.log(`${p.id}: ${summary}`);
  }
  await ctx.close();
}

await browser.close();
await server.close();
