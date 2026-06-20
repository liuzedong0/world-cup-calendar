import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 5177);
const ESPN_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=20260611-20260719";
const ESPN_STANDINGS_URL =
  "https://site.web.api.espn.com/apis/v2/sports/soccer/fifa.world/standings?region=us&lang=en&contentorigin=espn&season=2026";
const DATA_DIR = join(__dirname, "data");
const CACHE_FILE = join(DATA_DIR, "worldcup-2026.json");
const PUBLIC_DIR = join(__dirname, "public");

const platformLinks = {
  cctv5: "https://tv.cctv.com/live/cctv5/",
  cctvSports: "https://sports.cctv.com/",
  migu: "https://www.miguvideo.com/",
  espn: "https://www.espn.com/soccer/scoreboard/_/league/fifa.world"
};

const zhNames = {
  Argentina: "阿根廷",
  Australia: "澳大利亚",
  Austria: "奥地利",
  Belgium: "比利时",
  "Bosnia-Herzegovina": "波黑",
  Brazil: "巴西",
  Cameroon: "喀麦隆",
  Canada: "加拿大",
  "Cape Verde Islands": "佛得角",
  Colombia: "哥伦比亚",
  Croatia: "克罗地亚",
  Czechia: "捷克",
  Denmark: "丹麦",
  Ecuador: "厄瓜多尔",
  Egypt: "埃及",
  England: "英格兰",
  France: "法国",
  Germany: "德国",
  Ghana: "加纳",
  Haiti: "海地",
  Iran: "伊朗",
  Italy: "意大利",
  Japan: "日本",
  "Ivory Coast": "科特迪瓦",
  Mexico: "墨西哥",
  Morocco: "摩洛哥",
  Netherlands: "荷兰",
  "New Zealand": "新西兰",
  Norway: "挪威",
  Panama: "巴拿马",
  Paraguay: "巴拉圭",
  Poland: "波兰",
  Portugal: "葡萄牙",
  Qatar: "卡塔尔",
  "Saudi Arabia": "沙特阿拉伯",
  Scotland: "苏格兰",
  Senegal: "塞内加尔",
  Serbia: "塞尔维亚",
  "South Africa": "南非",
  "South Korea": "韩国",
  Spain: "西班牙",
  Switzerland: "瑞士",
  Tunisia: "突尼斯",
  Türkiye: "土耳其",
  Ukraine: "乌克兰",
  "United States": "美国",
  Uruguay: "乌拉圭",
  Uzbekistan: "乌兹别克斯坦"
};

const zhNameOverrides = {
  Algeria: "\u963f\u5c14\u53ca\u5229\u4e9a",
  "Cape Verde": "\u4f5b\u5f97\u89d2",
  "Congo DR": "\u521a\u679c\u6c11\u4e3b\u5171\u548c\u56fd",
  "Cura\u00e7ao": "\u5e93\u62c9\u7d22",
  Iraq: "\u4f0a\u62c9\u514b",
  Jordan: "\u7ea6\u65e6",
  Sweden: "\u745e\u5178",
  "Group A Winner": "A\u7ec4\u7b2c\u4e00",
  "Group B Winner": "B\u7ec4\u7b2c\u4e00",
  "Group C Winner": "C\u7ec4\u7b2c\u4e00",
  "Group D Winner": "D\u7ec4\u7b2c\u4e00",
  "Group E Winner": "E\u7ec4\u7b2c\u4e00",
  "Group F Winner": "F\u7ec4\u7b2c\u4e00",
  "Group G Winner": "G\u7ec4\u7b2c\u4e00",
  "Group H Winner": "H\u7ec4\u7b2c\u4e00",
  "Group I Winner": "I\u7ec4\u7b2c\u4e00",
  "Group J Winner": "J\u7ec4\u7b2c\u4e00",
  "Group K Winner": "K\u7ec4\u7b2c\u4e00",
  "Group L Winner": "L\u7ec4\u7b2c\u4e00",
  "Group A 2nd Place": "A\u7ec4\u7b2c\u4e8c",
  "Group B 2nd Place": "B\u7ec4\u7b2c\u4e8c",
  "Group C 2nd Place": "C\u7ec4\u7b2c\u4e8c",
  "Group D 2nd Place": "D\u7ec4\u7b2c\u4e8c",
  "Group E 2nd Place": "E\u7ec4\u7b2c\u4e8c",
  "Group F 2nd Place": "F\u7ec4\u7b2c\u4e8c",
  "Group G 2nd Place": "G\u7ec4\u7b2c\u4e8c",
  "Group H 2nd Place": "H\u7ec4\u7b2c\u4e8c",
  "Group I 2nd Place": "I\u7ec4\u7b2c\u4e8c",
  "Group J 2nd Place": "J\u7ec4\u7b2c\u4e8c",
  "Group K 2nd Place": "K\u7ec4\u7b2c\u4e8c",
  "Group L 2nd Place": "L\u7ec4\u7b2c\u4e8c",
  "T\u00fcrkiye": "\u571f\u8033\u5176"
};

let latestCache = null;
let isRefreshing = false;

function toDateParts(isoDate) {
  const date = new Date(isoDate);
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

function competitorName(competitor) {
  return competitor?.team?.displayName || competitor?.team?.name || competitor?.displayName || "待定";
}

function bilingualName(name) {
  const zh = zhNameOverrides[name] || zhNames[name];
  return zh ? `${zh} / ${name}` : name;
}

function statValue(entry, names, fallback = "0") {
  const stat = (entry.stats || []).find((item) => names.includes(item.name) || names.includes(item.type));
  return stat?.displayValue || String(stat?.value ?? fallback);
}

function numericValue(value) {
  const parsed = Number(String(value ?? "0").replace(/^\+/, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareNumberDesc(a, b) {
  return numericValue(b) - numericValue(a);
}

function headToHeadStats(abbr, tiedAbbreviations, matches) {
  const stats = { points: 0, goalDifference: 0, goalsFor: 0 };

  for (const match of matches) {
    if (match.status.state !== "post") continue;
    const home = match.homeTeam.abbreviation;
    const away = match.awayTeam.abbreviation;
    if (!tiedAbbreviations.has(home) || !tiedAbbreviations.has(away)) continue;
    if (home !== abbr && away !== abbr) continue;

    const homeScore = numericValue(match.homeTeam.score);
    const awayScore = numericValue(match.awayTeam.score);
    const isHome = home === abbr;
    const goalsFor = isHome ? homeScore : awayScore;
    const goalsAgainst = isHome ? awayScore : homeScore;

    stats.goalsFor += goalsFor;
    stats.goalDifference += goalsFor - goalsAgainst;
    if (goalsFor > goalsAgainst) stats.points += 3;
    else if (goalsFor === goalsAgainst) stats.points += 1;
  }

  return stats;
}

function sortTiedBucket(entries, matches) {
  if (entries.length <= 1) return entries;

  const tiedAbbreviations = new Set(entries.map((entry) => entry.team.abbreviation).filter(Boolean));
  return [...entries].sort((a, b) => {
    const aHead = headToHeadStats(a.team.abbreviation, tiedAbbreviations, matches);
    const bHead = headToHeadStats(b.team.abbreviation, tiedAbbreviations, matches);
    return (
      bHead.points - aHead.points ||
      bHead.goalDifference - aHead.goalDifference ||
      bHead.goalsFor - aHead.goalsFor ||
      numericValue(a.originalRank) - numericValue(b.originalRank) ||
      a.team.name.localeCompare(b.team.name)
    );
  });
}

function sortStandingsEntries(entries, matches) {
  const sorted = [...entries].sort((a, b) => {
    return (
      compareNumberDesc(a.points, b.points) ||
      compareNumberDesc(a.goalDifference, b.goalDifference) ||
      compareNumberDesc(a.goalsFor, b.goalsFor) ||
      numericValue(a.originalRank) - numericValue(b.originalRank) ||
      a.team.name.localeCompare(b.team.name)
    );
  });

  const result = [];
  for (let index = 0; index < sorted.length;) {
    const current = sorted[index];
    const bucket = [];
    while (
      index < sorted.length &&
      numericValue(sorted[index].points) === numericValue(current.points) &&
      numericValue(sorted[index].goalDifference) === numericValue(current.goalDifference) &&
      numericValue(sorted[index].goalsFor) === numericValue(current.goalsFor)
    ) {
      bucket.push(sorted[index]);
      index += 1;
    }
    result.push(...sortTiedBucket(bucket, matches));
  }

  return result.map((entry, index) => ({
    ...entry,
    rank: String(index + 1)
  }));
}

function transformStandings(payload, matches = []) {
  return (payload.children || []).map((group) => {
    const entries = (group.standings?.entries || []).map((entry) => ({
      originalRank: statValue(entry, ["rank"], entry.note?.rank || ""),
      rank: statValue(entry, ["rank"], entry.note?.rank || ""),
      team: {
        name: bilingualName(entry.team?.displayName || entry.team?.name || "TBD"),
        abbreviation: entry.team?.abbreviation || "",
        logo: entry.team?.logos?.[0]?.href || ""
      },
      played: statValue(entry, ["gamesPlayed", "gamesplayed"]),
      wins: statValue(entry, ["wins"]),
      draws: statValue(entry, ["ties"]),
      losses: statValue(entry, ["losses"]),
      goalsFor: statValue(entry, ["pointsFor", "pointsfor"]),
      goalsAgainst: statValue(entry, ["pointsAgainst", "pointsagainst"]),
      goalDifference: statValue(entry, ["pointDifferential", "pointdifferential"]),
      points: statValue(entry, ["points"]),
      note: entry.note?.description || ""
    }));

    return {
      id: group.id,
      name: `${group.name.replace("Group", "小组")} / ${group.name}`,
      shortName: group.name.replace("Group ", ""),
      sortRules: [
        "points",
        "goalDifference",
        "goalsFor",
        "headToHeadPoints",
        "headToHeadGoalDifference",
        "headToHeadGoalsFor",
        "fairPlayUnavailable",
        "sourceRankFallback"
      ],
      entries: sortStandingsEntries(entries, matches).map(({ originalRank, ...entry }) => entry)
    };
  });
}

function transformEvent(event) {
  const competition = event.competitions?.[0] || {};
  const competitors = [...(competition.competitors || [])].sort((a, b) => {
    if (a.homeAway === b.homeAway) return 0;
    return a.homeAway === "home" ? -1 : 1;
  });
  const home = competitors.find((team) => team.homeAway === "home") || competitors[0] || {};
  const away = competitors.find((team) => team.homeAway === "away") || competitors[1] || {};
  const status = competition.status?.type || event.status?.type || {};
  const statusSource = competition.status || event.status || {};
  const venue = competition.venue || {};
  const { dateKey, time } = toDateParts(event.date);
  const scoreReady = status.state === "in" || status.state === "post";

  return {
    id: event.id,
    dateUtc: event.date,
    dateKey,
    time,
    name: event.name,
    shortName: event.shortName,
    stage: event.season?.slug || event.season?.type || "",
    homeTeam: {
      name: bilingualName(competitorName(home)),
      abbreviation: home.team?.abbreviation || "",
      logo: home.team?.logo || "",
      score: scoreReady ? home.score ?? "" : ""
    },
    awayTeam: {
      name: bilingualName(competitorName(away)),
      abbreviation: away.team?.abbreviation || "",
      logo: away.team?.logo || "",
      score: scoreReady ? away.score ?? "" : ""
    },
    status: {
      state: status.state || "pre",
      detail: status.detail || status.shortDetail || status.description || "Scheduled",
      shortDetail: status.shortDetail || "",
      description: status.description || "",
      name: status.name || "",
      displayClock: statusSource.displayClock || "",
      period: statusSource.period || 0,
      completed: Boolean(status.completed)
    },
    venue: {
      name: venue.fullName || venue.name || "待公布",
      city: venue.address?.city || "",
      country: venue.address?.country || ""
    },
    links: {
      cctv5: platformLinks.cctv5,
      cctvSports: platformLinks.cctvSports,
      migu: platformLinks.migu,
      espn: event.links?.[0]?.href || platformLinks.espn
    }
  };
}

async function refreshMatches(reason = "scheduled") {
  if (isRefreshing) return latestCache;
  isRefreshing = true;
  try {
    const cacheBuster = `&_=${Date.now()}`;
    const [response, standingsResponse] = await Promise.all([
      fetch(`${ESPN_URL}${cacheBuster}`, {
        headers: {
          "cache-control": "no-cache",
          "pragma": "no-cache",
          "user-agent": "WorldCupCalendar/1.0 (+local app)"
        }
      }),
      fetch(`${ESPN_STANDINGS_URL}${cacheBuster}`, {
        headers: {
          "cache-control": "no-cache",
          "pragma": "no-cache",
          "user-agent": "WorldCupCalendar/1.0 (+local app)"
        }
      })
    ]);

    if (!response.ok) {
      throw new Error(`ESPN schedule returned ${response.status}`);
    }

    if (!standingsResponse.ok) {
      throw new Error(`ESPN standings returned ${standingsResponse.status}`);
    }

    const payload = await response.json();
    const standingsPayload = await standingsResponse.json();
    const matches = (payload.events || []).map(transformEvent).sort((a, b) => {
      return new Date(a.dateUtc).getTime() - new Date(b.dateUtc).getTime();
    });

    const grouped = matches.reduce((days, match) => {
      if (!days[match.dateKey]) days[match.dateKey] = [];
      days[match.dateKey].push(match);
      return days;
    }, {});

    latestCache = {
      tournament: "2026 FIFA World Cup",
      timezone: "Asia/Shanghai",
      source: "ESPN FIFA World Cup scoreboard API",
      sourceUrl: ESPN_URL,
      platformLinks,
      updatedAt: new Date().toISOString(),
      updateReason: reason,
      matchCount: matches.length,
      standings: transformStandings(standingsPayload, matches),
      matches,
      days: Object.entries(grouped).map(([date, dayMatches]) => ({ date, matches: dayMatches }))
    };

    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(latestCache, null, 2), "utf8");
    console.log(`[world-cup-calendar] refreshed ${matches.length} matches (${reason})`);
    return latestCache;
  } finally {
    isRefreshing = false;
  }
}

async function loadCache() {
  if (latestCache) return latestCache;
  try {
    latestCache = JSON.parse(await readFile(CACHE_FILE, "utf8"));
    return latestCache;
  } catch {
    return refreshMatches("startup");
  }
}

function mimeType(path) {
  const ext = extname(path).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg"
  }[ext] || "application/octet-stream";
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "content-type": mimeType(filePath) });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/matches") {
      const cache = await loadCache();
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(JSON.stringify(cache));
      return;
    }

    if (url.pathname === "/api/refresh" && request.method === "POST") {
      const cache = await refreshMatches("manual");
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, updatedAt: cache.updatedAt, matchCount: cache.matchCount }));
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, error: error.message }));
  }
});

await refreshMatches("startup");
setInterval(() => refreshMatches("automatic"), 6 * 60 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`[world-cup-calendar] http://localhost:${PORT}`);
});
