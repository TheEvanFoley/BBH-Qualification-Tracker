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

function StatChip({ label, value }) {
  return (
    <div className="stat-chip">
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
        <StatusPill tone="gold">#{player.skillRank ?? "-"}</StatusPill>
      </div>
      <p>{player.location}</p>
      <div className="player-card__stats">
        <StatChip label="Skill" value={formatNumber(player.globalSkillScore)} />
        <StatChip label="Wildcard" value={formatNumber(player.globalWildcardScore)} />
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
          <h3>
            {opportunity.weapon} · {opportunity.trek}
          </h3>
        </div>
        <div className="gain-badge">
          <span>Gain</span>
          <strong>{formatNumber(opportunity.theoreticalGain)}</strong>
        </div>
      </div>

      <div className="opportunity-card__stats">
        <StatChip label="3rd Best" value={formatNumber(opportunity.playerThirdBestScore)} />
        <StatChip label="Benchmark" value={formatNumber(opportunity.benchmarkScore)} />
      </div>

      <p className="opportunity-card__meta">
        Benchmark player: <strong>{opportunity.benchmarkPlayerName}</strong>
      </p>
    </button>
  );
}

function Drilldown({ opportunity }) {
  if (!opportunity) {
    return (
      <div className="empty-panel">
        Tap an opportunity card to inspect your current top-three scores and the benchmark.
      </div>
    );
  }

  return (
    <div className="detail-panel">
      <div className="detail-panel__hero">
        <div>
          <p className="eyebrow">{opportunity.animal}</p>
          <h2>
            {opportunity.weapon} · {opportunity.trek}
          </h2>
        </div>
        <StatusPill tone="blue">Target Trek</StatusPill>
      </div>

      <div className="detail-grid">
        <div className="detail-card">
          <p className="detail-card__label">Top Three Counted Scores</p>
          <div className="score-strip">
            {opportunity.playerTopThreeScores.map((score, index) => (
              <span key={`${opportunity.trek}-${index}`} className="score-pill">
                {formatNumber(score)}
              </span>
            ))}
          </div>
        </div>

        <div className="detail-card">
          <p className="detail-card__label">Current Counted Total</p>
          <strong>{formatNumber(opportunity.playerTopThreeTotal)}</strong>
        </div>

        <div className="detail-card">
          <p className="detail-card__label">Third-Best Run</p>
          <strong>{formatNumber(opportunity.playerThirdBestScore)}</strong>
        </div>

        <div className="detail-card">
          <p className="detail-card__label">Benchmark</p>
          <strong>{formatNumber(opportunity.benchmarkScore)}</strong>
          <span>{opportunity.benchmarkPlayerName}</span>
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
    "Pick a player to load ranked opportunities.",
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

  async function loadOpportunities(nextPlayer = selectedPlayer, nextWeapon = weapon, nextAnimal = animal) {
    if (!nextPlayer) {
      return;
    }

    setOpportunitiesMessage("Loading opportunities...");

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
            ? "No opportunities available for this player in the current snapshot."
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
            <p className="eyebrow">Live Worlds Push</p>
            <h2>See where your biggest gains still live while you are on the machine.</h2>
            <p>
              Search yourself, compare against benchmark trek scores, and keep the best grind path
              in front of you on your phone.
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
            <button type="button" className="primary-button" onClick={refreshData} disabled={isRefreshing}>
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
              <StatusPill tone="blue">Live Lookup</StatusPill>
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
                <p className="eyebrow">Opportunity Ranking</p>
                <h2>{selectedPlayer ? selectedPlayer.name : "Select a player"}</h2>
              </div>
              {selectedPlayer ? (
                <div className="summary-badges">
                  <StatusPill tone="gold">Skill #{selectedPlayer.skillRank ?? "-"}</StatusPill>
                  <StatusPill tone="orange">
                    {formatNumber(selectedPlayer.globalSkillScore)} skill
                  </StatusPill>
                </div>
              ) : null}
            </div>

            {selectedPlayer ? (
              <div className="summary-strip">
                <StatChip label="Skill Score" value={formatNumber(selectedPlayer.globalSkillScore)} />
                <StatChip
                  label="Wildcard Score"
                  value={formatNumber(selectedPlayer.globalWildcardScore)}
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
                    Page {currentPage} of {totalPages} · {opportunities.length} total
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
              <h2>Why This Trek Matters</h2>
            </div>
            <StatusPill tone="green">In-Session Companion</StatusPill>
          </div>
          <Drilldown opportunity={selectedOpportunity} />
        </section>
      </main>
    </div>
  );
}
