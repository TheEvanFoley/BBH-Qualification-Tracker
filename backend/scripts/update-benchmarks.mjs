import { createDatabase, getLatestSnapshot, replaceBenchmarksForSnapshot } from "../src/db.js";
import { scrapeBenchmarksOnly } from "../src/scraper.js";

const db = await createDatabase();

try {
  const snapshot = await getLatestSnapshot(db);
  if (!snapshot) {
    throw new Error("No snapshot available");
  }

  const benchmarks = await scrapeBenchmarksOnly();
  await replaceBenchmarksForSnapshot(db, snapshot.id, benchmarks);

  const moose = await db.all(
    `
      SELECT
        animal,
        weapon,
        trek,
        best_score AS bestScore,
        benchmark_player_name AS benchmarkPlayerName
      FROM trek_benchmarks
      WHERE snapshot_id = ?
        AND animal = ?
        AND trek = ?
      ORDER BY weapon ASC
    `,
    [snapshot.id, "Moose", "Trek 3"],
  );

  console.log(
    JSON.stringify(
      {
        snapshotId: snapshot.id,
        benchmarkCount: benchmarks.length,
        moose,
      },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}
