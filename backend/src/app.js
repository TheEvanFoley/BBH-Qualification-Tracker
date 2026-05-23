import express from "express";
import fs from "node:fs";
import path from "node:path";
import {
  getAllPlayersForSnapshot,
  getBenchmarksForSnapshot,
  getLatestSnapshot,
  getPlayers,
  replaceBenchmarksForSnapshot,
  getRunsForPlayer,
  savePlayersToSnapshot,
  savePlayerRuns,
  saveSnapshot,
} from "./db.js";
import { computeOpportunities } from "./analysis.js";
import {
  scrapeBenchmarksOnly,
  scrapePlayerRuns,
  scrapePlayersBySearch,
  scrapeQualifiers,
} from "./scraper.js";

export function createApp(db) {
  const app = express();
  const frontendRootDir = path.resolve("frontend");
  const frontendPublicDir = path.resolve(frontendRootDir, "public");
  const frontendDistDir = path.resolve(frontendRootDir, "dist");
  const activeFrontendDir = fs.existsSync(path.join(frontendDistDir, "index.html"))
    ? frontendDistDir
    : frontendRootDir;

  app.use(express.json());
  app.use(express.static(activeFrontendDir));
  app.use(express.static(frontendPublicDir));

  app.get("/api/health", async (_request, response) => {
    const snapshot = await getLatestSnapshot(db);
    response.json({
      ok: true,
      latestSnapshot: snapshot,
    });
  });

  app.get("/api/players", async (request, response) => {
    try {
      const snapshot = await getLatestSnapshot(db);
      if (!snapshot) {
        response.status(404).json({
          error: "No snapshot available yet. Run a refresh first.",
        });
        return;
      }

      const search = String(request.query.search ?? "");
      let players = await getPlayers(db, snapshot.id, search);

      if (search.trim() && String(request.query.live ?? "0") === "1") {
        const livePlayers = await scrapePlayersBySearch(search);
        if (livePlayers.length > 0) {
          await savePlayersToSnapshot(db, snapshot.id, livePlayers);
          const playersById = new Map(players.map((player) => [player.id, player]));
          for (const player of livePlayers) {
            playersById.set(player.id, player);
          }
          players = [...playersById.values()].sort((left, right) => {
            const leftRank = left.skillRank ?? Number.MAX_SAFE_INTEGER;
            const rightRank = right.skillRank ?? Number.MAX_SAFE_INTEGER;
            return leftRank - rightRank || left.name.localeCompare(right.name);
          });
        }
      }

      response.json({
        snapshot,
        players,
      });
    } catch (error) {
      response.status(500).json({
        error: "Failed to load players.",
        details: error.message,
      });
    }
  });

  app.post("/api/refresh", async (request, response) => {
    try {
      const payload = await scrapeQualifiers({
        maxPages: request.body?.maxPages ?? null,
        maxPlayers: request.body?.maxPlayers ?? null,
      });

      if (payload.players.length === 0) {
        response.status(502).json({
          error: "Scrape completed without any players.",
        });
        return;
      }

      const snapshot = await saveSnapshot(db, payload);
      response.status(201).json({
        snapshot,
        players: payload.players.length,
        trekRuns: payload.trekRuns.length,
      });
    } catch (error) {
      response.status(500).json({
        error: "Failed to refresh leaderboard data.",
        details: error.message,
      });
    }
  });

  app.post("/api/refresh-benchmarks", async (_request, response) => {
    try {
      const snapshot = await getLatestSnapshot(db);
      if (!snapshot) {
        response.status(404).json({
          error: "No snapshot available yet. Run a refresh first.",
        });
        return;
      }

      const benchmarks = await scrapeBenchmarksOnly();
      await replaceBenchmarksForSnapshot(db, snapshot.id, benchmarks);

      response.status(200).json({
        snapshot: await getLatestSnapshot(db),
        benchmarks: benchmarks.length,
      });
    } catch (error) {
      response.status(500).json({
        error: "Failed to refresh benchmark data.",
        details: error.message,
      });
    }
  });

  app.get("/api/player/:playerId/opportunities", async (request, response) => {
    const snapshot = await getLatestSnapshot(db);
    if (!snapshot) {
      response.status(404).json({
        error: "No snapshot available yet. Run a refresh first.",
      });
      return;
    }

    const players = await getAllPlayersForSnapshot(db, snapshot.id);
    const player = players.find((entry) => entry.id === request.params.playerId);
    if (!player) {
      response.status(404).json({
        error: "Player not found in the latest snapshot.",
      });
      return;
    }

    let runs = await getRunsForPlayer(db, snapshot.id, request.params.playerId);
    const benchmarks = await getBenchmarksForSnapshot(db, snapshot.id);

    if (runs.length === 0) {
      runs = await scrapePlayerRuns(player);
      await savePlayerRuns(db, snapshot.id, request.params.playerId, runs);
    }

    const result = computeOpportunities({
      playerId: request.params.playerId,
      players,
      runs,
      benchmarks,
      weapon: String(request.query.weapon ?? "both"),
      animal: String(request.query.animal ?? "all"),
    });

    response.json({
      snapshot,
      player,
      opportunities: result.opportunities,
    });
  });

  app.use((_request, response) => {
    response.sendFile(path.join(activeFrontendDir, "index.html"));
  });

  return app;
}
