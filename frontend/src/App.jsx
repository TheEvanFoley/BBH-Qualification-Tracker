import React, { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

const weaponOptions = [
  { value: "both", label: "Both" },
  { value: "gun", label: "Gun" },
  { value: "bow", label: "Bow" },
];

const opportunityViewOptions = [
  { value: "adventures", label: "Adventures" },
  { value: "treks", label: "Treks" },
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

const INSTALL_PANEL_DISMISSED_KEY = "bbh-install-panel-dismissed-v2";
const REFRESH_PROGRESS_DISMISSED_KEY = "bbh-refresh-progress-dismissed-v2";

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

  const currentStartedAt = current.startedAt ? Date.parse(current.startedAt) : 0;
  const nextStartedAt = next.startedAt ? Date.parse(next.startedAt) : 0;

  if (current.status === "running" && next.status === "idle") {
    return current;
  }

  if (current.status === "running" && nextStartedAt < currentStartedAt) {
    return current;
  }

  if (
    current.status === "running" &&
    next.status === "running" &&
    (next.progress ?? 0) > (current.progress ?? 0)
  ) {
    return next;
  }

  if (
    current.status === "running" &&
    next.status === "running" &&
    current.phase === "starting" &&
    next.phase !== "starting"
  ) {
    return next;
  }

  if (
    current.status === "running" &&
    (next.status === "completed" || next.status === "failed")
  ) {
    return next;
  }

  return next;
}

function readStoredValue(key) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredValue(key, value) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value == null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore localStorage issues and keep the UI usable.
  }
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

function TrekDrilldown({ opportunity }) {
  if (!opportunity) {
    return (
      <div className="empty-panel empty-panel--detail">
        Switch to the Treks view and tap a trek card to compare counted scores against the current
        top hunter.
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

function AdventureOpportunityCard({ opportunity, isActive, onSelect }) {
  return (
    <button
      type="button"
      className={`adventure-card ${isActive ? "is-active" : ""}`}
      onClick={onSelect}
    >
      <div className="adventure-card__header">
        <div>
          <p className="eyebrow">{opportunity.weapon}</p>
          <h3>{opportunity.animal}</h3>
        </div>
        <div className="gain-badge">
          <span>Adventure Gain</span>
          <strong>{formatNumber(opportunity.theoreticalGain)}</strong>
        </div>
      </div>

      <p className="adventure-card__meta">
        Sum of each trek&apos;s gap between the top hunter&apos;s best score and your 3rd-best
        counted score.
      </p>

      <div className="adventure-card__treks">
        {opportunity.treks.map((trek) => (
          <div key={`${opportunity.animal}-${opportunity.weapon}-${trek.trek}`} className="adventure-trek-pill">
            <span>{trek.trek}</span>
            <strong>{formatNumber(trek.theoreticalGain)}</strong>
          </div>
        ))}
      </div>
    </button>
  );
}

function AdventureDrilldown({ opportunity }) {
  if (!opportunity) {
    return (
      <div className="empty-panel empty-panel--detail">
        Tap an adventure card to compare its three trek gaps and total upside.
      </div>
    );
  }

  const selectedHunterName = opportunity.treks[0]?.selectedPlayerName ?? "Selected Hunter";

  return (
    <div className="detail-panel">
      <div className="detail-panel__hero">
        <div>
          <p className="eyebrow">{opportunity.weapon}</p>
          <h2>{opportunity.animal}</h2>
        </div>
        <div className="gain-badge gain-badge--hero">
          <span>Adventure Gain</span>
          <strong>{formatNumber(opportunity.theoreticalGain)}</strong>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-card">
          <p className="detail-card__label">How Adventure Gain Works</p>
          <div className="detail-card__name">{`${opportunity.animal} / ${opportunity.weapon}`}</div>
          <strong>{formatNumber(opportunity.theoreticalGain)}</strong>
          <span>Sum of the three trek gaps for this adventure.</span>
        </div>

        <div className="detail-card">
          <p className="detail-card__label">Trek Gaps</p>
          <div className="detail-card__name">{`${opportunity.animal} / ${opportunity.weapon}`}</div>
          <div className="score-strip score-strip--stacked">
            {opportunity.treks.map((trek) => (
              <span key={`${opportunity.animal}-${opportunity.weapon}-${trek.trek}`} className="score-pill">
                {`${trek.trek}: ${formatNumber(trek.theoreticalGain)}`}
              </span>
            ))}
          </div>
          <span>Each gap is top hunter best score minus your 3rd-best counted score.</span>
        </div>

        <div className="detail-card detail-card--span-2">
          <p className="detail-card__label">Ranked Trek Breakdown</p>
          <div className="detail-table">
            {opportunity.treks.map((trek) => (
              <div key={`${opportunity.animal}-${opportunity.weapon}-${trek.trek}-detail`} className="detail-table__row">
                <strong>{trek.trek}</strong>
                <span>{`${selectedHunterName} 3rd Best: ${formatNumber(trek.playerThirdBestScore)}`}</span>
                <span>{`Top Score: ${formatNumber(trek.benchmarkScore)}`}</span>
                <span>{`Gap: ${formatNumber(trek.theoreticalGain)}`}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerScoresModal({ isOpen, player, runs, onClose }) {
  const [scoreAnimal, setScoreAnimal] = useState("all");
  const [scoreWeapon, setScoreWeapon] = useState("all");
  const [scoreTrek, setScoreTrek] = useState("all");

  const animals = useMemo(
    () => [...new Set(runs.map((run) => run.animal))].sort(),
    [runs],
  );

  const weapons = useMemo(() => {
    const filteredByAnimal =
      scoreAnimal === "all" ? runs : runs.filter((run) => run.animal === scoreAnimal);

    return [...new Set(filteredByAnimal.map((run) => run.weapon))].sort();
  }, [runs, scoreAnimal]);

  const treks = useMemo(() => {
    const filtered = runs.filter((run) => {
      if (scoreAnimal !== "all" && run.animal !== scoreAnimal) {
        return false;
      }

      if (scoreWeapon !== "all" && run.weapon !== scoreWeapon) {
        return false;
      }

      return true;
    });

    return [...new Set(filtered.map((run) => run.trek))].sort();
  }, [runs, scoreAnimal, scoreWeapon]);

  const filteredRuns = useMemo(
    () =>
      runs.filter((run) => {
        if (scoreAnimal !== "all" && run.animal !== scoreAnimal) {
          return false;
        }

        if (scoreWeapon !== "all" && run.weapon !== scoreWeapon) {
          return false;
        }

        if (scoreTrek !== "all" && run.trek !== scoreTrek) {
          return false;
        }

        return true;
      }),
    [runs, scoreAnimal, scoreWeapon, scoreTrek],
  );

  useEffect(() => {
    if (scoreAnimal !== "all" && !animals.includes(scoreAnimal)) {
      setScoreAnimal("all");
    }
  }, [animals, scoreAnimal]);

  useEffect(() => {
    if (scoreWeapon !== "all" && !weapons.includes(scoreWeapon)) {
      setScoreWeapon("all");
    }
  }, [weapons, scoreWeapon]);

  useEffect(() => {
    if (scoreTrek !== "all" && !treks.includes(scoreTrek)) {
      setScoreTrek("all");
    }
  }, [treks, scoreTrek]);

  if (!isOpen || !player) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-card modal-card--scores"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scores-modal-title"
      >
        <button
          type="button"
          className="modal-close-button"
          aria-label="Close score table"
          onClick={onClose}
        >
          X
        </button>
        <p className="eyebrow">Hunter Scores</p>
        <h3 id="scores-modal-title">{`${player.name} Score Table`}</h3>
        <p>
          All saved runs for this hunter in the current snapshot, shown without benchmark
          comparison.
        </p>

        <div className="scores-toolbar">
          <DropdownControl
            label="Adventure"
            value={scoreAnimal}
            options={[
              { value: "all", label: "All Adventures" },
              ...animals.map((animal) => ({ value: animal, label: animal })),
            ]}
            onChange={setScoreAnimal}
            width="wide"
            menuDirection="down"
          />
          <DropdownControl
            label="Weapon"
            value={scoreWeapon}
            options={[
              { value: "all", label: "All Weapons" },
              ...weapons.map((weapon) => ({ value: weapon, label: weapon })),
            ]}
            onChange={setScoreWeapon}
            width="compact"
            menuDirection="down"
          />
          <DropdownControl
            label="Trek"
            value={scoreTrek}
            options={[
              { value: "all", label: "All Treks" },
              ...treks.map((trek) => ({ value: trek, label: trek })),
            ]}
            onChange={setScoreTrek}
            width="compact"
            menuDirection="down"
          />
        </div>

        <p className="scores-toolbar__summary">
          {`${filteredRuns.length} run${filteredRuns.length === 1 ? "" : "s"} shown`}
        </p>

        <div className="scores-table" role="table" aria-label={`${player.name} scores`}>
          <div className="scores-table__header" role="row">
            <span role="columnheader">Adventure</span>
            <span role="columnheader">Weapon</span>
            <span role="columnheader">Trek</span>
            <span role="columnheader">Score</span>
          </div>

          <div className="scores-table__body">
            {filteredRuns.length === 0 ? (
              <p className="empty-panel">No saved runs are available for this hunter yet.</p>
            ) : (
              filteredRuns.map((run, index) => (
                <div
                  key={`${run.animal}-${run.weapon}-${run.trek}-${run.score}-${run.runRank ?? index}`}
                  className="scores-table__row"
                  role="row"
                >
                  <span data-label="Adventure" role="cell">{run.animal}</span>
                  <span data-label="Weapon" role="cell">{run.weapon}</span>
                  <span data-label="Trek" role="cell">{run.trek}</span>
                  <strong data-label="Score" role="cell">{formatNumber(run.score)}</strong>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            Close
          </button>
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
      browserName: "browser",
    };
  }

  const standaloneMedia =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const navigatorStandalone = window.navigator.standalone === true;
  const userAgent = window.navigator.userAgent ?? "";
  const isIos = /iPhone|iPad|iPod/i.test(userAgent);
  const isEdge = /Edg\//i.test(userAgent);
  const isChrome = /Chrome\//i.test(userAgent) && !isEdge;
  const isFirefox = /Firefox\//i.test(userAgent);
  const isSafari = /Safari\//i.test(userAgent) && !isChrome && !isEdge;

  let browserName = "browser";
  if (isSafari) {
    browserName = "Safari";
  } else if (isChrome) {
    browserName = "Chrome";
  } else if (isEdge) {
    browserName = "Edge";
  } else if (isFirefox) {
    browserName = "Firefox";
  }

  return {
    isStandalone: standaloneMedia || navigatorStandalone,
    isIos,
    browserName,
  };
}

function getInstallGuide(installState) {
  const { isIos, canInstall, browserName } = installState;

  if (isIos) {
    return {
      title: `Install from ${browserName}`,
      steps: [
        `Open BBH Qualification Tracker in ${browserName}.`,
        "Tap the Share button in the browser toolbar.",
        "Choose Add to Home Screen, then confirm.",
      ],
    };
  }

  if (canInstall) {
    return {
      title: `Install from ${browserName}`,
      steps: [
        `Open BBH Qualification Tracker in ${browserName}.`,
        "Tap the Install App button on this page, or use the browser install prompt in the address bar.",
        "Confirm the install to add it like an app.",
      ],
    };
  }

  return {
    title: "Install from a mobile or desktop browser",
    steps: [
      "Open BBH Qualification Tracker in a browser that supports app install prompts or home-screen shortcuts.",
      "Look for an Add to Home Screen, Install App, or Share option in the browser menu.",
      "Use that option to add BBH Qualification Tracker for one-tap access later.",
    ],
  };
}

function InstallPanel({ installState, onInstall, onOpenHelp, onDismiss }) {
  const { isStandalone, canInstall, isDismissed, browserName } = installState;

  if (isDismissed) {
    return null;
  }

  if (isStandalone) {
    return (
      <div className="install-panel install-panel--ready">
        <div>
          <p className="eyebrow">Installed</p>
          <h3>BBH Tracker is on this device.</h3>
          <p>Open it from your home screen whenever you want a quick in-session lookup.</p>
        </div>
        <div className="install-panel__actions install-panel__actions--stacked">
          <StatusPill tone="green">Added To Home Screen</StatusPill>
          <button type="button" className="ghost-button" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="install-panel">
      <div className="install-panel__copy">
        <p className="eyebrow">Add To Home Screen</p>
        <h3>Install BBH Tracker for one-tap access.</h3>
      </div>

      <div className="install-panel__actions">
        {canInstall ? (
          <button type="button" className="secondary-button" onClick={onInstall}>
            Install App
          </button>
        ) : null}
        <button type="button" className="ghost-button" onClick={onOpenHelp}>
          Open Install Steps
        </button>
        <button type="button" className="ghost-button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function RefreshProgress({ refreshStatus, onDismiss }) {
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
      <div className="refresh-progress__actions">
        <button type="button" className="ghost-button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
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

function InstallHelpModal({ isOpen, installState, onClose }) {
  if (!isOpen) {
    return null;
  }

  const guide = getInstallGuide(installState);

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="install-modal-title">
        <p className="eyebrow">Add To Home Screen</p>
        <h3 id="install-modal-title">{guide.title}</h3>
        <ol className="modal-steps">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="modal-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            Close
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
  const [allAdventureOpportunities, setAllAdventureOpportunities] = useState([]);
  const [allRuns, setAllRuns] = useState([]);
  const [selectedAdventureKey, setSelectedAdventureKey] = useState(null);
  const [selectedOpportunityKey, setSelectedOpportunityKey] = useState(null);
  const [isScoresModalOpen, setIsScoresModalOpen] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [weapon, setWeapon] = useState("both");
  const [animal, setAnimal] = useState("all");
  const [opportunityView, setOpportunityView] = useState("adventures");
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
    isDismissed: readStoredValue(INSTALL_PANEL_DISMISSED_KEY) === "1",
  }));
  const [isInstallHelpOpen, setIsInstallHelpOpen] = useState(false);
  const [dismissedRefreshSignature, setDismissedRefreshSignature] = useState(
    () => readStoredValue(REFRESH_PROGRESS_DISMISSED_KEY) ?? "",
  );
  const isRefreshLocked = isStartingRefresh || refreshStatus?.status === "running";
  const refreshSignature = useMemo(
    () => (refreshStatus?.startedAt ? refreshStatus.startedAt : ""),
    [refreshStatus?.startedAt],
  );
  const isRefreshDismissed = Boolean(refreshSignature) && dismissedRefreshSignature === refreshSignature;

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

  const adventureOpportunities = useMemo(() => {
    if (animal === "all") {
      return allAdventureOpportunities;
    }

    return allAdventureOpportunities.filter((item) => item.animal.toLowerCase() === animal);
  }, [allAdventureOpportunities, animal]);

  const sortedRuns = useMemo(
    () =>
      [...allRuns].sort(
        (left, right) =>
          left.animal.localeCompare(right.animal) ||
          left.weapon.localeCompare(right.weapon) ||
          left.trek.localeCompare(right.trek) ||
          (right.score ?? 0) - (left.score ?? 0) ||
          (left.runRank ?? Number.MAX_SAFE_INTEGER) - (right.runRank ?? Number.MAX_SAFE_INTEGER),
      ),
    [allRuns],
  );

  const totalPages = Math.max(1, Math.ceil(opportunities.length / opportunityPageSize));
  const currentPage = Math.min(opportunityPage, totalPages);
  const visibleOpportunities = useMemo(() => {
    const startIndex = (currentPage - 1) * opportunityPageSize;
    return opportunities.slice(startIndex, startIndex + opportunityPageSize);
  }, [currentPage, opportunities, opportunityPageSize]);

  const selectedOpportunity =
    opportunityView !== "treks"
      ? null
      : (opportunities.find(
          (item) => `${item.animal}::${item.weapon}::${item.trek}` === selectedOpportunityKey,
        ) ?? opportunities[0] ?? null);

  const selectedAdventureOpportunity =
    opportunityView !== "adventures"
      ? null
      : (adventureOpportunities.find(
          (item) => `${item.animal}::${item.weapon}` === selectedAdventureKey,
        ) ?? adventureOpportunities[0] ?? null);

  useEffect(() => {
    if (opportunityView !== "treks") {
      setSelectedOpportunityKey(null);
      return;
    }

    if (selectedOpportunity) {
      setSelectedOpportunityKey(
        `${selectedOpportunity.animal}::${selectedOpportunity.weapon}::${selectedOpportunity.trek}`,
      );
    }
  }, [opportunityView, selectedOpportunity]);

  useEffect(() => {
    if (opportunityView !== "adventures") {
      setSelectedAdventureKey(null);
      return;
    }

    if (selectedAdventureOpportunity) {
      setSelectedAdventureKey(
        `${selectedAdventureOpportunity.animal}::${selectedAdventureOpportunity.weapon}`,
      );
    }
  }, [opportunityView, selectedAdventureOpportunity]);

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
        setIsScoresModalOpen(false);
        setAllRuns(data.runs ?? []);
        setAllOpportunities(data.opportunities);
        setAllAdventureOpportunities(data.adventureOpportunities ?? []);
        setSelectedAdventureKey(null);
        setOpportunityPage(1);
        setSelectedOpportunityKey(null);
        setOpportunitiesMessage(
          data.opportunities.length === 0
            ? "No skill score breakdown is available for this player in the current snapshot."
            : "",
        );
      });
    } catch (error) {
      setAllRuns([]);
      setAllOpportunities([]);
      setAllAdventureOpportunities([]);
      setSelectedAdventureKey(null);
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

  function openInstallHelp() {
    setIsInstallHelpOpen(true);
  }

  function dismissInstallPanel() {
    setInstallState((current) => ({
      ...current,
      isDismissed: true,
    }));
    writeStoredValue(INSTALL_PANEL_DISMISSED_KEY, "1");
  }

  function dismissRefreshProgress() {
    if (!refreshSignature) {
      return;
    }

    setDismissedRefreshSignature(refreshSignature);
    writeStoredValue(REFRESH_PROGRESS_DISMISSED_KEY, refreshSignature);
  }

  async function startRefresh() {
    flushSync(() => {
      setIsStartingRefresh(true);
      setIsRefreshModalOpen(false);
      setDismissedRefreshSignature("");
      writeStoredValue(REFRESH_PROGRESS_DISMISSED_KEY, null);
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
          <p className="eyebrow">Big Buck Hunter Reloaded Companion</p>
          <h1>
            Big Buck World Championship
            <br />
            Qualification Tracker
          </h1>
        </div>
      </header>

      <main className="dashboard">
        <section className="hero-card panel">
          <div className="hero-card__copy">
            <p className="eyebrow">How Worlds Qualification Works</p>
            <h2>Skills rewards the top-performing hunters. Wildcard rewards the grind after that.</h2>
            <p>
              The Skills score is built from the top three runs a hunter has on each trek, with
              the top 64 Skills players qualifying for Worlds first. After those 64 are locked in,
              the next 64 players qualify by Wildcard score, which reflects a hunter&apos;s total
              cumulative score from all Pro games played.
            </p>
            <p>
              This tracker compares a hunter&apos;s lowest contributing score on each trek against
              that trek&apos;s top hunter&apos;s best score. That makes it easier to spot where a
              hunter has the most points to gain by attempting that trek again.
            </p>
            <p>
              Adventure gain rolls those three trek gaps together for one animal and weapon so it
              is easier to spot the highest-upside full adventures.
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
            {!isRefreshDismissed ? (
              <RefreshProgress refreshStatus={refreshStatus} onDismiss={dismissRefreshProgress} />
            ) : null}
            <InstallPanel
              installState={installState}
              onInstall={installApp}
              onOpenHelp={openInstallHelp}
              onDismiss={dismissInstallPanel}
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
                    setIsScoresModalOpen(false);
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
                <button
                  type="button"
                  className="primary-button summary-strip__action"
                  onClick={() => setIsScoresModalOpen(true)}
                >
                  View Scores
                </button>
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

            <div className="filters-bar filters-bar--opportunity-view">
              <div>
                <p className="eyebrow">Opportunity View</p>
                <FilterTabs
                  value={opportunityView}
                  options={opportunityViewOptions}
                  onChange={setOpportunityView}
                />
              </div>
            </div>

            {opportunities.length === 0 ? (
              <p className="empty-panel">{opportunitiesMessage}</p>
            ) : opportunityView === "adventures" ? (
              <>
                <div className="subsection-heading">
                  <div>
                    <p className="eyebrow">Adventure Opportunities</p>
                    <h3>Best full-adventure score gains</h3>
                  </div>
                </div>

                <p className="empty-panel empty-panel--inline">
                  Adventure gain is the sum of the three trek gaps for this animal and weapon.
                </p>

                <div className="adventure-grid">
                  {adventureOpportunities.map((opportunity) => (
                    <AdventureOpportunityCard
                      key={`${opportunity.animal}::${opportunity.weapon}`}
                      opportunity={opportunity}
                      isActive={
                        selectedAdventureKey === `${opportunity.animal}::${opportunity.weapon}`
                      }
                      onSelect={() =>
                        setSelectedAdventureKey(`${opportunity.animal}::${opportunity.weapon}`)
                      }
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="subsection-heading">
                  <div>
                    <p className="eyebrow">Trek Opportunities</p>
                    <h3>Best single-trek score gains</h3>
                  </div>
                </div>

                <p className="empty-panel empty-panel--inline">
                  Trek gain is the top hunter&apos;s best score minus your 3rd-best counted score
                  on that trek.
                </p>

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
              <h2>{opportunityView === "adventures" ? "Adventure Details" : "Trek Details"}</h2>
            </div>
          </div>
          {opportunityView === "adventures" ? (
            <AdventureDrilldown opportunity={selectedAdventureOpportunity} />
          ) : (
            <TrekDrilldown opportunity={selectedOpportunity} />
          )}
        </section>
      </main>

      <RefreshConfirmModal
        isOpen={isRefreshModalOpen}
        isStarting={isStartingRefresh}
        onCancel={() => setIsRefreshModalOpen(false)}
        onConfirm={startRefresh}
      />
      <InstallHelpModal
        isOpen={isInstallHelpOpen}
        installState={installState}
        onClose={() => setIsInstallHelpOpen(false)}
      />
      <PlayerScoresModal
        isOpen={isScoresModalOpen}
        player={selectedPlayer}
        runs={sortedRuns}
        onClose={() => setIsScoresModalOpen(false)}
      />
    </div>
  );
}
