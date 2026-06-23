const state = {
  data: null,
  lastSignature: "",
  query: "",
  status: "all",
  didAutoScroll: false,
  lastServerRefreshAt: 0
};

const calendar = document.querySelector("#calendar");
const searchInput = document.querySelector("#searchInput");
const statusFilter = document.querySelector("#statusFilter");
const refreshButton = document.querySelector("#refreshButton");
const todayButton = document.querySelector("#todayButton");
const standingsList = document.querySelector("#standingsList");
const matchCount = document.querySelector("#matchCount");
const nextMatch = document.querySelector("#nextMatch");
const updatedAt = document.querySelector("#updatedAt");

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "long",
  day: "numeric",
  weekday: "long"
});

const updateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

const stageLabels = {
  "group-stage": "小组赛 / Group Stage",
  "round-of-32": "1/16 决赛 / Round of 32",
  "round-of-16": "1/8 决赛 / Round of 16",
  quarterfinals: "1/4 决赛 / Quarter-finals",
  semifinals: "1/2 决赛 / Semi-finals",
  "3rd-place-match": "三四名决赛 / Third-place match",
  final: "决赛 / Final"
};

function text(value) {
  return String(value || "").toLowerCase();
}

function todayKey() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function allTournamentDates() {
  return [...new Set((state.data?.matches || []).map((match) => match.dateKey))].sort();
}

function tournamentDayNumber(date) {
  const index = allTournamentDates().indexOf(date);
  return index >= 0 ? index + 1 : "";
}

function stageLabelForMatches(matches) {
  const counts = matches.reduce((map, match) => {
    map.set(match.stage, (map.get(match.stage) || 0) + 1);
    return map;
  }, new Map());
  const [stage] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  return stageLabels[stage] || "赛段待定 / Stage TBD";
}

function dayInfo(date, matches, isToday) {
  if (!isToday) return "";
  const dayNumber = tournamentDayNumber(date);
  const [stageZh, stageEn = ""] = stageLabelForMatches(matches).split(" / ");
  return `
    <div class="day-info">
      <span>今天是世界杯</span>
      <strong>第 ${dayNumber} 个</strong>
      <span>比赛日</span>
      <span>${stageZh}</span>
      <span>${stageEn}</span>
    </div>
  `;
}

function matchSearches(match, query) {
  if (!query) return true;
  const haystack = [
    match.homeTeam.name,
    match.awayTeam.name,
    match.homeTeam.abbreviation,
    match.awayTeam.abbreviation,
    match.venue.name,
    match.venue.city,
    match.venue.country,
    match.name
  ]
    .map(text)
    .join(" ");
  return haystack.includes(query);
}

function visibleMatches() {
  if (!state.data) return [];
  const query = state.query.trim().toLowerCase();
  return state.data.matches.filter((match) => {
    const statusOk = state.status === "all" || match.status.state === state.status;
    return statusOk && matchSearches(match, query);
  });
}

function dataSignature(data) {
  return JSON.stringify({
    matches: data.matches.map((match) => [
      match.id,
      match.homeTeam.score,
      match.awayTeam.score,
      match.status.state,
      match.status.detail,
      match.status.displayClock
    ]),
    standings: data.standings
  });
}

function groupedByDate(matches) {
  return matches.reduce((days, match) => {
    if (!days[match.dateKey]) days[match.dateKey] = [];
    days[match.dateKey].push(match);
    return days;
  }, {});
}

function scoreLabel(match) {
  if (match.status.state === "pre") return "vs";
  return `${match.homeTeam.score || 0} - ${match.awayTeam.score || 0}`;
}

function liveStatusLabel(status) {
  const detail = status.displayClock || status.detail || status.shortDetail || "";
  const statusName = String(status.name || "").toUpperCase();
  const description = String(status.description || "").toLowerCase();
  const isHalfTime = statusName.includes("HALFTIME") || detail === "HT" || description === "halftime" || description === "half time";
  if (isHalfTime) return "中场休息 / Half-time";
  if (status.period === 1) return `上半场 / 1H|${detail || "Live"}`;
  if (status.period === 2) return `下半场 / 2H|${detail || "Live"}`;
  if (status.period >= 3) return `加时 / ET|${detail || "Live"}`;
  return detail ? `进行中 / ${detail}` : "进行中 / Live";
}

function statusLabel(status) {
  if (status.state === "post") return "已结束 / Finished";
  if (status.state === "in") return liveStatusLabel(status);
  return "未开始 / Scheduled";
}

function statusMarkup(status) {
  const label = statusLabel(status);
  if (status.state !== "in" || !label.includes("|")) return label;
  const [phase, clock] = label.split("|");
  return `<span class="status-phase">${phase}</span><span class="status-clock">${clock}</span>`;
}

function teamMarkup(team, side) {
  const logo = team.logo ? `<img src="${team.logo}" alt="" loading="lazy" />` : "";
  return `
    <div class="team ${side}">
      ${side === "away" ? "" : logo}
      <span>${team.name}</span>
      ${side === "away" ? logo : ""}
    </div>
  `;
}

function renderSummary(matches) {
  const future = state.data.matches.find((match) => new Date(match.dateUtc) >= new Date() && match.status.state !== "post");
  matchCount.textContent = String(matches.length);
  nextMatch.textContent = future ? `${future.dateKey} ${future.time}` : "暂无 / None";
  updatedAt.textContent = state.data.updatedAt ? updateFormatter.format(new Date(state.data.updatedAt)) : "--";
}

function scrollToToday(smooth = true) {
  const target = document.querySelector(`#day-${todayKey()}`) || document.querySelector("[data-upcoming='true']");
  if (!target) return;
  target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
}

function render() {
  const matches = visibleMatches();
  renderSummary(matches);
  renderStandings();
  const grouped = groupedByDate(matches);
  const dates = Object.keys(grouped).sort();

  if (!dates.length) {
    calendar.innerHTML = `<div class="empty">没有匹配的比赛 / No matches found</div>`;
    return;
  }

  const today = todayKey();
  const now = new Date();
  calendar.innerHTML = dates
    .map((date) => {
      const dayMatches = grouped[date];
      const displayDate = dateFormatter.format(new Date(`${date}T12:00:00+08:00`));
      const isToday = date === today;
      const isUpcoming = dayMatches.some((match) => new Date(match.dateUtc) >= now);
      return `
        <article class="day ${isToday ? "today" : ""}" id="day-${date}" ${isUpcoming ? "data-upcoming='true'" : ""}>
          <aside class="date-rail">
            <strong>${date.slice(5)}</strong>
            <span>${displayDate}${isToday ? " · 今日 / Today" : ""}</span>
            ${dayInfo(date, dayMatches, isToday)}
          </aside>
          <div class="matches">
            ${dayMatches.map(renderMatch).join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderStandings() {
  const groups = state.data?.standings || [];
  if (!groups.length) {
    standingsList.innerHTML = `<div class="standings-empty">暂无积分 / No standings</div>`;
    return;
  }

  standingsList.innerHTML = groups
    .map((group) => `
      <section class="group-table">
        <h3>${group.name}</h3>
        <div class="table-head">
          <span>球队 / Team</span>
          <span>赛 / P</span>
          <span>胜 / W</span>
          <span>平 / D</span>
          <span>负 / L</span>
          <span>净 / GD</span>
          <span>分 / Pts</span>
        </div>
        ${group.entries.map(renderStandingRow).join("")}
      </section>
    `)
    .join("");
}

function renderStandingRow(entry) {
  return `
    <div class="standing-row">
      <span class="standing-team">
        <strong>${entry.rank}</strong>
        ${entry.team.logo ? `<img src="${entry.team.logo}" alt="" loading="lazy" />` : ""}
        <span>${entry.team.name}</span>
      </span>
      <span>${entry.played}</span>
      <span>${entry.wins}</span>
      <span>${entry.draws}</span>
      <span>${entry.losses}</span>
      <span>${entry.goalDifference}</span>
      <span class="pts">${entry.points}</span>
    </div>
  `;
}

function renderMatch(match) {
  const venueBits = [match.venue.name, match.venue.city, match.venue.country].filter(Boolean).join(" · ");
  return `
    <article class="match-card ${match.status.state === "in" ? "live-match" : ""}">
      <div class="match-main">
        <div class="time">${match.time}</div>
        ${teamMarkup(match.homeTeam, "home")}
        <div class="score">${scoreLabel(match)}</div>
        ${teamMarkup(match.awayTeam, "away")}
        <div class="status ${match.status.state}">${statusMarkup(match.status)}</div>
      </div>
      <div class="meta">
        <span>${venueBits}</span>
        <span>北京时间 / Beijing Time</span>
      </div>
      <div class="links" aria-label="观看入口">
        <a href="${match.links.cctv5}" target="_blank" rel="noreferrer">CCTV5</a>
        <a href="${match.links.cctvSports}" target="_blank" rel="noreferrer">央视体育</a>
        <a href="${match.links.migu}" target="_blank" rel="noreferrer">咪咕体育</a>
        <a href="${match.links.espn}" target="_blank" rel="noreferrer">比赛详情 / Details</a>
      </div>
    </article>
  `;
}

async function loadMatches({ silent = false } = {}) {
  if (!silent && !state.data) {
    calendar.innerHTML = `<div class="empty">正在加载赛程... / Loading matches...</div>`;
  }
  const response = await fetch("/api/matches", { cache: "no-store" });
  if (!response.ok) throw new Error("赛程加载失败 / Failed to load matches");
  const nextData = await response.json();
  const nextSignature = dataSignature(nextData);
  const unchanged = state.lastSignature === nextSignature;
  state.data = nextData;
  state.lastSignature = nextSignature;

  if (silent && unchanged) {
    renderSummary(visibleMatches());
    return;
  }

  render();

  if (!state.didAutoScroll) {
    state.didAutoScroll = true;
    window.requestAnimationFrame(() => {
      window.setTimeout(() => scrollToToday(false), 450);
    });
  }
}

async function refreshServerCache() {
  const response = await fetch("/api/refresh", { method: "POST" });
  if (!response.ok) throw new Error("更新失败 / Refresh failed");
  state.lastServerRefreshAt = Date.now();
}

async function refreshMatches() {
  refreshButton.disabled = true;
  refreshButton.textContent = "更新中 / Updating";
  try {
    await refreshServerCache();
    await loadMatches({ silent: true });
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "更新 / Refresh";
  }
}

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

statusFilter.addEventListener("change", (event) => {
  state.status = event.target.value;
  render();
});

refreshButton.addEventListener("click", refreshMatches);
todayButton.addEventListener("click", () => scrollToToday(true));

async function boot() {
  try {
    await refreshServerCache();
  } catch (error) {
    console.warn(error);
  }
  await loadMatches();
}

setInterval(() => {
  refreshServerCache()
    .then(() => loadMatches({ silent: true }))
    .catch((error) => console.warn(error));
}, 30 * 1000);

document.addEventListener("visibilitychange", () => {
  const stale = Date.now() - state.lastServerRefreshAt > 60 * 1000;
  if (document.visibilityState === "visible" && stale) {
    refreshServerCache()
      .then(() => loadMatches({ silent: true }))
      .catch((error) => console.warn(error));
  }
});

boot().catch((error) => {
  calendar.innerHTML = `<div class="empty">${error.message}</div>`;
});
