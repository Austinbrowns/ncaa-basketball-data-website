const DATA_URL = "data/team_box_2022_2026.csv";
const QUALITY_URL = "data/quality.json";
const MODEL_URL = "data/march_model.json";

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const mean = (rows, key) => {
  const values = rows.map((row) => number(row[key])).filter((value) => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
};

const sum = (rows, key) => rows.reduce((total, row) => total + (number(row[key]) || 0), 0);

const unique = (rows, key) => new Set(rows.map((row) => row[key])).size;

function uniqueGameRows(rows) {
  const games = new Map();
  rows.forEach((row) => {
    if (!games.has(row.gameId)) games.set(row.gameId, row);
  });
  return [...games.values()];
}

const formatNumber = (value, digits = 1) => {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
};

const formatPercent = (value, digits = 1) => `${formatNumber(value, digits)}%`;

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

let teamDirectory = new Map();
const teamIdentityCache = new Map();
const fallbackTeamPalettes = [
  ["#0b1c31", "#f2c14e"], ["#76232f", "#f6c344"], ["#003b5c", "#d6a84f"], ["#512698", "#f7c948"],
  ["#0057b8", "#fdbb30"], ["#7c2529", "#f2f2f2"], ["#006633", "#ffcc00"], ["#ba0c2f", "#111111"],
];

function normalizeColor(value, fallback) {
  const text = String(value || "").replace("#", "");
  return /^[0-9a-f]{6}$/i.test(text) ? `#${text}` : fallback;
}

function fallbackTeamColor(team, alternate = false) {
  const hash = [...String(team || "")].reduce((total, character) => total + character.charCodeAt(0), 0);
  return fallbackTeamPalettes[hash % fallbackTeamPalettes.length][alternate ? 1 : 0];
}

function teamColor(team, alternate = false) {
  const identity = teamDirectory.get(team) || {};
  return normalizeColor(alternate ? identity.alternateColor : identity.color, fallbackTeamColor(team, alternate));
}

async function hydrateTeamIdentities(teams) {
  const pending = teams.filter((team) => team && !teamIdentityCache.has(team)).map(async (team) => {
    const base = teamDirectory.get(team);
    if (!base?.teamId) return;
    try {
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${encodeURIComponent(base.teamId)}`);
      if (!response.ok) throw new Error("team identity unavailable");
      const payload = await response.json();
      const remoteTeam = payload.team || {};
      teamDirectory.set(team, {
        ...base,
        abbreviation: remoteTeam.abbreviation || base.abbreviation,
        color: remoteTeam.color,
        alternateColor: remoteTeam.alternateColor,
      });
    } catch (error) {
      teamDirectory.set(team, { ...base, color: fallbackTeamColor(team), alternateColor: fallbackTeamColor(team, true) });
    }
    teamIdentityCache.set(team, true);
  });
  if (!pending.length) return;
  await Promise.all(pending);
}

function teamInitials(team, abbreviation = "") {
  if (abbreviation) return abbreviation.slice(0, 4).toUpperCase();
  return String(team || "D1").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "D1";
}

function teamLogoMarkup(team, className = "team-logo") {
  const identity = teamDirectory.get(team) || {};
  const logoUrl = identity.teamId ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${encodeURIComponent(identity.teamId)}.png` : "";
  const initials = teamInitials(team, identity.abbreviation);
  const logoClass = logoUrl ? className : `${className} logo-fallback`;
  const image = logoUrl ? `<img src="${logoUrl}" alt="" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('logo-fallback')">` : "";
  return `<span class="${logoClass}" aria-label="${escapeHtml(team)} logo">${image}<span class="team-logo-text">${escapeHtml(initials)}</span></span>`;
}

function parseCSV(text) {
  const source = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows.shift().map((header) => header.trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function normalizeRow(row) {
  const season = number(row.season);
  return {
    gameId: row.game_id,
    season,
    seasonLabel: row.season_label,
    seasonPhase: row.season_phase,
    date: row.game_date,
    teamId: row.team_id,
    team: row.team_name,
    opponentTeamId: row.opponent_team_id,
    teamLocation: row.team_location,
    abbreviation: row.team_abbreviation,
    conference: row.conference,
    venue: row.team_home_away === "home" ? "Home" : "Away",
    result: row.result,
    win: row.result === "Win" ? 1 : 0,
    points: number(row.team_score),
    opponent: row.opponent_team_name,
    opponentPoints: number(row.opponent_score),
    margin: number(row.margin),
    assists: number(row.assists),
    blocks: number(row.blocks),
    defensiveRebounds: number(row.defensive_rebounds),
    offensiveRebounds: number(row.offensive_rebounds),
    rebounds: number(row.total_rebounds),
    steals: number(row.steals),
    turnovers: number(row.turnovers),
    fouls: number(row.fouls),
    fgm: number(row.field_goals_made),
    fga: number(row.field_goals_attempted),
    fgPct: number(row.field_goal_pct),
    threePM: number(row.three_point_field_goals_made),
    threePA: number(row.three_point_field_goals_attempted),
    threePct: number(row.three_point_field_goal_pct),
    threeRate: number(row.three_point_rate_pct),
    efg: number(row.effective_fg_pct),
    ftm: number(row.free_throws_made),
    fta: number(row.free_throws_attempted),
    ftPct: number(row.free_throw_pct),
    teamTurnovers: number(row.team_turnovers),
    pointsInPaint: number(row.points_in_paint),
    possessions: number(row.possessions),
    turnoverRate: number(row.turnover_rate_pct),
  };
}

function enrichRows(rows) {
  const games = new Map();
  rows.forEach((row) => {
    if (!games.has(row.gameId)) games.set(row.gameId, new Map());
    games.get(row.gameId).set(row.teamId, row);
  });
  return rows.map((row) => {
    const game = games.get(row.gameId);
    const opponent = game?.get(row.opponentTeamId) || [...(game?.values() || [])].find((candidate) => candidate.team === row.opponent);
    const orbDenominator = opponent ? row.offensiveRebounds + opponent.defensiveRebounds : 0;
    return {
      ...row,
      freeThrowRate: row.fga ? 100 * row.fta / row.fga : null,
      orbRate: orbDenominator ? 100 * row.offensiveRebounds / orbDenominator : null,
    };
  });
}

async function loadDataset() {
  const [dataResponse, qualityResponse, modelResponse] = await Promise.all([
    fetch(DATA_URL),
    fetch(QUALITY_URL),
    fetch(MODEL_URL),
  ]);
  if (!dataResponse.ok) throw new Error(`Could not load ${DATA_URL}`);
  const dataText = await dataResponse.text();
  const rows = enrichRows(parseCSV(dataText).map(normalizeRow).filter((row) => row.teamId && row.team));
  const quality = qualityResponse.ok ? await qualityResponse.json() : {};
  if (modelResponse.ok) {
    const modelConfig = await modelResponse.json();
    if (Number.isFinite(Number(modelConfig.intercept)) && Array.isArray(modelConfig.features) && modelConfig.features.length) {
      MARCH_MODEL.intercept = Number(modelConfig.intercept);
      MARCH_MODEL.pathLength = Number(modelConfig.path_length) || 6;
      MARCH_MODEL.features = modelConfig.features.map((feature) => ({
        ...feature,
        coefficient: Number(feature.coefficient),
      }));
    }
  }
  return { rows, quality };
}

function groupRows(rows, keyFunction, measureFunction) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = keyFunction(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  return [...groups.entries()].map(([label, group]) => {
    const values = group.map(measureFunction).filter((value) => Number.isFinite(value));
    return {
      label,
      rows: group.length,
      games: unique(group, "gameId"),
      wins: sum(group, "win"),
      average: values.length ? values.reduce((total, value) => total + value, 0) / values.length : null,
      averagePoints: mean(group, "points"),
      averageMargin: mean(group, "margin"),
      winRate: 100 * mean(group, "win"),
    };
  });
}

function shortLabel(label, length = 18) {
  const value = String(label);
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function svgText(x, y, value, attributes = "") {
  return `<text x="${x}" y="${y}" ${attributes}>${escapeHtml(value)}</text>`;
}

function replayMotion(container, className) {
  container.classList.remove(className);
  void container.offsetWidth;
  container.classList.add(className);
}

function chartTransitionDelay(container) {
  const dashboardCharts = [...document.querySelectorAll('body[data-page="dashboard"] .chart')];
  const chartIndex = dashboardCharts.indexOf(container);
  return `${Math.max(0, Math.min(chartIndex, 7)) * 45}ms`;
}

function replayChartMotion(container) {
  container.style.setProperty("--chart-delay", chartTransitionDelay(container));
  replayMotion(container, "chart-is-refreshing");
}

function emptyChart(container, message = "No rows match these filters.") {
  container.innerHTML = `<div class="empty-chart">${escapeHtml(message)}</div>`;
  replayChartMotion(container);
}

function chartFrame(width, height, content, label) {
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}" preserveAspectRatio="none">${content}</svg>`;
}

function activateChartTooltips(container) {
  const tooltip = container.querySelector(".chart-tooltip");
  const targets = container.querySelectorAll("[data-tooltip]");
  if (!tooltip || !targets.length) return;

  const hide = () => {
    tooltip.classList.remove("is-visible");
  };
  const move = (event, target) => {
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const pointerX = event?.clientX > 0 ? event.clientX : targetRect.left + targetRect.width / 2;
    const pointerY = event?.clientY > 0 ? event.clientY : targetRect.top + targetRect.height / 2;
    const rawLeft = pointerX - containerRect.left + 14;
    const rawTop = pointerY - containerRect.top + 14;
    const left = Math.min(Math.max(8, rawLeft), Math.max(8, containerRect.width - tooltip.offsetWidth - 8));
    const top = Math.min(Math.max(8, rawTop), Math.max(8, containerRect.height - tooltip.offsetHeight - 8));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };
  const show = (event, target) => {
    tooltip.textContent = target.dataset.tooltip;
    tooltip.classList.add("is-visible");
    move(event, target);
  };

  targets.forEach((target) => {
    target.setAttribute("tabindex", "0");
    target.addEventListener("pointerenter", (event) => show(event, target));
    target.addEventListener("pointermove", (event) => move(event, target));
    target.addEventListener("pointerleave", hide);
    target.addEventListener("focus", (event) => show(event, target));
    target.addEventListener("blur", hide);
    target.addEventListener("click", () => {
      targets.forEach((candidate) => candidate.classList.remove("is-selected"));
      target.classList.add("is-selected");
      const filterId = target.dataset.filterId;
      const filterValue = target.dataset.filterValue;
      if (!filterId || filterValue === undefined) return;
      const select = document.getElementById(filterId);
      if (!select || ![...select.options].some((option) => option.value === filterValue)) return;
      setFilterValue(select, filterValue);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
}

function setChart(container, svg) {
  container.innerHTML = `${svg}<div class="chart-tooltip" role="tooltip"></div>`;
  activateChartTooltips(container);
  replayChartMotion(container);
}

function chartFilterAttributes(options, item) {
  if (!options.filterId) return "";
  const value = options.filterValue ? options.filterValue(item) : item.label;
  return ` data-filter-id="${escapeHtml(options.filterId)}" data-filter-value="${escapeHtml(value)}"`;
}

function renderBars(container, items, options = {}) {
  if (!items.length) return emptyChart(container);
  const width = 760;
  const height = options.height || 310;
  const margin = { top: 22, right: 18, bottom: 76, left: 52 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const barSpace = plotWidth / items.length;
  const barWidth = Math.max(8, barSpace * 0.68);
  let content = "";

  [0, 0.5, 1].forEach((tick) => {
    const y = margin.top + plotHeight - plotHeight * tick;
    content += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" class="chart-grid"/>`;
    content += svgText(margin.left - 8, y + 4, formatNumber(maxValue * tick, options.digits ?? 1), 'class="chart-axis" text-anchor="end"');
  });

  items.forEach((item, index) => {
    const x = margin.left + barSpace * index + (barSpace - barWidth) / 2;
    const barHeight = (Math.max(0, item.value) / maxValue) * plotHeight;
    const y = margin.top + plotHeight - barHeight;
    const displayValue = options.valueFormat ? options.valueFormat(item.value) : formatNumber(item.value);
    content += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" class="chart-bar" data-tooltip="${escapeHtml(`${item.label}: ${displayValue}`)}" aria-label="${escapeHtml(`${item.label}: ${displayValue}`)}"${chartFilterAttributes(options, item)}/>`;
    content += svgText(x + barWidth / 2, y - 8, displayValue, 'class="chart-value" text-anchor="middle"');
    content += `<text x="${x + barWidth / 2}" y="${height - margin.bottom + 22}" class="chart-label" text-anchor="end" transform="rotate(-35 ${x + barWidth / 2} ${height - margin.bottom + 22})">${escapeHtml(shortLabel(item.label, 22))}</text>`;
  });

  setChart(container, chartFrame(width, height, content, options.label || "Bar chart"));
}

function renderLine(container, items, options = {}) {
  if (!items.length) return emptyChart(container);
  const width = 760;
  const height = options.height || 310;
  const margin = { top: 24, right: 22, bottom: 54, left: 52 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const step = items.length === 1 ? plotWidth : plotWidth / (items.length - 1);
  const points = items.map((item, index) => {
    const x = margin.left + index * step;
    const y = margin.top + plotHeight - (Math.max(0, item.value) / maxValue) * plotHeight;
    return { ...item, x, y };
  });
  let content = "";

  [0, 0.5, 1].forEach((tick) => {
    const y = margin.top + plotHeight - plotHeight * tick;
    content += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" class="chart-grid"/>`;
    content += svgText(margin.left - 8, y + 4, formatNumber(maxValue * tick, options.digits ?? 1), 'class="chart-axis" text-anchor="end"');
  });

  content += `<polyline points="${points.map((point) => `${point.x},${point.y}`).join(" ")}" class="chart-line"/>`;
  points.forEach((point) => {
    const displayValue = options.valueFormat ? options.valueFormat(point.value) : formatNumber(point.value);
    content += `<circle cx="${point.x}" cy="${point.y}" r="5" class="chart-dot" data-tooltip="${escapeHtml(`${point.label}: ${displayValue}`)}" aria-label="${escapeHtml(`${point.label}: ${displayValue}`)}"${chartFilterAttributes(options, point)}/>`;
    content += svgText(point.x, height - 18, shortLabel(point.label, 15), 'class="chart-label" text-anchor="middle"');
    content += svgText(point.x, point.y - 12, displayValue, 'class="chart-value" text-anchor="middle"');
  });

  setChart(container, chartFrame(width, height, content, options.label || "Line chart"));
}

function renderComparisonLine(container, series, options = {}) {
  const availableSeries = series
    .map((line) => ({ ...line, values: line.values.filter((item) => Number.isFinite(item.value)) }))
    .filter((line) => line.values.length);
  if (!availableSeries.length) return emptyChart(container, "No comparison rows match these filters.");

  const width = 760;
  const legendColumns = 3;
  const legendRows = Math.ceil(availableSeries.length / legendColumns);
  const height = options.height || Math.max(340, 300 + legendRows * 20);
  const margin = { top: 34 + legendRows * 20, right: 22, bottom: 54, left: 52 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const labels = [...new Set(availableSeries.flatMap((line) => line.values.map((item) => item.label)))];
  const allValues = availableSeries.flatMap((line) => line.values.map((item) => item.value));
  const maxValue = Math.max(...allValues, 1);
  const step = labels.length === 1 ? plotWidth : plotWidth / (labels.length - 1);
  let content = "";

  [0, 0.5, 1].forEach((tick) => {
    const y = margin.top + plotHeight - plotHeight * tick;
    content += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" class="chart-grid"/>`;
    content += svgText(margin.left - 8, y + 4, options.valueFormat ? options.valueFormat(maxValue * tick) : formatNumber(maxValue * tick), 'class="chart-axis" text-anchor="end"');
  });

  availableSeries.forEach((line, lineIndex) => {
    const valuesByLabel = new Map(line.values.map((item) => [item.label, item.value]));
    const points = labels.map((label, index) => {
      const value = valuesByLabel.get(label);
      if (!Number.isFinite(value)) return null;
      const x = margin.left + index * step;
      const y = margin.top + plotHeight - (Math.max(0, value) / maxValue) * plotHeight;
      return { label, value, x, y };
    }).filter(Boolean);
    const lineClasses = ["chart-line", "chart-line-alt", "chart-line-third", "chart-line-fourth"];
    const dotClasses = ["chart-dot-primary", "chart-dot-alt", "chart-dot-third", "chart-dot-fourth"];
    const lineClass = lineClasses[lineIndex % lineClasses.length];
    const dotClass = dotClasses[lineIndex % dotClasses.length];
    const lineColor = line.color ? ` style="stroke:${escapeHtml(line.color)}"` : "";
    const dotColor = line.color ? ` style="fill:${escapeHtml(line.color)}"` : "";
    if (points.length > 1) content += `<polyline points="${points.map((point) => `${point.x},${point.y}`).join(" ")}" class="${lineClass}"${lineColor}/>`;
    points.forEach((point) => {
      const displayValue = options.valueFormat ? options.valueFormat(point.value) : formatNumber(point.value);
      const tooltipText = `${line.label} · ${point.label}: ${displayValue}`;
      content += `<circle cx="${point.x}" cy="${point.y}" r="5" class="${dotClass}"${dotColor} data-tooltip="${escapeHtml(tooltipText)}" aria-label="${escapeHtml(tooltipText)}"${chartFilterAttributes(options, point)}><title>${escapeHtml(tooltipText)}</title></circle>`;
      content += svgText(point.x, point.y - 12, displayValue, 'class="chart-value" text-anchor="middle"');
    });
  });

  labels.forEach((label, index) => {
    const x = margin.left + index * step;
    content += svgText(x, height - 18, shortLabel(label, 15), 'class="chart-label" text-anchor="middle"');
  });

  availableSeries.forEach((line, index) => {
    const x = 52 + (index % legendColumns) * 235;
    const y = 20 + Math.floor(index / legendColumns) * 20;
    const colorClass = ["chart-line", "chart-line-alt", "chart-line-third", "chart-line-fourth"][index % 4];
    const legendColor = line.color ? ` style="stroke:${escapeHtml(line.color)}"` : "";
    content += `<line x1="${x}" y1="${y}" x2="${x + 24}" y2="${y}" class="${colorClass}"${legendColor}/>`;
    content += svgText(x + 32, y + 4, shortLabel(line.label, 26), 'class="chart-legend"');
  });

  setChart(container, chartFrame(width, height, content, options.label || "Two-team comparison line chart"));
}

function renderHorizontal(container, items, options = {}) {
  if (!items.length) return emptyChart(container);
  const width = 760;
  const rowHeight = 30;
  const height = Math.max(220, options.top * rowHeight + 74);
  const margin = { top: 22, right: 70, bottom: 24, left: 170 };
  const visible = items.slice(0, options.top || 8);
  const maxValue = Math.max(...visible.map((item) => item.value), 1);
  const plotWidth = width - margin.left - margin.right;
  let content = "";

  visible.forEach((item, index) => {
    const y = margin.top + index * rowHeight;
    const barWidth = Math.max(2, (Math.max(0, item.value) / maxValue) * plotWidth);
    const displayValue = options.valueFormat ? options.valueFormat(item.value) : formatNumber(item.value);
    content += svgText(margin.left - 10, y + 17, shortLabel(item.label, 23), 'class="chart-label" text-anchor="end"');
    content += `<rect x="${margin.left}" y="${y + 4}" width="${barWidth}" height="20" rx="4" class="chart-bar chart-bar-alt" data-tooltip="${escapeHtml(`${item.label}: ${displayValue}`)}" aria-label="${escapeHtml(`${item.label}: ${displayValue}`)}"${chartFilterAttributes(options, item)}/>`;
    content += svgText(margin.left + barWidth + 8, y + 19, displayValue, 'class="chart-value"');
  });

  setChart(container, chartFrame(width, height, content, options.label || "Horizontal bar chart"));
}

function renderDots(container, items, options = {}) {
  if (!items.length) return emptyChart(container);
  const width = 760;
  const height = options.height || 310;
  const margin = { top: 24, right: 30, bottom: 54, left: 54 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxX = Math.max(...items.map((item) => item.rows), 1);
  const maxY = Math.max(...items.map((item) => item.value), 1);
  let content = "";

  [0, 0.5, 1].forEach((tick) => {
    const y = margin.top + plotHeight - plotHeight * tick;
    content += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" class="chart-grid"/>`;
    content += svgText(margin.left - 8, y + 4, formatNumber(maxY * tick, options.digits ?? 1), 'class="chart-axis" text-anchor="end"');
  });

  items.slice(0, 60).forEach((item) => {
    const x = margin.left + (item.rows / maxX) * plotWidth;
    const y = margin.top + plotHeight - (item.value / maxY) * plotHeight;
    const displayValue = options.valueFormat ? options.valueFormat(item.value) : formatNumber(item.value);
    const tooltipText = `${item.label} · ${formatNumber(item.rows, 0)} rows: ${displayValue}`;
    content += `<circle cx="${x}" cy="${y}" r="5" class="chart-dot chart-dot-soft" data-tooltip="${escapeHtml(tooltipText)}" aria-label="${escapeHtml(tooltipText)}"${chartFilterAttributes(options, item)}><title>${escapeHtml(tooltipText)}</title></circle>`;
  });
  content += svgText(width / 2, height - 15, "Rows in group", 'class="chart-axis" text-anchor="middle"');
  content += `<text x="16" y="${height / 2}" class="chart-axis" text-anchor="middle" transform="rotate(-90 16 ${height / 2})">${escapeHtml(options.yLabel || "Value")}</text>`;
  setChart(container, chartFrame(width, height, content, options.label || "Dot chart"));
}

function renderRadar(container, items, options = {}) {
  if (!items.length) return emptyChart(container);
  const width = 760;
  const height = options.height || 330;
  const centerX = 270;
  const centerY = height / 2 + 8;
  const radius = 105;
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const angle = (Math.PI * 2) / items.length;
  const pointAt = (value, index) => {
    const theta = -Math.PI / 2 + angle * index;
    const distance = radius * (value / maxValue);
    return { x: centerX + Math.cos(theta) * distance, y: centerY + Math.sin(theta) * distance };
  };
  let content = "";
  [0.25, 0.5, 0.75, 1].forEach((ring) => {
    const points = items.map((item, index) => pointAt(maxValue * ring, index));
    content += `<polygon points="${points.map((point) => `${point.x},${point.y}`).join(" ")}" class="chart-radar-ring"/>`;
  });
  items.forEach((item, index) => {
    const axis = pointAt(maxValue, index);
    const labelPoint = pointAt(maxValue * 1.24, index);
    content += `<line x1="${centerX}" y1="${centerY}" x2="${axis.x}" y2="${axis.y}" class="chart-radar-axis"/>`;
    content += svgText(labelPoint.x, labelPoint.y + (labelPoint.y < centerY ? -2 : 12), shortLabel(item.label, 19), `class="chart-label" text-anchor="${labelPoint.x < centerX - 8 ? "end" : labelPoint.x > centerX + 8 ? "start" : "middle"}`);
  });
  const valuePoints = items.map((item, index) => pointAt(item.value, index));
  content += `<polygon points="${valuePoints.map((point) => `${point.x},${point.y}`).join(" ")}" class="chart-radar-area"/>`;
  items.forEach((item, index) => {
    const point = valuePoints[index];
    const displayValue = options.valueFormat ? options.valueFormat(item.value) : formatNumber(item.value);
    const tooltipText = `${item.label}: ${displayValue}`;
    content += `<circle cx="${point.x}" cy="${point.y}" r="7" class="chart-radar-point" data-tooltip="${escapeHtml(tooltipText)}" aria-label="${escapeHtml(tooltipText)}"><title>${escapeHtml(tooltipText)}</title></circle>`;
  });
  items.forEach((item, index) => {
    const y = 68 + index * 42;
    const displayValue = options.valueFormat ? options.valueFormat(item.value) : formatNumber(item.value);
    content += `<line x1="520" y1="${y - 5}" x2="548" y2="${y - 5}" class="chart-radar-key"/>`;
    content += svgText(560, y, shortLabel(item.label, 26), 'class="chart-label"');
    content += svgText(730, y, displayValue, 'class="chart-value" text-anchor="end"');
  });
  setChart(container, chartFrame(width, height, content, options.label || "Four-factor radar chart"));
}

function renderDumbbell(container, items, options = {}) {
  if (!items.length) return emptyChart(container);
  const width = 760;
  const height = options.height || 230;
  const margin = { left: 72, right: 58, top: 66, bottom: 44 };
  const values = items.map((item) => item.value).filter((value) => Number.isFinite(value));
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 1);
  const scale = (value) => margin.left + ((value - minValue) / Math.max(0.0001, maxValue - minValue)) * (width - margin.left - margin.right);
  const y = height / 2 + 5;
  let content = "";
  [minValue, (minValue + maxValue) / 2, maxValue].forEach((value) => {
    const x = scale(value);
    content += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}" class="chart-grid"/>`;
    content += svgText(x, height - 18, options.valueFormat ? options.valueFormat(value) : formatNumber(value), 'class="chart-axis" text-anchor="middle"');
  });
  const points = items.map((item) => ({ ...item, x: scale(item.value) }));
  if (points.length > 1) content += `<line x1="${points[0].x}" y1="${y}" x2="${points.at(-1).x}" y2="${y}" class="chart-dumbbell-line"/>`;
  points.forEach((point) => {
    const displayValue = options.valueFormat ? options.valueFormat(point.value) : formatNumber(point.value);
    const tooltipText = `${point.label}: ${displayValue}`;
    const pointClass = point.label === "Win" ? "chart-dumbbell-point chart-dumbbell-win" : "chart-dumbbell-point chart-dumbbell-loss";
    content += `<circle cx="${point.x}" cy="${y}" r="10" class="${pointClass}" data-tooltip="${escapeHtml(tooltipText)}" aria-label="${escapeHtml(tooltipText)}"><title>${escapeHtml(tooltipText)}</title></circle>`;
    content += svgText(point.x, y - 21, displayValue, 'class="chart-value" text-anchor="middle"');
    content += svgText(point.x, 34, shortLabel(point.label, 18), 'class="chart-label" text-anchor="middle"');
  });
  content += svgText(width / 2, 18, options.subtitle || "Win–loss gap", 'class="chart-axis" text-anchor="middle"');
  setChart(container, chartFrame(width, height, content, options.label || "Win-loss dumbbell chart"));
}

function renderLollipops(container, items, options = {}) {
  if (!items.length) return emptyChart(container);
  const visible = items.slice(0, options.top || 8);
  const width = 760;
  const rowHeight = 32;
  const height = Math.max(230, visible.length * rowHeight + 72);
  const margin = { left: 178, right: 72, top: 22, bottom: 26 };
  const maxValue = Math.max(...visible.map((item) => item.value), 1);
  const plotWidth = width - margin.left - margin.right;
  let content = "";
  visible.forEach((item, index) => {
    const y = margin.top + index * rowHeight + 12;
    const x = margin.left + (Math.max(0, item.value) / maxValue) * plotWidth;
    const displayValue = options.valueFormat ? options.valueFormat(item.value) : formatNumber(item.value);
    const tooltipText = `${item.label}: ${displayValue}`;
    content += svgText(margin.left - 10, y + 4, shortLabel(item.label, 23), 'class="chart-label" text-anchor="end"');
    content += `<line x1="${margin.left}" y1="${y}" x2="${x}" y2="${y}" class="chart-lollipop-line"/>`;
    content += `<circle cx="${x}" cy="${y}" r="8" class="chart-lollipop-point" data-tooltip="${escapeHtml(tooltipText)}" aria-label="${escapeHtml(tooltipText)}"><title>${escapeHtml(tooltipText)}</title></circle>`;
    content += svgText(x + 13, y + 4, displayValue, 'class="chart-value"');
  });
  setChart(container, chartFrame(width, height, content, options.label || "Lollipop ranking chart"));
}

const CONCEPTS = {
  efg: {
    label: "Shot quality",
    title: "Effective field-goal percentage",
    plain: "A made three is worth more than a made two. eFG% gives the shot profile credit for that extra point, so it tells us more than raw field-goal percentage.",
    formula: "(FGM + 0.5 × 3PM) ÷ FGA",
    visual: "shots",
    videoId: "_u0NSrwKs-w",
    videoTitle: "How Do You Calculate Effective Field Goal Percentage?",
  },
  turnoverRate: {
    label: "Ball security",
    title: "Turnover rate",
    plain: "Every empty possession is a chance the other team gets for free. A lower turnover rate means a team keeps more of its possessions alive.",
    formula: "turnovers ÷ estimated possessions",
    visual: "turnover",
  },
  orbRate: {
    label: "Second chances",
    title: "Offensive-rebound rate",
    plain: "A miss is not always the end of a possession. An offensive rebound gives the offense another shot, another pass, or another trip to the line.",
    formula: "ORB ÷ (ORB + opponent DRB)",
    visual: "rebound",
    videoId: "d_D4rNMi9AA",
    videoTitle: "Mastering the Offensive Rebound",
  },
  freeThrowRate: {
    label: "Pressure at the line",
    title: "Free-throw rate",
    plain: "This estimates how often a team gets to the line relative to its field-goal attempts. It is a pressure signal: drives, contact, and paint attacks create extra scoring chances.",
    formula: "FTA ÷ FGA",
    visual: "freethrow",
  },
};

function conceptVisual(key) {
  if (key === "efg") return `<div class="concept-visual concept-visual-shots"><span class="court-hoop"></span><span class="shot-dot shot-two">2</span><span class="shot-dot shot-three">3</span><span class="shot-path path-two"></span><span class="shot-path path-three"></span><b>3 points count more</b></div>`;
  if (key === "turnoverRate") return `<div class="concept-visual concept-visual-turnover"><span class="possession-ball">●</span><span class="possession-path"></span><span class="possession-x">×</span><b>empty trip</b><small>the opponent gets the next possession</small></div>`;
  if (key === "orbRate") return `<div class="concept-visual concept-visual-rebound"><span class="backboard"></span><span class="rim"></span><span class="rebound-ball ball-miss">●</span><span class="rebound-ball ball-board">●</span><span class="rebound-arrow">↗</span><b>miss → extra chance</b></div>`;
  return `<div class="concept-visual concept-visual-freethrow"><span class="free-line"></span><span class="free-hoop"></span><span class="free-ball">●</span><span class="free-arrow">→</span><b>pressure creates points</b></div>`;
}

function factorEdges(profileA, profileB, teamA, teamB) {
  return MARCH_MODEL.features.map((feature) => {
    const valueA = profileA[feature.key];
    const valueB = profileB[feature.key];
    const signedModelEdge = feature.coefficient * (valueA - valueB);
    const winner = signedModelEdge >= 0 ? teamA : teamB;
    return { feature, valueA, valueB, winner, difference: Math.abs(valueA - valueB), signedModelEdge };
  });
}

function renderConceptExplainer(key, rows, model) {
  const container = document.getElementById("concept-explainer");
  if (!container) return;
  const concept = CONCEPTS[key] || CONCEPTS.orbRate;
  const teamA = document.getElementById("compare-team-a")?.value;
  const teamB = document.getElementById("compare-team-b")?.value;
  const season = document.getElementById("filter-season")?.value || "all";
  const profileA = getTeamModelProfile(model, rows, teamA, season);
  const profileB = getTeamModelProfile(model, rows, teamB, season);
  const edge = profileA && profileB ? factorEdges(profileA, profileB, teamA, teamB).find((item) => item.feature.key === key) : null;
  const video = concept.videoId
    ? `<div class="concept-video"><iframe src="https://www.youtube-nocookie.com/embed/${concept.videoId}?rel=0" title="${escapeHtml(concept.videoTitle)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe><a href="https://www.youtube.com/watch?v=${concept.videoId}" target="_blank" rel="noreferrer">Watch the full example on YouTube ↗</a></div>`
    : `<div class="concept-video concept-video-placeholder"><div class="concept-video-caption">This concept is shown with the interactive floor visual above. Select another factor to watch a coaching example.</div></div>`;
  container.innerHTML = `<div class="concept-heading"><span class="eyebrow">See the stat on the floor</span><h3>${escapeHtml(concept.title)}</h3><p>${escapeHtml(concept.plain)}</p></div>${conceptVisual(key)}<div class="concept-formula"><span>Formula</span><strong>${escapeHtml(concept.formula)}</strong>${edge ? `<small>${escapeHtml(edge.winner)} leads this factor by ${formatNumber(edge.difference)} percentage points in the selected profile.</small>` : ""}</div>${video}`;
}

function renderHeadToHeadFactorBars(rows, model) {
  const container = document.getElementById("dashboard-chart-factor-bars");
  const status = document.getElementById("factor-board-status");
  const teamA = document.getElementById("compare-team-a")?.value;
  const teamB = document.getElementById("compare-team-b")?.value;
  const season = document.getElementById("filter-season")?.value || "all";
  if (!teamA || !teamB || teamA === teamB) {
    status.textContent = "Choose two different teams to reveal the matchup story.";
    container.innerHTML = `<div class="empty-chart">Your four-factor faceoff will appear here.</div>`;
    return;
  }
  const profileA = getTeamModelProfile(model, rows, teamA, season);
  const profileB = getTeamModelProfile(model, rows, teamB, season);
  if (!profileA || !profileB) {
    status.textContent = "Not enough regular-season data for the four-factor faceoff.";
    container.innerHTML = `<div class="empty-chart">Not enough data to build this matchup story.</div>`;
    return;
  }
  const edges = factorEdges(profileA, profileB, teamA, teamB);
  const strongest = [...edges].sort((a, b) => Math.abs(b.signedModelEdge) - Math.abs(a.signedModelEdge))[0];
  status.textContent = `${strongest.winner} owns the biggest modeled edge: ${strongest.feature.label.toLowerCase()}. Click any row to see how that stat becomes a basketball action.`;
  container.innerHTML = edges.map((edge) => {
    const aScore = edge.feature.coefficient < 0 ? 100 - edge.valueA : edge.valueA;
    const bScore = edge.feature.coefficient < 0 ? 100 - edge.valueB : edge.valueB;
    const total = Math.max(0.01, aScore + bScore);
    const aWidth = 100 * aScore / total;
    const bWidth = 100 * bScore / total;
    const winnerA = edge.winner === teamA;
    return `<button type="button" class="factor-duel-row ${winnerA ? "factor-duel-a" : "factor-duel-b"}" data-factor="${escapeHtml(edge.feature.key)}"><div class="factor-duel-heading"><span>${escapeHtml(edge.feature.shortLabel)} <small>${edge.feature.coefficient < 0 ? "lower is better" : "higher is better"}</small></span><strong>${teamLogoMarkup(edge.winner, "team-logo team-logo-tiny")}${escapeHtml(edge.winner)} +${formatNumber(edge.difference)} pp</strong></div><div class="factor-bar-line"><span class="factor-bar-team"><i style="background:${teamColor(teamA)}"></i>${escapeHtml(teamA)} <b>${formatPercent(edge.valueA)}</b></span><span class="factor-track"><i class="factor-fill-a" style="width:${aWidth}%;background:${teamColor(teamA)}"></i></span></div><div class="factor-bar-line"><span class="factor-bar-team"><i style="background:${teamColor(teamB)}"></i>${escapeHtml(teamB)} <b>${formatPercent(edge.valueB)}</b></span><span class="factor-track"><i class="factor-fill-b" style="width:${bWidth}%;background:${teamColor(teamB)}"></i></span></div></button>`;
  }).join("");
  container.querySelectorAll("[data-factor]").forEach((row) => {
    row.addEventListener("click", () => renderConceptExplainer(row.dataset.factor, rows, model));
    row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); renderConceptExplainer(row.dataset.factor, rows, model); } });
  });
  renderConceptExplainer(strongest.feature.key, rows, model);
}

const MARCH_MODEL = {
  intercept: -0.00264869,
  pathLength: 6,
  features: [
    { key: "efg", label: "Effective FG%", shortLabel: "Shot quality", definition: "(FGM + 0.5 × 3PM) ÷ FGA", coefficient: 0.07566725 },
    { key: "turnoverRate", label: "Turnover rate", shortLabel: "Ball security", definition: "Turnovers ÷ estimated possessions", coefficient: -0.08095011 },
    { key: "orbRate", label: "Offensive-rebound rate", shortLabel: "Second chances", definition: "ORB ÷ (ORB + opponent DRB)", coefficient: 0.02122665 },
    { key: "freeThrowRate", label: "Free-throw rate", shortLabel: "Pressure at the line", definition: "FTA ÷ FGA", coefficient: 0.01490215 },
  ],
};

function standardDeviation(items, key, average) {
  const values = items.map((item) => number(item[key])).filter((value) => value !== null);
  if (!values.length) return 1;
  return Math.sqrt(values.reduce((total, value) => total + ((value - average) ** 2), 0) / values.length) || 1;
}

function buildMarchModel(rows) {
  const regularRows = rows.filter((row) => row.seasonPhase === "Regular season");
  const games = new Map();
  regularRows.forEach((row) => {
    if (!games.has(row.gameId)) games.set(row.gameId, new Map());
    games.get(row.gameId).set(row.teamId, row);
  });

  const buckets = new Map();
  regularRows.forEach((row) => {
    const game = games.get(row.gameId);
    const opponent = game?.get(row.opponentTeamId) || [...(game?.values() || [])].find((candidate) => candidate.team === row.opponent);
    const orbDenominator = opponent ? row.offensiveRebounds + opponent.defensiveRebounds : 0;
    const freeThrowRate = row.fga ? 100 * row.fta / row.fga : null;
    const metrics = {
      efg: row.efg,
      turnoverRate: row.turnoverRate,
      orbRate: orbDenominator ? 100 * row.offensiveRebounds / orbDenominator : null,
      freeThrowRate,
    };
    if (MARCH_MODEL.features.some((feature) => !Number.isFinite(metrics[feature.key]))) return;
    const key = `${row.seasonLabel}::${row.teamId}`;
    if (!buckets.has(key)) buckets.set(key, { key, seasonLabel: row.seasonLabel, teamId: row.teamId, team: row.team, values: [] });
    buckets.get(key).values.push(metrics);
  });

  const postseason = new Map();
  rows.filter((row) => row.seasonPhase === "Postseason").forEach((row) => {
    const key = `${row.seasonLabel}::${row.teamId}`;
    if (!postseason.has(key)) postseason.set(key, { games: 0, wins: 0 });
    const result = postseason.get(key);
    result.games += 1;
    result.wins += row.win;
  });

  const profiles = [...buckets.values()]
    .filter((bucket) => bucket.values.length >= 10)
    .map((bucket) => {
      const profile = {
        key: bucket.key,
        seasonLabel: bucket.seasonLabel,
        teamId: bucket.teamId,
        team: bucket.team,
        regularGames: bucket.values.length,
      };
      MARCH_MODEL.features.forEach((feature) => { profile[feature.key] = mean(bucket.values, feature.key); });
      const postseasonRecord = postseason.get(bucket.key) || { games: 0, wins: 0 };
      profile.postseasonGames = postseasonRecord.games;
      profile.postseasonWins = postseasonRecord.wins;
      profile.postseasonWinRate = postseasonRecord.games ? 100 * postseasonRecord.wins / postseasonRecord.games : null;
      return profile;
    });

  const postseasonProfiles = profiles.filter((profile) => profile.postseasonGames > 0);
  const referenceProfiles = postseasonProfiles.length ? postseasonProfiles : profiles;
  const reference = Object.fromEntries(MARCH_MODEL.features.map((feature) => {
    const average = mean(referenceProfiles, feature.key);
    return [feature.key, { average, deviation: standardDeviation(referenceProfiles, feature.key, average) }];
  }));
  const totalWeight = MARCH_MODEL.features.reduce((total, feature) => total + Math.abs(feature.coefficient), 0);

  const scoredProfiles = profiles.map((profile) => {
    const zScores = {};
    let logit = MARCH_MODEL.intercept;
    MARCH_MODEL.features.forEach((feature) => {
      const zScore = (profile[feature.key] - reference[feature.key].average) / reference[feature.key].deviation;
      zScores[feature.key] = zScore;
      logit += feature.coefficient * zScore;
    });
    const winProbability = 1 / (1 + Math.exp(-logit));
    return { ...profile, zScores, logit, winProbability, titlePathProbability: winProbability ** MARCH_MODEL.pathLength };
  });

  return {
    profiles: scoredProfiles,
    reference,
    postseasonProfileCount: postseasonProfiles.length,
    postseasonGameRows: rows.filter((row) => row.seasonPhase === "Postseason").length,
    totalWeight,
  };
}

function scoreMarchMetrics(metrics, model) {
  const zScores = {};
  let logit = MARCH_MODEL.intercept;
  MARCH_MODEL.features.forEach((feature) => {
    const zScore = (metrics[feature.key] - model.reference[feature.key].average) / model.reference[feature.key].deviation;
    zScores[feature.key] = zScore;
    logit += feature.coefficient * zScore;
  });
  const winProbability = 1 / (1 + Math.exp(-logit));
  return { zScores, logit, winProbability, titlePathProbability: winProbability ** MARCH_MODEL.pathLength };
}

function getTeamModelProfile(model, rows, team, seasonFilter = "all") {
  if (!team || !model) return null;
  const profiles = model.profiles
    .filter((profile) => profile.team === team && (seasonFilter === "all" || profile.seasonLabel === seasonFilter))
    .sort((a, b) => String(b.seasonLabel).localeCompare(String(a.seasonLabel), undefined, { numeric: true }));
  if (profiles.length) return profiles[0];

  const teamRows = rows.filter((row) => row.team === team && row.seasonPhase === "Regular season" && (seasonFilter === "all" || row.seasonLabel === seasonFilter));
  if (!teamRows.length) return null;
  const profile = {
    key: `${teamRows[0].seasonLabel}::${teamRows[0].teamId}`,
    seasonLabel: teamRows[0].seasonLabel,
    teamId: teamRows[0].teamId,
    team,
    regularGames: teamRows.length,
  };
  MARCH_MODEL.features.forEach((feature) => { profile[feature.key] = mean(teamRows, feature.key); });
  return { ...profile, ...scoreMarchMetrics(profile, model), postseasonGames: 0, postseasonWins: 0, postseasonWinRate: null };
}

function teamStyle(profile) {
  if (!profile) return "Profile waiting";
  const styles = [
    { key: "efg", label: "Shot-making team" },
    { key: "turnoverRate", label: "Low-turnover team", reverse: true },
    { key: "orbRate", label: "Second-chance machine" },
    { key: "freeThrowRate", label: "Pressure-at-the-line team" },
  ];
  return styles.sort((a, b) => {
    const aScore = (a.reverse ? -1 : 1) * (profile.zScores?.[a.key] || 0);
    const bScore = (b.reverse ? -1 : 1) * (profile.zScores?.[b.key] || 0);
    return bScore - aScore;
  })[0].label;
}

function getFeatureStrength(profile, feature) {
  const zScore = profile?.zScores?.[feature.key] || 0;
  return feature.coefficient < 0 ? -zScore : zScore;
}

function renderMarchTakeaway(model, latestSeason) {
  const strongest = [...MARCH_MODEL.features].sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient))[0];
  const latestProfiles = model.profiles.filter((profile) => profile.seasonLabel === latestSeason);
  const rankedProfiles = (latestProfiles.length ? latestProfiles : model.profiles)
    .sort((a, b) => b.titlePathProbability - a.titlePathProbability)
    .slice(0, 10);
  const formulaParts = MARCH_MODEL.features.map((feature) => {
    const sign = feature.coefficient >= 0 ? "+" : "−";
    return `${sign} ${formatNumber(Math.abs(feature.coefficient), 3)} z(${feature.shortLabel})`;
  }).join(" ");
  const formula = `logit(p) = ${formatNumber(MARCH_MODEL.intercept, 3)} ${formulaParts};  p = 1 ÷ (1 + e⁻ˡ);  title path ≈ p${MARCH_MODEL.pathLength}`;

  document.getElementById("march-takeaway-lede").textContent = `The formula was estimated from ${formatNumber(model.postseasonGameRows, 0)} postseason team-game rows across ${formatNumber(model.postseasonProfileCount, 0)} team-seasons. ${strongest.label} carries ${formatNumber(100 * Math.abs(strongest.coefficient) / model.totalWeight, 0)}% of the model’s relative factor weight in this sample, followed by ${MARCH_MODEL.features.filter((feature) => feature !== strongest).sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient))[0].label.toLowerCase()}.`;
  document.getElementById("march-formula").textContent = formula;
  document.getElementById("march-model-footnote").textContent = `The chart estimates a ${MARCH_MODEL.pathLength}-game path by raising each team’s one-game win probability to the ${MARCH_MODEL.pathLength}th power. It is a historical postseason proxy—not a sportsbook line, seed model, or literal bracket forecast. Hover any bar or point for the exact value.`;
  document.getElementById("march-factor-grid").innerHTML = MARCH_MODEL.features.map((feature) => {
    const sign = feature.coefficient >= 0 ? "+" : "−";
    const weight = 100 * Math.abs(feature.coefficient) / model.totalWeight;
    const reference = model.reference[feature.key].average;
    return `<article class="march-factor">
      <span class="card-label">${escapeHtml(feature.shortLabel)}</span>
      <strong>${formatNumber(weight, 0)}%</strong>
      <span>${sign} ${formatNumber(Math.abs(feature.coefficient), 3)} × z-score</span>
      <small>${escapeHtml(feature.label)} · reference ${formatNumber(reference)}%</small>
      <small>${escapeHtml(feature.definition)}</small>
    </article>`;
  }).join("");

  renderLollipops(document.getElementById("report-chart-march"), rankedProfiles.map((profile) => ({
    label: `${profile.team} · ${profile.seasonLabel}`,
    value: 100 * profile.titlePathProbability,
  })), {
    top: 10,
    label: `Estimated six-game title path for ${latestSeason}`,
    valueFormat: (value) => formatPercent(value),
  });
}

function reportSection(id, heading, copy, chartTitle, why) {
  return `<section class="report-section">
    <div class="section-copy"><p class="eyebrow">Finding ${id}</p><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(copy)}</p><div class="why-it-matters"><span>Why it matters</span><p>${escapeHtml(why)}</p></div></div>
    <div class="chart-wrap"><div class="chart-title">${escapeHtml(chartTitle)}</div><div id="report-chart-${id}" class="chart"></div></div>
  </section>`;
}

function getSeasonGroups(rows, measureKey) {
  return groupRows(rows, (row) => row.seasonLabel, (row) => row[measureKey])
    .sort((a, b) => a.label.localeCompare(b.label));
}

function renderReport(rows, quality) {
  const gameRows = uniqueGameRows(rows);
  const marchModel = buildMarchModel(rows);
  const seasons = [...new Set(rows.map((row) => row.seasonLabel))].sort();
  const firstSeason = seasons[0];
  const lastSeason = seasons[seasons.length - 1];
  const seasonGames = groupRows(gameRows, (row) => row.seasonLabel, () => 1).sort((a, b) => a.label.localeCompare(b.label));
  const seasonThreeRate = getSeasonGroups(rows, "threeRate");
  const seasonPace = getSeasonGroups(rows, "possessions");
  const seasonEfficiency = groupRows(rows, (row) => row.seasonLabel, (row) => row.possessions ? row.points / row.possessions : null).sort((a, b) => a.label.localeCompare(b.label));
  const turnoverRateByResult = groupRows(rows, (row) => row.result, (row) => row.turnoverRate).sort((a, b) => a.label.localeCompare(b.label));
  const efgByResult = groupRows(rows, (row) => row.result, (row) => row.efg).sort((a, b) => a.label.localeCompare(b.label));
  const orbRateByResult = groupRows(rows, (row) => row.result, (row) => row.orbRate).sort((a, b) => a.label.localeCompare(b.label));
  const freeThrowRateByResult = groupRows(rows, (row) => row.result, (row) => row.freeThrowRate).sort((a, b) => a.label.localeCompare(b.label));
  const teamEfficiency = groupRows(rows, (row) => row.team, (row) => row.possessions ? row.points / row.possessions : null)
    .filter((item) => item.rows >= 100)
    .sort((a, b) => b.average - a.average)
    .slice(0, 8);
  const modelProfiles = marchModel.profiles.filter((profile) => profile.postseasonGames > 0).sort((a, b) => a.logit - b.logit);
  const quartileSize = Math.max(1, Math.ceil(modelProfiles.length / 4));
  const modelQuartiles = ["Lowest factor score", "Lower-middle factor score", "Upper-middle factor score", "Highest factor score"].map((label, index) => {
    const group = modelProfiles.slice(index * quartileSize, (index + 1) * quartileSize);
    return { label, average: mean(group, "postseasonWinRate"), rows: group.length };
  }).filter((item) => item.rows);
  const factorWeights = MARCH_MODEL.features.map((feature) => ({
    label: feature.shortLabel,
    value: 100 * Math.abs(feature.coefficient) / marchModel.totalWeight,
  }));

  document.getElementById("headline-seasons").textContent = seasons.length;
  document.getElementById("headline-teamgames").textContent = formatNumber(rows.length, 0);
  document.getElementById("headline-teams").textContent = formatNumber(unique(rows, "teamId"), 0);
  document.getElementById("headline-pace").textContent = formatNumber(mean(rows, "possessions"), 1);
  const heroSummary = document.getElementById("hero-summary");
  if (heroSummary) heroSummary.textContent = `This report uses ${formatNumber(rows.length, 0)} Division I team-game observations from ${firstSeason} through ${lastSeason}, representing ${formatNumber(unique(rows, "teamId"), 0)} team IDs and ${formatNumber(gameRows.length, 0)} unique games. It turns repeated ESPN/SportsDataverse box scores into evidence about competitive games, home court, pace, shot quality, ball security, second chances, and the margins that separate winning from losing.`;
  renderMarchTakeaway(marchModel, lastSeason);

  const firstThree = seasonThreeRate[0]?.average || 0;
  const lastThree = seasonThreeRate.at(-1)?.average || 0;
  const firstPace = seasonPace[0]?.average || 0;
  const lastPace = seasonPace.at(-1)?.average || 0;
  const firstEfficiency = seasonEfficiency[0]?.average || 0;
  const lastEfficiency = seasonEfficiency.at(-1)?.average || 0;
  const winTurnoverRate = turnoverRateByResult.find((item) => item.label === "Win")?.average || 0;
  const lossTurnoverRate = turnoverRateByResult.find((item) => item.label === "Loss")?.average || 0;
  const winEfg = efgByResult.find((item) => item.label === "Win")?.average || 0;
  const lossEfg = efgByResult.find((item) => item.label === "Loss")?.average || 0;
  const winOrbRate = orbRateByResult.find((item) => item.label === "Win")?.average || 0;
  const lossOrbRate = orbRateByResult.find((item) => item.label === "Loss")?.average || 0;
  const winFreeThrowRate = freeThrowRateByResult.find((item) => item.label === "Win")?.average || 0;
  const lossFreeThrowRate = freeThrowRateByResult.find((item) => item.label === "Loss")?.average || 0;
  const highestQuartileWinRate = modelQuartiles.at(-1)?.average || 0;
  const lowestQuartileWinRate = modelQuartiles[0]?.average || 0;
  const topEfficiencyTeam = teamEfficiency[0];

  document.getElementById("report-sections").innerHTML = [
    reportSection("01", `The panel covers ${formatNumber(gameRows.length, 0)} games, not just a handful of headlines`, `The file contains ${formatNumber(rows.length, 0)} team-game observations from ${formatNumber(unique(rows, "teamId"), 0)} Division I teams across ${seasons.length} seasons. Each game contributes a team-level box score, so the report can test whether a pattern repeats instead of relying on a single tournament run.`, "Games by season · volume pulse", "A large repeated sample makes it possible to benchmark teams and test whether a basketball idea survives across seasons."),
    reportSection("02", `The highest factor-score quartile averaged a ${formatPercent(highestQuartileWinRate)} postseason win rate`, `Team-seasons in the highest four-factor score quartile averaged ${formatPercent(highestQuartileWinRate)} across their observed postseason games compared with ${formatPercent(lowestQuartileWinRate)} for the lowest quartile. This is the model’s calibration check across ${formatNumber(modelProfiles.length, 0)} postseason team-seasons.`, "Postseason win rate · calibration ladder", "A metric earns its place when stronger profiles show up with stronger results. This comparison connects the formula to actual postseason outcomes."),
    reportSection("03", `Offensive-rebound rate carries ${formatNumber(factorWeights.find((item) => item.label === "Second chances")?.value || 0, 0)}% of the model weight`, `The model ranks second chances ahead of effective shooting, turnover rate, and free-throw rate in this five-season postseason sample. These weights describe this dataset’s signal, not a universal law of basketball.`, "March factor power grid · hover each vertex", "The weighting tells the reader where the model is finding repeatable information—and where a stat is better treated as context than as a standalone prediction."),
    reportSection("04", `Winning teams posted ${formatPercent(winEfg)} effective field-goal shooting`, `Winning rows averaged ${formatPercent(winEfg)} eFG compared with ${formatPercent(lossEfg)} for losing rows, a gap of ${formatNumber(winEfg - lossEfg)} percentage points. Effective field goal percentage gives extra credit for made threes.`, "Winner vs. loss · shot-quality dumbbell", "Raw field-goal percentage can hide shot value. This metric connects shot selection and shot making to the result in one comparable measure."),
    reportSection("05", `Winners turned the ball over on ${formatPercent(winTurnoverRate)} of possessions`, `Losing rows turned the ball over on ${formatPercent(lossTurnoverRate)} of estimated possessions, a ${formatNumber(lossTurnoverRate - winTurnoverRate)} percentage-point gap. Turnover rate normalizes giveaways by the number of possessions available.`, "Winner vs. loss · possession-cost dumbbell", "Possessions are limited. A small difference in turnover rate can quietly remove several scoring opportunities over the course of a game."),
    reportSection("06", `Winners created a ${formatNumber(winOrbRate - lossOrbRate)} percentage-point offensive-rebound edge`, `Winning rows averaged ${formatPercent(winOrbRate)} offensive-rebound rate compared with ${formatPercent(lossOrbRate)} for losing rows. The rate uses offensive rebounds divided by offensive rebounds plus the opponent’s defensive rebounds.`, "Winner vs. loss · second-chance dumbbell", "Second chances are extra possessions. This is the factor the postseason model weighted most heavily in this sample."),
    reportSection("07", `Winning teams had a ${formatNumber(winFreeThrowRate - lossFreeThrowRate)}-point free-throw-rate edge`, `Winning rows averaged ${formatPercent(winFreeThrowRate)} FTA per FGA compared with ${formatPercent(lossFreeThrowRate)} for losing rows. The model keeps this factor in context because its independent coefficient is negative after the other factors are included.`, "Winner vs. loss · pressure dumbbell", "Getting to the line still describes pressure and scoring opportunity, but a multivariable model can reveal when a stat overlaps with stronger signals."),
    reportSection("08", `The average game barely changed pace, but each possession became more productive`, `Estimated pace moved from ${formatNumber(firstPace)} to ${formatNumber(lastPace)} possessions per team-game, while points per possession rose from ${formatNumber(firstEfficiency, 3)} to ${formatNumber(lastEfficiency, 3)}. That is a ${formatPercent(100 * (lastEfficiency / firstEfficiency - 1))} increase in scoring efficiency.`, "Points per possession by season", "Per-possession measures separate tempo from efficiency. They help compare a fast team and a slow team without rewarding either style for simply creating more trips."),
    reportSection("09", `${topEfficiencyTeam?.label || "The leading offense"} led the efficiency table`, `Among teams with at least 100 team-game rows, ${topEfficiencyTeam?.label || "the leader"} produced ${formatNumber(topEfficiencyTeam?.average || 0, 3)} points per estimated possession. The ranking uses a minimum sample so a short hot streak does not dominate the comparison.`, "Efficiency leaders · lollipop ranking", "A team can score a lot because it plays fast. Points per possession asks the more useful scouting question: how well does each trip produce?"),
    reportSection("10", `Three-point attempts rose from ${formatPercent(firstThree)} to ${formatPercent(lastThree)} of field-goal attempts`, `Three-point attempt rate measures shot selection, not shooting accuracy. The change across the five seasons is ${formatNumber(lastThree - firstThree)} percentage points, showing why shot volume belongs in the dashboard as context rather than in the core odds formula.`, "Three-point attempt rate by season", "Shot mix is a style fingerprint. It helps explain how teams create offense without confusing volume with winning probability."),
  ].join("");

  renderLine(document.getElementById("report-chart-01"), seasonGames.map((item) => ({ label: item.label, value: item.rows })), { digits: 0, label: "Games by season" });
  renderLine(document.getElementById("report-chart-02"), modelQuartiles.map((item) => ({ label: item.label, value: item.average })), { label: "Postseason win rate by factor-score quartile", valueFormat: (value) => formatPercent(value) });
  renderRadar(document.getElementById("report-chart-03"), factorWeights, { label: "Relative weight of each March factor", valueFormat: (value) => formatPercent(value) });
  renderDumbbell(document.getElementById("report-chart-04"), efgByResult.map((item) => ({ label: item.label, value: item.average })), { label: "Effective field-goal percentage by result", valueFormat: (value) => formatPercent(value), subtitle: "Higher is better" });
  renderDumbbell(document.getElementById("report-chart-05"), turnoverRateByResult.map((item) => ({ label: item.label, value: item.average })), { label: "Turnover rate by result", valueFormat: (value) => formatPercent(value), subtitle: "Lower is better" });
  renderDumbbell(document.getElementById("report-chart-06"), orbRateByResult.map((item) => ({ label: item.label, value: item.average })), { label: "Offensive-rebound rate by result", valueFormat: (value) => formatPercent(value), subtitle: "Higher is better" });
  renderDumbbell(document.getElementById("report-chart-07"), freeThrowRateByResult.map((item) => ({ label: item.label, value: item.average })), { label: "Free-throw rate by result", valueFormat: (value) => formatPercent(value), subtitle: "Higher is opportunity" });
  renderLine(document.getElementById("report-chart-08"), seasonEfficiency.map((item) => ({ label: item.label, value: item.average })), { label: "Points per possession by season", valueFormat: (value) => formatNumber(value, 3) });
  renderLollipops(document.getElementById("report-chart-09"), teamEfficiency.map((item) => ({ label: item.label, value: item.average })), { top: 8, label: "Top teams by points per possession", valueFormat: (value) => formatNumber(value, 3) });
  renderLine(document.getElementById("report-chart-10"), seasonThreeRate.map((item) => ({ label: item.label, value: item.average })), { label: "Three-point attempt rate by season", valueFormat: (value) => formatPercent(value) });

  const dropped = quality.dropped_rows ?? 0;
  document.getElementById("methodology-copy").innerHTML = `Source: public ESPN men's college basketball team box scores released through SportsDataverse, joined to the public 2026 Division I team crosswalk. The raw files contain one row per team per game; seasons 2022–2026 were combined, rows whose team ID was absent from the Division I crosswalk or missing a required team/opponent score were dropped (${formatNumber(dropped, 0)} rows), and the final file contains ${formatNumber(rows.length, 0)} rows, ${formatNumber(unique(rows, "teamId"), 0)} team IDs, ${formatNumber(unique(rows, "team"), 0)} display-name values, and ${formatNumber(gameRows.length, 0)} unique games. A team-game row is the unit of analysis, while unique game counts use each game ID once. Report and dashboard averages are arithmetic means of nonmissing team-game values; points per possession equals points ÷ estimated possessions; three-point attempt rate equals 3PA ÷ FGA × 100; effective field-goal percentage equals (FGM + 0.5 × 3PM) ÷ FGA × 100; offensive-rebound rate equals ORB ÷ (ORB + opponent DRB) × 100; free-throw rate equals FTA ÷ FGA × 100; estimated possessions equal FGA − ORB + turnovers + 0.44 × FTA; turnover rate equals turnovers ÷ estimated possessions × 100; win rate equals wins ÷ team-game rows × 100; and every displayed margin is team score minus opponent score. The March model averages each team-season's regular-season factor values, standardizes them by the mean and population standard deviation among team-seasons with postseason games, fits a ridge-regularized weighted logistic regression to postseason wins out of postseason team-game rows, converts the result to p = 1 ÷ (1 + e⁻ˡᵒᵍⁱᵗ), and reports a six-game title-path proxy as p⁶. It is a transparent historical postseason signal, not a literal NCAA bracket probability.`;
}

const measureDefinitions = {
  points: { label: "Average points", key: "points", format: (value) => formatNumber(value) },
  winRate: { label: "Win rate", key: "win", format: (value) => formatPercent(value) },
  threePA: { label: "Average 3PA", key: "threePA", format: (value) => formatNumber(value) },
  threeRate: { label: "3-point shot attempt rate", key: "threeRate", format: (value) => formatPercent(value) },
  efg: { label: "Effective FG%", key: "efg", format: (value) => formatPercent(value) },
  turnoverRate: { label: "Turnover rate", key: "turnoverRate", format: (value) => formatPercent(value) },
  orbRate: { label: "Offensive-rebound rate", key: "orbRate", format: (value) => formatPercent(value) },
  freeThrowRate: { label: "Free-throw rate", key: "freeThrowRate", format: (value) => formatPercent(value) },
  rebounds: { label: "Average rebounds", key: "rebounds", format: (value) => formatNumber(value) },
  pointsInPaint: { label: "Shots around rim (paint points proxy)", key: "pointsInPaint", format: (value) => formatNumber(value) },
  freeThrowAttempts: { label: "Free throw attempts", key: "fta", format: (value) => formatNumber(value) },
  steals: { label: "Steals", key: "steals", format: (value) => formatNumber(value) },
  blocks: { label: "Blocks", key: "blocks", format: (value) => formatNumber(value) },
  turnovers: { label: "Average turnovers", key: "turnovers", format: (value) => formatNumber(value) },
  possessions: { label: "Number of possessions", key: "possessions", format: (value) => formatNumber(value) },
};

const breakdownDefinitions = {
  season: { label: "Season", key: (row) => row.seasonLabel, filterId: "filter-season" },
  conference: { label: "Conference", key: (row) => row.conference, filterId: "filter-conference" },
  venue: { label: "Venue", key: (row) => row.venue, filterId: "filter-venue" },
  team: { label: "Team", key: (row) => row.team, filterId: "filter-team" },
};

function measureValue(row, measureKey) {
  return number(row[measureDefinitions[measureKey].key]);
}

function selectedRows(rows) {
  const season = document.getElementById("filter-season").value;
  const teams = selectedTeams();
  const conference = document.getElementById("filter-conference").value;
  const venue = document.getElementById("filter-venue").value;
  const result = document.getElementById("filter-result").value;
  return rows.filter((row) =>
    (season === "all" || row.seasonLabel === season) &&
    (!teams.length || teams.includes(row.team)) &&
    (conference === "all" || row.conference === conference) &&
    (venue === "all" || row.venue === venue) &&
    (result === "all" || row.result === result)
  );
}

function aggregateForDashboard(rows, measureKey, breakdownKey) {
  const definition = breakdownDefinitions[breakdownKey];
  const measure = (row) => measureValue(row, measureKey);
  return groupRows(rows, definition.key, measure)
    .map((item) => ({ ...item, value: item.average }))
    .filter((item) => item.rows > 0 && Number.isFinite(item.value))
    .sort((a, b) => b.value - a.value);
}

function optionValues(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function fillSelect(selectId, values, allLabel) {
  const select = document.getElementById(selectId);
  select.innerHTML = `<option value="all">${escapeHtml(allLabel)}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
}

function fillMultiSelect(selectId, values) {
  const select = document.getElementById(selectId);
  select.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
}

function selectedTeams() {
  const select = document.getElementById("filter-team");
  return select ? [...select.selectedOptions].map((option) => option.value).filter(Boolean) : [];
}

function setFilterValue(select, value) {
  if (!select) return;
  if (select.multiple) {
    [...select.options].forEach((option) => { option.selected = option.value === value; });
  } else {
    select.value = value;
  }
}

function fillChoiceSelect(selectId, values, placeholder) {
  const select = document.getElementById(selectId);
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
}

function syncComparisonTeamsToConference(rows) {
  const conferenceSelect = document.getElementById("filter-conference");
  const conference = conferenceSelect?.value || "all";
  const previousSelectedTeams = new Set(selectedTeams());
  const previousCompareA = document.getElementById("compare-team-a")?.value || "";
  const previousCompareB = document.getElementById("compare-team-b")?.value || "";
  const previousScenario = document.getElementById("scenario-team")?.value || "";
  const scopedRows = conference === "all" ? rows : rows.filter((row) => row.conference === conference);
  const teams = optionValues(scopedRows, "team");

  fillMultiSelect("filter-team", teams);
  [...document.getElementById("filter-team").options].forEach((option) => {
    option.selected = previousSelectedTeams.has(option.value);
  });
  fillChoiceSelect("compare-team-a", teams, conference === "all" ? "Choose team one" : `Choose ${conference} team one`);
  fillChoiceSelect("compare-team-b", teams, conference === "all" ? "Choose team two" : `Choose ${conference} team two`);
  fillChoiceSelect("scenario-team", teams, conference === "all" ? "Choose a team" : `Choose a ${conference} team`);

  const chooseTeam = (previous, fallbackIndex) => teams.includes(previous) ? previous : (teams[fallbackIndex] || "");
  document.getElementById("compare-team-a").value = chooseTeam(previousCompareA, 0);
  document.getElementById("compare-team-b").value = chooseTeam(previousCompareB, 1);
  document.getElementById("scenario-team").value = chooseTeam(previousScenario, 0);

  const help = document.getElementById("team-filter-help");
  if (help) help.textContent = conference === "all"
    ? "Choose one or more programs. Leave this empty to view the full Division I panel."
    : `${formatNumber(teams.length, 0)} ${conference} teams are loaded into the comparison selectors. Select multiple for a season race.`;
}

function renderActiveFilters(rows) {
  const container = document.getElementById("active-filters");
  if (!container) return;
  const filters = [
    ["filter-season", "Season"],
    ["filter-conference", "Conference"],
    ["filter-venue", "Venue"],
    ["filter-result", "Result"],
  ].map(([id, label]) => {
    const select = document.getElementById(id);
    return { id, label, value: select.value, text: select.options[select.selectedIndex]?.textContent || select.value };
  }).filter((filter) => filter.value !== "all");
  const teams = selectedTeams();
  if (teams.length) filters.unshift({ id: "filter-team", label: "Teams", value: teams.join("|"), text: teams.length > 2 ? `${teams.slice(0, 2).join(", ")} +${teams.length - 2} more` : teams.join(", ") });

  if (!filters.length) {
    container.innerHTML = `<span class="active-filter-empty">No filters pinned. Click a chart mark to lock in a view.</span>`;
    return;
  }
  container.innerHTML = filters.map((filter) => `<button type="button" class="filter-chip" data-clear-filter="${escapeHtml(filter.id)}"><span>${escapeHtml(filter.label)}</span>${escapeHtml(filter.text)} <b aria-hidden="true">×</b></button>`).join("");
  container.querySelectorAll("[data-clear-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const select = document.getElementById(button.dataset.clearFilter);
      if (select.multiple) [...select.options].forEach((option) => { option.selected = false; });
      else select.value = "all";
      updateDashboard(rows);
    });
  });
}

function renderSelectedTeamIdentity() {
  const container = document.getElementById("selected-team-identity");
  if (!container) return;
  const teams = selectedTeams();
  container.innerHTML = teams.length
    ? `<span class="selection-label">Selected team lens</span>${teams.map((team) => `<span class="selected-team-pill">${teamLogoMarkup(team)}<span>${escapeHtml(team)}</span></span>`).join("")}`
    : `<span class="selection-label">All teams visible · select multiple programs to focus the comparison.</span>`;
}

function renderComparisonIdentities() {
  const container = document.getElementById("comparison-identities");
  if (!container) return;
  const teamA = document.getElementById("compare-team-a").value;
  const teamB = document.getElementById("compare-team-b").value;
  container.innerHTML = teamA && teamB
    ? `<span class="comparison-team-identity">${teamLogoMarkup(teamA, "team-logo team-logo-small")}<strong>${escapeHtml(teamA)}</strong></span><span class="vs-mark">VS</span><span class="comparison-team-identity">${teamLogoMarkup(teamB, "team-logo team-logo-small")}<strong>${escapeHtml(teamB)}</strong></span>`
    : "";
}

function renderTeamDNA(rows, model) {
  const grid = document.getElementById("team-dna-grid");
  const status = document.getElementById("team-dna-status");
  const teamA = document.getElementById("compare-team-a").value;
  const teamB = document.getElementById("compare-team-b").value;
  const season = document.getElementById("filter-season").value;
  if (!teamA || !teamB || teamA === teamB) {
    status.textContent = "Choose two different teams to build their profiles.";
    grid.innerHTML = `<div class="empty-chart">Choose two different teams to display their Team DNA.</div>`;
    return;
  }

  const profiles = [getTeamModelProfile(model, rows, teamA, season), getTeamModelProfile(model, rows, teamB, season)];
  if (profiles.some((profile) => !profile)) {
    status.textContent = "One of these teams does not have enough regular-season rows for a profile.";
    grid.innerHTML = `<div class="empty-chart">Not enough regular-season data for both team profiles.</div>`;
    return;
  }

  status.textContent = `Regular-season profiles · ${season === "all" ? "latest available season" : season}`;
  grid.innerHTML = profiles.map((profile, index) => {
    const accent = index === 0 ? "dna-card-a" : "dna-card-b";
    const score = formatPercent(100 * profile.titlePathProbability);
    return `<article class="dna-card ${accent}">
      <div class="dna-card-top"><div><span class="card-label">${index === 0 ? "Team one" : "Team two"}</span><div class="dna-team-name">${teamLogoMarkup(profile.team, "team-logo team-logo-large")}<h3>${escapeHtml(profile.team)}</h3></div><span class="dna-style">${escapeHtml(teamStyle(profile))}</span></div><div class="dna-score"><strong>${score}</strong><span>March profile</span></div></div>
      <div class="dna-metrics">${MARCH_MODEL.features.map((feature) => {
        const zScore = profile.zScores[feature.key] || 0;
        const strength = Math.max(8, Math.min(92, 50 + getFeatureStrength(profile, feature) * 17));
        return `<div class="dna-metric"><div><span>${escapeHtml(feature.label)}</span><strong>${formatPercent(profile[feature.key])}</strong></div><div class="dna-track"><span style="width:${strength}%"></span><i aria-hidden="true"></i></div><small>${zScore >= 0 ? "+" : "−"}${formatNumber(Math.abs(zScore), 1)} standard deviations vs postseason reference</small></div>`;
      }).join("")}</div>
    </article>`;
  }).join("");
}

function renderMatchupInsights(rows, model) {
  const container = document.getElementById("matchup-insights");
  const teamA = document.getElementById("compare-team-a").value;
  const teamB = document.getElementById("compare-team-b").value;
  const season = document.getElementById("filter-season").value;
  if (!container || !teamA || !teamB || teamA === teamB) {
    if (container) container.innerHTML = "";
    return;
  }
  const profileA = getTeamModelProfile(model, rows, teamA, season);
  const profileB = getTeamModelProfile(model, rows, teamB, season);
  if (!profileA || !profileB) {
    container.innerHTML = `<div class="empty-chart">Not enough regular-season data to calculate the four-factor matchup edge.</div>`;
    return;
  }

  const edges = MARCH_MODEL.features.map((feature) => {
    const valueA = profileA[feature.key];
    const valueB = profileB[feature.key];
    const signedModelEdge = feature.coefficient * (valueA - valueB);
    const winner = signedModelEdge >= 0 ? teamA : teamB;
    return { feature, valueA, valueB, winner, difference: Math.abs(valueA - valueB), signedModelEdge };
  }).sort((a, b) => Math.abs(b.signedModelEdge) - Math.abs(a.signedModelEdge));
  const strongest = edges[0];
  const counter = edges[1];
  const lead = strongest.winner;
  const other = lead === teamA ? teamB : teamA;
  container.innerHTML = `<div class="matchup-insight-copy"><span class="eyebrow">Four-factor scouting read</span><strong>${escapeHtml(lead)} owns the biggest model edge.</strong><p>${escapeHtml(lead)} leads ${escapeHtml(strongest.feature.label.toLowerCase())} by ${formatNumber(strongest.difference)} percentage points. ${escapeHtml(other)} counters with ${escapeHtml(counter.feature.label.toLowerCase())}. Click a card to keep exploring the matchup.</p></div><div class="matchup-edge-grid">${edges.map((edge) => {
    const winnerIsA = edge.winner === teamA;
    return `<button type="button" class="matchup-edge-card ${winnerIsA ? "edge-a" : "edge-b"}" data-matchup-feature="${escapeHtml(edge.feature.key)}"><span class="card-label">${escapeHtml(edge.feature.shortLabel)}</span><strong>${teamLogoMarkup(edge.winner, "team-logo team-logo-tiny")}${escapeHtml(edge.winner)}</strong><span>${formatNumber(edge.difference)} pp edge</span><small>${escapeHtml(teamA)} ${formatPercent(edge.valueA)} · ${escapeHtml(teamB)} ${formatPercent(edge.valueB)}</small></button>`;
  }).join("")}</div>`;
  container.querySelectorAll("[data-matchup-feature]").forEach((card) => {
    card.addEventListener("click", () => {
      document.getElementById("measure-select").value = card.dataset.matchupFeature;
      document.getElementById("breakdown-select").value = "team";
      updateDashboard(rows);
      renderConceptExplainer(card.dataset.matchupFeature, rows, model);
      document.getElementById("concept-explainer")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

function renderScenarioSliders() {
  const container = document.getElementById("scenario-sliders");
  if (!container) return;
  container.innerHTML = MARCH_MODEL.features.map((feature) => `<label class="scenario-slider" for="scenario-${feature.key}"><span><b>${escapeHtml(feature.label)}</b><output id="scenario-output-${feature.key}">0.0 pp</output></span><input id="scenario-${feature.key}" type="range" min="-3" max="3" step="0.1" value="0" data-scenario-feature="${escapeHtml(feature.key)}" aria-label="Change ${escapeHtml(feature.label)} by percentage points"><small>Move by percentage points · ${escapeHtml(feature.definition)}</small></label>`).join("");
}

function updateScenario(model, rows) {
  const team = document.getElementById("scenario-team")?.value;
  const season = document.getElementById("filter-season")?.value || "all";
  const profile = getTeamModelProfile(model, rows, team, season);
  const probability = document.getElementById("scenario-probability");
  const baseline = document.getElementById("scenario-baseline");
  const insight = document.getElementById("scenario-insight");
  if (!profile) {
    probability.textContent = "—";
    baseline.textContent = "Choose a team with regular-season data.";
    insight.textContent = "The model will explain which change moved the estimate.";
    return;
  }

  const adjusted = { ...profile };
  const changes = [];
  MARCH_MODEL.features.forEach((feature) => {
    const input = document.getElementById(`scenario-${feature.key}`);
    const output = document.getElementById(`scenario-output-${feature.key}`);
    const delta = Number(input?.value || 0);
    adjusted[feature.key] = profile[feature.key] + delta;
    if (output) output.textContent = `${delta >= 0 ? "+" : "−"}${formatNumber(Math.abs(delta), 1)} pp`;
    if (delta) changes.push({ feature, delta });
  });
  const scenario = scoreMarchMetrics(adjusted, model);
  const basePercent = 100 * profile.titlePathProbability;
  const scenarioPercent = 100 * scenario.titlePathProbability;
  probability.textContent = formatPercent(scenarioPercent);
  baseline.textContent = `${profile.team} baseline: ${formatPercent(basePercent)} · ${profile.seasonLabel}`;
  if (!changes.length) {
    insight.textContent = "Move a slider to test how a better or worse factor profile changes the estimate.";
    return;
  }
  const change = scenarioPercent - basePercent;
  const strongestChange = changes.sort((a, b) => Math.abs(b.delta * b.feature.coefficient) - Math.abs(a.delta * a.feature.coefficient))[0];
  const direction = change >= 0 ? "up" : "down";
  insight.textContent = `${strongestChange.feature.label} is the biggest modeled lever in this scenario. The estimated title path moves ${direction} ${formatNumber(Math.abs(change), 2)} percentage points.`;
}

const DASHBOARD_MODES = {
  scout: { badge: "Scouting lens · 2022–2026", title: "Read the game<br><span>like a scout.</span>", description: "Keep every control available and build a custom scouting report.", measure: "efg", breakdown: "season" },
  march: { badge: "March lens · four factors", title: "Find the edge<br><span>that travels.</span>", description: "Put effective shooting, ball security, second chances, and pressure at the line in the spotlight.", measure: "efg", breakdown: "team" },
  fan: { badge: "Fan lens · big picture", title: "Make the numbers<br><span>feel like a game.</span>", description: "See team stories, scoring, and rankings first; switch back to Scout or March mode for deeper detail.", measure: "points", breakdown: "team" },
};

function setDashboardMode(mode, rows) {
  const config = DASHBOARD_MODES[mode] || DASHBOARD_MODES.scout;
  document.body.dataset.dashboardMode = mode;
  document.querySelectorAll("[data-dashboard-mode]").forEach((button) => {
    const isActive = button.dataset.dashboardMode === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  document.getElementById("dashboard-mode-badge").textContent = config.badge;
  document.getElementById("dashboard-heading-title").innerHTML = config.title;
  document.getElementById("mode-description").textContent = config.description;
  document.getElementById("measure-select").value = config.measure;
  document.getElementById("breakdown-select").value = config.breakdown;
  updateDashboard(rows);
}

let dashboardModel = null;

function comparisonRows(rows) {
  const season = document.getElementById("filter-season").value;
  const conference = document.getElementById("filter-conference").value;
  const venue = document.getElementById("filter-venue").value;
  const result = document.getElementById("filter-result").value;
  return rows.filter((row) =>
    (season === "all" || row.seasonLabel === season) &&
    (conference === "all" || row.conference === conference) &&
    (venue === "all" || row.venue === venue) &&
    (result === "all" || row.result === result)
  );
}

function conferenceHeadToHeadRows(rows, teamA, teamB) {
  const season = document.getElementById("filter-season").value;
  const games = new Map();
  rows.forEach((row) => {
    if (row.seasonPhase !== "Regular season") return;
    if (season !== "all" && row.seasonLabel !== season) return;
    const isMatchupRow = (row.team === teamA && row.opponent === teamB) || (row.team === teamB && row.opponent === teamA);
    if (!isMatchupRow) return;
    if (!games.has(row.gameId)) games.set(row.gameId, []);
    games.get(row.gameId).push(row);
  });

  return [...games.values()]
    .map((game) => {
      const rowA = game.find((row) => row.team === teamA);
      const rowB = game.find((row) => row.team === teamB);
      if (!rowA || !rowB || !rowA.conference || rowA.conference !== rowB.conference) return null;
      return {
        gameId: rowA.gameId,
        seasonLabel: rowA.seasonLabel,
        date: rowA.date || rowB.date,
        conference: rowA.conference,
        teamAScore: rowA.points,
        teamBScore: rowB.points,
        teamAWon: rowA.win === 1,
        teamAVenue: rowA.venue,
        teamBVenue: rowB.venue,
        margin: Math.abs(rowA.margin ?? 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function clearHeadToHead(message = "Choose two teams to see the matchup history.", teamA = "", teamB = "") {
  document.getElementById("matchup-status").textContent = message;
  document.getElementById("matchup-meetings").textContent = teamA && teamB ? "0" : "—";
  document.getElementById("matchup-team-a-label").textContent = teamA ? `${teamA} record` : "Team one record";
  document.getElementById("matchup-team-b-label").textContent = teamB ? `${teamB} record` : "Team two record";
  document.getElementById("matchup-team-a-record").textContent = teamA && teamB ? "0–0" : "—";
  document.getElementById("matchup-team-b-record").textContent = teamA && teamB ? "0–0" : "—";
  document.getElementById("matchup-average-margin").textContent = "—";
  document.getElementById("matchup-table-body").innerHTML = `<tr><td colspan="6" class="empty-cell">${escapeHtml(message)}</td></tr>`;
  emptyChart(document.getElementById("dashboard-chart-matchup"), "Choose two teams to display their conference meetings.");
}

function updateHeadToHead(rows) {
  const teamA = document.getElementById("compare-team-a").value;
  const teamB = document.getElementById("compare-team-b").value;
  if (!teamA || !teamB) return clearHeadToHead();
  if (teamA === teamB) return clearHeadToHead("Choose two different teams for a head-to-head matchup.");

  const meetings = conferenceHeadToHeadRows(rows, teamA, teamB);
  const teamAWins = meetings.filter((meeting) => meeting.teamAWon).length;
  const teamBWins = meetings.length - teamAWins;
  const averageMargin = meetings.length ? mean(meetings, "margin") : 0;
  const status = document.getElementById("matchup-status");
  document.getElementById("matchup-team-a-label").textContent = `${teamA} record`;
  document.getElementById("matchup-team-b-label").textContent = `${teamB} record`;
  document.getElementById("matchup-meetings").textContent = formatNumber(meetings.length, 0);
  document.getElementById("matchup-team-a-record").textContent = `${teamAWins}–${teamBWins}`;
  document.getElementById("matchup-team-b-record").textContent = `${teamBWins}–${teamAWins}`;
  document.getElementById("matchup-average-margin").textContent = formatNumber(averageMargin);

  if (!meetings.length) {
    return clearHeadToHead(`No regular-season same-conference meetings found for ${teamA} and ${teamB} in the selected season filter.`, teamA, teamB);
  }

  status.textContent = `${meetings.length} regular-season conference meeting${meetings.length === 1 ? "" : "s"} found for ${teamA} and ${teamB}. Postseason games are excluded.`;
  const series = [
    { label: teamA, values: meetings.map((meeting) => ({ label: meeting.date, value: meeting.teamAScore })) },
    { label: teamB, values: meetings.map((meeting) => ({ label: meeting.date, value: meeting.teamBScore })) },
  ];
  renderComparisonLine(document.getElementById("dashboard-chart-matchup"), series, { label: `Conference meeting scores for ${teamA} and ${teamB}`, valueFormat: (value) => formatNumber(value, 0), height: 340 });

  document.getElementById("matchup-table-body").innerHTML = meetings.map((meeting) => {
    const winner = meeting.teamAWon ? teamA : teamB;
    const venue = `${teamA}: ${meeting.teamAVenue}; ${teamB}: ${meeting.teamBVenue}`;
    return `<tr>
      <td>${escapeHtml(meeting.seasonLabel)}</td>
      <td>${escapeHtml(meeting.date)}</td>
      <td><strong>${escapeHtml(winner)}</strong></td>
      <td>${escapeHtml(teamA)} ${formatNumber(meeting.teamAScore, 0)}–${formatNumber(meeting.teamBScore, 0)} ${escapeHtml(teamB)}</td>
      <td>${formatNumber(meeting.margin, 0)}</td>
      <td>${escapeHtml(venue)}</td>
    </tr>`;
  }).join("");
}

function updateTeamComparison(rows, measureKey) {
  const teamA = document.getElementById("compare-team-a").value;
  const teamB = document.getElementById("compare-team-b").value;
  const status = document.getElementById("comparison-status");
  const chart = document.getElementById("dashboard-chart-compare");
  const measure = measureDefinitions[measureKey];

  if (!teamA || !teamB) {
    status.textContent = "Choose two teams to begin.";
    return emptyChart(chart, "Choose two teams to display a comparison.");
  }
  if (teamA === teamB) {
    status.textContent = "Choose two different teams for a head-to-head comparison.";
    return emptyChart(chart, "The two comparison teams must be different.");
  }

  const filteredRows = comparisonRows(rows);
  const seasons = optionValues(filteredRows, "seasonLabel").sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  const lines = [teamA, teamB].map((team) => {
    const teamRows = filteredRows.filter((row) => row.team === team);
    const grouped = groupRows(teamRows, (row) => row.seasonLabel, (row) => measureValue(row, measureKey));
    const averages = new Map(grouped.map((item) => [item.label, item.average]));
    return {
      label: team,
      values: seasons.map((season) => ({ label: season, value: averages.get(season) })),
      rows: teamRows.length,
      color: teamColor(team),
    };
  });

  const available = lines.filter((line) => line.rows > 0);
  status.textContent = `${measure.label} comparison for ${teamA} and ${teamB}. ${formatNumber(lines[0].rows + lines[1].rows, 0)} team-game rows match the comparison filters.`;
  renderComparisonLine(chart, lines, { label: `${measure.label} comparison for ${teamA} and ${teamB}`, valueFormat: measure.format, height: 340 });
  if (!available.length) status.textContent = `No rows match the comparison filters for ${teamA} or ${teamB}.`;
}

function updateMultiTeamComparison(rows, measureKey) {
  const selected = selectedTeams();
  const status = document.getElementById("multi-comparison-status");
  const chart = document.getElementById("dashboard-chart-multi");
  if (selected.length < 2) {
    status.textContent = "Select at least two teams in Control the context to start a multi-team race.";
    return emptyChart(chart, "Select at least two teams to compare their season profiles.");
  }
  const visibleTeams = selected.slice(0, 8);
  const filteredRows = comparisonRows(rows).filter((row) => visibleTeams.includes(row.team));
  const seasons = optionValues(filteredRows, "seasonLabel").sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  const series = visibleTeams.map((team) => {
    const teamRows = filteredRows.filter((row) => row.team === team);
    const grouped = groupRows(teamRows, (row) => row.seasonLabel, (row) => measureValue(row, measureKey));
    const averages = new Map(grouped.map((item) => [item.label, item.average]));
    return { label: team, values: seasons.map((season) => ({ label: season, value: averages.get(season) })), rows: teamRows.length, color: teamColor(team) };
  });
  status.textContent = `${visibleTeams.length} teams on the season race for ${measureDefinitions[measureKey].label.toLowerCase()}.${selected.length > 8 ? " Showing the first eight selected teams." : ""}`;
  renderComparisonLine(chart, series, { label: `${measureDefinitions[measureKey].label} comparison for selected teams`, valueFormat: measureDefinitions[measureKey].format, height: 390 });
}

function updateDashboard(rows) {
  const filtered = selectedRows(rows);
  const measureKey = document.getElementById("measure-select").value;
  const breakdownKey = document.getElementById("breakdown-select").value;
  const measure = measureDefinitions[measureKey];
  const groups = aggregateForDashboard(filtered, measureKey, breakdownKey);
  const seasonal = aggregateForDashboard(filtered, measureKey, "season").sort((a, b) => a.label.localeCompare(b.label));
  const byTeam = aggregateForDashboard(filtered, measureKey, "team");

  document.getElementById("summary-teamgames").textContent = formatNumber(filtered.length, 0);
  document.getElementById("summary-games").textContent = formatNumber(unique(filtered, "gameId"), 0);
  document.getElementById("summary-teams").textContent = formatNumber(unique(filtered, "teamId"), 0);
  document.getElementById("summary-average").textContent = formatPercent(mean(filtered, "efg"));
  document.getElementById("summary-average-label").textContent = "Average effective FG%";
  const mode = DASHBOARD_MODES[document.body.dataset.dashboardMode] || DASHBOARD_MODES.scout;
  document.getElementById("dashboard-status").textContent = `${formatNumber(filtered.length, 0)} team-game rows match the current filters. ${mode.badge} uses ${measure.label.toLowerCase()} and updates in the browser.`;
  renderActiveFilters(rows);
  renderSelectedTeamIdentity();
  renderComparisonIdentities();
  renderHeadToHeadFactorBars(rows, dashboardModel);
  updateTeamComparison(rows, measureKey);
  updateMultiTeamComparison(rows, measureKey);
  updateHeadToHead(rows);
  renderTeamDNA(rows, dashboardModel);
  renderMatchupInsights(rows, dashboardModel);
  updateScenario(dashboardModel, rows);
  const identityTeams = [...new Set([...selectedTeams(), document.getElementById("compare-team-a").value, document.getElementById("compare-team-b").value, document.getElementById("scenario-team").value].filter(Boolean))];
  hydrateTeamIdentities(identityTeams).then(() => {
    renderSelectedTeamIdentity();
    renderComparisonIdentities();
    const hydratedMeasure = document.getElementById("measure-select").value;
    updateTeamComparison(rows, hydratedMeasure);
    updateMultiTeamComparison(rows, hydratedMeasure);
    renderHeadToHeadFactorBars(rows, dashboardModel);
    renderTeamDNA(rows, dashboardModel);
    renderMatchupInsights(rows, dashboardModel);
  });

  const comparison = groups.slice(0, 14).reverse();
  renderBars(document.getElementById("dashboard-chart-bars"), comparison.map((item) => ({ label: item.label, value: item.value })), { label: `${measure.label} by ${breakdownDefinitions[breakdownKey].label}`, valueFormat: measure.format, height: 340, filterId: breakdownDefinitions[breakdownKey].filterId });
  renderLine(document.getElementById("dashboard-chart-line"), seasonal.map((item) => ({ label: item.label, value: item.value })), { label: `${measure.label} by season`, valueFormat: measure.format, height: 340, filterId: "filter-season" });
  renderHorizontal(document.getElementById("dashboard-chart-top"), byTeam.map((item) => ({ label: item.label, value: item.value })), { top: 10, label: `Top teams by ${measure.label.toLowerCase()}`, valueFormat: measure.format, filterId: "filter-team" });
  renderDots(document.getElementById("dashboard-chart-dots"), groups, { label: `${measure.label} and group size`, yLabel: measure.label, height: 340, filterId: breakdownDefinitions[breakdownKey].filterId });

  const table = document.getElementById("dashboard-table-body");
  table.innerHTML = groups.slice(0, 30).map((item) => `<tr>
    <td>${escapeHtml(item.label)}</td>
    <td>${formatNumber(item.rows, 0)}</td>
    <td>${formatNumber(item.games, 0)}</td>
    <td>${measure.format(item.value)}</td>
    <td>${formatPercent(item.winRate)}</td>
    <td>${formatNumber(item.averagePoints)}</td>
  </tr>`).join("") || `<tr><td colspan="6" class="empty-cell">No rows match the current filters.</td></tr>`;
}

function initializeDashboard(rows) {
  dashboardModel = buildMarchModel(rows);
  teamDirectory = new Map();
  rows.forEach((row) => {
    if (!teamDirectory.has(row.team)) teamDirectory.set(row.team, { teamId: row.teamId, abbreviation: row.abbreviation });
  });
  fillSelect("filter-season", optionValues(rows, "seasonLabel"), "All seasons");
  const teams = optionValues(rows, "team");
  fillMultiSelect("filter-team", teams);
  fillSelect("filter-conference", optionValues(rows, "conference"), "All conferences");
  fillSelect("filter-venue", optionValues(rows, "venue"), "All venues");
  fillSelect("filter-result", optionValues(rows, "result"), "All results");
  fillChoiceSelect("compare-team-a", teams, "Choose team one");
  fillChoiceSelect("compare-team-b", teams, "Choose team two");
  fillChoiceSelect("scenario-team", teams, "Choose a team");
  if (teams.length > 1) {
    document.getElementById("compare-team-a").value = teams[0];
    document.getElementById("compare-team-b").value = teams[1];
    document.getElementById("scenario-team").value = teams[0];
  }
  syncComparisonTeamsToConference(rows);
  renderScenarioSliders();

  ["filter-season", "filter-team", "filter-conference", "filter-venue", "filter-result", "measure-select", "breakdown-select", "compare-team-a", "compare-team-b"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      if (id === "filter-conference") syncComparisonTeamsToConference(rows);
      updateDashboard(rows);
    });
  });
  document.getElementById("scenario-team").addEventListener("change", () => updateScenario(dashboardModel, rows));
  document.querySelectorAll("[data-scenario-feature]").forEach((input) => input.addEventListener("input", () => updateScenario(dashboardModel, rows)));
  document.getElementById("reset-scenario").addEventListener("click", () => {
    document.querySelectorAll("[data-scenario-feature]").forEach((input) => { input.value = "0"; });
    updateScenario(dashboardModel, rows);
  });
  document.querySelectorAll("[data-dashboard-mode]").forEach((button) => {
    button.addEventListener("click", () => setDashboardMode(button.dataset.dashboardMode, rows));
  });

  document.getElementById("reset-filters").addEventListener("click", () => {
    ["filter-season", "filter-conference", "filter-venue", "filter-result"].forEach((id) => { document.getElementById(id).value = "all"; });
    [...document.getElementById("filter-team").options].forEach((option) => { option.selected = false; });
    document.getElementById("measure-select").value = "efg";
    document.getElementById("breakdown-select").value = "season";
    syncComparisonTeamsToConference(rows);
    if (teams.length > 1) {
      document.getElementById("compare-team-a").value = teams[0];
      document.getElementById("compare-team-b").value = teams[1];
    }
    updateDashboard(rows);
  });
  setDashboardMode("scout", rows);
}

function showError(error) {
  document.querySelectorAll(".loading").forEach((element) => {
    element.classList.remove("loading");
    element.innerHTML = `<strong>Data could not be loaded.</strong><br>${escapeHtml(error.message)}<br><small>Use a local web server when testing this project; GitHub Pages serves the files correctly.</small>`;
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const { rows, quality } = await loadDataset();
    if (document.body.dataset.page === "report") renderReport(rows, quality);
    if (document.body.dataset.page === "dashboard") initializeDashboard(rows);
    document.querySelectorAll(".loading").forEach((element) => element.classList.remove("loading"));
  } catch (error) {
    showError(error);
  }
});
