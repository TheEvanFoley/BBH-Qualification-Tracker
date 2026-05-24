import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const publicDir = path.resolve("frontend", "public");
const sourceImage = path.join(publicDir, "icon-source.png");
const jobs = [
  { output: "favicon-16-v2.png", size: 16 },
  { output: "favicon-32-v2.png", size: 32 },
  { output: "icon-192-v2.png", size: 192 },
  { output: "icon-512-v2.png", size: 512 },
  { output: "icon-maskable-512-v2.png", size: 512 },
  { output: "apple-touch-icon-v2.png", size: 180 },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 512, height: 512 },
  deviceScaleFactor: 1,
});

for (const job of jobs) {
  const sourceUrl = pathToFileURL(sourceImage).href;

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
        object-fit: cover;
      }
    </style>
    <img src="${sourceUrl}" alt="" />
  `);

  await page.locator("img").screenshot({
    path: path.join(publicDir, job.output),
  });
}

await browser.close();
