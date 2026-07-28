import React, { useState, useMemo, useRef } from "react";
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import Papa from "papaparse";
import {
  Upload, Download, LayoutDashboard, Table2, Facebook, Youtube, Linkedin, Instagram,
  TrendingUp, TrendingDown, Users, Info, ChevronDown, X as XIcon, Plug, CheckCircle2,
  AlertCircle, Loader2, RefreshCw, ShieldAlert, FileText, ExternalLink
} from "lucide-react";

// ---------------------------------------------------------------------------
// Platform registry — confirmed official GSS accounts (verified via web search,
// July 2026). No official TikTok account was found for GSS at time of writing.
//
// corsLive: true  -> this platform's API allows a direct browser fetch, so a
//           pasted API key/access token can pull real numbers right here.
// corsLive: false -> the platform blocks browser-origin requests (no CORS
//           headers). A real integration needs a small backend proxy to hold
//           the OAuth flow and relay requests; this dashboard offers a manual
//           entry form instead so you can still log daily numbers by hand.
// ---------------------------------------------------------------------------
const PLATFORMS = [
  { id: "facebook", name: "Facebook", handle: "@statsghana", url: "https://www.facebook.com/statsghana/", color: "#1877F2", icon: Facebook, corsLive: true },
  { id: "instagram", name: "Instagram", handle: "@stats_ghana", url: "https://www.instagram.com/stats_ghana/", color: "#C2185B", icon: Instagram, corsLive: true },
  { id: "youtube", name: "YouTube", handle: "Ghana Statistical Service", url: "https://www.youtube.com/@ghanastatisticalservice", color: "#CC0000", icon: Youtube, corsLive: true },
  { id: "linkedin", name: "LinkedIn", handle: "Ghana Statistical Service", url: "https://gh.linkedin.com/company/ghana-statistical-service", color: "#0A66C2", icon: Linkedin, corsLive: false },
  { id: "x", name: "X (Twitter)", handle: "@StatsGhana", url: "https://x.com/StatsGhana", color: "#0F1419", icon: XIcon, corsLive: false },
];

const PLATFORM_MAP = Object.fromEntries(PLATFORMS.map(p => [p.id, p]));
const PLATFORM_ORDER = ["facebook", "x", "instagram", "linkedin", "youtube"];

// ---------------------------------------------------------------------------
// Sample data generator — deterministic seeded pseudo-random so the demo is
// stable across renders. Overwritten row-by-row as you connect real accounts
// or import a CSV.
// ---------------------------------------------------------------------------
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function generateSampleData(days = 60) {
  const rand = seededRandom(42);
  const baseFollowers = { facebook: 18400, x: 12100, instagram: 3200, linkedin: 9800, youtube: 2100 };
  const baseReach = { facebook: 6200, x: 4100, instagram: 1800, linkedin: 2600, youtube: 900 };
  const rows = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const followers = { ...baseFollowers };

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dow = d.getDay();
    const weekendDamp = (dow === 0 || dow === 6) ? 0.55 : 1;
    const spike = (i % 13 === 0) ? 2.4 : 1;

    PLATFORM_ORDER.forEach(pid => {
      const base = baseReach[pid];
      const noise = 0.6 + rand() * 0.8;
      const posts = Math.max(0, Math.round((pid === "x" ? 3 : 1) * weekendDamp * (0.5 + rand())));
      const impressions = Math.round(base * noise * weekendDamp * spike * (3 + rand() * 2));
      const reach = Math.round(impressions * (0.55 + rand() * 0.2));
      const likes = Math.round(reach * (0.02 + rand() * 0.03) * spike);
      const comments = Math.round(likes * (0.04 + rand() * 0.06));
      const shares = Math.round(likes * (0.03 + rand() * 0.08));
      const clicks = Math.round(reach * (0.01 + rand() * 0.02));
      const newFollowers = Math.round((5 + rand() * 40) * spike * weekendDamp);
      followers[pid] += newFollowers;
      const engagements = likes + comments + shares + clicks;
      const engagementRate = reach > 0 ? +(engagements / reach * 100).toFixed(2) : 0;

      rows.push({
        date: fmtDate(d),
        platform: pid,
        platformName: PLATFORM_MAP[pid].name,
        posts, impressions, reach, likes, comments, shares, clicks,
        engagements, engagementRate,
        followers: followers[pid],
        newFollowers,
        source: "sample",
      });
    });
  }
  return rows;
}

const SAMPLE_DATA = generateSampleData(60);
const NUMBER_FMT = new Intl.NumberFormat("en-US");
function sum(arr, key) { return arr.reduce((a, r) => a + (r[key] || 0), 0); }

function downloadCSV(rows, filename) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function emptyRow(platformId, date) {
  return {
    date, platform: platformId, platformName: PLATFORM_MAP[platformId].name,
    posts: 0, impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, clicks: 0,
    engagements: 0, engagementRate: 0, followers: 0, newFollowers: 0, source: "live",
  };
}

// ---------------------------------------------------------------------------
// Live fetchers — real API calls. These work because Google's and Meta's
// Graph APIs send Access-Control-Allow-Origin headers on GET requests, so a
// browser can call them directly with just a key/token, no backend needed.
// ---------------------------------------------------------------------------
async function fetchYouTubeLive(apiKey, channelId) {
  const chRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`);
  const chJson = await chRes.json();
  if (chJson.error) throw new Error(chJson.error.message);
  const stats = chJson.items?.[0]?.statistics;
  if (!stats) throw new Error("No channel found for that Channel ID.");
  const followers = Number(stats.subscriberCount || 0);

  const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?channelId=${encodeURIComponent(channelId)}&part=id&order=date&maxResults=10&type=video&key=${encodeURIComponent(apiKey)}`);
  const searchJson = await searchRes.json();
  if (searchJson.error) throw new Error(searchJson.error.message);
  const ids = (searchJson.items || []).map(i => i.id?.videoId).filter(Boolean).join(",");

  let likes = 0, comments = 0, views = 0, videoCount = 0;
  const posts = [];
  if (ids) {
    const vidRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${ids}&key=${encodeURIComponent(apiKey)}`);
    const vidJson = await vidRes.json();
    if (vidJson.error) throw new Error(vidJson.error.message);
    videoCount = vidJson.items?.length || 0;
    (vidJson.items || []).forEach(v => {
      const l = Number(v.statistics?.likeCount || 0);
      const c = Number(v.statistics?.commentCount || 0);
      const vw = Number(v.statistics?.viewCount || 0);
      likes += l; comments += c; views += vw;
      posts.push({
        postId: v.id, platform: "youtube",
        date: (v.snippet?.publishedAt || "").slice(0, 10),
        caption: v.snippet?.title || "",
        likes: l, comments: c, shares: 0, views: vw,
        engagements: l + c,
        engagementRate: vw > 0 ? +((l + c) / vw * 100).toFixed(2) : 0,
        url: `https://www.youtube.com/watch?v=${v.id}`,
      });
    });
  }
  return { followers, likes, comments, views, postCount: videoCount, posts, note: "engagement = sum of last 10 uploaded videos (public API has no true daily breakdown without OAuth Analytics access)" };
}

async function fetchFacebookLive(accessToken, pageId) {
  const res = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}?fields=fan_count,followers_count&access_token=${encodeURIComponent(accessToken)}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  const followers = json.followers_count || json.fan_count || 0;

  const postsRes = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}/posts?fields=message,created_time,permalink_url,likes.summary(true),comments.summary(true),shares&limit=10&access_token=${encodeURIComponent(accessToken)}`);
  const postsJson = await postsRes.json();
  if (postsJson.error) throw new Error(postsJson.error.message);
  let likes = 0, comments = 0, shares = 0;
  const posts = [];
  (postsJson.data || []).forEach(p => {
    const l = p.likes?.summary?.total_count || 0;
    const c = p.comments?.summary?.total_count || 0;
    const s = p.shares?.count || 0;
    likes += l; comments += c; shares += s;
    posts.push({
      postId: p.id, platform: "facebook",
      date: (p.created_time || "").slice(0, 10),
      caption: p.message || "",
      likes: l, comments: c, shares: s, views: 0,
      engagements: l + c + s,
      engagementRate: 0, // needs Page follower count to normalize; left 0 at post level
      url: p.permalink_url || "",
    });
  });
  return { followers, likes, comments, shares, postCount: postsJson.data?.length || 0, posts, note: "engagement = sum of last 10 Page posts" };
}

async function fetchInstagramLive(accessToken, igUserId) {
  const res = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(igUserId)}?fields=followers_count,media_count&access_token=${encodeURIComponent(accessToken)}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  const followers = json.followers_count || 0;

  const mediaRes = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(igUserId)}/media?fields=timestamp,caption,permalink,like_count,comments_count&limit=10&access_token=${encodeURIComponent(accessToken)}`);
  const mediaJson = await mediaRes.json();
  if (mediaJson.error) throw new Error(mediaJson.error.message);
  let likes = 0, comments = 0;
  const posts = [];
  (mediaJson.data || []).forEach(m => {
    const l = m.like_count || 0;
    const c = m.comments_count || 0;
    likes += l; comments += c;
    posts.push({
      postId: m.id, platform: "instagram",
      date: (m.timestamp || "").slice(0, 10),
      caption: m.caption || "",
      likes: l, comments: c, shares: 0, views: 0,
      engagements: l + c,
      engagementRate: followers > 0 ? +((l + c) / followers * 100).toFixed(2) : 0,
      url: m.permalink || "",
    });
  });
  return { followers, likes, comments, postCount: mediaJson.data?.length || 0, posts, note: "engagement = sum of last 10 posts" };
}

const LIVE_FETCHERS = { youtube: fetchYouTubeLive, facebook: fetchFacebookLive, instagram: fetchInstagramLive };

export default function GSSSocialDashboard() {
  const [data, setData] = useState(SAMPLE_DATA);
  const [posts, setPosts] = useState([]); // individual post-level insights, own accounts only
  const [view, setView] = useState("dashboard");
  const [range, setRange] = useState(30);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [showHelp, setShowHelp] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [importMsg, setImportMsg] = useState(null);
  const fileInputRef = useRef(null);

  // Connection state lives only in memory (React state) — credentials are
  // never persisted to storage, so they clear on refresh. See ConnectionsModal.
  const [connections, setConnections] = useState(() =>
    Object.fromEntries(PLATFORMS.map(p => [p.id, {
      status: "idle", error: null, lastSync: null,
      apiKey: "", secondaryId: "",
    }]))
  );

  const connectedCount = Object.values(connections).filter(c => c.status === "connected").length;

  function updateConnection(id, patch) {
    setConnections(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function upsertRow(platformId, patchFromLive) {
    const today = fmtDate(new Date());
    setData(prev => {
      const platformRows = prev.filter(r => r.platform === platformId).sort((a, b) => b.date.localeCompare(a.date));
      const priorFollowers = platformRows.find(r => r.date !== today)?.followers || 0;
      const engagements = (patchFromLive.likes || 0) + (patchFromLive.comments || 0) + (patchFromLive.shares || 0) + (patchFromLive.clicks || 0);
      const reach = patchFromLive.reach || patchFromLive.views || 0;
      const newRow = {
        ...emptyRow(platformId, today),
        posts: patchFromLive.postCount || 0,
        impressions: patchFromLive.views || 0,
        reach,
        likes: patchFromLive.likes || 0,
        comments: patchFromLive.comments || 0,
        shares: patchFromLive.shares || 0,
        clicks: 0,
        engagements,
        engagementRate: reach > 0 ? +(engagements / reach * 100).toFixed(2) : 0,
        followers: patchFromLive.followers || 0,
        newFollowers: Math.max(0, (patchFromLive.followers || 0) - priorFollowers),
        source: patchFromLive.source || "live",
      };
      const withoutToday = prev.filter(r => !(r.platform === platformId && r.date === today));
      return [...withoutToday, newRow];
    });
  }

  function mergePosts(platformId, newPosts, source) {
    if (!newPosts || !newPosts.length) return;
    setPosts(prev => {
      const ids = new Set(newPosts.map(p => p.postId));
      const withoutDupes = prev.filter(p => !(p.platform === platformId && ids.has(p.postId)));
      const tagged = newPosts.map(p => ({ ...p, source: source || "live", fetchedAt: new Date().toISOString() }));
      return [...withoutDupes, ...tagged];
    });
  }

  async function connectAndFetch(platformId) {
    const conn = connections[platformId];
    updateConnection(platformId, { status: "loading", error: null });
    try {
      const fetcher = LIVE_FETCHERS[platformId];
      const result = await fetcher(conn.apiKey, conn.secondaryId);
      upsertRow(platformId, result);
      mergePosts(platformId, result.posts, "live");
      updateConnection(platformId, { status: "connected", error: null, lastSync: new Date().toLocaleString() });
    } catch (err) {
      updateConnection(platformId, { status: "error", error: err.message || String(err) });
    }
  }

  function logManualEntry(platformId, values, postEntry) {
    upsertRow(platformId, { ...values, source: "manual" });
    if (postEntry && postEntry.caption) {
      mergePosts(platformId, [{
        postId: `manual-${platformId}-${Date.now()}`,
        platform: platformId,
        date: fmtDate(new Date()),
        caption: postEntry.caption,
        likes: values.likes, comments: values.comments, shares: values.shares, views: 0,
        engagements: values.likes + values.comments + values.shares + (values.clicks || 0),
        engagementRate: values.reach > 0 ? +((values.likes + values.comments + values.shares) / values.reach * 100).toFixed(2) : 0,
        url: "",
      }], "manual");
    }
    updateConnection(platformId, { status: "connected", error: null, lastSync: new Date().toLocaleString() + " (manual)" });
  }

  const allDates = useMemo(() => Array.from(new Set(data.map(r => r.date))).sort(), [data]);
  const maxDate = allDates[allDates.length - 1];
  const minDateInRange = useMemo(() => {
    if (!maxDate) return null;
    const d = new Date(maxDate);
    d.setDate(d.getDate() - (range - 1));
    return fmtDate(d);
  }, [maxDate, range]);

  const filtered = useMemo(() => {
    return data.filter(r => {
      if (minDateInRange && r.date < minDateInRange) return false;
      if (platformFilter !== "all" && r.platform !== platformFilter) return false;
      return true;
    });
  }, [data, minDateInRange, platformFilter]);

  const sortedTable = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      let cmp;
      if (typeof av === "string") cmp = av.localeCompare(bv);
      else cmp = av - bv;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  const totalEngagements = sum(filtered, "engagements");
  const totalReach = sum(filtered, "reach");
  const totalPosts = sum(filtered, "posts");
  const avgEngRate = filtered.length ? +(sum(filtered, "engagementRate") / filtered.length).toFixed(2) : 0;

  const priorFiltered = useMemo(() => {
    if (!minDateInRange) return [];
    const start = new Date(minDateInRange);
    const priorEnd = new Date(start);
    priorEnd.setDate(priorEnd.getDate() - 1);
    const priorStart = new Date(priorEnd);
    priorStart.setDate(priorStart.getDate() - (range - 1));
    const ps = fmtDate(priorStart), pe = fmtDate(priorEnd);
    return data.filter(r => r.date >= ps && r.date <= pe && (platformFilter === "all" || r.platform === platformFilter));
  }, [data, minDateInRange, range, platformFilter]);
  const priorEngagements = sum(priorFiltered, "engagements");
  const pctChange = priorEngagements > 0 ? ((totalEngagements - priorEngagements) / priorEngagements * 100) : 0;

  const timeSeries = useMemo(() => {
    const byDate = {};
    filtered.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = { date: r.date };
      byDate[r.date][r.platform] = (byDate[r.date][r.platform] || 0) + r.engagements;
    });
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  const platformTotals = useMemo(() => {
    return PLATFORMS.map(p => {
      const rows = filtered.filter(r => r.platform === p.id);
      const latestFollowers = data.filter(r => r.platform === p.id).sort((a, b) => b.date.localeCompare(a.date))[0]?.followers || 0;
      return {
        ...p,
        engagements: sum(rows, "engagements"),
        reach: sum(rows, "reach"),
        posts: sum(rows, "posts"),
        followers: latestFollowers,
        avgEngRate: rows.length ? +(sum(rows, "engagementRate") / rows.length).toFixed(2) : 0,
      };
    }).sort((a, b) => b.engagements - a.engagements);
  }, [filtered, data]);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data.filter(r => r.date && r.platform);
        if (!rows.length) {
          setImportMsg({ type: "error", text: "No valid rows found. Check the column headers match the template." });
          return;
        }
        const normalized = rows.map(r => ({
          date: String(r.date).slice(0, 10),
          platform: String(r.platform).toLowerCase(),
          platformName: PLATFORM_MAP[String(r.platform).toLowerCase()]?.name || r.platform,
          posts: Number(r.posts) || 0,
          impressions: Number(r.impressions) || 0,
          reach: Number(r.reach) || 0,
          likes: Number(r.likes) || 0,
          comments: Number(r.comments) || 0,
          shares: Number(r.shares) || 0,
          clicks: Number(r.clicks) || 0,
          engagements: Number(r.engagements) || (Number(r.likes) || 0) + (Number(r.comments) || 0) + (Number(r.shares) || 0) + (Number(r.clicks) || 0),
          engagementRate: Number(r.engagementRate) || 0,
          followers: Number(r.followers) || 0,
          newFollowers: Number(r.newFollowers) || 0,
          source: "import",
        }));
        setData(normalized);
        setImportMsg({ type: "success", text: `Imported ${normalized.length} rows successfully.` });
      },
      error: (err) => setImportMsg({ type: "error", text: "Failed to parse CSV: " + err.message }),
    });
    e.target.value = "";
  }

  function resetToSample() {
    setData(SAMPLE_DATA);
    setImportMsg({ type: "success", text: "Restored sample demo data." });
  }

  const rangeOptions = [7, 14, 30, 60];

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#14213D] font-sans">
      <header className="bg-[#0B2545] text-white">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[#8DA9C4]">
              <span>Ghana Statistical Service</span>
              <span className="w-1 h-1 rounded-full bg-[#D9A441]" />
              <span>Digital Engagement</span>
            </div>
            <h1 className="text-2xl font-semibold mt-1 tracking-tight">Social Media Engagement Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConnections(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-md bg-[#D9A441] text-[#0B2545] font-medium hover:bg-[#c8963a] transition-colors"
            >
              <Plug size={15} /> Connect Accounts {connectedCount > 0 && `(${connectedCount})`}
            </button>
            <button
              onClick={() => setShowHelp(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Info size={15} /> CSV format
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">

        <div className="mb-5 rounded-lg border border-[#D9A441]/40 bg-[#FBF3E1] px-4 py-3 text-sm text-[#6B4E16] flex items-start gap-2">
          <Info size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            Rows tagged <strong>sample</strong> are synthetic demo data. Click <strong>Connect Accounts</strong> to pull
            real numbers from Facebook, Instagram, and YouTube directly (their APIs allow it), or log LinkedIn/X numbers
            manually — those two block direct browser API calls. No official GSS TikTok account was found.
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">
            <button
              onClick={() => setView("dashboard")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === "dashboard" ? "bg-[#0B2545] text-white" : "text-gray-600 hover:bg-gray-100"}`}
            >
              <LayoutDashboard size={15} /> Dashboard
            </button>
            <button
              onClick={() => setView("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === "table" ? "bg-[#0B2545] text-white" : "text-gray-600 hover:bg-gray-100"}`}
            >
              <Table2 size={15} /> Daily Table
            </button>
            <button
              onClick={() => setView("posts")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === "posts" ? "bg-[#0B2545] text-white" : "text-gray-600 hover:bg-gray-100"}`}
            >
              <FileText size={15} /> Posts {posts.length > 0 && `(${posts.length})`}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={platformFilter}
              onChange={e => setPlatformFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-md px-2.5 py-1.5 bg-white"
            >
              <option value="all">All platforms</option>
              {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <div className="flex items-center bg-white border border-gray-300 rounded-md overflow-hidden">
              {rangeOptions.map(r => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1.5 text-sm ${range === r ? "bg-[#0B2545] text-white" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  {r}d
                </button>
              ))}
            </div>

            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50"
            >
              <Upload size={14} /> Import CSV
            </button>
            <button
              onClick={() => downloadCSV(sortedTable, `gss-social-engagement_${minDateInRange}_to_${maxDate}.csv`)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-[#0B2545] text-white font-medium hover:bg-[#12315e]"
            >
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>

        {importMsg && (
          <div className={`mb-4 text-sm px-3 py-2 rounded-md ${importMsg.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
            {importMsg.text}{" "}
            {importMsg.type === "success" && data !== SAMPLE_DATA && (
              <button onClick={resetToSample} className="underline ml-2">Revert to sample data</button>
            )}
          </div>
        )}

        {view === "dashboard" ? (
          <DashboardView
            totalEngagements={totalEngagements}
            totalReach={totalReach}
            totalPosts={totalPosts}
            avgEngRate={avgEngRate}
            pctChange={pctChange}
            timeSeries={timeSeries}
            platformTotals={platformTotals}
            range={range}
            connections={connections}
          />
        ) : view === "table" ? (
          <TableView rows={sortedTable} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
        ) : (
          <PostsView posts={posts} platformFilter={platformFilter} />
        )}
      </main>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showConnections && (
        <ConnectionsModal
          connections={connections}
          updateConnection={updateConnection}
          onConnect={connectAndFetch}
          onManualLog={logManualEntry}
          onClose={() => setShowConnections(false)}
        />
      )}
    </div>
  );
}

function KPICard({ label, value, sub, icon: Icon, trend }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">{label}</div>
        {Icon && <Icon size={16} className="text-gray-400" />}
      </div>
      <div className="text-2xl font-semibold mt-1.5 text-[#0B2545]">{value}</div>
      {sub && (
        <div className={`text-xs mt-1 flex items-center gap-1 ${trend === "up" ? "text-green-600" : trend === "down" ? "text-red-500" : "text-gray-500"}`}>
          {trend === "up" && <TrendingUp size={12} />}
          {trend === "down" && <TrendingDown size={12} />}
          {sub}
        </div>
      )}
    </div>
  );
}

function SourceBadge({ source }) {
  const styles = {
    sample: "bg-gray-100 text-gray-500",
    import: "bg-blue-50 text-blue-600",
    live: "bg-green-50 text-green-700",
    manual: "bg-amber-50 text-amber-700",
  };
  const labels = { sample: "sample", import: "imported", live: "live", manual: "manual" };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide ${styles[source] || styles.sample}`}>{labels[source] || source}</span>;
}

function DashboardView({ totalEngagements, totalReach, totalPosts, avgEngRate, pctChange, timeSeries, platformTotals, range, connections }) {
  const pieData = platformTotals.filter(p => p.engagements > 0).map(p => ({ name: p.name, value: p.engagements, color: p.color }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          label="Total Engagements"
          value={NUMBER_FMT.format(totalEngagements)}
          sub={`${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}% vs prior ${range}d`}
          trend={pctChange >= 0 ? "up" : "down"}
          icon={TrendingUp}
        />
        <KPICard label="Total Reach" value={NUMBER_FMT.format(totalReach)} sub={`across ${range} days`} icon={Users} />
        <KPICard label="Posts Published" value={NUMBER_FMT.format(totalPosts)} sub={`avg ${(totalPosts / range).toFixed(1)}/day`} />
        <KPICard label="Avg. Engagement Rate" value={`${avgEngRate}%`} sub="engagements ÷ reach" />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-[#0B2545] mb-4">Daily Engagements by Platform</h3>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={timeSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {PLATFORMS.map(p => (
              <Area key={p.id} type="monotone" dataKey={p.id} name={p.name} stackId="1" stroke={p.color} fill={p.color} fillOpacity={0.55} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-[#0B2545] mb-4">Engagements by Platform</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={platformTotals} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
              <Tooltip formatter={v => NUMBER_FMT.format(v)} />
              <Bar dataKey="engagements" radius={[0, 4, 4, 0]}>
                {platformTotals.map((p, i) => <Cell key={i} fill={p.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-[#0B2545] mb-4">Share of Total Engagement</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {pieData.map((p, i) => <Cell key={i} fill={p.color} />)}
              </Pie>
              <Tooltip formatter={v => NUMBER_FMT.format(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[#0B2545] mb-3">Platform Breakdown</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {platformTotals.map(p => {
            const Icon = p.icon;
            const conn = connections[p.id];
            return (
              <div key={p.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: p.color + "1A" }}>
                    <Icon size={15} style={{ color: p.color }} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#0B2545]">{p.name}</div>
                    <div className="text-[11px] text-gray-500">{p.handle}</div>
                  </div>
                </a>
                <div className="space-y-1 text-xs mb-2">
                  <div className="flex justify-between"><span className="text-gray-500">Followers</span><span className="font-medium">{NUMBER_FMT.format(p.followers)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Engagements</span><span className="font-medium">{NUMBER_FMT.format(p.engagements)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Posts</span><span className="font-medium">{NUMBER_FMT.format(p.posts)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Avg. Eng. Rate</span><span className="font-medium">{p.avgEngRate}%</span></div>
                </div>
                <div className="pt-2 border-t border-gray-100 flex items-center gap-1 text-[11px]">
                  {conn?.status === "connected" ? (
                    <><CheckCircle2 size={12} className="text-green-600" /> <span className="text-green-700">Synced {conn.lastSync}</span></>
                  ) : conn?.status === "error" ? (
                    <><AlertCircle size={12} className="text-red-500" /> <span className="text-red-600">Sync failed</span></>
                  ) : (
                    <span className="text-gray-400">Not connected</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TableView({ rows, sortKey, sortDir, onSort }) {
  const columns = [
    { key: "date", label: "Date" },
    { key: "platformName", label: "Platform" },
    { key: "posts", label: "Posts" },
    { key: "impressions", label: "Impressions" },
    { key: "reach", label: "Reach" },
    { key: "likes", label: "Likes" },
    { key: "comments", label: "Comments" },
    { key: "shares", label: "Shares" },
    { key: "clicks", label: "Clicks" },
    { key: "engagements", label: "Engagements" },
    { key: "engagementRate", label: "Eng. Rate %" },
    { key: "followers", label: "Followers" },
    { key: "newFollowers", label: "New Followers" },
    { key: "source", label: "Source" },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto max-h-[70vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#0B2545] text-white z-10">
            <tr>
              {columns.map(c => (
                <th
                  key={c.key}
                  onClick={() => onSort(c.key)}
                  className="px-3 py-2.5 text-left font-medium cursor-pointer select-none whitespace-nowrap hover:bg-[#12315e]"
                >
                  <span className="flex items-center gap-1">
                    {c.label}
                    {sortKey === c.key && <ChevronDown size={12} className={sortDir === "asc" ? "rotate-180" : ""} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i % 2 ? "bg-gray-50" : "bg-white"}>
                <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                <td className="px-3 py-2 whitespace-nowrap font-medium" style={{ color: PLATFORM_MAP[r.platform]?.color }}>{r.platformName}</td>
                <td className="px-3 py-2">{r.posts}</td>
                <td className="px-3 py-2">{NUMBER_FMT.format(r.impressions)}</td>
                <td className="px-3 py-2">{NUMBER_FMT.format(r.reach)}</td>
                <td className="px-3 py-2">{NUMBER_FMT.format(r.likes)}</td>
                <td className="px-3 py-2">{NUMBER_FMT.format(r.comments)}</td>
                <td className="px-3 py-2">{NUMBER_FMT.format(r.shares)}</td>
                <td className="px-3 py-2">{NUMBER_FMT.format(r.clicks)}</td>
                <td className="px-3 py-2 font-medium">{NUMBER_FMT.format(r.engagements)}</td>
                <td className="px-3 py-2">{r.engagementRate}%</td>
                <td className="px-3 py-2">{NUMBER_FMT.format(r.followers)}</td>
                <td className="px-3 py-2">+{r.newFollowers}</td>
                <td className="px-3 py-2"><SourceBadge source={r.source || "sample"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 text-xs text-gray-500 border-t border-gray-100">
        {rows.length} rows — click any column header to sort
      </div>
    </div>
  );
}

function PostsView({ posts, platformFilter }) {
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  const filtered = platformFilter === "all" ? posts : posts.filter(p => p.platform === platformFilter);
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    let cmp = typeof av === "string" ? String(av).localeCompare(String(bv)) : (av - bv);
    return sortDir === "asc" ? cmp : -cmp;
  });

  function onSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  if (!posts.length) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-10 text-center">
        <FileText size={28} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          No individual post data yet. Click <strong>Connect Accounts</strong> and sync Facebook, Instagram, or YouTube
          to pull captions and per-post engagement automatically, or log a LinkedIn/X post manually with a caption.
        </p>
      </div>
    );
  }

  const columns = [
    { key: "date", label: "Date" },
    { key: "platform", label: "Platform" },
    { key: "caption", label: "Caption" },
    { key: "likes", label: "Likes" },
    { key: "comments", label: "Comments" },
    { key: "shares", label: "Shares" },
    { key: "views", label: "Views" },
    { key: "engagements", label: "Engagements" },
    { key: "engagementRate", label: "Eng. Rate %" },
    { key: "source", label: "Source" },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <span className="text-xs text-gray-500">{sorted.length} posts</span>
        <button
          onClick={() => downloadCSV(sorted.map(({ postId, fetchedAt, ...rest }) => rest), `gss-posts_${fmtDate(new Date())}.csv`)}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50"
        >
          <Download size={12} /> Export posts CSV
        </button>
      </div>
      <div className="overflow-x-auto max-h-[70vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#0B2545] text-white z-10">
            <tr>
              {columns.map(c => (
                <th key={c.key} onClick={() => onSort(c.key)} className="px-3 py-2.5 text-left font-medium cursor-pointer select-none whitespace-nowrap hover:bg-[#12315e]">
                  <span className="flex items-center gap-1">{c.label}{sortKey === c.key && <ChevronDown size={12} className={sortDir === "asc" ? "rotate-180" : ""} />}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={p.postId + i} className={i % 2 ? "bg-gray-50" : "bg-white"}>
                <td className="px-3 py-2 whitespace-nowrap">{p.date}</td>
                <td className="px-3 py-2 whitespace-nowrap font-medium" style={{ color: PLATFORM_MAP[p.platform]?.color }}>{PLATFORM_MAP[p.platform]?.name}</td>
                <td className="px-3 py-2 max-w-xs">
                  <div className="truncate" title={p.caption}>
                    {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1">{p.caption || "(no caption)"} <ExternalLink size={11} className="flex-shrink-0" /></a> : (p.caption || "(no caption)")}
                  </div>
                </td>
                <td className="px-3 py-2">{NUMBER_FMT.format(p.likes)}</td>
                <td className="px-3 py-2">{NUMBER_FMT.format(p.comments)}</td>
                <td className="px-3 py-2">{NUMBER_FMT.format(p.shares)}</td>
                <td className="px-3 py-2">{NUMBER_FMT.format(p.views)}</td>
                <td className="px-3 py-2 font-medium">{NUMBER_FMT.format(p.engagements)}</td>
                <td className="px-3 py-2">{p.engagementRate}%</td>
                <td className="px-3 py-2"><SourceBadge source={p.source} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HelpModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#0B2545]">CSV import/export format</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon size={20} /></button>
        </div>
        <div className="text-sm text-gray-700 space-y-4">
          <p>Use this format if you're importing a bulk export rather than connecting accounts live.</p>
          <div>
            <h3 className="font-semibold text-[#0B2545] mb-1">Required CSV columns</h3>
            <div className="bg-gray-50 rounded-md p-3 font-mono text-xs overflow-x-auto">
              date,platform,posts,impressions,reach,likes,comments,shares,clicks,followers,newFollowers
            </div>
            <p className="mt-2 text-xs text-gray-500">
              <code>date</code> format YYYY-MM-DD. <code>platform</code> must be one of: facebook, x, instagram, linkedin, youtube.
              <code>engagements</code> and <code>engagementRate</code> are computed automatically if omitted.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectionsModal({ connections, updateConnection, onConnect, onManualLog, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-3xl w-full p-6 max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-[#0B2545]">Connect Accounts</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon size={20} /></button>
        </div>
        <div className="text-xs text-gray-500 mb-5 flex items-start gap-1.5">
          <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
          Keys and tokens you paste here stay in this browser tab's memory only — they are never saved or sent
          anywhere except directly to the platform's own API, and they clear the moment you refresh or close this page.
        </div>

        <div className="space-y-5">
          {PLATFORMS.map(p => (
            p.corsLive
              ? <LiveConnectCard key={p.id} platform={p} conn={connections[p.id]} updateConnection={updateConnection} onConnect={onConnect} />
              : <ManualConnectCard key={p.id} platform={p} conn={connections[p.id]} onManualLog={onManualLog} />
          ))}
        </div>
      </div>
    </div>
  );
}

function fieldsForPlatform(id) {
  if (id === "youtube") return { keyLabel: "API key (Google Cloud)", idLabel: "Channel ID" };
  if (id === "facebook") return { keyLabel: "Page Access Token", idLabel: "Page ID" };
  if (id === "instagram") return { keyLabel: "Access Token", idLabel: "IG Business Account ID" };
  return { keyLabel: "Access Token", idLabel: "Account ID" };
}

function LiveConnectCard({ platform, conn, updateConnection, onConnect }) {
  const Icon = platform.icon;
  const { keyLabel, idLabel } = fieldsForPlatform(platform.id);
  const canSubmit = conn.apiKey.trim() && conn.secondaryId.trim() && conn.status !== "loading";

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: platform.color + "1A" }}>
            <Icon size={15} style={{ color: platform.color }} />
          </div>
          <div className="font-semibold text-sm text-[#0B2545]">{platform.name}</div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">Live API — browser-fetchable</span>
        </div>
        {conn.status === "connected" && <span className="flex items-center gap-1 text-xs text-green-700"><CheckCircle2 size={13} /> Connected</span>}
      </div>

      <div className="grid sm:grid-cols-2 gap-2 mb-2">
        <input
          type="password"
          placeholder={keyLabel}
          value={conn.apiKey}
          onChange={e => updateConnection(platform.id, { apiKey: e.target.value })}
          className="text-sm border border-gray-300 rounded-md px-2.5 py-1.5"
        />
        <input
          type="text"
          placeholder={idLabel}
          value={conn.secondaryId}
          onChange={e => updateConnection(platform.id, { secondaryId: e.target.value })}
          className="text-sm border border-gray-300 rounded-md px-2.5 py-1.5"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          disabled={!canSubmit}
          onClick={() => onConnect(platform.id)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-[#0B2545] text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#12315e]"
        >
          {conn.status === "loading" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {conn.status === "connected" ? "Re-sync now" : "Connect & fetch"}
        </button>
        {conn.lastSync && <span className="text-xs text-gray-400">Last synced {conn.lastSync}</span>}
      </div>

      {conn.status === "error" && (
        <div className="mt-2 text-xs text-red-600 flex items-start gap-1.5">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {conn.error}
        </div>
      )}
    </div>
  );
}

function ManualConnectCard({ platform, conn, onManualLog }) {
  const Icon = platform.icon;
  const [form, setForm] = useState({ followers: "", likes: "", comments: "", shares: "", clicks: "", reach: "", postCount: "" });
  const [caption, setCaption] = useState("");

  function submit() {
    const values = {
      followers: Number(form.followers) || 0,
      likes: Number(form.likes) || 0,
      comments: Number(form.comments) || 0,
      shares: Number(form.shares) || 0,
      clicks: Number(form.clicks) || 0,
      reach: Number(form.reach) || 0,
      postCount: Number(form.postCount) || 0,
    };
    onManualLog(platform.id, values, caption.trim() ? { caption: caption.trim() } : null);
    setCaption("");
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: platform.color + "1A" }}>
            <Icon size={15} style={{ color: platform.color }} />
          </div>
          <div className="font-semibold text-sm text-[#0B2545]">{platform.name}</div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">API blocks browser calls — manual entry</span>
        </div>
        {conn.status === "connected" && <span className="flex items-center gap-1 text-xs text-green-700"><CheckCircle2 size={13} /> Logged</span>}
      </div>
      <p className="text-xs text-gray-500 mb-3">
        {platform.id === "linkedin"
          ? "LinkedIn's API requires partner approval and doesn't allow direct browser requests. Copy today's numbers from the LinkedIn Page analytics tab and log them here."
          : "As of Feb 2026 X's API has no free tier and blocks direct browser calls. Copy today's numbers from X Analytics and log them here."}
        {" "}A live connection would need a small backend proxy handling OAuth — happy to write that server-side script separately.
      </p>
      <input
        type="text"
        placeholder="Post caption/title (optional — adds this post to the Posts tab)"
        value={caption}
        onChange={e => setCaption(e.target.value)}
        className="text-sm border border-gray-300 rounded-md px-2.5 py-1.5 w-full mb-2"
      />
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
        {[
          ["followers", "Followers"], ["reach", "Reach"], ["likes", "Likes"],
          ["comments", "Comments"], ["shares", "Shares"], ["clicks", "Clicks"], ["postCount", "Posts"],
        ].map(([key, label]) => (
          <input
            key={key}
            type="number"
            placeholder={label}
            value={form[key]}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            className="text-sm border border-gray-300 rounded-md px-2 py-1.5 w-full"
          />
        ))}
      </div>
      <button
        onClick={submit}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-[#0B2545] text-white font-medium hover:bg-[#12315e]"
      >
        <CheckCircle2 size={14} /> Log today's numbers
      </button>
    </div>
  );
}
