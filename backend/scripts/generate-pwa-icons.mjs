import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("frontend", "public", "icon-source.png");
const publicDir = path.resolve("frontend", "public");
const jobs = [
  { output: "favicon-16-v2.png", size: 16 },
  { output: "favicon-32-v2.png", size: 32 },
  { output: "icon-192-v2.png", size: 192 },
  { output: "icon-512-v2.png", size: 512 },
  { output: "icon-maskable-512-v2.png", size: 512 },
  { output: "apple-touch-icon-v2.png", size: 180 },
];

async function run() {
  const { default: sharp } = await import("sharp");

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing icon source image at ${sourcePath}`);
  }

  for (const job of jobs) {
    await sharp(sourcePath)
      .resize(job.size, job.size, {
        fit: "cover",
        position: "centre",
      })
      .png()
      .toFile(path.join(publicDir, job.output));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
