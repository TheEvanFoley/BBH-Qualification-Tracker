import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const publicDir = path.resolve("frontend", "public");
const jobs = [
  { source: "icon.svg", output: "icon-192.png", size: 192 },
  { source: "icon.svg", output: "icon-512.png", size: 512 },
  { source: "icon-maskable.svg", output: "icon-maskable-512.png", size: 512 },
  { source: "icon.svg", output: "apple-touch-icon.png", size: 180 },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 512, height: 512 },
  deviceScaleFactor: 1,
});

for (const job of jobs) {
  const sourceUrl = pathToFileURL(path.join(publicDir, job.source)).href;

  await page.setViewportSize({ width: job.size, height: job.size });
  await page.setContent(`
    <style>
      html, body {
        margin: 0;
        background: transparent;
      }

      img {
        display: block;
        width: ${job.size}px;
        height: ${job.size}px;
      }
    </style>
    <img src="${sourceUrl}" alt="" />
  `);

  await page.locator("img").screenshot({
    path: path.join(publicDir, job.output),
  });
}

await browser.close();
