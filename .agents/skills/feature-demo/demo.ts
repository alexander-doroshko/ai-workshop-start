// Records a feature demo of the web view, the way a person would show it: a visible cursor that
// moves to what it clicks, typing at a readable pace, a caption for each step, pauses to look.
// Copy it next to a scenario and run that with Node; see SKILL.md.
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';

/** What a scenario drives the page with. */
export type Demo = {
  page: Page;
  /** Shows a line at the bottom of the video, until the next caption; empty hides it. */
  caption(text: string): Promise<void>;
  /** Moves the cursor to the element and clicks it. */
  click(selector: string): Promise<void>;
  /** Clicks the field, then types the text into it, key by key. */
  type(selector: string, text: string): Promise<void>;
  /** Presses a key `times` times, e.g. `Backspace`. */
  press(key: string, times?: number): Promise<void>;
  /** Holds still, so the viewer can see the result. */
  pause(ms?: number): Promise<void>;
  /** A PNG of the page as it is now, `<out>/<name>.png`. */
  shot(name: string): Promise<void>;
};

const SIZE = { width: 1280, height: 800 };

/** A cursor and a caption bar drawn into the page: headless video has no mouse pointer. */
const OVERLAY = () => {
  addEventListener('DOMContentLoaded', () => {
    const cursor = document.createElement('div');
    cursor.id = '__demo-cursor';
    cursor.style.cssText = 'position:fixed;left:0;top:0;width:20px;height:20px;z-index:2147483647;pointer-events:none;'
      + 'border-radius:50%;background:rgba(220,38,38,.35);border:2px solid #dc2626;transform:translate(-50%,-50%);'
      + 'transition:width .1s,height .1s';
    const caption = document.createElement('div');
    caption.id = '__demo-caption';
    caption.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483646;'
      + 'pointer-events:none;padding:8px 16px;border-radius:8px;background:rgba(17,24,39,.85);color:#fff;'
      + 'font:16px system-ui,sans-serif;max-width:80%;text-align:center;display:none';
    document.body.append(cursor, caption);
    addEventListener('mousemove', (e) => { cursor.style.left = `${e.clientX}px`; cursor.style.top = `${e.clientY}px`; }, true);
    addEventListener('mousedown', () => { cursor.style.width = cursor.style.height = '14px'; }, true);
    addEventListener('mouseup', () => { cursor.style.width = cursor.style.height = '20px'; }, true);
  });
};

/**
 * Opens `url` in headless Chromium, runs the scenario, and saves `<out>/<name>.webm` and its
 * screenshots. Resolves to the video's path.
 */
export async function record(options: { url: string; out: string; name: string }, scenario: (demo: Demo) => Promise<void>) {
  const { url, out, name } = options;
  const tmp = join(out, `.${name}-video`);
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: tmp, size: SIZE } });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  let position = { x: SIZE.width / 2, y: SIZE.height / 2 };

  const pause = (ms = 1000) => page.waitForTimeout(ms);
  const moveTo = async (selector: string) => {
    const target = page.locator(selector).first();
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error(`not visible: ${selector}`);
    const to = { x: box.x + Math.min(box.width / 2, 120), y: box.y + box.height / 2 };
    const distance = Math.hypot(to.x - position.x, to.y - position.y);
    await page.mouse.move(to.x, to.y, { steps: Math.max(10, Math.round(distance / 12)) });
    position = to;
    await pause(250);
  };
  const demo: Demo = {
    page,
    caption: (text) => page.evaluate((text) => {
      const caption = document.getElementById('__demo-caption')!;
      caption.textContent = text;
      caption.style.display = text ? 'block' : 'none';
    }, text),
    async click(selector) {
      await moveTo(selector);
      await page.mouse.down();
      await page.mouse.up();
      await pause(400);
    },
    async type(selector, text) {
      await demo.click(selector);
      await page.keyboard.type(text, { delay: 150 });
      await pause(600);
    },
    async press(key, times = 1) {
      for (let i = 0; i < times; i++) {
        await page.keyboard.press(key);
        await pause(200);
      }
      await pause(400);
    },
    pause,
    shot: async (shot) => { await page.screenshot({ path: join(out, `${shot}.png`) }); },
  };

  try {
    await page.goto(url);
    await page.mouse.move(position.x, position.y);
    await pause(800);
    await scenario(demo);
    await pause(1500);
  } finally {
    await context.close();
    await browser.close();
  }
  const video = join(out, `${name}.webm`);
  await rename(await page.video()!.path(), video);
  await rm(tmp, { recursive: true, force: true });
  return video;
}
