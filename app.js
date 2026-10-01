const DATA_URL = "data/team_box_2022_2026.csv";
const QUALITY_URL = "data/quality.json";

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

async function loadDataset() {
  const [dataResponse, qualityResponse] = await Promise.all([
    fetch(DATA_URL),
    fetch(QUALITY_URL),
  ]);
  if (!dataResponse.ok) throw new Error(`Could not load ${DATA_URL}`);
  const dataText = await dataResponse.text();
  const rows = parseCSV(dataText).map(normalizeRow).filter((row) => row.teamId && row.team);
  const quality = qualityResponse.ok ? await qualityResponse.json() : {};
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

function emptyChart(container, message = "No rows match these filters.") {
  container.innerHTML = `<div class="empty-chart">${escapeHtml(message)}</div>`;
}

function chartFrame(width, height, content, label) {
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}" preserveAspectRatio="none">${content}</svg>`;
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
    content += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" class="chart-bar"/>`;
    content += svgText(x + barWidth / 2, y - 8, options.valueFormat ? options.valueFormat(item.value) : formatNumber(item.value), 'class="chart-value" text-anchor="middle"');
    content += `<text x="${x + barWidth / 2}" y="${height - margin.bottom + 22}" class="chart-label" text-anchor="end" transform="rotate(-35 ${x + barWidth / 2} ${height - margin.bottom + 22})">${escapeHtml(shortLabel(item.label, 22))}</text>`;
  });

  container.innerHTML = chartFrame(width, height, content, options.label || "Bar chart");
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
    content += `<circle cx="${point.x}" cy="${point.y}" r="5" class="chart-dot"/>`;
    content += svgText(point.x, height - 18, shortLabel(point.label, 15), 'class="chart-label" text-anchor="middle"');
    content += svgText(point.x, point.y - 12, options.valueFormat ? options.valueFormat(point.value) : formatNumber(point.value), 'class="chart-value" text-anchor="middle"');
  });

  container.innerHTML = chartFrame(width, height, content, options.label || "Line chart");
}

function renderComparisonLine(container, series, options = {}) {
  const availableSeries = series
    .map((line) => ({ ...line, values: line.values.filter((item) => Number.isFinite(item.value)) }))
    .filter((line) => line.values.length);
  if (!availableSeries.length) return emptyChart(container, "No comparison rows match these filters.");

  const width = 760;
  const height = options.height || 340;
  const margin = { top: 58, right: 22, bottom: 54, left: 52 };
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
    const lineClass = lineIndex === 0 ? "chart-line" : "chart-line-alt";
    const dotClass = lineIndex === 0 ? "chart-dot-primary" : "chart-dot-alt";
    if (points.length > 1) content += `<polyline points="${points.map((point) => `${point.x},${point.y}`).join(" ")}" class="${lineClass}"/>`;
    points.forEach((point) => {
      content += `<circle cx="${point.x}" cy="${point.y}" r="5" class="${dotClass}"><title>${escapeHtml(line.label)} · ${escapeHtml(point.label)}: ${escapeHtml(options.valueFormat ? options.valueFormat(point.value) : formatNumber(point.value))}</title></circle>`;
      content += svgText(point.x, point.y - 12, options.valueFormat ? options.valueFormat(point.value) : formatNumber(point.value), 'class="chart-value" text-anchor="middle"');
    });
  });

  labels.forEach((label, index) => {
    const x = margin.left + index * step;
    content += svgText(x, height - 18, shortLabel(label, 15), 'class="chart-label" text-anchor="middle"');
  });

  availableSeries.forEach((line, index) => {
    const x = margin.left + index * 230;
    const colorClass = index === 0 ? "chart-line" : "chart-line-alt";
    content += `<line x1="${x}" y1="25" x2="${x + 24}" y2="25" class="${colorClass}"/>`;
    content += svgText(x + 32, 29, shortLabel(line.label, 26), 'class="chart-legend"');
  });

  container.innerHTML = chartFrame(width, height, content, options.label || "Two-team comparison line chart");
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
    content += svgText(margin.left - 10, y + 17, shortLabel(item.label, 23), 'class="chart-label" text-anchor="end"');
    content += `<rect x="${margin.left}" y="${y + 4}" width="${barWidth}" height="20" rx="4" class="chart-bar chart-bar-alt"/>`;
    content += svgText(margin.left + barWidth + 8, y + 19, options.valueFormat ? options.valueFormat(item.value) : formatNumber(item.value), 'class="chart-value"');
  });

  container.innerHTML = chartFrame(width, height, content, options.label || "Horizontal bar chart");
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
    content += `<circle cx="${x}" cy="${y}" r="5" class="chart-dot chart-dot-soft"><title>${escapeHtml(item.label)}: ${formatNumber(item.value)}</title></circle>`;
  });
  content += svgText(width / 2, height - 15, "Rows in group", 'class="chart-axis" text-anchor="middle"');
  content += `<text x="16" y="${height / 2}" class="chart-axis" text-anchor="middle" transform="rotate(-90 16 ${height / 2})">${escapeHtml(options.yLabel || "Value")}</text>`;
  container.innerHTML = chartFrame(width, height, content, options.label || "Dot chart");
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
  const seasons = [...new Set(rows.map((row) => row.seasonLabel))].sort();
  const firstSeason = seasons[0];
  const lastSeason = seasons[seasons.length - 1];
  const seasonGames = groupRows(gameRows, (row) => row.seasonLabel, () => 1).sort((a, b) => a.label.localeCompare(b.label));
  const seasonThreeRate = getSeasonGroups(rows, "threeRate");
  const seasonPace = getSeasonGroups(rows, "possessions");
  const seasonEfficiency = groupRows(rows, (row) => row.seasonLabel, (row) => row.possessions ? row.points / row.possessions : null).sort((a, b) => a.label.localeCompare(b.label));
  const closeGameRate = groupRows(gameRows, (row) => row.seasonLabel, (row) => Math.abs(row.margin) <= 5 ? 100 : 0).sort((a, b) => a.label.localeCompare(b.label));
  const homeAway = groupRows(rows, (row) => row.venue, (row) => row.win).sort((a, b) => a.label.localeCompare(b.label));
  const homeAwayBySeason = ["Home", "Away"].map((venue) => ({
    label: `${venue} win rate`,
    values: seasons.map((season) => {
      const group = rows.filter((row) => row.seasonLabel === season && row.venue === venue);
      return { label: season, value: group.length ? 100 * mean(group, "win") : null };
    }),
  }));
  const turnoverRateByResult = groupRows(rows, (row) => row.result, (row) => row.turnoverRate).sort((a, b) => a.label.localeCompare(b.label));
  const efgByResult = groupRows(rows, (row) => row.result, (row) => row.efg).sort((a, b) => a.label.localeCompare(b.label));
  const ftaByResult = groupRows(rows, (row) => row.result, (row) => row.fta).sort((a, b) => a.label.localeCompare(b.label));
  const teamEfficiency = groupRows(rows, (row) => row.team, (row) => row.possessions ? row.points / row.possessions : null)
    .filter((item) => item.rows >= 100)
    .sort((a, b) => b.average - a.average)
    .slice(0, 8);
  const conferencePace = groupRows(rows, (row) => row.conference, (row) => row.possessions)
    .filter((item) => item.label && item.rows >= 100)
    .sort((a, b) => b.average - a.average);
  const conferencePaceChart = [
    ...[...conferencePace].sort((a, b) => a.average - b.average).slice(0, 5),
    ...conferencePace.slice(0, 5),
  ];

  document.getElementById("headline-seasons").textContent = seasons.length;
  document.getElementById("headline-teamgames").textContent = formatNumber(rows.length, 0);
  document.getElementById("headline-teams").textContent = formatNumber(unique(rows, "teamId"), 0);
  document.getElementById("headline-pace").textContent = formatNumber(mean(rows, "possessions"), 1);
  document.getElementById("hero-summary").textContent = `This report uses ${formatNumber(rows.length, 0)} Division I team-game observations from ${firstSeason} through ${lastSeason}. It turns repeated box scores into evidence about competitive games, home court, pace, shot quality, ball security, and the margins that separate winning from losing.`;

  const firstClose = closeGameRate[0]?.average || 0;
  const lastClose = closeGameRate.at(-1)?.average || 0;
  const firstThree = seasonThreeRate[0]?.average || 0;
  const lastThree = seasonThreeRate.at(-1)?.average || 0;
  const firstPace = seasonPace[0]?.average || 0;
  const lastPace = seasonPace.at(-1)?.average || 0;
  const firstEfficiency = seasonEfficiency[0]?.average || 0;
  const lastEfficiency = seasonEfficiency.at(-1)?.average || 0;
  const overallClose = gameRows.length ? 100 * gameRows.filter((row) => Math.abs(row.margin) <= 5).length / gameRows.length : 0;
  const homeRate = homeAway.find((item) => item.label === "Home")?.winRate || 0;
  const awayRate = homeAway.find((item) => item.label === "Away")?.winRate || 0;
  const winTurnoverRate = turnoverRateByResult.find((item) => item.label === "Win")?.average || 0;
  const lossTurnoverRate = turnoverRateByResult.find((item) => item.label === "Loss")?.average || 0;
  const winEfg = efgByResult.find((item) => item.label === "Win")?.average || 0;
  const lossEfg = efgByResult.find((item) => item.label === "Loss")?.average || 0;
  const winFta = ftaByResult.find((item) => item.label === "Win")?.average || 0;
  const lossFta = ftaByResult.find((item) => item.label === "Loss")?.average || 0;
  const fastestConference = conferencePace[0];
  const slowestConference = conferencePace.at(-1);
  const topEfficiencyTeam = teamEfficiency[0];

  document.getElementById("report-sections").innerHTML = [
    reportSection("01", `The panel covers ${formatNumber(gameRows.length, 0)} games, not just a handful of headlines`, `The file contains ${formatNumber(rows.length, 0)} team-game observations from ${formatNumber(unique(rows, "teamId"), 0)} Division I teams across ${seasons.length} seasons. Each game contributes a team-level box score, so the report can test whether a pattern repeats instead of relying on a single tournament run.`, "Games by season", "A large repeated sample makes it possible to benchmark teams and test whether a basketball idea survives across seasons."),
    reportSection("02", `About ${formatPercent(overallClose)} of games finished within five points`, `The share of five-point games moved from ${formatPercent(firstClose)} in ${firstSeason} to ${formatPercent(lastClose)} in ${lastSeason}. The game-level calculation uses each game ID once, so a close game is never counted twice just because both teams have rows.`, "Games decided by five points or fewer", "Close-game rate measures competitive pressure better than an average score. It shows how often late possessions, coaching choices, and execution can change the result."),
    reportSection("03", `Home court created a ${formatNumber(homeRate - awayRate)} percentage-point win-rate gap`, `Home teams won ${formatPercent(homeRate)} of their team-game rows compared with ${formatPercent(awayRate)} for away teams. The chart shows whether that advantage was stable from ${firstSeason} through ${lastSeason}.`, "Home and away win rate by season", "Venue is a context variable that changes the meaning of a box score. Comparing it across thousands of games reveals the baseline challenge a road team faces."),
    reportSection("04", `Winning teams posted ${formatPercent(winEfg)} effective field-goal shooting`, `Winning rows averaged ${formatPercent(winEfg)} eFG compared with ${formatPercent(lossEfg)} for losing rows, a gap of ${formatNumber(winEfg - lossEfg)} percentage points. Effective field goal percentage gives extra credit for made threes.`, "Effective field-goal percentage by result", "Raw field-goal percentage can hide shot value. This metric connects shot selection and shot making to the result in one comparable measure."),
    reportSection("05", `Winners turned the ball over on ${formatPercent(winTurnoverRate)} of possessions`, `Losing rows turned the ball over on ${formatPercent(lossTurnoverRate)} of estimated possessions, a ${formatNumber(lossTurnoverRate - winTurnoverRate)} percentage-point gap. Turnover rate normalizes giveaways by the number of possessions available.`, "Turnover rate by result", "Possessions are limited. A small difference in turnover rate can quietly remove several scoring opportunities over the course of a game."),
    reportSection("06", `Winning teams reached the line ${formatNumber(winFta - lossFta)} more times per team-game`, `Winning rows averaged ${formatNumber(winFta)} free-throw attempts compared with ${formatNumber(lossFta)} for losing rows. This is an outcome association, not proof that free throws alone caused the win.`, "Free-throw attempts by result", "Free throws show how often a team creates high-value, clock-stopped scoring chances—one useful window into rim pressure and physicality."),
    reportSection("07", `The average game barely changed pace, but each possession became more productive`, `Estimated pace moved from ${formatNumber(firstPace)} to ${formatNumber(lastPace)} possessions per team-game, while points per possession rose from ${formatNumber(firstEfficiency, 3)} to ${formatNumber(lastEfficiency, 3)}. That is a ${formatPercent(100 * (lastEfficiency / firstEfficiency - 1))} increase in scoring efficiency.`, "Points per possession by season", "Per-possession measures separate tempo from efficiency. They help compare a fast team and a slow team without rewarding either style for simply creating more trips."),
    reportSection("08", `${topEfficiencyTeam?.label || "The leading offense"} led the efficiency table`, `Among teams with at least 100 team-game rows, ${topEfficiencyTeam?.label || "the leader"} produced ${formatNumber(topEfficiencyTeam?.average || 0, 3)} points per estimated possession. The ranking uses a minimum sample so a short hot streak does not dominate the comparison.`, "Top teams by points per possession", "A team can score a lot because it plays fast. Points per possession asks the more useful scouting question: how well does each trip produce?"),
    reportSection("09", `Three-point attempts rose from ${formatPercent(firstThree)} to ${formatPercent(lastThree)} of field-goal attempts`, `Three-point attempt rate measures shot selection, not shooting accuracy. The change across the five seasons is ${formatNumber(lastThree - firstThree)} percentage points, showing how strategic choices can shift even when pace stays nearly flat.`, "Three-point attempt rate by season", "Shot mix is a style fingerprint. It helps explain how teams create offense and why two teams with similar scores can play very different games."),
    reportSection("10", `${fastestConference?.label || "The fastest conference"} played about ${formatNumber((fastestConference?.average || 0) - (slowestConference?.average || 0), 1)} more possessions than ${slowestConference?.label || "the slowest conference"}`, `Conference pace ranges from ${formatNumber(slowestConference?.average || 0, 1)} to ${formatNumber(fastestConference?.average || 0, 1)} estimated possessions per team-game. The comparison includes conferences with at least 100 team-game rows.`, "Fastest and slowest conference pace", "Conference context matters when evaluating a team. A raw points total means something different in a high-possession environment than in a deliberate one."),
  ].join("");

  renderBars(document.getElementById("report-chart-01"), seasonGames.map((item) => ({ label: item.label, value: item.rows })), { digits: 0, label: "Games by season" });
  renderLine(document.getElementById("report-chart-02"), closeGameRate.map((item) => ({ label: item.label, value: item.average })), { label: "Share of games decided by five points or fewer", valueFormat: (value) => formatPercent(value) });
  renderComparisonLine(document.getElementById("report-chart-03"), homeAwayBySeason, { label: "Home and away win rate by season", valueFormat: (value) => formatPercent(value), height: 340 });
  renderBars(document.getElementById("report-chart-04"), efgByResult.map((item) => ({ label: item.label, value: item.average })), { label: "Effective field-goal percentage by result", valueFormat: (value) => formatPercent(value) });
  renderBars(document.getElementById("report-chart-05"), turnoverRateByResult.map((item) => ({ label: item.label, value: item.average })), { label: "Turnover rate by result", valueFormat: (value) => formatPercent(value) });
  renderBars(document.getElementById("report-chart-06"), ftaByResult.map((item) => ({ label: item.label, value: item.average })), { label: "Free-throw attempts by result" });
  renderLine(document.getElementById("report-chart-07"), seasonEfficiency.map((item) => ({ label: item.label, value: item.average })), { label: "Points per possession by season", valueFormat: (value) => formatNumber(value, 3) });
  renderHorizontal(document.getElementById("report-chart-08"), teamEfficiency.map((item) => ({ label: item.label, value: item.average })), { top: 8, label: "Top teams by points per possession", valueFormat: (value) => formatNumber(value, 3) });
  renderLine(document.getElementById("report-chart-09"), seasonThreeRate.map((item) => ({ label: item.label, value: item.average })), { label: "Three-point attempt rate by season", valueFormat: (value) => formatPercent(value) });
  renderHorizontal(document.getElementById("report-chart-10"), conferencePaceChart.map((item) => ({ label: item.label, value: item.average })), { top: conferencePaceChart.length, label: "Fastest and slowest conference pace", valueFormat: (value) => formatNumber(value, 1) });

  const dropped = quality.dropped_rows ?? 0;
  document.getElementById("methodology-copy").innerHTML = `The raw ESPN/SportsDataverse files contain one row per team per game. I combined seasons 2022–2026, kept rows whose team ID appears in the public 2026 Division I crosswalk, and dropped ${formatNumber(dropped, 0)} rows belonging to non-D-I teams or rows missing a required score/team identifier. The final file contains ${formatNumber(rows.length, 0)} rows and ${formatNumber(unique(rows, "teamId"), 0)} teams. A team-game row is the unit of analysis; the opponent is retained as a descriptive field. Game-level margin findings use each game ID once. Points, rebounds, assists, turnovers, free throws, and shooting percentages are taken from the source box score. Three-point rate equals 3PA/FGA × 100. Effective field-goal percentage equals (FGM + 0.5 × 3PM)/FGA × 100. Estimated possessions equal FGA − offensive rebounds + turnovers + 0.44 × FTA; turnover rate equals turnovers divided by estimated possessions. Win rate equals winning team-game rows divided by all team-game rows.`;
}

const measureDefinitions = {
  points: { label: "Average points", key: "points", format: (value) => formatNumber(value) },
  winRate: { label: "Win rate", key: "win", format: (value) => formatPercent(value) },
  threePA: { label: "Average 3PA", key: "threePA", format: (value) => formatNumber(value) },
  threeRate: { label: "3-point shot attempt rate", key: "threeRate", format: (value) => formatPercent(value) },
  efg: { label: "Effective FG%", key: "efg", format: (value) => formatPercent(value) },
  rebounds: { label: "Average rebounds", key: "rebounds", format: (value) => formatNumber(value) },
  pointsInPaint: { label: "Shots around rim (paint points proxy)", key: "pointsInPaint", format: (value) => formatNumber(value) },
  freeThrowAttempts: { label: "Free throw attempts", key: "fta", format: (value) => formatNumber(value) },
  steals: { label: "Steals", key: "steals", format: (value) => formatNumber(value) },
  blocks: { label: "Blocks", key: "blocks", format: (value) => formatNumber(value) },
  turnovers: { label: "Average turnovers", key: "turnovers", format: (value) => formatNumber(value) },
  turnoverRate: { label: "Turnover rate", key: "turnoverRate", format: (value) => formatPercent(value) },
  possessions: { label: "Number of possessions", key: "possessions", format: (value) => formatNumber(value) },
};

const breakdownDefinitions = {
  season: { label: "Season", key: (row) => row.seasonLabel },
  conference: { label: "Conference", key: (row) => row.conference },
  venue: { label: "Venue", key: (row) => row.venue },
  team: { label: "Team", key: (row) => row.team },
};

function measureValue(row, measureKey) {
  return number(row[measureDefinitions[measureKey].key]);
}

function selectedRows(rows) {
  const season = document.getElementById("filter-season").value;
  const team = document.getElementById("filter-team").value;
  const conference = document.getElementById("filter-conference").value;
  const venue = document.getElementById("filter-venue").value;
  const result = document.getElementById("filter-result").value;
  return rows.filter((row) =>
    (season === "all" || row.seasonLabel === season) &&
    (team === "all" || row.team === team) &&
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

function fillChoiceSelect(selectId, values, placeholder) {
  const select = document.getElementById(selectId);
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
}

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
    };
  });

  const available = lines.filter((line) => line.rows > 0);
  status.textContent = `${measure.label} comparison for ${teamA} and ${teamB}. ${formatNumber(lines[0].rows + lines[1].rows, 0)} team-game rows match the comparison filters.`;
  renderComparisonLine(chart, lines, { label: `${measure.label} comparison for ${teamA} and ${teamB}`, valueFormat: measure.format, height: 340 });
  if (!available.length) status.textContent = `No rows match the comparison filters for ${teamA} or ${teamB}.`;
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
  document.getElementById("summary-average").textContent = formatNumber(mean(filtered, "points"));
  document.getElementById("summary-average-label").textContent = "Average points per team-game";
  document.getElementById("dashboard-status").textContent = `${formatNumber(filtered.length, 0)} team-game rows match the current filters. Charts use ${measure.label.toLowerCase()} and update in the browser.`;
  updateTeamComparison(rows, measureKey);
  updateHeadToHead(rows);

  const comparison = groups.slice(0, 14).reverse();
  renderBars(document.getElementById("dashboard-chart-bars"), comparison.map((item) => ({ label: item.label, value: item.value })), { label: `${measure.label} by ${breakdownDefinitions[breakdownKey].label}`, valueFormat: measure.format, height: 340 });
  renderLine(document.getElementById("dashboard-chart-line"), seasonal.map((item) => ({ label: item.label, value: item.value })), { label: `${measure.label} by season`, valueFormat: measure.format, height: 340 });
  renderHorizontal(document.getElementById("dashboard-chart-top"), byTeam.map((item) => ({ label: item.label, value: item.value })), { top: 10, label: `Top teams by ${measure.label.toLowerCase()}`, valueFormat: measure.format });
  renderDots(document.getElementById("dashboard-chart-dots"), groups, { label: `${measure.label} and group size`, yLabel: measure.label, height: 340 });

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
  fillSelect("filter-season", optionValues(rows, "seasonLabel"), "All seasons");
  const teams = optionValues(rows, "team");
  fillSelect("filter-team", teams, "All teams");
  fillSelect("filter-conference", optionValues(rows, "conference"), "All conferences");
  fillSelect("filter-venue", optionValues(rows, "venue"), "All venues");
  fillSelect("filter-result", optionValues(rows, "result"), "All results");
  fillChoiceSelect("compare-team-a", teams, "Choose team one");
  fillChoiceSelect("compare-team-b", teams, "Choose team two");
  if (teams.length > 1) {
    document.getElementById("compare-team-a").value = teams[0];
    document.getElementById("compare-team-b").value = teams[1];
  }

  ["filter-season", "filter-team", "filter-conference", "filter-venue", "filter-result", "measure-select", "breakdown-select", "compare-team-a", "compare-team-b"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => updateDashboard(rows));
  });

  document.getElementById("reset-filters").addEventListener("click", () => {
    ["filter-season", "filter-team", "filter-conference", "filter-venue", "filter-result"].forEach((id) => { document.getElementById(id).value = "all"; });
    document.getElementById("measure-select").value = "points";
    document.getElementById("breakdown-select").value = "season";
    if (teams.length > 1) {
      document.getElementById("compare-team-a").value = teams[0];
      document.getElementById("compare-team-b").value = teams[1];
    }
    updateDashboard(rows);
  });
  updateDashboard(rows);
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
