// Renders the daily fleet digest (markdown) from the files fleet/bin/digest.sh
// gathered into the run directory, and writes the repo-wide gauges the run
// records as metrics. No network, no LLM: node fleet/lib/digest-render.mjs <run-dir>
//
// Inputs in <run-dir> (any may be missing; missing means "unknown", not zero):
//   signals-created.json  issues labelled `signal` created in the window
//   signals-open.json     open `signal` issues
//   needs-decision.json   open `fleet:needs-decision` issues
//   prs.json              last 100 PRs (all states); fleet PRs have head fleet/fixer-*
//   commits.json          commits on the base branch since the window start (GitHub API shape)
//   digests-open.json     open `fleet:digest` issues (closed by the script after posting)
//   runs.json             [{dir, ...result.json}] for every run directory with a result
// Env: DIGEST_SINCE, DIGEST_NOW (ISO), DIGEST_DATE, FLEET_REPO, FLEET_DASHBOARD_URL,
//      FLEET_BASE_BRANCH, FLEET_RUN_NAME_DIR (basename of this run's directory)
// Outputs: <run-dir>/digest.md and <run-dir>/gauges.json
import fs from "node:fs"
import path from "node:path"

const runDir = process.argv[2]
if (!runDir) {
  process.stderr.write("usage: digest-render.mjs <run-dir>\n")
  process.exit(2)
}
const env = process.env
const repo = env.FLEET_REPO || "TheExGenesis/community-archive"
const baseBranch = env.FLEET_BASE_BRANCH || "main"
const dashboard = env.FLEET_DASHBOARD_URL || "https://neatrowan1763.grafana.net/d/ca-fleet"
const since = Date.parse(env.DIGEST_SINCE)
const now = env.DIGEST_NOW ? Date.parse(env.DIGEST_NOW) : Date.now()
const date = env.DIGEST_DATE || new Date(now).toISOString().slice(0, 10)

const read = (name) => {
  const file = path.join(runDir, name)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return null
  }
}
const list = (name) => {
  const v = read(name)
  return Array.isArray(v) ? v : null
}

// A run that finished in the same second the digest started still counts.
const inWindow = (iso) => {
  const t = Date.parse(iso)
  return Number.isFinite(t) && t >= since && t < now + 1000
}
// Times inside the 24-hour window are unambiguous as HH:MM; older ones get the day.
const hhmm = (iso) => {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "?"
  const d = new Date(t).toISOString()
  return (inWindow(iso) ? "" : d.slice(5, 10) + " ") + d.slice(11, 16) + "Z"
}
const ago = (iso) => {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000))
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  return `${Math.floor(s / 86400)} d`
}
const dur = (s) => {
  s = Number(s) || 0
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`
}
const usd = (n) => `$${(Number(n) || 0).toFixed(2)}`
const link = (text, url) => (url ? `[${text}](${url})` : text)
const issueUrl = (n) => `https://github.com/${repo}/issues/${n}`
const labelNames = (labels) => (labels || []).map((l) => (typeof l === "string" ? l : l.name))
const fleetLabel = (labels) => labelNames(labels).find((n) => n.startsWith("fleet:")) || ""
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")

const out = []
const say = (...lines) => out.push(...lines)

// ─── Header ────────────────────────────────────────────────────────────────
const q = (s) => encodeURIComponent(s)
say(
  `Fleet digest for **${date}**. Window ${new Date(since).toISOString().slice(0, 16)}Z → ${new Date(now).toISOString().slice(0, 16)}Z (UTC).`,
  "",
  [
    link("Dashboard", dashboard),
    link("Inbox", `https://github.com/${repo}/issues?q=${q("is:open label:signal")}`),
    link("Needs decision", `https://github.com/${repo}/issues?q=${q("is:open label:fleet:needs-decision")}`),
    link("Fleet PRs", `https://github.com/${repo}/pulls?q=${q("is:pr head:fleet/fixer-")}`),
    link("Learnings", `https://github.com/${repo}/tree/${baseBranch}/memos/fleet/learnings`),
  ].join(" · "),
  "",
)

// ─── Signals ───────────────────────────────────────────────────────────────
const signalsCreated = list("signals-created.json")
const signalsOpen = list("signals-open.json")
const received = (signalsCreated || []).filter((i) => inWindow(i.createdAt))
say(`## Signals received · ${signalsCreated ? received.length : "unknown"}`, "")
if (!signalsCreated) {
  say("_Could not list signals (gh failed)._", "")
} else if (received.length === 0) {
  say("_No new signals in the window._", "")
} else {
  say("| Signal | Received | Now |", "| --- | --- | --- |")
  for (const i of received.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    const state = String(i.state || "").toLowerCase() + (fleetLabel(i.labels) ? ` · ${fleetLabel(i.labels)}` : "")
    say(`| ${link(`#${i.number} ${esc(i.title)}`, i.url || issueUrl(i.number))} | ${hhmm(i.createdAt)} | ${state} |`)
  }
  say("")
}
if (signalsOpen) {
  const oldest = [...signalsOpen].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0]
  say(
    `Open signals in total: **${signalsOpen.length}**${oldest ? ` (oldest ${link(`#${oldest.number}`, oldest.url || issueUrl(oldest.number))}, ${ago(oldest.createdAt)} old)` : ""}.`,
    "",
  )
}

// ─── Runs ──────────────────────────────────────────────────────────────────
const runs = (list("runs.json") || []).filter((r) => r.finished_at && inWindow(r.finished_at))
const byRoutine = (name) => runs.filter((r) => r.run === name).sort((a, b) => Date.parse(a.finished_at) - Date.parse(b.finished_at))
const countBy = (items, key) => {
  const m = new Map()
  for (const it of items) m.set(it[key], (m.get(it[key]) || 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}
const fixerRuns = byRoutine("fixer")
const prs = list("prs.json")
const fleetPrs = (prs || []).filter((p) => String(p.headRefName || "").startsWith("fleet/fixer-"))
const prsOpened = fleetPrs.filter((p) => inWindow(p.createdAt))
const prsMerged = fleetPrs.filter((p) => p.mergedAt && inWindow(p.mergedAt))
const prsClosedUnmerged = fleetPrs.filter((p) => !p.mergedAt && p.closedAt && inWindow(p.closedAt))
const prsOpen = fleetPrs.filter((p) => String(p.state).toUpperCase() === "OPEN")
const commits = list("commits.json")
const reverts = (commits || []).filter((c) => /^Revert "\[fleet:fixer\]/.test((c.commit && c.commit.message) || c.message || ""))
const fleetCommits = (commits || []).filter((c) => /^\[fleet:fixer\]/.test((c.commit && c.commit.message) || c.message || ""))

const summary = countBy(fixerRuns, "outcome").map(([o, n]) => `${n} ${o}`).join(", ")
say(`## Fixer · ${fixerRuns.length} run${fixerRuns.length === 1 ? "" : "s"}${summary ? ` (${summary})` : ""}`, "")
const worked = fixerRuns.filter((r) => !["idle", "locked"].includes(r.outcome))
if (fixerRuns.length === 0) {
  say("_No fixer runs recorded in the window (runs/ is rotated after 7 days; the timer may be off)._", "")
} else if (worked.length === 0) {
  say("_Every run found the inbox empty._", "")
} else {
  say("| Finished | Issue | Outcome | Shipped | Learning | Took | Cost |", "| --- | --- | --- | --- | --- | --- | --- |")
  for (const r of worked) {
    const issue = r.issue ? link(`#${r.issue}`, issueUrl(r.issue)) : "—"
    let shipped = "—"
    if (r.outcome === "pr_opened" && r.pr_or_commit) shipped = link(`PR #${String(r.pr_or_commit).split("/").pop()}`, r.pr_or_commit)
    else if (r.outcome === "pushed_main" && r.pr_or_commit) shipped = link(String(r.pr_or_commit).slice(0, 8), `https://github.com/${repo}/commit/${r.pr_or_commit}`)
    let learning = "—"
    if (r.learning) {
      const ref = r.outcome === "pushed_main" ? baseBranch : r.branch || baseBranch
      learning = link(path.basename(r.learning, ".md"), `https://github.com/${repo}/blob/${ref}/${r.learning}`)
    }
    const cost = r.usage && typeof r.usage.cost_usd === "number" ? usd(r.usage.cost_usd) : "—"
    say(`| ${hhmm(r.finished_at)} | ${issue} | ${r.outcome}${r.classification && r.classification !== "bug" ? ` (${r.classification})` : ""} | ${shipped} | ${learning} | ${dur(r.duration_s)} | ${cost} |`)
  }
  say("")
}
if (prs) {
  say(
    `Fleet PRs in the window: opened **${prsOpened.length}** · merged **${prsMerged.length}** · closed without merge **${prsClosedUnmerged.length}**.` +
      (commits ? ` Fleet commits on \`${baseBranch}\`: **${fleetCommits.length}**, reverts of fleet commits: **${reverts.length}**.` : ""),
  )
  for (const p of prsMerged) say(`- merged ${link(`#${p.number} ${esc(p.title)}`, p.url)} at ${hhmm(p.mergedAt)}`)
  for (const p of prsClosedUnmerged) say(`- closed without merge ${link(`#${p.number} ${esc(p.title)}`, p.url)} at ${hhmm(p.closedAt)}`)
  for (const c of reverts) say(`- revert ${link(String(c.sha).slice(0, 8), c.html_url || c.url)}: ${esc(((c.commit && c.commit.message) || c.message || "").split("\n")[0])}`)
  say("")
}

// ─── Canary ────────────────────────────────────────────────────────────────
const canaryRuns = byRoutine("canary")
const allCanary = (list("runs.json") || []).filter((r) => r.run === "canary" && r.finished_at).sort((a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at))
const latest = allCanary[0]
say("## Canary", "")
if (!latest) {
  say("_No canary result on disk._", "")
} else {
  const checks = latest.checks || {}
  const names = Object.keys(checks)
  const failing = names.filter((n) => checks[n].verdict === "failed")
  const inconclusive = names.filter((n) => checks[n].verdict === "inconclusive")
  const okCount = names.filter((n) => checks[n].verdict === "ok").length
  let line = `Latest: **${latest.outcome}** at ${hhmm(latest.finished_at)} (${ago(latest.finished_at)} ago), ${okCount}/${names.length} checks ok`
  if (failing.length) line += `; failing: ${failing.join(", ")}`
  if (inconclusive.length) line += `; inconclusive: ${inconclusive.join(", ")}`
  if (latest.deployment && latest.deployment.sha) line += `; production at \`${String(latest.deployment.sha).slice(0, 8)}\``
  say(line + ".", "")
  if (canaryRuns.length) {
    const counts = countBy(canaryRuns, "outcome").map(([o, n]) => `${o} ${n}`).join(" · ")
    say(`Runs in window: **${canaryRuns.length}** (${counts}).`)
    const newFailures = canaryRuns.flatMap((r) => (r.new_failures || []).map((n) => `${n} at ${hhmm(r.finished_at)}`))
    const recovered = canaryRuns.flatMap((r) => (r.recovered || []).map((n) => `${n} at ${hhmm(r.finished_at)}`))
    const rollbacks = canaryRuns.filter((r) => r.rollback && r.rollback.attempted)
    if (newFailures.length) say(`- new failures: ${newFailures.join(", ")}`)
    if (recovered.length) say(`- recovered: ${recovered.join(", ")}`)
    for (const r of rollbacks) {
      const rb = r.rollback
      say(`- rollback at ${hhmm(r.finished_at)}: ${rb.ok ? "rolled back" : "FAILED to roll back"} ${rb.from && rb.from.url} → ${rb.to && rb.to.url}`)
    }
    say("")
  } else {
    say("_No canary runs in the window._", "")
  }
}

// ─── Cost ──────────────────────────────────────────────────────────────────
const withUsage = runs.filter((r) => r.usage)
const tokens = { input: 0, output: 0, cache_read: 0, cache_creation: 0 }
let cost = 0
let calls = 0
for (const r of withUsage) {
  cost += Number(r.usage.cost_usd) || 0
  calls += Number(r.usage.calls) || 0
  for (const k of Object.keys(tokens)) tokens[k] += Number((r.usage.tokens || {})[k]) || 0
}
say("## Cost", "")
if (withUsage.length === 0) {
  say("_No Claude calls recorded in the window._", "")
} else {
  say(
    `**${usd(cost)}** across ${calls} Claude call${calls === 1 ? "" : "s"} in ${withUsage.length} run${withUsage.length === 1 ? "" : "s"}: ` +
      `${tokens.input.toLocaleString("en-US")} input · ${tokens.output.toLocaleString("en-US")} output · ` +
      `${tokens.cache_read.toLocaleString("en-US")} cache read · ${tokens.cache_creation.toLocaleString("en-US")} cache write tokens. ` +
      "Cost is what `claude -p` reports; a Max login still reports the list-price equivalent.",
    "",
  )
}

// ─── Fleet failures ────────────────────────────────────────────────────────
const failures = runs.filter((r) => r.outcome === "error").sort((a, b) => Date.parse(a.finished_at) - Date.parse(b.finished_at))
say(`## Fleet failures · ${failures.length}`, "")
if (failures.length === 0) {
  say("_None: every run finished without a harness error._", "")
} else {
  for (const r of failures) {
    let reason = ""
    const signalFile = path.join(r.dir || "", "signal-failure.json")
    if (r.dir && fs.existsSync(signalFile)) {
      try {
        const s = JSON.parse(fs.readFileSync(signalFile, "utf8"))[0]
        reason = ` · ${s.details && s.details.kind ? s.details.kind + ": " : ""}${esc((s.details && s.details.message) || s.summary || "")}`
      } catch {
        // leave reason empty
      }
    }
    say(`- ${hhmm(r.finished_at)} **${r.run}**${r.issue ? ` on #${r.issue}` : ""}${reason} (run \`${path.basename(r.dir || "?")}\`)`)
  }
  say("", "These are filed in the inbox as `[signal:generic] Fleet <routine> failed: <kind>`.", "")
}

// ─── Other routines ────────────────────────────────────────────────────────
const others = runs.filter((r) => !["fixer", "canary", "digest"].includes(r.run))
if (others.length) {
  say("## Other routines", "")
  for (const [name, n] of countBy(others, "run")) {
    const outcomes = countBy(others.filter((r) => r.run === name), "outcome").map(([o, c]) => `${c} ${o}`).join(", ")
    say(`- **${name}**: ${n} run${n === 1 ? "" : "s"} (${outcomes})`)
  }
  say("")
}

// ─── Needs a human ─────────────────────────────────────────────────────────
const needsDecision = list("needs-decision.json")
say("## Needs Christine", "")
let waiting = 0
if (needsDecision === null) {
  say("_Could not list fleet:needs-decision issues (gh failed)._", "")
} else if (needsDecision.length) {
  waiting += needsDecision.length
  say(`**Decisions · ${needsDecision.length}**`, "")
  for (const i of needsDecision.sort((a, b) => Date.parse(a.updatedAt || a.createdAt) - Date.parse(b.updatedAt || b.createdAt))) {
    say(`- ${link(`#${i.number} ${esc(i.title)}`, i.url || issueUrl(i.number))} · waiting ${ago(i.updatedAt || i.createdAt)}`)
  }
  say("")
}
if (prs && prsOpen.length) {
  waiting += prsOpen.length
  say(`**Fleet PRs awaiting merge · ${prsOpen.length}**`, "")
  for (const p of prsOpen.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    say(`- ${link(`#${p.number} ${esc(p.title)}`, p.url)} · open ${ago(p.createdAt)}`)
  }
  say("")
}
if (waiting === 0 && needsDecision !== null) say("_Nothing waiting on a human._", "")

// ─── Footer ────────────────────────────────────────────────────────────────
const previous = (list("digests-open.json") || []).map((d) => link(`#${d.number}`, d.url || issueUrl(d.number)))
say(
  "---",
  `_Generated by \`fleet/bin/digest.sh\` (run \`${env.FLEET_RUN_NAME_DIR || path.basename(runDir)}\`).` +
    (previous.length ? ` Closes the previous digest ${previous.join(", ")}.` : "") +
    "_",
)

fs.writeFileSync(path.join(runDir, "digest.md"), out.join("\n") + "\n")

// ─── Gauges for fleet_record_metrics ───────────────────────────────────────
const gauges = {}
if (needsDecision) gauges.fleet_needs_decision_issues = needsDecision.length
if (prs) {
  gauges.fleet_open_fixer_prs = prsOpen.length
  gauges.fleet_prs_opened_24h = prsOpened.length
  gauges.fleet_prs_merged_24h = prsMerged.length
  gauges.fleet_prs_closed_unmerged_24h = prsClosedUnmerged.length
}
if (commits) gauges.fleet_reverts_24h = reverts.length
if (signalsOpen) gauges.fleet_signals_open = signalsOpen.length
if (signalsCreated) gauges.fleet_signals_received_24h = received.length
gauges.fleet_failures_24h = failures.length
gauges.fleet_cost_usd_24h = Math.round(cost * 1e4) / 1e4
fs.writeFileSync(path.join(runDir, "gauges.json"), JSON.stringify(gauges, null, 2) + "\n")
