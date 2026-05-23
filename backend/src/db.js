import fs from "node:fs";
import path from "node:path";
import sqlite3 from "sqlite3";
import { buildBenchmarks } from "./analysis.js";

const databaseDir = path.resolve("backend", "data");
const databasePath = path.join(databaseDir, "leaderboards.sqlite");

function promisifyDb(db) {
  return {
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(error) {
          if (error) {
            reject(error);
            return;
          }

          resolve(this);
        });
      });
    },
    get(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(row ?? null);
        });
      });
    },
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(rows);
        });
      });
    },
    exec(sql) {
      return new Promise((resolve, reject) => {
        db.exec(sql, (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        db.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}

export async function createDatabase() {
  fs.mkdirSync(databaseDir, { recursive: true });
  const sqlite = sqlite3.verbose();
  const rawDb = new sqlite.Database(databasePath);
  const db = promisifyDb(rawDb);

  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      source_last_updated TEXT,
      player_count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS players (
      snapshot_id INTEGER NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      skill_rank INTEGER,
      global_skill_score INTEGER,
      global_wildcard_score INTEGER,
      accuracy REAL,
      PRIMARY KEY (snapshot_id, id),
      FOREIGN KEY (snapshot_id) REFERENCES snapshots (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trek_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      player_id TEXT NOT NULL,
      animal TEXT NOT NULL,
      weapon TEXT NOT NULL,
      trek TEXT NOT NULL,
      score INTEGER NOT NULL,
      run_rank INTEGER,
      counted INTEGER NOT NULL DEFAULT 1,
      raw_label TEXT,
      FOREIGN KEY (snapshot_id) REFERENCES snapshots (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trek_benchmarks (
      snapshot_id INTEGER NOT NULL,
      animal TEXT NOT NULL,
      weapon TEXT NOT NULL,
      trek TEXT NOT NULL,
      best_score INTEGER NOT NULL,
      benchmark_player_id TEXT NOT NULL,
      benchmark_player_name TEXT NOT NULL,
      PRIMARY KEY (snapshot_id, animal, weapon, trek),
      FOREIGN KEY (snapshot_id) REFERENCES snapshots (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_players_snapshot_name
      ON players (snapshot_id, name);

    CREATE INDEX IF NOT EXISTS idx_runs_snapshot_player
      ON trek_runs (snapshot_id, player_id);
  `);

  const playerColumns = await db.all(`PRAGMA table_info(players)`);
  const playerColumnNames = new Set(playerColumns.map((column) => column.name));

  if (!playerColumnNames.has("country_code")) {
    await db.exec(`ALTER TABLE players ADD COLUMN country_code TEXT`);
  }

  if (!playerColumnNames.has("external_player_id")) {
    await db.exec(`ALTER TABLE players ADD COLUMN external_player_id TEXT`);
  }

  return db;
}

export async function saveSnapshot(db, snapshotPayload) {
  await db.exec("BEGIN TRANSACTION");

  try {
    const snapshotResult = await db.run(
      `
        INSERT INTO snapshots (created_at, source_last_updated, player_count)
        VALUES (?, ?, ?)
      `,
      [
        snapshotPayload.createdAt,
        snapshotPayload.sourceLastUpdated,
        snapshotPayload.players.length,
      ],
    );

    const snapshotId = snapshotResult.lastID;

    for (const player of snapshotPayload.players) {
      await db.run(
        `
          INSERT INTO players (
            snapshot_id,
            id,
            name,
            location,
            skill_rank,
            global_skill_score,
            global_wildcard_score,
            accuracy,
            country_code,
            external_player_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          snapshotId,
          player.id,
          player.name,
          player.location,
          player.skillRank,
          player.globalSkillScore,
          player.globalWildcardScore,
          player.accuracy,
          player.countryCode ?? null,
          player.externalPlayerId ?? null,
        ],
      );
    }

    for (const run of snapshotPayload.trekRuns ?? []) {
      await db.run(
        `
          INSERT INTO trek_runs (
            snapshot_id,
            player_id,
            animal,
            weapon,
            trek,
            score,
            run_rank,
            counted,
            raw_label
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          snapshotId,
          run.playerId,
          run.animal,
          run.weapon,
          run.trek,
          run.score,
          run.runRank,
          run.counted,
          run.rawLabel,
        ],
      );
    }

    const playersById = new Map(snapshotPayload.players.map((player) => [player.id, player]));
    const benchmarks =
      snapshotPayload.benchmarks ?? buildBenchmarks(snapshotPayload.trekRuns ?? [], playersById);

    for (const benchmark of benchmarks) {
      await db.run(
        `
          INSERT INTO trek_benchmarks (
            snapshot_id,
            animal,
            weapon,
            trek,
            best_score,
            benchmark_player_id,
            benchmark_player_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          snapshotId,
          benchmark.animal,
          benchmark.weapon,
          benchmark.trek,
          benchmark.bestScore,
          benchmark.benchmarkPlayerId,
          benchmark.benchmarkPlayerName,
        ],
      );
    }

    await db.exec("COMMIT");
    return getSnapshotById(db, snapshotId);
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

export async function savePlayersToSnapshot(db, snapshotId, players) {
  await db.exec("BEGIN TRANSACTION");

  try {
    for (const player of players) {
      await db.run(
        `
          INSERT INTO players (
            snapshot_id,
            id,
            name,
            location,
            skill_rank,
            global_skill_score,
            global_wildcard_score,
            accuracy,
            country_code,
            external_player_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(snapshot_id, id) DO UPDATE SET
            name = excluded.name,
            location = excluded.location,
            skill_rank = excluded.skill_rank,
            global_skill_score = excluded.global_skill_score,
            global_wildcard_score = excluded.global_wildcard_score,
            accuracy = excluded.accuracy,
            country_code = excluded.country_code,
            external_player_id = excluded.external_player_id
        `,
        [
          snapshotId,
          player.id,
          player.name,
          player.location,
          player.skillRank,
          player.globalSkillScore,
          player.globalWildcardScore,
          player.accuracy,
          player.countryCode ?? null,
          player.externalPlayerId ?? null,
        ],
      );
    }

    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

export async function savePlayerRuns(db, snapshotId, playerId, runs) {
  await db.exec("BEGIN TRANSACTION");

  try {
    await db.run(
      `
        DELETE FROM trek_runs
        WHERE snapshot_id = ?
          AND player_id = ?
      `,
      [snapshotId, playerId],
    );

    for (const run of runs) {
      await db.run(
        `
          INSERT INTO trek_runs (
            snapshot_id,
            player_id,
            animal,
            weapon,
            trek,
            score,
            run_rank,
            counted,
            raw_label
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          snapshotId,
          playerId,
          run.animal,
          run.weapon,
          run.trek,
          run.score,
          run.runRank,
          run.counted,
          run.rawLabel,
        ],
      );
    }

    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

export async function replaceBenchmarksForSnapshot(db, snapshotId, benchmarks) {
  await db.exec("BEGIN TRANSACTION");

  try {
    await db.run(
      `
        DELETE FROM trek_benchmarks
        WHERE snapshot_id = ?
      `,
      [snapshotId],
    );

    for (const benchmark of benchmarks) {
      await db.run(
        `
          INSERT INTO trek_benchmarks (
            snapshot_id,
            animal,
            weapon,
            trek,
            best_score,
            benchmark_player_id,
            benchmark_player_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          snapshotId,
          benchmark.animal,
          benchmark.weapon,
          benchmark.trek,
          benchmark.bestScore,
          benchmark.benchmarkPlayerId,
          benchmark.benchmarkPlayerName,
        ],
      );
    }

    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

export async function getSnapshotById(db, snapshotId) {
  return db.get(
    `
      SELECT
        id,
        created_at AS createdAt,
        source_last_updated AS sourceLastUpdated,
        player_count AS playerCount
      FROM snapshots
      WHERE id = ?
    `,
    [snapshotId],
  );
}

export async function getLatestSnapshot(db) {
  return db.get(
    `
      SELECT
        id,
        created_at AS createdAt,
        source_last_updated AS sourceLastUpdated,
        player_count AS playerCount
      FROM snapshots
      ORDER BY id DESC
      LIMIT 1
    `,
  );
}

export async function getPlayers(db, snapshotId, search = "") {
  const query = `
    SELECT
      id,
      name,
      location,
      skill_rank AS skillRank,
      global_skill_score AS globalSkillScore,
      global_wildcard_score AS globalWildcardScore,
      accuracy,
      country_code AS countryCode,
      external_player_id AS externalPlayerId
    FROM players
    WHERE snapshot_id = ?
      AND (? = '' OR lower(name) LIKE ? OR lower(location) LIKE ?)
    ORDER BY skill_rank ASC, name ASC
    LIMIT 50
  `;

  const searchValue = search.trim().toLowerCase();
  const wildcard = `%${searchValue}%`;

  return db.all(query, [snapshotId, searchValue, wildcard, wildcard]);
}

export async function getAllPlayersForSnapshot(db, snapshotId) {
  return db.all(
    `
      SELECT
        id,
        name,
        location,
        skill_rank AS skillRank,
        global_skill_score AS globalSkillScore,
        global_wildcard_score AS globalWildcardScore,
        accuracy,
        country_code AS countryCode,
        external_player_id AS externalPlayerId
      FROM players
      WHERE snapshot_id = ?
      ORDER BY skill_rank ASC, name ASC
    `,
    [snapshotId],
  );
}

export async function getRunsForSnapshot(db, snapshotId) {
  return db.all(
    `
      SELECT
        snapshot_id AS snapshotId,
        player_id AS playerId,
        animal,
        weapon,
        trek,
        score,
        run_rank AS runRank,
        counted,
        raw_label AS rawLabel
      FROM trek_runs
      WHERE snapshot_id = ?
    `,
    [snapshotId],
  );
}

export async function getRunsForPlayer(db, snapshotId, playerId) {
  return db.all(
    `
      SELECT
        snapshot_id AS snapshotId,
        player_id AS playerId,
        animal,
        weapon,
        trek,
        score,
        run_rank AS runRank,
        counted,
        raw_label AS rawLabel
      FROM trek_runs
      WHERE snapshot_id = ?
        AND player_id = ?
    `,
    [snapshotId, playerId],
  );
}

export async function getBenchmarksForSnapshot(db, snapshotId) {
  return db.all(
    `
      SELECT
        animal,
        weapon,
        trek,
        best_score AS bestScore,
        benchmark_player_id AS benchmarkPlayerId,
        benchmark_player_name AS benchmarkPlayerName
      FROM trek_benchmarks
      WHERE snapshot_id = ?
    `,
    [snapshotId],
  );
}

export { databasePath };
