import { chromium } from 'playwright';
import { preview } from 'vite';
import fs from 'fs';
import path from 'path';

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '820x1180', width: 820, height: 1180 },
  { name: '390x844', width: 390, height: 844, mobile: true },
];
const THEMES = ['light', 'dark'];
const ONLY = process.argv[2]; // optional viewport name filter

const outDir = path.resolve(process.cwd(), 'qa-screenshots');
fs.mkdirSync(outDir, { recursive: true });

async function pickExample(page, title) {
  await page.getByRole('button', { name: 'Examples' }).click();
  await page.getByRole('menuitem', { name: title, exact: true }).click();
}

async function runAndWait(page) {
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  // The first Python run downloads Pyodide, so allow plenty of time.
  await page.getByText(/^Step \d+ \/ \d+$/).waitFor({ timeout: 30_000 });
  const pause = page.getByRole('button', { name: /^Pause/ });
  if (await pause.isVisible()) await pause.click();
}

/** Move the playhead to a fraction of the trace using the slider's keyboard support. */
async function seek(page, fraction) {
  const slider = page.getByRole('slider', { name: 'Step' });
  const max = Number(await slider.getAttribute('aria-valuemax'));
  await slider.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < Math.round(max * fraction); i++) await page.keyboard.press('ArrowRight');
}

async function showLens(page, vp) {
  if (vp.mobile) await page.getByRole('radio', { name: 'Trace' }).click();
}

async function showCode(page, vp) {
  if (vp.mobile) await page.getByRole('radio', { name: 'Code' }).click();
}

async function main() {
  const server = await preview({ preview: { port: 4173 } });
  const url = 'http://localhost:4173';
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS.filter((v) => !ONLY || v.name === ONLY)) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
        deviceScaleFactor: 1,
      });
      await context.addInitScript((t) => localStorage.setItem('tracel:theme', t), theme);
      const page = await context.newPage();
      const shot = async (label) => {
        await page.evaluate(() => document.activeElement?.blur());
        await page.waitForTimeout(400);
        const file = path.join(outDir, `${vp.name}-${theme}-${label}.png`);
        await page.screenshot({ path: file });
        console.log(`Captured ${path.basename(file)}`);
      };

      try {
        await page.goto(url, { waitUntil: 'networkidle' });
        await shot('01-empty');
        if (vp.mobile) {
          await showLens(page, vp);
          await shot('01b-empty-lens');
          await showCode(page, vp);
        }

        // Python runs hang until the Pyodide worker is fixed (it calls
        // importScripts inside a module worker), so the array and error
        // states use the C examples.
        await page.getByRole('radio', { name: 'C', exact: true }).click();
        await pickExample(page, 'Array sum');
        await runAndWait(page);
        await seek(page, 0.5);
        await showLens(page, vp);
        await shot('02-array');
        await showCode(page, vp);

        // The C interpreter's reliable error today is rejecting unsupported features.
        await showCode(page, vp);
        await page.locator('.cm-content').click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.insertText('template<typename T>\nT twice(T x) { return x * 2; }\n\nint main() {\n    return twice(4);\n}\n');
        await runAndWait(page).catch(() => {});
        await showLens(page, vp);
        await shot('03-runtime-error');
        await showCode(page, vp);

        await page.getByRole('radio', { name: 'C++' }).click();
        await pickExample(page, 'Linked list with pointers');
        await runAndWait(page);
        await seek(page, 0.6);
        await showLens(page, vp);
        await shot('04-cpp-linked-list');

        await page.getByRole('button', { name: 'Settings' }).click();
        await shot('05-settings');
      } catch (err) {
        console.warn(`${vp.name} ${theme}: ${err.message}`);
        await shot('zz-failure');
      }
      await context.close();
    }
  }

  await browser.close();
  await server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
