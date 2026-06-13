import { describe, expect, it } from "vitest";
import {
  buildAdventureOpportunities,
  buildBenchmarks,
  computeOpportunities,
  createPlayerId,
  summarizePlayerRuns,
} from "../src/analysis.js";

describe("analysis helpers", () => {
  it("orders runs and picks the third-best score", () => {
    const playerId = createPlayerId("Test Player", "Arcade");
    const summaries = summarizePlayerRuns([
      { playerId, animal: "Elk", weapon: "Gun", trek: "Trek 2", score: 12000 },
      { playerId, animal: "Elk", weapon: "Gun", trek: "Trek 2", score: 9000 },
      { playerId, animal: "Elk", weapon: "Gun", trek: "Trek 2", score: 15000 },
      { playerId, animal: "Elk", weapon: "Gun", trek: "Trek 2", score: 10000 },
    ]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].topThree).toEqual([15000, 12000, 10000]);
    expect(summaries[0].thirdBestScore).toBe(10000);
    expect(summaries[0].topThreeTotal).toBe(37000);
  });

  it("computes opportunities from third-best score to trek benchmark", () => {
    const playerId = createPlayerId("Test Player", "Arcade");
    const rivalId = createPlayerId("Benchmark", "Arcade");
    const players = [
      { id: playerId, name: "Test Player" },
      { id: rivalId, name: "Benchmark" },
    ];
    const runs = [
      { playerId, animal: "Elk", weapon: "Gun", trek: "Trek 3", score: 13000 },
      { playerId, animal: "Elk", weapon: "Gun", trek: "Trek 3", score: 12500 },
      { playerId, animal: "Elk", weapon: "Gun", trek: "Trek 3", score: 10000 },
      { playerId: rivalId, animal: "Elk", weapon: "Gun", trek: "Trek 3", score: 17000 },
    ];

    const benchmarks = buildBenchmarks(runs, new Map(players.map((player) => [player.id, player])));
    const result = computeOpportunities({
      playerId,
      players,
      runs,
      benchmarks,
    });

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]).toMatchObject({
      theoreticalGain: 7000,
      playerThirdBestScore: 10000,
      benchmarkScore: 17000,
      benchmarkPlayerName: "Benchmark",
    });
    expect(result.adventureOpportunities).toEqual([
      expect.objectContaining({
        animal: "Elk",
        weapon: "Gun",
        theoreticalGain: 7000,
        trekCount: 1,
      }),
    ]);
  });

  it("supports weapon and animal filters", () => {
    const playerId = createPlayerId("Test Player", "Arcade");
    const players = [{ id: playerId, name: "Test Player" }];
    const runs = [
      { playerId, animal: "Elk", weapon: "Gun", trek: "Trek 1", score: 8000 },
      { playerId, animal: "Elk", weapon: "Gun", trek: "Trek 1", score: 7800 },
      { playerId, animal: "Elk", weapon: "Gun", trek: "Trek 1", score: 7000 },
      { playerId, animal: "Moose", weapon: "Bow", trek: "Trek 2", score: 6000 },
      { playerId, animal: "Moose", weapon: "Bow", trek: "Trek 2", score: 5500 },
      { playerId, animal: "Moose", weapon: "Bow", trek: "Trek 2", score: 5000 },
    ];
    const benchmarks = [
      {
        animal: "Elk",
        weapon: "Gun",
        trek: "Trek 1",
        bestScore: 10000,
        benchmarkPlayerId: "a",
        benchmarkPlayerName: "A",
      },
      {
        animal: "Moose",
        weapon: "Bow",
        trek: "Trek 2",
        bestScore: 11000,
        benchmarkPlayerId: "b",
        benchmarkPlayerName: "B",
      },
    ];

    const result = computeOpportunities({
      playerId,
      players,
      runs,
      benchmarks,
      weapon: "bow",
      animal: "moose",
    });

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0].animal).toBe("Moose");
    expect(result.opportunities[0].weapon).toBe("Bow");
  });

  it("includes benchmark treks the player has never played yet", () => {
    const playerId = createPlayerId("Test Player", "Arcade");
    const players = [{ id: playerId, name: "Test Player" }];
    const benchmarks = [
      {
        animal: "Elk",
        weapon: "Gun",
        trek: "Trek 1",
        bestScore: 10000,
        benchmarkPlayerId: "a",
        benchmarkPlayerName: "A",
      },
      {
        animal: "Moose",
        weapon: "Bow",
        trek: "Trek 2",
        bestScore: 11000,
        benchmarkPlayerId: "b",
        benchmarkPlayerName: "B",
      },
    ];

    const result = computeOpportunities({
      playerId,
      players,
      runs: [],
      benchmarks,
    });

    expect(result.opportunities).toHaveLength(2);
    expect(result.opportunities[0]).toMatchObject({
      animal: "Moose",
      weapon: "Bow",
      trek: "Trek 2",
      playerThirdBestScore: 0,
      playerTopThreeScores: [0, 0, 0],
      benchmarkScore: 11000,
      theoreticalGain: 11000,
    });
  });

  it("uses the highest benchmark run even when row order is not highest-to-lowest", () => {
    const playerId = createPlayerId("Trevor Gartner", "The Basemnt Lounge");
    const players = [{ id: playerId, name: "Trevor Gartner" }];
    const runs = [
      { playerId, animal: "Moose", weapon: "Gun", trek: "Trek 3", score: 16722, runRank: 3 },
      { playerId, animal: "Moose", weapon: "Gun", trek: "Trek 3", score: 18011, runRank: 1 },
      { playerId, animal: "Moose", weapon: "Gun", trek: "Trek 3", score: 17744, runRank: 2 },
    ];

    const benchmarks = buildBenchmarks(runs, new Map(players.map((player) => [player.id, player])));
    expect(benchmarks).toEqual([
      {
        animal: "Moose",
        weapon: "Gun",
        trek: "Trek 3",
        bestScore: 18011,
        benchmarkTopThreeScores: [18011],
        benchmarkTopThreeTotal: 18011,
        benchmarkPlayerId: playerId,
        benchmarkPlayerName: "Trevor Gartner",
      },
    ]);
  });

  it("groups trek opportunities into ranked adventure opportunities", () => {
    const adventures = buildAdventureOpportunities([
      { animal: "Elk", weapon: "Gun", trek: "Trek 2", theoreticalGain: 2000 },
      { animal: "Moose", weapon: "Bow", trek: "Trek 1", theoreticalGain: 3000 },
      { animal: "Elk", weapon: "Gun", trek: "Trek 1", theoreticalGain: 5000 },
      { animal: "Elk", weapon: "Gun", trek: "Trek 3", theoreticalGain: 1000 },
    ]);

    expect(adventures).toEqual([
      {
        animal: "Elk",
        weapon: "Gun",
        theoreticalGain: 8000,
        trekCount: 3,
        treks: [
          expect.objectContaining({ trek: "Trek 1", theoreticalGain: 5000 }),
          expect.objectContaining({ trek: "Trek 2", theoreticalGain: 2000 }),
          expect.objectContaining({ trek: "Trek 3", theoreticalGain: 1000 }),
        ],
      },
      {
        animal: "Moose",
        weapon: "Bow",
        theoreticalGain: 3000,
        trekCount: 1,
        treks: [expect.objectContaining({ trek: "Trek 1", theoreticalGain: 3000 })],
      },
    ]);
  });

  it("keeps gun and bow adventures separate when weapon filter is both", () => {
    const playerId = createPlayerId("Test Player", "Arcade");
    const players = [{ id: playerId, name: "Test Player" }];
    const benchmarks = [
      {
        animal: "Elk",
        weapon: "Gun",
        trek: "Trek 1",
        bestScore: 10000,
        benchmarkPlayerId: "gun-benchmark",
        benchmarkPlayerName: "Gun Benchmark",
      },
      {
        animal: "Elk",
        weapon: "Bow",
        trek: "Trek 1",
        bestScore: 12000,
        benchmarkPlayerId: "bow-benchmark",
        benchmarkPlayerName: "Bow Benchmark",
      },
    ];

    const result = computeOpportunities({
      playerId,
      players,
      runs: [],
      benchmarks,
      weapon: "both",
    });

    expect(result.adventureOpportunities).toHaveLength(2);
    expect(result.adventureOpportunities[0]).toMatchObject({
      animal: "Elk",
      weapon: "Bow",
      theoreticalGain: 12000,
    });
    expect(result.adventureOpportunities[1]).toMatchObject({
      animal: "Elk",
      weapon: "Gun",
      theoreticalGain: 10000,
    });
  });
});
