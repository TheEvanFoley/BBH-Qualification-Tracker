import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import * as scraper from "../src/scraper.js";

function createMockDb() {
  const snapshot = {
    id: 1,
    createdAt: "2026-05-23T12:00:00.000Z",
    sourceLastUpdated: "5/23/26 @ 9:45 AM GMT",
    playerCount: 1,
  };

  return {
    async exec() {
      return undefined;
    },
    async run() {
      return undefined;
    },
    async get(sql) {
      if (sql.includes("FROM snapshots")) {
        return snapshot;
      }

      if (sql.includes("COUNT(*) AS total") && sql.includes("FROM players")) {
        return { total: 1 };
      }

      return null;
    },
    async all(sql) {
      if (sql.includes("FROM players") && sql.includes("LIMIT")) {
        return [
          {
            id: "player-one",
            name: "Player One",
            location: "Chicago, IL",
            skillRank: 32,
            globalSkillScore: 123456,
            globalWildcardScore: 654321,
            accuracy: 44.4,
          },
        ];
      }

      if (sql.includes("FROM players")) {
        return [
          {
            id: "player-one",
            name: "Player One",
            location: "Chicago, IL",
            skillRank: 32,
            globalSkillScore: 123456,
            globalWildcardScore: 654321,
            accuracy: 44.4,
          },
        ];
      }

      if (sql.includes("FROM trek_runs")) {
        return [
          {
            snapshotId: 1,
            playerId: "player-one",
            animal: "Elk",
            weapon: "Gun",
            trek: "Trek 1",
            score: 12000,
            runRank: 1,
            counted: 1,
            rawLabel: "Elk Gun Trek 1 12000",
          },
          {
            snapshotId: 1,
            playerId: "player-one",
            animal: "Elk",
            weapon: "Gun",
            trek: "Trek 1",
            score: 10000,
            runRank: 2,
            counted: 1,
            rawLabel: "Elk Gun Trek 1 10000",
          },
          {
            snapshotId: 1,
            playerId: "player-one",
            animal: "Elk",
            weapon: "Gun",
            trek: "Trek 1",
            score: 9000,
            runRank: 3,
            counted: 1,
            rawLabel: "Elk Gun Trek 1 9000",
          },
        ];
      }

      if (sql.includes("FROM trek_benchmarks")) {
        return [
          {
            animal: "Elk",
            weapon: "Gun",
            trek: "Trek 1",
            bestScore: 15000,
            benchmarkPlayerId: "player-two",
            benchmarkPlayerName: "Player Two",
          },
        ];
      }

      return [];
    },
  };
}

describe("API", () => {
  let app;

  beforeEach(() => {
    app = createApp(createMockDb());
    vi.restoreAllMocks();
  });

  it("returns players from the latest snapshot", async () => {
    const response = await request(app).get("/api/players?search=player");
    expect(response.status).toBe(200);
    expect(response.body.players).toHaveLength(1);
    expect(response.body.players[0].name).toBe("Player One");
    expect(response.body.pagination).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it("returns opportunities for a selected player", async () => {
    const response = await request(app).get("/api/player/player-one/opportunities");
    expect(response.status).toBe(200);
    expect(response.body.opportunities).toHaveLength(1);
    expect(response.body.opportunities[0].theoreticalGain).toBe(6000);
  });

  it("returns live search results even when they are not already in the local query result", async () => {
    vi.spyOn(scraper, "scrapePlayersBySearch").mockResolvedValue([
      {
        id: "player-989928",
        name: "Evan Foley",
        location: "Baraboo Axe Lounge - Baraboo, WI",
        countryCode: "us",
        externalPlayerId: "989928",
        skillRank: 304,
        globalSkillScore: 304349,
        globalWildcardScore: 758328,
        accuracy: 39.1,
      },
    ]);

    const response = await request(app).get("/api/players?search=Evan%20Foley&live=1");
    expect(response.status).toBe(200);
    expect(response.body.players).toHaveLength(1);
    expect(response.body.players[0].name).toBe("Player One");
  });
});
