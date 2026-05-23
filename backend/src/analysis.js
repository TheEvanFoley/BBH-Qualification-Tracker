const keyFor = (animal, weapon, trek) => `${animal}::${weapon}::${trek}`;

export function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createPlayerId(name, location) {
  return `${slugify(name)}--${slugify(location || "unknown")}`;
}

export function toInt(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const digits = String(value).replace(/[^\d-]/g, "");
  if (!digits) {
    return null;
  }

  const parsed = Number.parseInt(digits, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function toFloat(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const cleaned = String(value).replace(/[^\d.-]/g, "");
  if (!cleaned) {
    return null;
  }

  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}

export function summarizePlayerRuns(runs) {
  const grouped = new Map();

  for (const run of runs) {
    const key = `${run.playerId}::${keyFor(run.animal, run.weapon, run.trek)}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        playerId: run.playerId,
        animal: run.animal,
        weapon: run.weapon,
        trek: run.trek,
        scores: [],
      });
    }

    grouped.get(key).scores.push(run.score);
  }

  return [...grouped.values()].map((entry) => {
    const sortedScores = [...entry.scores].sort((a, b) => b - a);
    const topThree = sortedScores.slice(0, 3);
    const thirdBestScore = topThree.at(-1) ?? 0;

    return {
      playerId: entry.playerId,
      animal: entry.animal,
      weapon: entry.weapon,
      trek: entry.trek,
      topThree,
      topThreeTotal: topThree.reduce((sum, score) => sum + score, 0),
      thirdBestScore,
    };
  });
}

export function buildBenchmarks(runs, playersById = new Map()) {
  const benchmarks = new Map();

  for (const run of runs) {
    const key = keyFor(run.animal, run.weapon, run.trek);
    const current = benchmarks.get(key);
    if (!current || run.score > current.bestScore) {
      const player = playersById.get(run.playerId);
      benchmarks.set(key, {
        animal: run.animal,
        weapon: run.weapon,
        trek: run.trek,
        bestScore: run.score,
        benchmarkPlayerId: run.playerId,
        benchmarkPlayerName: player?.name ?? run.playerId,
      });
    }
  }

  return [...benchmarks.values()];
}

export function computeOpportunities({
  playerId,
  runs,
  players = [],
  benchmarks,
  weapon = "both",
  animal = "all",
}) {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const benchmarkMap = new Map(
    (benchmarks ?? buildBenchmarks(runs, playersById)).map((benchmark) => [
      keyFor(benchmark.animal, benchmark.weapon, benchmark.trek),
      benchmark,
    ]),
  );

  const summaryMap = new Map(
    summarizePlayerRuns(runs)
      .filter((summary) => summary.playerId === playerId)
      .map((summary) => [keyFor(summary.animal, summary.weapon, summary.trek), summary]),
  );

  const opportunities = [...benchmarkMap.values()]
    .map((benchmark) => {
      const summary =
        summaryMap.get(keyFor(benchmark.animal, benchmark.weapon, benchmark.trek)) ?? null;
      const topThree = summary?.topThree ?? [0, 0, 0];
      const thirdBestScore = summary?.thirdBestScore ?? 0;
      const topThreeTotal = summary?.topThreeTotal ?? 0;

      return {
        playerId,
        animal: benchmark.animal,
        weapon: benchmark.weapon,
        trek: benchmark.trek,
        theoreticalGain: Math.max(benchmark.bestScore - thirdBestScore, 0),
        playerThirdBestScore: thirdBestScore,
        playerTopThreeScores: topThree,
        playerTopThreeTotal: topThreeTotal,
        benchmarkScore: benchmark.bestScore,
        benchmarkPlayerId: benchmark.benchmarkPlayerId,
        benchmarkPlayerName: benchmark.benchmarkPlayerName,
      };
    })
    .filter((item) => {
      if (weapon !== "both" && item.weapon.toLowerCase() !== weapon.toLowerCase()) {
        return false;
      }

      if (animal !== "all" && item.animal.toLowerCase() !== animal.toLowerCase()) {
        return false;
      }

      return true;
    })
    .sort((left, right) => right.theoreticalGain - left.theoreticalGain);

  const player = playersById.get(playerId) ?? null;

  return {
    player,
    opportunities,
  };
}
