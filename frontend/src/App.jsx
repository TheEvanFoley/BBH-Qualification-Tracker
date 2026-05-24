import React, { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

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

function mergeRefreshStatus(current, next) {
  if (!current) {
    return next;
  }

  if (current.status === "running" && next.status === "idle") {
    return current;
  }

  const currentStartedAt = current.startedAt ? Date.parse(current.startedAt) : 0;
  const nextStartedAt = next.startedAt ? Date.parse(next.startedAt) : 0;

  if (current.status === "running" && nextStartedAt < currentStartedAt) {
    return current;
  }

  return next;
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
      <div className="empty-panel empty-panel--detail">
        Tap a trek row from the Skills Score Breakdown table to compare counted scores against the
        current top hunter.
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

function getInstallContext() {
  if (typeof window === "undefined") {
    return {
      isStandalone: false,
      isIos: false,
    };
  }

  const standaloneMedia =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const navigatorStandalone = window.navigator.standalone === true;
  const userAgent = window.navigator.userAgent ?? "";
  const isIos = /iPhone|iPad|iPod/i.test(userAgent);

  return {
    isStandalone: standaloneMedia || navigatorStandalone,
    isIos,
  };
}

function InstallPanel({ installState, onInstall, isSharePending, onShare }) {
  const { isStandalone, isIos, canInstall, isDismissed } = installState;

  if (isStandalone) {
    return (
      <div className="install-panel install-panel--ready">
        <div>
          <p className="eyebrow">Installed</p>
          <h3>BBH Tracker is on this device.</h3>
          <p>Open it from your home screen whenever you want a quick in-session lookup.</p>
        </div>
        <StatusPill tone="green">Added To Home Screen</StatusPill>
      </div>
    );
  }

  if (isDismissed) {
    return (
      <div className="install-panel install-panel--compact">
        <div>
          <p className="eyebrow">Add To Home Screen</p>
          <p>
            {isIos
              ? "Open this link in Safari, tap Share, then tap Add to Home Screen."
              : canInstall
                ? "Use the Install App button to pin BBH Tracker to your phone or desktop."
                : "Open this in a browser that supports install prompts, or share the hosted link with a friend."}
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={onShare} disabled={isSharePending}>
          {isSharePending ? "Opening..." : "Install"}
        </button>
      </div>
    );
  }

  return (
    <div className="install-panel">
      <div className="install-panel__copy">
        <p className="eyebrow">Add To Home Screen</p>
        <h3>{isIos ? "Install this on your iPhone in three taps." : "Install this like an app."}</h3>
        <p>
          {isIos
            ? "1. Open this page in Safari. 2. Tap the Share button. 3. Tap Add to Home Screen. After that, BBH Tracker will launch from your phone like an app."
            : canInstall
              ? "Tap Install App to pin BBH Tracker like an app, then share the same hosted link with your crew."
              : "Use the Install button for phone setup help, or open this in a browser that supports app install prompts."}
        </p>
      </div>

      <div className="install-panel__actions">
        {canInstall ? (
          <button type="button" className="secondary-button" onClick={onInstall}>
            Install App
          </button>
        ) : null}
        <button type="button" className="ghost-button" onClick={onShare} disabled={isSharePending}>
          {isSharePending ? "Opening..." : isIos ? "Open Install Steps" : "Install"}
        </button>
      </div>
    </div>
  );
}

function RefreshProgress({ refreshStatus }) {
  if (!refreshStatus || refreshStatus.status === "idle") {
    return null;
  }

  return (
    <div className="refresh-progress">
      <div className="refresh-progress__top">
        <div>
          <p className="eyebrow">Refresh Progress</p>
          <strong>
            {refreshStatus.status === "running"
              ? "Live refresh is running"
              : refreshStatus.status === "completed"
                ? "Latest refresh completed"
                : "Latest refresh failed"}
          </strong>
        </div>
        <span>{refreshStatus.progress ?? 0}%</span>
      </div>
      <div className="progress-bar" aria-hidden="true">
        <span style={{ width: `${refreshStatus.progress ?? 0}%` }} />
      </div>
      <p className="refresh-progress__message">
        {refreshStatus.error ? `${refreshStatus.message} ${refreshStatus.error}` : refreshStatus.message}
      </p>
    </div>
  );
}

function RefreshConfirmModal({ isOpen, isStarting, onCancel, onConfirm }) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="refresh-modal-title">
        <p className="eyebrow">Refresh Live Data</p>
        <h3 id="refresh-modal-title">This refresh can take a while.</h3>
        <p>
          A Live Data refresh checks the Big Buck Hunter leaderboard and collects its data, which
          can take a few minutes to finish.
        </p>
        <p>
          Please only run a refresh when it is actually needed. That helps keep the shared app fast
          and affordable for everyone using it.
        </p>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onCancel} disabled={isStarting}>
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={onConfirm} disabled={isStarting}>
            {isStarting ? "Starting..." : "Start Refresh"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DropdownControl({
  label,
  value,
  options,
  onChange,
  width = "compact",
  menuDirection = "down",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`dropdown-control dropdown-control--${width} ${isOpen ? "is-open" : ""}`}
    >
      <span className="dropdown-control__label">{label}</span>
      <button
        type="button"
        className="dropdown-control__button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="dropdown-control__value">
          {options.find((option) => option.value === value)?.label ?? value}
        </span>
        <span className="dropdown-control__arrow" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div
          className={`dropdown-control__menu dropdown-control__menu--${menuDirection}`}
          role="listbox"
          aria-label={label}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              className={`dropdown-control__option ${value === option.value ? "is-selected" : ""}`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [players, setPlayers] = useState([]);
  const [playersPagination, setPlayersPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  });
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [allOpportunities, setAllOpportunities] = useState([]);
  const [selectedOpportunityKey, setSelectedOpportunityKey] = useState(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [weapon, setWeapon] = useState("both");
  const [animal, setAnimal] = useState("all");
  const [playerPage, setPlayerPage] = useState(1);
  const [playerPageSize, setPlayerPageSize] = useState(10);
  const [opportunityPage, setOpportunityPage] = useState(1);
  const [opportunityPageSize, setOpportunityPageSize] = useState(10);
  const [playersMessage, setPlayersMessage] = useState("");
  const [opportunitiesMessage, setOpportunitiesMessage] = useState(
    "Pick a player from the Find a Hunter table to load the full skill score breakdown.",
  );
  const [refreshStatus, setRefreshStatus] = useState(null);
  const [isStartingRefresh, setIsStartingRefresh] = useState(false);
  const [isRefreshModalOpen, setIsRefreshModalOpen] = useState(false);
  const [installState, setInstallState] = useState(() => ({
    ...getInstallContext(),
    canInstall: false,
    deferredPrompt: null,
    isDismissed: false,
  }));
  const [isSharePending, setIsSharePending] = useState(false);
  const isRefreshLocked = isStartingRefresh || refreshStatus?.status === "running";

  const animals = useMemo(
    () => [...new Set(allOpportunities.map((item) => item.animal))].sort(),
    [allOpportunities],
  );

  const opportunities = useMemo(() => {
    if (animal === "all") {
      return allOpportunities;
    }

    return allOpportunities.filter((item) => item.animal.toLowerCase() === animal);
  }, [allOpportunities, animal]);

  const totalPages = Math.max(1, Math.ceil(opportunities.length / opportunityPageSize));
  const currentPage = Math.min(opportunityPage, totalPages);
  const visibleOpportunities = useMemo(() => {
    const startIndex = (currentPage - 1) * opportunityPageSize;
    return opportunities.slice(startIndex, startIndex + opportunityPageSize);
  }, [currentPage, opportunities, opportunityPageSize]);

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

  async function loadPlayers({
    live = false,
    overrideSearch = playerSearch,
    overridePage = playerPage,
    overridePageSize = playerPageSize,
  } = {}) {
    try {
      const search = encodeURIComponent(overrideSearch.trim());
      const data = await fetchJson(
        `/api/players?search=${search}&live=${live ? "1" : "0"}&page=${overridePage}&pageSize=${overridePageSize}`,
      );
      startTransition(() => {
        setSnapshot(data.snapshot);
        setPlayers(data.players);
        setPlayersPagination(data.pagination);
        setPlayersMessage(data.players.length === 0 ? "No players found." : "");
      });
    } catch (error) {
      setPlayers([]);
      setPlayersPagination({
        page: 1,
        pageSize: playerPageSize,
        total: 0,
        totalPages: 1,
      });
      setPlayersMessage(error.message);
    }
  }

  async function loadOpportunities(
    nextPlayer = selectedPlayer,
    nextWeapon = weapon,
  ) {
    if (!nextPlayer) {
      return;
    }

    setOpportunitiesMessage("Loading skill score breakdown...");

    try {
      const queryWeapon = encodeURIComponent(nextWeapon);
      const data = await fetchJson(
        `/api/player/${nextPlayer.id}/opportunities?weapon=${queryWeapon}&animal=all`,
      );

      startTransition(() => {
        setSnapshot(data.snapshot);
        setSelectedPlayer(data.player);
        setAllOpportunities(data.opportunities);
        setOpportunityPage(1);
        setSelectedOpportunityKey(null);
        setOpportunitiesMessage(
          data.opportunities.length === 0
            ? "No skill score breakdown is available for this player in the current snapshot."
            : "",
        );
      });
    } catch (error) {
      setAllOpportunities([]);
      setOpportunitiesMessage(error.message);
    }
  }

  async function loadRefreshStatus() {
    try {
      const data = await fetchJson("/api/refresh-status");
      setRefreshStatus((current) => mergeRefreshStatus(current, data));
      return data;
    } catch (error) {
      setPlayersMessage(error.message);
      return null;
    }
  }

  useEffect(() => {
    loadPlayers();
    loadRefreshStatus();
  }, [playerPage, playerPageSize]);

  useEffect(() => {
    if (selectedPlayer) {
      loadOpportunities(selectedPlayer, weapon);
    }
  }, [weapon]);

  useEffect(() => {
    if (refreshStatus?.status !== "running") {
      return undefined;
    }

    const intervalId = window.setInterval(async () => {
      const latestStatus = await loadRefreshStatus();

      if (latestStatus?.status === "completed") {
        await loadPlayers();
        if (selectedPlayer) {
          await loadOpportunities(selectedPlayer, weapon);
        }
      }
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [refreshStatus?.status, selectedPlayer, weapon]);

  useEffect(() => {
    function syncDisplayMode() {
      setInstallState((current) => ({
        ...current,
        ...getInstallContext(),
      }));
    }

    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallState((current) => ({
        ...current,
        ...getInstallContext(),
        canInstall: true,
        deferredPrompt: event,
      }));
    }

    function handleInstalled() {
      setInstallState((current) => ({
        ...current,
        ...getInstallContext(),
        canInstall: false,
        deferredPrompt: null,
        isDismissed: false,
      }));
    }

    syncDisplayMode();
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("focus", syncDisplayMode);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("focus", syncDisplayMode);
    };
  }, []);

  async function installApp() {
    if (!installState.deferredPrompt) {
      return;
    }

    try {
      await installState.deferredPrompt.prompt();
      await installState.deferredPrompt.userChoice.catch(() => null);
    } catch {
      return;
    }

    setInstallState((current) => ({
      ...current,
      ...getInstallContext(),
      canInstall: false,
      deferredPrompt: null,
    }));
  }

  async function shareApp() {
    setIsSharePending(true);

    try {
      if (installState.isIos) {
        if (typeof window !== "undefined") {
          window.alert(
            "To install BBH Tracker on iPhone: open this page in Safari, tap Share, then tap Add to Home Screen.",
          );
        }
        return;
      }

      const sharePayload = {
        title: "BBH Qualification Tracker",
        text: "Track worlds qualification gaps and trek priorities.",
        url: window.location.href,
      };

      if (navigator.share) {
        await navigator.share(sharePayload).catch(() => null);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
      }
    } finally {
      setIsSharePending(false);
    }
  }

  async function startRefresh() {
    flushSync(() => {
      setIsStartingRefresh(true);
      setIsRefreshModalOpen(false);
      setRefreshStatus((current) => ({
        ...(current ?? {}),
        status: "running",
        phase: "starting",
        progress: Math.max(2, current?.progress ?? 0),
        message: "Preparing a live data refresh...",
        error: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
      }));
    });

    try {
      const data = await fetchJson("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setRefreshStatus((current) => mergeRefreshStatus(current, data.refresh));
    } catch (error) {
      setPlayersMessage(error.message);
      setRefreshStatus((current) => ({
        ...(current ?? {}),
        status: "failed",
        phase: "failed",
        message: "Refresh failed.",
        error: error.message,
        completedAt: new Date().toISOString(),
      }));
    } finally {
      setIsStartingRefresh(false);
    }
  }

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
              onClick={() => setIsRefreshModalOpen(true)}
              disabled={isRefreshLocked}
            >
              {isStartingRefresh
                ? "Starting Refresh..."
                : refreshStatus?.status === "running"
                  ? "Refresh Running..."
                  : "Refresh Live Data"}
            </button>
            <RefreshProgress refreshStatus={refreshStatus} />
            <InstallPanel
              installState={installState}
              onInstall={installApp}
              isSharePending={isSharePending}
              onShare={shareApp}
            />
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
                    setPlayerPage(1);
                    loadPlayers({ live: true, overrideSearch: playerSearch, overridePage: 1 });
                  }
                }}
                className="search-input"
                type="search"
                placeholder="Search by player or location"
              />
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setPlayerPage(1);
                  loadPlayers({ live: true, overrideSearch: playerSearch, overridePage: 1 });
                }}
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
                    loadOpportunities(player, weapon);
                  }}
                />
              ))}
            </div>

            <div className="pagination-bar">
              <DropdownControl
                label="Hunters Per Page"
                value={playerPageSize}
                options={[10, 25, 50, 100].map((option) => ({
                  value: option,
                  label: String(option),
                }))}
                onChange={(nextValue) => {
                  setPlayerPageSize(nextValue);
                  setPlayerPage(1);
                }}
                menuDirection="up"
              />
              <p>
                Page {playersPagination.page} of {playersPagination.totalPages} | {playersPagination.total} total
              </p>
              <div className="pagination-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setPlayerPage((page) => Math.max(1, page - 1))}
                  disabled={playersPagination.page <= 1}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    setPlayerPage((page) => Math.min(playersPagination.totalPages, page + 1))
                  }
                  disabled={playersPagination.page >= playersPagination.totalPages}
                >
                  Next
                </button>
              </div>
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

              <DropdownControl
                label="Adventure"
                value={animal}
                options={[
                  { value: "all", label: "All Adventures" },
                  ...animals.map((animalName) => ({
                    value: animalName.toLowerCase(),
                    label: animalName,
                  })),
                ]}
                onChange={(nextValue) => {
                  setAnimal(nextValue);
                  setOpportunityPage(1);
                  setSelectedOpportunityKey(null);
                }}
                width="wide"
                menuDirection="down"
              />
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
                  <DropdownControl
                    label="Treks Per Page"
                    value={opportunityPageSize}
                    options={[10, 25, 50, 100].map((option) => ({
                      value: option,
                      label: String(option),
                    }))}
                    onChange={(nextValue) => {
                      setOpportunityPageSize(nextValue);
                      setOpportunityPage(1);
                    }}
                    menuDirection="up"
                  />
                  <p>
                    Page {currentPage} of {totalPages} | {opportunities.length} total
                  </p>
                  <div className="pagination-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setOpportunityPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage <= 1}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setOpportunityPage((page) => Math.min(totalPages, page + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                    </button>
                  </div>
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

      <RefreshConfirmModal
        isOpen={isRefreshModalOpen}
        isStarting={isStartingRefresh}
        onCancel={() => setIsRefreshModalOpen(false)}
        onConfirm={startRefresh}
      />
    </div>
  );
}
