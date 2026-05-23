import React, { startTransition, useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 12;
const weaponOptions = [
  { value: "both", label: "Both" },
  { value: "gun", label: "Gun" },
  { value: "bow", label: "Bow" },
];

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

function formatWildcardRank(rank) {
  return rank != null ? `#${rank}` : "N/A";
}

function normalizeThreeScores(scores = []) {
  return [...scores, 0, 0, 0].slice(0, 3);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function StatusPill({ tone = "neutral", children }) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}

function StatChip({ label, value, tone = "neutral" }) {
  return (
    <div className={`stat-chip stat-chip--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FilterTabs({ value, options, onChange }) {
  return (
    <div className="filter-tabs" role="tablist" aria-label="Weapon filter">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`filter-tab ${value === option.value ? "is-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PlayerCard({ player, isActive, onSelect }) {
  return (
    <button
      type="button"
      className={`player-card ${isActive ? "is-active" : ""}`}
      onClick={onSelect}
    >
      <div className="player-card__top">
        <strong>{player.name}</strong>
        <div className="rank-pills">
          <StatusPill tone="green">Skill #{player.skillRank ?? "-"}</StatusPill>
          <StatusPill tone="orange">
            Wildcard {formatWildcardRank(player.wildcardRank)}
          </StatusPill>
        </div>
      </div>
      <p>{player.location}</p>
      <div className="player-card__stats">
        <StatChip label="Skill" value={formatNumber(player.globalSkillScore)} tone="green" />
        <StatChip
          label="Wildcard"
          value={formatNumber(player.globalWildcardScore)}
          tone="orange"
        />
      </div>
    </button>
  );
}

function OpportunityCard({ opportunity, isActive, onSelect }) {
  return (
    <button
      type="button"
      className={`opportunity-card ${isActive ? "is-active" : ""}`}
      onClick={onSelect}
    >
      <div className="opportunity-card__header">
        <div>
          <p className="eyebrow">{opportunity.animal}</p>
          <h3>{`${opportunity.weapon} / ${opportunity.trek}`}</h3>
        </div>
        <div className="gain-badge">
          <span>Gain</span>
          <strong>{formatNumber(opportunity.theoreticalGain)}</strong>
        </div>
      </div>

      <div className="opportunity-card__stats">
        <StatChip label="3rd Best" value={formatNumber(opportunity.playerThirdBestScore)} />
        <StatChip label="Top Score" value={formatNumber(opportunity.benchmarkScore)} />
      </div>

      <p className="opportunity-card__meta">
        Top hunter: <strong>{opportunity.benchmarkPlayerName}</strong>
      </p>
    </button>
  );
}

function Drilldown({ opportunity }) {
  if (!opportunity) {
    return (
      <div className="empty-panel">
        Tap a trek row to compare your counted scores against the current top hunter.
      </div>
    );
  }

  const playerScores = normalizeThreeScores(opportunity.playerTopThreeScores);
  const benchmarkScores = normalizeThreeScores(opportunity.benchmarkTopThreeScores);
  const selectedHunterName = opportunity.selectedPlayerName ?? "Selected Hunter";

  return (
    <div className="detail-panel">
      <div className="detail-panel__hero">
        <div>
          <p className="eyebrow">{opportunity.animal}</p>
          <h2>{`${opportunity.weapon} / ${opportunity.trek}`}</h2>
        </div>
        <div className="gain-badge gain-badge--hero">
          <span>Single Trek Gain</span>
          <strong>{formatNumber(opportunity.theoreticalGain)}</strong>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-card">
          <p className="detail-card__label">Current Skill Total</p>
          <div className="detail-card__name">{selectedHunterName}</div>
          <strong>{formatNumber(opportunity.playerTopThreeTotal)}</strong>
          <span>Current counted total for this trek.</span>
        </div>

        <div className="detail-card">
          <p className="detail-card__label">Current Skill Scores</p>
          <div className="detail-card__name">{selectedHunterName}</div>
          <div className="score-strip">
            {playerScores.map((score, index) => (
              <span
                key={`${opportunity.trek}-player-${index}`}
                className={`score-pill ${index === 2 ? "score-pill--player-focus" : ""}`}
              >
                {formatNumber(score)}
              </span>
            ))}
          </div>
        </div>

        <div className="detail-card">
          <p className="detail-card__label">Top Hunter Total</p>
          <div className="detail-card__name">{opportunity.benchmarkPlayerName}</div>
          <strong>{formatNumber(opportunity.benchmarkTopThreeTotal)}</strong>
          <span>Current counted total for the top hunter on this trek.</span>
        </div>

        <div className="detail-card">
          <p className="detail-card__label">Top Hunter Scores</p>
          <div className="detail-card__name">{opportunity.benchmarkPlayerName}</div>
          <div className="score-strip">
            {benchmarkScores.map((score, index) => (
              <span
                key={`${opportunity.trek}-benchmark-${index}`}
                className={`score-pill ${index === 0 ? "score-pill--benchmark-focus" : ""}`}
              >
                {formatNumber(score)}
              </span>
            ))}
          </div>
          <span>Best single-run benchmark highlighted in orange.</span>
        </div>
      </div>
    </div>
  );
}

export function App({ serviceWorkerState }) {
  const [snapshot, setSnapshot] = useState(null);
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [selectedOpportunityKey, setSelectedOpportunityKey] = useState(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [weapon, setWeapon] = useState("both");
  const [animal, setAnimal] = useState("all");
  const [opportunityPage, setOpportunityPage] = useState(1);
  const [playersMessage, setPlayersMessage] = useState("");
  const [opportunitiesMessage, setOpportunitiesMessage] = useState(
    "Pick a player to load the full skill score breakdown.",
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const animals = useMemo(
    () => [...new Set(opportunities.map((item) => item.animal))].sort(),
    [opportunities],
  );

  const totalPages = Math.max(1, Math.ceil(opportunities.length / PAGE_SIZE));
  const currentPage = Math.min(opportunityPage, totalPages);
  const visibleOpportunities = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return opportunities.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, opportunities]);

  const selectedOpportunity =
    opportunities.find(
      (item) => `${item.animal}::${item.weapon}::${item.trek}` === selectedOpportunityKey,
    ) ?? opportunities[0] ?? null;

  useEffect(() => {
    if (selectedOpportunity) {
      setSelectedOpportunityKey(
        `${selectedOpportunity.animal}::${selectedOpportunity.weapon}::${selectedOpportunity.trek}`,
      );
    }
  }, [selectedOpportunity]);

  async function loadPlayers({ live = false, overrideSearch = playerSearch } = {}) {
    try {
      const search = encodeURIComponent(overrideSearch.trim());
      const data = await fetchJson(`/api/players?search=${search}&live=${live ? "1" : "0"}`);
      startTransition(() => {
        setSnapshot(data.snapshot);
        setPlayers(data.players);
        setPlayersMessage(data.players.length === 0 ? "No players found." : "");
      });
    } catch (error) {
      setPlayers([]);
      setPlayersMessage(error.message);
    }
  }

  async function loadOpportunities(
    nextPlayer = selectedPlayer,
    nextWeapon = weapon,
    nextAnimal = animal,
  ) {
    if (!nextPlayer) {
      return;
    }

    setOpportunitiesMessage("Loading skill score breakdown...");

    try {
      const queryWeapon = encodeURIComponent(nextWeapon);
      const queryAnimal = encodeURIComponent(nextAnimal);
      const data = await fetchJson(
        `/api/player/${nextPlayer.id}/opportunities?weapon=${queryWeapon}&animal=${queryAnimal}`,
      );

      startTransition(() => {
        setSnapshot(data.snapshot);
        setSelectedPlayer(data.player);
        setOpportunities(data.opportunities);
        setOpportunityPage(1);
        setSelectedOpportunityKey(null);
        setOpportunitiesMessage(
          data.opportunities.length === 0
            ? "No skill score breakdown is available for this player in the current snapshot."
            : "",
        );
      });
    } catch (error) {
      setOpportunities([]);
      setOpportunitiesMessage(error.message);
    }
  }

  async function refreshData() {
    setIsRefreshing(true);

    try {
      await fetchJson("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await fetchJson("/api/refresh-benchmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      await loadPlayers();
      if (selectedPlayer) {
        await loadOpportunities(selectedPlayer);
      }
    } catch (error) {
      setPlayersMessage(error.message);
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    loadPlayers();
  }, []);

  useEffect(() => {
    if (selectedPlayer) {
      loadOpportunities(selectedPlayer, weapon, animal);
    }
  }, [weapon, animal]);

  return (
    <div className="app-shell">
      <div className="ambient ambient--blue" />
      <div className="ambient ambient--orange" />
      <div className="ambient ambient--green" />

      <header className="topbar">
        <div>
          <p className="eyebrow">Big Buck Hunter Companion</p>
          <h1>BBH Qualification Tracker</h1>
        </div>
        <StatusPill tone={serviceWorkerState.status === "ready" ? "green" : "neutral"}>
          {serviceWorkerState.message}
        </StatusPill>
      </header>

      <main className="dashboard">
        <section className="hero-card panel">
          <div className="hero-card__copy">
            <p className="eyebrow">How Worlds Qualification Works</p>
            <h2>Skills gets you in first. Wildcard is the backup race after that.</h2>
            <p>
              Your Skills score is built from the top three runs you have on each trek, with the
              top 64 Skills players qualifying for Worlds first. After those 64 are locked in, the
              next 64 players qualify by Wildcard score, which is your broader cumulative total.
            </p>
            <p>
              Use this tracker to compare your third counted score on each trek against the current
              top hunter&apos;s best score so you can see where the most Skills ground is still on
              the table.
            </p>
          </div>

          <div className="hero-card__status">
            <div className="status-tile">
              <span>Latest Snapshot</span>
              <strong>
                {snapshot
                  ? `${snapshot.createdAt}${snapshot.sourceLastUpdated ? ` | ${snapshot.sourceLastUpdated}` : ""}`
                  : "No snapshot yet"}
              </strong>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={refreshData}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh Live Data"}
            </button>
          </div>
        </section>

        <section className="layout-grid">
          <section className="panel stack">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Player Search</p>
                <h2>Find a Hunter</h2>
              </div>
            </div>

            <div className="search-panel">
              <input
                value={playerSearch}
                onChange={(event) => setPlayerSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    loadPlayers({ live: true, overrideSearch: playerSearch });
                  }
                }}
                className="search-input"
                type="search"
                placeholder="Search by player or location"
              />
              <button
                type="button"
                className="secondary-button"
                onClick={() => loadPlayers({ live: true, overrideSearch: playerSearch })}
              >
                Search
              </button>
            </div>

            {playersMessage ? <p className="empty-panel">{playersMessage}</p> : null}

            <div className="player-grid">
              {players.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  isActive={selectedPlayer?.id === player.id}
                  onSelect={() => {
                    setSelectedPlayer(player);
                    setSelectedOpportunityKey(null);
                    setOpportunityPage(1);
                    loadOpportunities(player, weapon, animal);
                  }}
                />
              ))}
            </div>
          </section>

          <section className="panel stack">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Skills Focus</p>
                <h2>{selectedPlayer ? `${selectedPlayer.name} Skill Score Breakdown` : "Skill Score Breakdown"}</h2>
              </div>
              {selectedPlayer ? (
                <div className="summary-badges">
                  <StatusPill tone="green">Skill #{selectedPlayer.skillRank ?? "-"}</StatusPill>
                  <StatusPill tone="orange">
                    Wildcard {formatWildcardRank(selectedPlayer.wildcardRank)}
                  </StatusPill>
                </div>
              ) : null}
            </div>

            {selectedPlayer ? (
              <div className="summary-strip">
                <StatChip
                  label="Skill Score"
                  value={formatNumber(selectedPlayer.globalSkillScore)}
                  tone="green"
                />
                <StatChip
                  label="Wildcard Score"
                  value={formatNumber(selectedPlayer.globalWildcardScore)}
                  tone="orange"
                />
                <StatChip label="Location" value={selectedPlayer.location} />
              </div>
            ) : null}

            <div className="filters-bar">
              <div>
                <p className="eyebrow">Weapon</p>
                <FilterTabs value={weapon} options={weaponOptions} onChange={setWeapon} />
              </div>

              <label className="animal-filter">
                <span className="eyebrow">Animal</span>
                <select value={animal} onChange={(event) => setAnimal(event.target.value)}>
                  <option value="all">All Animals</option>
                  {animals.map((animalName) => (
                    <option key={animalName} value={animalName.toLowerCase()}>
                      {animalName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {opportunities.length === 0 ? (
              <p className="empty-panel">{opportunitiesMessage}</p>
            ) : (
              <>
                <div className="opportunity-grid">
                  {visibleOpportunities.map((opportunity) => {
                    const key = `${opportunity.animal}::${opportunity.weapon}::${opportunity.trek}`;

                    return (
                      <OpportunityCard
                        key={key}
                        opportunity={opportunity}
                        isActive={selectedOpportunityKey === key}
                        onSelect={() => setSelectedOpportunityKey(key)}
                      />
                    );
                  })}
                </div>

                <div className="pagination-bar">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setOpportunityPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage <= 1}
                  >
                    Previous
                  </button>
                  <p>
                    Page {currentPage} of {totalPages} | {opportunities.length} total
                  </p>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setOpportunityPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </section>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Drilldown</p>
              <h2>Trek Details</h2>
            </div>
          </div>
          <Drilldown opportunity={selectedOpportunity} />
        </section>
      </main>
    </div>
  );
}
