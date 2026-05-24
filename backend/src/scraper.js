import { chromium } from "playwright";
import { createPlayerId, toFloat, toInt } from "./analysis.js";

const BASE_URL = "https://www.bigbuckhunter.com/world/qualifiers";
const PAGE_SIZE = 100;
const ADVENTURES = [
  { id: "10100", animal: "Whitetail" },
  { id: "10200", animal: "Elk" },
  { id: "10300", animal: "Kudu" },
  { id: "10400", animal: "Moose" },
  { id: "10500", animal: "Wildebeest" },
  { id: "10600", animal: "Gemsbok" },
  { id: "10700", animal: "Bighorn Sheep" },
  { id: "10800", animal: "Irish Elk" },
  { id: "10900", animal: "Buckzilla" },
  { id: "11000", animal: "Zombie Deer" },
  { id: "11100", animal: "Caribou" },
];
const BENCHMARK_TARGETS = ADVENTURES.length * 3;
const SHORT_PAGE_RETRY_LIMIT = 3;

function reportProgress(onProgress, update) {
  if (typeof onProgress === "function") {
    onProgress(update);
  }
}

async function parsePlayerSummary(page) {
  return page.$$eval("table tr", (rows) =>
    rows
      .slice(1)
      .map((row) => {
        const cellElements = [...row.querySelectorAll("td")];
        const cells = cellElements.map((cell) =>
          cell.textContent.replace(/\s+/g, " ").trim(),
        );

        if (cells.length < 4) {
          return null;
        }

        const playerLink = row.querySelector("td.player a");
        const name = row.querySelector("td.player .name")?.textContent?.trim() ?? "";
        const location =
          row.querySelector("td.player .location")?.textContent?.trim() ?? "";
        const countryCode =
          [...(row.querySelector("td.rank .country-indicator")?.classList ?? [])].find(
            (className) => className !== "country-indicator",
          ) ?? "";
        const externalPlayerId =
          playerLink?.getAttribute("href")?.match(/\/profile\/player\/(\d+)/i)?.[1] ?? "";

        return {
          profileHref: playerLink?.getAttribute("href") ?? "",
          name,
          location,
          countryCode,
          externalPlayerId,
          skillCell: cells[2] || "",
          wildcardCell: cells[3] || "",
          cells,
        };
      })
      .filter(Boolean),
  );
}

function parseProfileId(profileHref, name, location) {
  const match = profileHref.match(/\/profile\/player\/(\d+)/i);
  if (match) {
    return `player-${match[1]}`;
  }

  return createPlayerId(name, location);
}

function parseSkillCell(text) {
  const rankMatch = text.match(/^\D*(\d+)\s*\(([\d,]+)\)/);
  const accuracyMatch = text.match(/Accy\s*([\d.]+)%/i);

  return {
    skillRank: rankMatch ? Number.parseInt(rankMatch[1], 10) : null,
    globalSkillScore: rankMatch ? toInt(rankMatch[2]) : null,
    accuracy: accuracyMatch ? toFloat(accuracyMatch[1]) : null,
  };
}

function parseWildcardCell(text) {
  const rankMatch = text.match(/^\D*(\d+)\s*\(([\d,]+)\)/);
  const scoreMatch = text.match(/\(([\d,]+)\)/);
  return {
    wildcardRank: rankMatch ? Number.parseInt(rankMatch[1], 10) : null,
    globalWildcardScore: scoreMatch ? toInt(scoreMatch[1]) : null,
  };
}

function buildPlayerSummary(summary) {
  return {
    id: parseProfileId(summary.profileHref, summary.name, summary.location),
    name: summary.name,
    location: summary.location,
    countryCode: summary.countryCode,
    externalPlayerId: summary.externalPlayerId,
    ...parseSkillCell(summary.skillCell),
    ...parseWildcardCell(summary.wildcardCell),
  };
}

function parseQualifierScores(playerId, payload, animalFilter = null) {
  const data = typeof payload === "string" ? JSON.parse(payload) : payload;
  const animals = data.scores ?? {};
  const runs = [];

  for (const animalEntry of Object.values(animals)) {
    const animalName = animalEntry.animal;
    if (animalFilter && animalName !== animalFilter) {
      continue;
    }

    const scoreGroups = animalEntry.scores ?? {};
    for (const [weapon, slots] of Object.entries(scoreGroups)) {
      const orderedSlotIds = Object.keys(slots)
        .sort((left, right) => Number(left) - Number(right));

      orderedSlotIds.forEach((slotId, index) => {
        const trekScores = slots[slotId] ?? [];
        trekScores.forEach((score, trekIndex) => {
          runs.push({
            playerId,
            animal: animalName,
            weapon,
            trek: `Trek ${trekIndex + 1}`,
            score: toInt(score) ?? 0,
            runRank: index + 1,
            counted: 1,
            rawLabel: `${weapon} ${slotId}`,
          });
        });
      });
    }
  }

  return runs;
}

async function fetchQualifierScores(page, player) {
  if (!player.countryCode || !player.externalPlayerId) {
    throw new Error(`Missing qualifier score lookup fields for ${player.name}`);
  }

  const response = await page.goto(
    `https://www.bigbuckhunter.com/world/qualifier_scores/${player.countryCode}/${player.externalPlayerId}`,
    { waitUntil: "domcontentloaded" },
  );

  return response.text();
}

function buildLeaderboardUrl(offset) {
  return offset === 0
    ? BASE_URL
    : `${BASE_URL}?order_by=SkillRank&order_direction=desc&search=&limit=${PAGE_SIZE}&offset=${offset}`;
}

async function loadLeaderboardPage(page, offset) {
  await page.goto(buildLeaderboardUrl(offset), { waitUntil: "networkidle" });
  await page.waitForSelector("table tr");

  const [summaries, sourceLastUpdated] = await Promise.all([
    parsePlayerSummary(page),
    page
      .locator(".leaderboard-last-update strong")
      .first()
      .textContent()
      .catch(() => null),
  ]);

  return {
    offset,
    summaries,
    sourceLastUpdated,
  };
}

async function scrapePlayerIndex(page, { maxPages = null, maxPlayers = null, onProgress = null } = {}) {
  const players = [];
  const seenPlayers = new Set();
  let sourceLastUpdated = null;
  let prefetchedPage = null;

  for (let pageIndex = 0; ; pageIndex += 1) {
    if (maxPages && pageIndex >= maxPages) {
      break;
    }

    const offset = pageIndex * PAGE_SIZE;

    reportProgress(onProgress, {
      phase: "players",
      pageIndex,
      playersFound: players.length,
      message:
        pageIndex === 0
          ? "Loading the main qualifiers leaderboard..."
          : `Scanning leaderboard page ${pageIndex + 1} for more players...`,
    });

    let pageData;
    if (prefetchedPage?.offset === offset) {
      pageData = prefetchedPage;
      prefetchedPage = null;
    } else {
      pageData = await loadLeaderboardPage(page, offset);
    }

    if (!sourceLastUpdated) {
      sourceLastUpdated = pageData.sourceLastUpdated;
    }

    let summaries = pageData.summaries;
    if (summaries.length === 0) {
      break;
    }

    if (pageIndex > 0 && summaries.length < PAGE_SIZE) {
      const nextOffset = offset + PAGE_SIZE;

      reportProgress(onProgress, {
        phase: "players",
        pageIndex,
        playersFound: players.length,
        message: `Verifying leaderboard page ${pageIndex + 1} before stopping...`,
      });

      const nextPageData = await loadLeaderboardPage(page, nextOffset);

      if (nextPageData.summaries.length > 0) {
        let recovered = false;

        for (let retryIndex = 1; retryIndex <= SHORT_PAGE_RETRY_LIMIT; retryIndex += 1) {
          reportProgress(onProgress, {
            phase: "players",
            pageIndex,
            playersFound: players.length,
            message: `Retrying leaderboard page ${pageIndex + 1} (${retryIndex}/${SHORT_PAGE_RETRY_LIMIT})...`,
          });

          await page.waitForTimeout(500 * retryIndex);
          const retriedPageData = await loadLeaderboardPage(page, offset);
          summaries = retriedPageData.summaries;

          if (summaries.length === PAGE_SIZE) {
            pageData = retriedPageData;
            recovered = true;
            break;
          }
        }

        if (!recovered) {
          throw new Error(
            `Leaderboard page ${pageIndex + 1} returned only ${summaries.length} rows while later pages still had data. Refresh stopped to avoid saving an incomplete snapshot.`,
          );
        }
      } else {
        prefetchedPage = nextPageData;
      }
    }

    for (const summary of summaries) {
      const player = buildPlayerSummary(summary);
      if (seenPlayers.has(player.id)) {
        continue;
      }

      seenPlayers.add(player.id);
      players.push(player);

      if (maxPlayers && players.length >= maxPlayers) {
        break;
      }
    }

    reportProgress(onProgress, {
      phase: "players",
      pageIndex,
      playersFound: players.length,
      message: `Loaded ${players.length} player summaries so far.`,
    });

    if (maxPlayers && players.length >= maxPlayers) {
      break;
    }

    if (summaries.length < PAGE_SIZE) {
      break;
    }
  }

  return { players, sourceLastUpdated };
}

async function scrapeBenchmarks(page, { onProgress = null } = {}) {
  const benchmarks = [];
  const cachedScoreRuns = new Map();
  let processedTargets = 0;

  for (const adventure of ADVENTURES) {
    for (const trekNumber of [1, 2, 3]) {
      processedTargets += 1;
      reportProgress(onProgress, {
        phase: "benchmarks",
        processedTargets,
        totalTargets: BENCHMARK_TARGETS,
        animal: adventure.animal,
        trek: `Trek ${trekNumber}`,
        message: `Benchmarking ${adventure.animal} Trek ${trekNumber}...`,
      });

      const url = `${BASE_URL}?order_by=Trek${trekNumber}_Rank&order_direction=desc&search=&limit=${PAGE_SIZE}&offset=0&adventure_id=${adventure.id}`;
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForSelector("table tr");

      const topSummary = (await parsePlayerSummary(page))[0];
      if (!topSummary) {
        continue;
      }

      const benchmarkPlayer = buildPlayerSummary(topSummary);
      const cacheKey = `${benchmarkPlayer.countryCode}:${benchmarkPlayer.externalPlayerId}`;

      if (!cachedScoreRuns.has(cacheKey)) {
        const payload = await fetchQualifierScores(page, benchmarkPlayer);
        cachedScoreRuns.set(cacheKey, parseQualifierScores(benchmarkPlayer.id, payload));
      }

      const playerRuns = cachedScoreRuns.get(cacheKey);
      for (const weapon of ["Gun", "Bow"]) {
        const trekRuns = playerRuns
          .filter(
            (run) =>
              run.animal === adventure.animal &&
              run.weapon === weapon &&
              run.trek === `Trek ${trekNumber}`,
          )
          .sort((left, right) => right.score - left.score || left.runRank - right.runRank);

        const benchmarkRun = trekRuns[0];
        if (benchmarkRun) {
          const benchmarkTopThreeScores = trekRuns.slice(0, 3).map((run) => run.score);
          benchmarks.push({
            animal: adventure.animal,
            weapon,
            trek: `Trek ${trekNumber}`,
            bestScore: benchmarkRun.score,
            benchmarkTopThreeScores,
            benchmarkTopThreeTotal: benchmarkTopThreeScores.reduce((sum, score) => sum + score, 0),
            benchmarkPlayerId: benchmarkPlayer.id,
            benchmarkPlayerName: benchmarkPlayer.name,
          });
        }
      }
    }
  }

  return benchmarks;
}

export async function scrapeBenchmarksOnly() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    return await scrapeBenchmarks(page);
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

export async function scrapeQualifiers({ maxPages = null, maxPlayers = null, onProgress = null } = {}) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    reportProgress(onProgress, {
      phase: "starting",
      message: "Launching scraper...",
    });

    const { players, sourceLastUpdated } = await scrapePlayerIndex(page, {
      maxPages,
      maxPlayers,
      onProgress,
    });
    reportProgress(onProgress, {
      phase: "players-complete",
      playersFound: players.length,
      message: `Player index loaded with ${players.length} players.`,
    });
    const benchmarks = await scrapeBenchmarks(page, { onProgress });
    reportProgress(onProgress, {
      phase: "benchmarks-complete",
      benchmarksFound: benchmarks.length,
      message: `Collected ${benchmarks.length} trek benchmarks.`,
    });

    return {
      createdAt: new Date().toISOString(),
      sourceLastUpdated,
      players,
      trekRuns: [],
      benchmarks,
    };
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

export async function scrapePlayersBySearch(searchTerm) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const normalizedSearch = searchTerm.trim();
    if (!normalizedSearch) {
      return [];
    }

    const queries = [
      normalizedSearch,
      ...normalizedSearch
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean),
    ];
    const seenPlayers = new Map();

    for (const query of queries) {
      const encodedSearch = encodeURIComponent(query);
      const response = await page.goto(
        `https://www.bigbuckhunter.com/world/qualifiers_search?order_by=SkillRank&order_direction=desc&search=${encodedSearch}&limit=${PAGE_SIZE}&offset=0`,
        { waitUntil: "domcontentloaded" },
      );

      const players = JSON.parse(await response.text());
      for (const player of players) {
        const normalizedName = String(player.name ?? "").toLowerCase();
        const normalizedLocation = [
          player.location_name,
          player.location_city,
          player.location_state,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const normalizedQuery = normalizedSearch.toLowerCase();
        const tokenMatch = normalizedSearch
          .toLowerCase()
          .split(/\s+/)
          .every((token) => normalizedName.includes(token) || normalizedLocation.includes(token));

        if (
          !normalizedName.includes(normalizedQuery) &&
          !normalizedLocation.includes(normalizedQuery) &&
          !tokenMatch
        ) {
          continue;
        }

        seenPlayers.set(String(player.id), {
          id: `player-${player.id}`,
          name: player.name,
          location: [player.location_name, `${player.location_city}, ${player.location_state}`]
            .filter(Boolean)
            .join(" - "),
          countryCode: player.country,
          externalPlayerId: String(player.id),
          skillRank: toInt(player.overall_rank),
          wildcardRank: toInt(player.wildcard_rank),
          globalSkillScore: toInt(player.overall_score),
          globalWildcardScore: toInt(player.cumulative_score),
          accuracy: toFloat(player.accuracy),
        });
      }
    }

    return [...seenPlayers.values()].sort((left, right) => {
      const leftRank = left.skillRank ?? Number.MAX_SAFE_INTEGER;
      const rightRank = right.skillRank ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.name.localeCompare(right.name);
    });
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

export async function scrapePlayerRuns(player) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const payload = await fetchQualifierScores(page, player);
    return parseQualifierScores(player.id, payload);
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
