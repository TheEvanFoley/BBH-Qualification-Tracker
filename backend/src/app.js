import express from "express";
import fs from "node:fs";
import path from "node:path";
import {
  countPlayers,
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

const REFRESH_PAGE_SIZE = 100;

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

  const refreshState = {
    status: "idle",
    phase: "idle",
    progress: 0,
    message: "No refresh has been started yet.",
    error: null,
    startedAt: null,
    completedAt: null,
    latestSnapshotId: null,
    playersFound: 0,
    benchmarksFound: 0,
    currentPage: 0,
    estimatedPlayerPages: 0,
    processedTargets: 0,
    totalTargets: 0,
  };

  function updateRefreshState(patch) {
    Object.assign(refreshState, patch);
  }

  function buildRefreshMessage(update, estimatedPlayerPages) {
    if (update.phase === "starting") {
      return "Preparing a live data refresh...";
    }

    if (update.phase === "players") {
      const currentPage = (update.pageIndex ?? 0) + 1;
      if (estimatedPlayerPages && estimatedPlayerPages >= currentPage) {
        return `Checking leaderboard page ${currentPage} of ${estimatedPlayerPages}...`;
      }

      return `Checking leaderboard page ${currentPage}...`;
    }

    if (update.phase === "players-complete") {
      return `Checked the leaderboard and found ${update.playersFound ?? 0} players.`;
    }

    if (update.phase === "benchmarks") {
      return `Retrieving Top Scores for ${update.animal} ${update.trek}...`;
    }

    if (update.phase === "benchmarks-complete") {
      return `Retrieved ${update.benchmarksFound ?? 0} top-score benchmarks.`;
    }

    return update.message ?? refreshState.message;
  }

  function mapRefreshProgress(update, estimatedPlayerPages) {
    if (update.phase === "starting") {
      return 6;
    }

    if (update.phase === "players") {
      const currentPage = (update.pageIndex ?? 0) + 1;
      const rollingEstimate =
        estimatedPlayerPages && estimatedPlayerPages >= currentPage
          ? estimatedPlayerPages
          : currentPage + 10;
      const totalPages = Math.max(1, rollingEstimate);
      const ratio = Math.min(1, currentPage / totalPages);
      return 12 + Math.round(ratio * 43);
    }

    if (update.phase === "players-complete") {
      return 58;
    }

    if (update.phase === "benchmarks") {
      const totalTargets = update.totalTargets ?? 1;
      const processedTargets = update.processedTargets ?? 0;
      return 60 + Math.round((processedTargets / totalTargets) * 34);
    }

    if (update.phase === "benchmarks-complete") {
      return 96;
    }

    return refreshState.progress;
  }

  async function runRefreshJob(options = {}) {
    const latestSnapshot = await getLatestSnapshot(db);
    const estimatedPlayerPages =
      latestSnapshot?.playerCount && latestSnapshot.playerCount >= REFRESH_PAGE_SIZE
        ? Math.ceil(latestSnapshot.playerCount / REFRESH_PAGE_SIZE)
        : 0;

    updateRefreshState({
      status: "running",
      phase: "starting",
      progress: 0,
      message: "Preparing a live data refresh...",
      error: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      playersFound: 0,
      benchmarksFound: 0,
      currentPage: 0,
      estimatedPlayerPages,
      processedTargets: 0,
      totalTargets: 0,
    });

    try {
      const payload = await scrapeQualifiers({
        maxPages: options.maxPages ?? null,
        maxPlayers: options.maxPlayers ?? null,
        onProgress: (update) => {
          const currentPage = update.phase === "players" ? (update.pageIndex ?? 0) + 1 : refreshState.currentPage;
          const nextEstimatedPlayerPages =
            update.phase === "players" && currentPage > refreshState.estimatedPlayerPages
              ? Math.max(refreshState.estimatedPlayerPages, currentPage + 10)
              : refreshState.estimatedPlayerPages;

          updateRefreshState({
            phase: update.phase ?? refreshState.phase,
            progress: mapRefreshProgress(update, nextEstimatedPlayerPages),
            message: buildRefreshMessage(update, nextEstimatedPlayerPages),
            playersFound: update.playersFound ?? refreshState.playersFound,
            benchmarksFound: update.benchmarksFound ?? refreshState.benchmarksFound,
            currentPage,
            estimatedPlayerPages: nextEstimatedPlayerPages,
            processedTargets: update.processedTargets ?? refreshState.processedTargets,
            totalTargets: update.totalTargets ?? refreshState.totalTargets,
          });
        },
      });

      if (payload.players.length === 0) {
        throw new Error("Scrape completed without any players.");
      }

      updateRefreshState({
        phase: "saving",
        progress: 98,
        message: "Saving the refreshed snapshot locally...",
        playersFound: payload.players.length,
        benchmarksFound: payload.benchmarks.length,
      });

      const snapshot = await saveSnapshot(db, payload);

      updateRefreshState({
        status: "completed",
        phase: "completed",
        progress: 100,
        message: "Refresh complete.",
        completedAt: new Date().toISOString(),
        latestSnapshotId: snapshot.id,
      });

      return snapshot;
    } catch (error) {
      updateRefreshState({
        status: "failed",
        phase: "failed",
        message: "Refresh failed.",
        error: error.message,
        completedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  app.get("/api/health", async (_request, response) => {
    const snapshot = await getLatestSnapshot(db);
    response.json({
      ok: true,
      latestSnapshot: snapshot,
    });
  });

  app.get("/api/refresh-status", async (_request, response) => {
    const latestSnapshot = await getLatestSnapshot(db);
    response.json({
      ...refreshState,
      latestSnapshot,
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
      const pageSize = Math.max(1, Number.parseInt(String(request.query.pageSize ?? "10"), 10) || 10);
      const page = Math.max(1, Number.parseInt(String(request.query.page ?? "1"), 10) || 1);
      const offset = (page - 1) * pageSize;

      if (search.trim() && String(request.query.live ?? "0") === "1") {
        const livePlayers = await scrapePlayersBySearch(search);
        if (livePlayers.length > 0) {
          await savePlayersToSnapshot(db, snapshot.id, livePlayers);
        }
      }

      const [players, total] = await Promise.all([
        getPlayers(db, snapshot.id, search, pageSize, offset),
        countPlayers(db, snapshot.id, search),
      ]);

      response.json({
        snapshot,
        players,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      });
    } catch (error) {
      response.status(500).json({
        error: "Failed to load players.",
        details: error.message,
      });
    }
  });

  app.post("/api/refresh", async (request, response) => {
    if (refreshState.status === "running") {
      response.status(409).json({
        error: "A refresh is already running.",
        refresh: refreshState,
      });
      return;
    }

    void runRefreshJob(request.body ?? {}).catch(() => {});

    response.status(202).json({
      ok: true,
      refresh: refreshState,
    });
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
