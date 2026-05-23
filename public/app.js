const elements = {
  snapshotMeta: document.querySelector("#snapshot-meta"),
  refreshButton: document.querySelector("#refresh-button"),
  playerSearch: document.querySelector("#player-search"),
  playerSearchButton: document.querySelector("#player-search-button"),
  playerResults: document.querySelector("#player-results"),
  playerTemplate: document.querySelector("#player-result-template"),
  selectedPlayerTitle: document.querySelector("#selected-player-title"),
  opportunityState: document.querySelector("#opportunity-state"),
  opportunityTable: document.querySelector("#opportunity-table"),
  opportunityBody: document.querySelector("#opportunity-table tbody"),
  opportunityPagination: document.querySelector("#opportunity-pagination"),
  opportunityPrev: document.querySelector("#opportunity-prev"),
  opportunityNext: document.querySelector("#opportunity-next"),
  opportunityPageMeta: document.querySelector("#opportunity-page-meta"),
  drilldown: document.querySelector("#drilldown"),
  weaponFilter: document.querySelector("#weapon-filter"),
  animalFilter: document.querySelector("#animal-filter"),
};

const PAGE_SIZE = 15;

const state = {
  snapshot: null,
  players: [],
  selectedPlayerId: null,
  opportunities: [],
  selectedOpportunityKey: null,
  opportunityPage: 1,
};

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

function setSnapshot(snapshot) {
  state.snapshot = snapshot;
  if (!snapshot) {
    elements.snapshotMeta.textContent = "No snapshot yet";
    return;
  }

  const sourceText = snapshot.sourceLastUpdated
    ? ` | Source ${snapshot.sourceLastUpdated}`
    : "";
  elements.snapshotMeta.textContent = `Snapshot ${snapshot.createdAt}${sourceText}`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function renderPlayers(players) {
  elements.playerResults.innerHTML = "";

  if (players.length === 0) {
    elements.playerResults.innerHTML = `<p class="empty-state">No players found.</p>`;
    return;
  }

  for (const player of players) {
    const fragment = elements.playerTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".player-result");
    fragment.querySelector(".player-name").textContent = player.name;
    fragment.querySelector(".player-meta").textContent =
      `${player.location} | Skill #${player.skillRank ?? "-"} | ${formatNumber(player.globalSkillScore)}`;

    if (player.id === state.selectedPlayerId) {
      button.classList.add("active");
    }

    button.addEventListener("click", () => {
      state.selectedPlayerId = player.id;
      state.selectedOpportunityKey = null;
      state.opportunityPage = 1;
      elements.selectedPlayerTitle.textContent = player.name;
      renderPlayers(state.players);
      loadOpportunities();
    });

    elements.playerResults.appendChild(fragment);
  }
}

function renderAnimalFilter(opportunities) {
  const animals = [...new Set(opportunities.map((item) => item.animal))].sort();
  const currentValue = elements.animalFilter.value;

  elements.animalFilter.innerHTML =
    `<option value="all">All Animals</option>` +
    animals.map((animal) => `<option value="${animal.toLowerCase()}">${animal}</option>`).join("");

  elements.animalFilter.value = animals.some(
    (animal) => animal.toLowerCase() === currentValue,
  )
    ? currentValue
    : "all";
}

function renderDrilldown(opportunity) {
  if (!opportunity) {
    elements.drilldown.className = "empty-state";
    elements.drilldown.innerHTML =
      "Tap a trek row to inspect the player's top three scores and the benchmark player.";
    return;
  }

  elements.drilldown.className = "drill-list";
  elements.drilldown.innerHTML = `
    <div>
      <p class="label">${opportunity.animal} · ${opportunity.weapon}</p>
      <h3>${opportunity.trek}</h3>
    </div>
    <div>
      <p class="label">Top Three Counted Scores</p>
      <div class="score-strip">
        ${opportunity.playerTopThreeScores
          .map((score) => `<span class="pill">${formatNumber(score)}</span>`)
          .join("")}
      </div>
    </div>
    <div>
      <p class="label">Current Counted Total</p>
      <p>${formatNumber(opportunity.playerTopThreeTotal)}</p>
    </div>
    <div>
      <p class="label">Third-Best Run</p>
      <p>${formatNumber(opportunity.playerThirdBestScore)}</p>
    </div>
    <div>
      <p class="label">Best Known Benchmark</p>
      <p>${formatNumber(opportunity.benchmarkScore)} by ${opportunity.benchmarkPlayerName}</p>
    </div>
    <div>
      <p class="label">Theoretical Gain</p>
      <p>${formatNumber(opportunity.theoreticalGain)}</p>
    </div>
  `;
}

function renderOpportunities(opportunities) {
  state.opportunities = opportunities;
  renderAnimalFilter(opportunities);

  elements.opportunityBody.innerHTML = "";

  if (opportunities.length === 0) {
    elements.opportunityTable.hidden = true;
    elements.opportunityPagination.hidden = true;
    elements.opportunityState.hidden = false;
    elements.opportunityState.textContent =
      "No opportunities available for this player in the current snapshot.";
    renderDrilldown(null);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(opportunities.length / PAGE_SIZE));
  state.opportunityPage = Math.min(state.opportunityPage, totalPages);
  const startIndex = (state.opportunityPage - 1) * PAGE_SIZE;
  const visibleOpportunities = opportunities.slice(startIndex, startIndex + PAGE_SIZE);

  elements.opportunityState.hidden = true;
  elements.opportunityTable.hidden = false;
  elements.opportunityPagination.hidden = false;
  elements.opportunityPrev.disabled = state.opportunityPage <= 1;
  elements.opportunityNext.disabled = state.opportunityPage >= totalPages;
  elements.opportunityPageMeta.textContent =
    `Page ${state.opportunityPage} of ${totalPages} • ${opportunities.length} total`;

  for (const opportunity of visibleOpportunities) {
    const key = `${opportunity.animal}::${opportunity.weapon}::${opportunity.trek}`;
    const row = document.createElement("tr");

    if (state.selectedOpportunityKey === key) {
      row.classList.add("active");
    }

    row.innerHTML = `
      <td>${opportunity.animal}</td>
      <td>${opportunity.weapon}</td>
      <td>${opportunity.trek}</td>
      <td>${formatNumber(opportunity.theoreticalGain)}</td>
      <td>${formatNumber(opportunity.playerThirdBestScore)}</td>
      <td>${formatNumber(opportunity.benchmarkScore)}</td>
    `;

    row.addEventListener("click", () => {
      state.selectedOpportunityKey = key;
      renderOpportunities(state.opportunities);
      renderDrilldown(opportunity);
    });

    elements.opportunityBody.appendChild(row);
  }

  const selected =
    opportunities.find(
      (item) =>
        `${item.animal}::${item.weapon}::${item.trek}` === state.selectedOpportunityKey,
    ) ?? opportunities[0];

  state.selectedOpportunityKey = `${selected.animal}::${selected.weapon}::${selected.trek}`;
  renderDrilldown(selected);
}

async function loadPlayers({ live = false } = {}) {
  try {
    const search = encodeURIComponent(elements.playerSearch.value.trim());
    const data = await fetchJson(`/api/players?search=${search}&live=${live ? "1" : "0"}`);
    setSnapshot(data.snapshot);
    state.players = data.players;
    renderPlayers(data.players);
  } catch (error) {
    elements.playerResults.innerHTML = `<p class="empty-state">${error.message}</p>`;
  }
}

async function loadOpportunities() {
  if (!state.selectedPlayerId) {
    return;
  }

  elements.opportunityState.hidden = false;
  elements.opportunityState.textContent = "Loading opportunities...";
  elements.opportunityTable.hidden = true;
  elements.opportunityPagination.hidden = true;

  try {
    state.opportunityPage = 1;
    const weapon = encodeURIComponent(elements.weaponFilter.value);
    const animal = encodeURIComponent(elements.animalFilter.value);
    const data = await fetchJson(
      `/api/player/${state.selectedPlayerId}/opportunities?weapon=${weapon}&animal=${animal}`,
    );
    setSnapshot(data.snapshot);
    renderOpportunities(data.opportunities);
  } catch (error) {
    elements.opportunityState.textContent = error.message;
    elements.opportunityTable.hidden = true;
    elements.opportunityPagination.hidden = true;
  }
}

async function refreshData() {
  elements.refreshButton.disabled = true;
  elements.refreshButton.textContent = "Refreshing...";

  try {
    await fetchJson("/api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await loadPlayers();
    if (state.selectedPlayerId) {
      await loadOpportunities();
    }
  } catch (error) {
    alert(error.message);
  } finally {
    elements.refreshButton.disabled = false;
    elements.refreshButton.textContent = "Refresh Live Data";
  }
}

elements.playerSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    loadPlayers({ live: true });
  }
});

elements.refreshButton.addEventListener("click", refreshData);
elements.playerSearchButton.addEventListener("click", () => loadPlayers({ live: true }));
elements.weaponFilter.addEventListener("change", loadOpportunities);
elements.animalFilter.addEventListener("change", loadOpportunities);
elements.opportunityPrev.addEventListener("click", () => {
  if (state.opportunityPage <= 1) {
    return;
  }

  state.opportunityPage -= 1;
  renderOpportunities(state.opportunities);
});
elements.opportunityNext.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(state.opportunities.length / PAGE_SIZE));
  if (state.opportunityPage >= totalPages) {
    return;
  }

  state.opportunityPage += 1;
  renderOpportunities(state.opportunities);
});

loadPlayers();
