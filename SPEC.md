# PR Updater (Deno CLI) Tech Spec Draft

## Problem
Updating GitHub pull requests (PRs) is repetitive and error-prone:

- You run same boilerplate commands each time.
- You can lose track of current branch/base and make mistakes.
- You mainly care about:
  1. Whether updating with base branch was clean.
  2. Whether conflicts happened and required resolution.
  3. Whether PR needs your attention (conflicts, PR diff changed, skipped, etc.).

Tool must support:

- Manual runs.
- Unattended background runs (once/hour).
- A review/approval gate before pushing any changes.

## Goals
- Discover all open PRs authored by you (via GitHub CLI).
- Detect PR stacks and process in dependency order.
- For each PR:
  - Update remote refs.
  - Merge base branch into PR head branch.
  - Detect merge conflicts.
  - If conflicts: run a resolver agent (configurable) to resolve, then record summary.
  - If no conflicts: determine whether PR likely needs re-review due to base overlap.
- Produce an end-of-run report you can review later.
- Do not push anything automatically. Push only after explicit user approval.
- Handle git worktrees gracefully.

## Non-Goals (v0)
- Automatically creating new PRs.
- Automatically rebasing/force-pushing (unless explicitly opted-in later).
- Automatically approving/merging PRs.
- CI/status checks aggregation.
- Review state aggregation.
- Posting comments/reviews to GitHub.
- Built-in daemon. User runs via cron/launchd for hourly unattended runs.

## Constraints / Assumptions
- Runs locally on your machine (not GitHub Actions).
- Uses `gh` (GitHub CLI) for PR discovery and PR metadata.
- Uses `git` for all merges and conflict detection.
- Must be safe for unattended hourly execution:
  - No prompts.
  - No destructive operations.
  - Avoid touching your active working directories by default.

## Terminology
- **Base branch**: PR target branch (`baseRefName`), e.g. `main` or another branch in a stack.
- **Head branch**: PR source branch (`headRefName`).
- **Stack**: chain of PRs where PR2 targets PR1 head branch, etc.
- **Cache repo**: isolated local clone used only by this tool.

## High-Level Approach
Default safe mode: operate in isolated cache clones, never in your local dev repo.

Per repo:

1. Discover your open PRs.
2. Build stack graph and process PRs bottom-up (base first).
3. For each PR, in its own isolated working state:
   - Fetch base + head refs.
   - Checkout head.
   - Merge base into head.
   - On conflicts: invoke resolver hook; re-attempt merge completion.
   - Record results (conflicts, files impacted).
4. End: write report + mark “pending push” branches.
5. Later, explicit command pushes pending branches.

Invariant:

- At most one pending push set per repo.

## CLI Surface (Proposed)

### `pr-updater run`
Runs one update pass. 

Pending-approval rule:

- If pending push set exists, `run` does not modify branches.
- Exception: if pending push set older than `pendingTtlHours` (default 24), tool clears pending state AND cleans up local-only artifacts:
  - Delete local branches created by tool for those PRs (match prefix `pr-updater/`).
  - Delete any temp worktrees/directories created by tool.
  - Do not delete anything remote.
  - Note: local commits may remain as unreachable objects until git GC; that ok.

Flags:

- `--repo owner/name` (optional): restrict to one configured repo.
- `--pr 123` (optional): restrict to one PR.
- `--dry-run`: do everything except writing commits.
- `--force`: if pending push set exists, first discard it (same cleanup as TTL) then run.
- `--verbose`.

Default behavior:

- Without `--repo`, runs across all configured `repos[]`.

### `pr-updater status`
Shows latest report summary and pending actions.

Flags:

- `--json`: print JSON (stable contract for Raycast).

### `pr-updater push`
Pushes branches for PRs that were updated locally and are marked “pending push”.

Flags:

- `--repo owner/name` (required): push pending for one repo.
- `--pr 123`: push only one.

### `pr-updater config`
Prints effective config; optionally edits/validates.

## Configuration
Config file location (proposal):

these directories are hard-coded into the tool. I can run this tool from any directory on my machine and the tool will run no problem because it always reads config and writes state to these fixed locations.

- macOS: `~/Library/Application Support/pr-updater/config.json`
- Linux: `~/.config/pr-updater/config.json`

State/report location:

- macOS: `~/Library/Application Support/pr-updater/state/`
- Linux: `~/.local/state/pr-updater/`

Cache location:

- macOS: `~/Library/Caches/pr-updater/`
- Linux: `~/.cache/pr-updater/`

Config fields (draft JSON schema):

```jsonc
{
  "repos": [
    {
      "repo": "owner/name",
      "pendingTtlHours": 24
    }
  ],
  "pendingTtlHours": 24,
  "mergeConflictAgent": {
     "enabled": true,
     "command": "resolve-merge-conflicts",
     "timeoutSeconds": 300
    },
  "notifications": {
    "printSummary": true,
    "writeHtmlReport": true,
    "reportPath": null
  }
}
```

Notes:

- `repos[]` enables multi-repo runs (needed for Raycast).
- Top-level `pendingTtlHours` is default; per-repo can override.
- `mergeConflictAgent.command` is external; tool passes context via env + git state.
- Tool never stores secrets; relies on `gh auth`.

## PR Discovery (GitHub CLI)
For each configured repo (or `--repo`):

- List open PRs authored by current user (`--author @me`).

Identity note:

- Tool does not need to know username; GitHub CLI supports `@me`.

Data needed per PR:

- `number`, `url`
- `title`
- `baseRefName`, `headRefName`
- `headRepository` (to detect fork heads)
- `isDraft`

Implementation note: prefer `gh pr list --repo owner/name --author @me --state open --json ...`.

Note: even if a pull request is draft, we still want to update it. 

## Stack Detection
Build directed graph across discovered PRs (per repo):

- Node = PR.
- Edge `A -> B` if `B.baseRefName == A.headRefName`.

Stacks:

- A “root” PR has base branch not equal to any other PR head branch.
- Order for processing: topological order from roots to leaves (base first).

Output:

- “stack string” for report, e.g. `main <- feat/base <- feat/child <- feat/grandchild`.

Edge cases:

- Multiple PRs may share same base.
- Base may be branch not present in PR set (e.g. `main`).
- Cycles: assume will not happen. If detected, tool records error and skips cycle members.

## Repo Handling Modes

Only one mode in v0: isolated cache clone.

Cache clone persists across runs; each run fetches to update.

Cache layout (recommended):

- Bare repo: `${CACHE_DIR}/repos/<owner>/<name>.git`
- Per-run workdir: `${CACHE_DIR}/work/<owner>/<name>/<runId>/`

Rationale: bare repo keeps fetched objects; per-run workdir prevents dirty state leaks across runs.

Workdir cleanup:

- After `run` finishes, delete per-run workdir directory.
- Pending push relies on stored tool branches + SHAs; `push` can create a fresh workdir.

Remote verification:

- Before using an existing cache repo, verify `origin` remote URL matches expected configured repo URL.
- If mismatch, delete cache dirs for that repo and re-clone.

### Mode: `isolated`
Never touch your local working repo.

- Maintain cache clone per `owner/name`.
- Use that clone to checkout and update PR head branches.
- Push only on explicit approval.

Benefits:

- Safe for unattended runs.
- Worktree-safe.

Costs:

- Disk usage.
- Needs careful fork remote handling.

Fork-head scope (v0):

- If PR head repository is not the configured repo (head-from-fork), mark PR “needs attention” and skip updating it (no safe push target).

## Per-PR Update Workflow (Merge Strategy)
Inputs:

- Repo `owner/name`.
- PR `number`.
- Base ref name `baseRefName`.
- Head ref name `headRefName`.

Steps (isolated mode):

1. Ensure cache clone exists.
2. Fetch base ref from base remote (usually `origin`).
3. Fetch head ref:
   - If head in same repo: fetch from `origin`.
   - If head in fork: skip in v0 (see fork-head scope).
4. Checkout local tool branch pointing at fetched head SHA.
   - Naming (sanitized): `pr-updater/pr-<number>/<headRefName>`
   - Sanitization rule: replace `/` with `-` and strip any leading/trailing whitespace.
5. Record `beforeHeadSha`.
6. Merge base into head:
   - Merge exact fetched base tip SHA (no `--ff-only`; allow merge commit).
   - If PR is stacked and its `baseRefName` matches another PR's `headRefName` already processed in this run: merge against that base PR's UPDATED LOCAL tool branch tip (not remote), so stack becomes consistent in one run.

Merge commit message:

- Use git default merge commit message.
7. If merge conflicts:
   - Record conflict file list.
    - Invoke merge-conflict-agent hook (see next section).
    - Validate merge resolved:
      - `git status` clean (no unmerged paths).
      - Optionally run `git diff --check`.
    - Tool runs `git add -A` after agent, then completes merge commit if merge still in-progress.
8. Record `afterHeadSha`.
9. Compute “review-needed” signals.
10. If head SHA changed (merge created commit), mark branch as pending push.
    - If merge is already up-to-date (head SHA unchanged), do not add to pending push.

Failure policy:

- If any PR update fails, continue to next PR and report failure.

## Merge Conflict Agent Hook
Tool does not hardcode model/provider.

When conflicts detected, tool runs configured external command:

- Executed with working directory = repo path.
- No required args; agent can read context from env + git state.

Timeout:

- Enforce timeout per agent execution (`timeoutSeconds`, default 300).

Command contract:

- Exit 0: agent believes conflicts resolved.
- Exit non-zero: resolution failed; tool records failure and leaves branch local-only.

Timeout behavior:

- If agent times out:
  - Record ⚠️ reason `conflict-agent-timeout`.
  - Abort merge (`git merge --abort`) and reset branch back to `headBefore`.
  - Do not mark pending push.
  - Continue to next PR.

Summary contract (optional):

- the agent will write a markdown summary of how it resolved the conflicts to a path provided by env `PR_UPDATER_SUMMARY_PATH`.
- Tool stores that summary in report (local only).

Agent env contract (draft):

- `PR_UPDATER_REPO=owner/name`
- `PR_UPDATER_PR_NUMBER=123`
- `PR_UPDATER_BASE_REF=main`
- `PR_UPDATER_HEAD_REF=feat/foo`
- `PR_UPDATER_RUN_ID=<runId>`
- `PR_UPDATER_SUMMARY_PATH=/abs/path/to/summary.txt`

Tool behavior:

- Tool creates empty summary file before invoking agent.
- After agent exits 0, tool reads summary file content (if any) into `conflictSummaryText` and embeds into HTML report.

## “Needs Attention” Signals
Tool should produce actionable checklist per PR.

Signals to detect:

- Merge conflicts occurred.
- Conflict agent ran (include link/path to local summary).
- PR diff changed after merge (strong signal: open PR and re-review).
- Fork-head PR skipped (v0 limitation).

Needs-attention section must be concise (fast scan).

PR links:

- Report must include PR URL.
- Also include “files view” URL as default jump target: `<prUrl>/files`.

## Determining “Code Changed After Merge” (Review Needed)
Naive `before..after` diff includes all base changes and is noisy.

Proposed v0 heuristic:

- Primary signal (closest to GitHub green/red numbers idea): compare PR diff stats before vs after merge, using same base tip.
  - Let `baseTip` = fetched base branch tip SHA (before merge).
  - Let `headBefore` = head SHA before merge.
  - Let `headAfter` = head SHA after merge.
  - Define `prRange(baseTip, head)` = `git diff --numstat $(git merge-base baseTip head)..head`.
  - Compute `prRange(baseTip, headBefore)` and `prRange(baseTip, headAfter)`.
  - If totals or file list differ, mark “PR diff changed after merge”.

- Let `prFiles` = files changed by PR relative to its base before update.
  - Compute from PR branch history locally: `git diff --name-only <mergeBase>...<headBefore>`.
- Let `baseDeltaFiles` = files changed in base since merge base:
  - `git diff --name-only <mergeBase>..<baseSha>`.
- If `intersection(prFiles, baseDeltaFiles)` non-empty, mark as “review needed” and report those files.

Trust model / limitations:

- Tool cannot reliably replicate GitHub “viewed file checkboxes” state via `gh` in v0.
  - If later we find an API for per-file viewed/unviewed by viewer, we can switch to that as primary signal.
- Git-based signals are heuristics.
  - Design goal: minimize false negatives (missing a needed re-review) even if it increases noise.
  - Therefore: if any strong signal triggers (conflict, PR diff changed, overlap files), tool marks “review needed”.
  - Tool must avoid wording like “safe/no review needed”; instead: “no re-review signals detected”.

Intent:

- Detect: did PR-visible diff change after merge (base moved under it), like when GitHub diff numbers change after you push.
- If yes, list files in diff that changed due to update.

Rationale:

- Highlights files where PR changes overlap base movement.
- Avoids listing unrelated base churn.

Additionally:

- If conflicts occurred, conflicted files are always “review needed”.

## Reporting
After run, write:

- Machine-readable state: `state/latest.json`.
- Human report: `reports/<timestamp>.html`.

### State File Schema (Draft)
`state/latest.json` must be stable for Raycast and `push`.

```jsonc
{
  "version": 1,
  "generatedAt": "2026-05-05T12:00:00Z",
  "repos": [
    {
      "repo": "owner/name",
      "latestReportPath": "/abs/path/to/reports/2026-05-05T12:00:00Z.html",
      "latestReportUrl": "file:///abs/path/to/reports/2026-05-05T12:00:00Z.html",
      "hasWarning": true,
      "warnings": [
        {
          "prNumber": 130,
          "prUrl": "https://github.com/owner/name/pull/130",
          "prUrlFiles": "https://github.com/owner/name/pull/130/files",
          "reason": "fork-head-out-of-scope"
        }
      ],
      "pending": [
        {
          "prNumber": 123,
          "prUrl": "https://github.com/owner/name/pull/123",
          "prUrlFiles": "https://github.com/owner/name/pull/123/files",
          "baseRef": "main",
          "headRef": "feat/base",
          "localBranch": "pr-updater/pr-123/feat-base",
          "beforeSha": "...",
          "afterSha": "...",
          "updatedAt": "2026-05-05T12:00:00Z",
          "needsAttentionReasons": ["conflicts", "pr-diff-changed"],
          "reviewNeededFiles": ["src/foo.ts"],
          "conflictSummaryText": "..."
        }
      ]
    }
  ]
}
```

Notes:

- `pending` only includes PRs where tool created new commit(s) and expects a push.
- `warnings` includes attention items that are not pending/pushable (example: fork-head skipped, agent timeout).
- `conflictSummaryText` is optional; when present, report must embed it inline.

Report includes per repo:

- Stack summary strings.
- Per PR table:
  - PR url
  - PR files url (`/files`)
  - base/head
  - updated? (yes/no)
  - conflicts? (none/resolved/unresolved)
  - review-needed files (list)
  - pending push? (yes/no)

Include “Needs Attention” section at top:

- One line per PR needing action.
- Keep to: PR link, reason, and local summary link/path if conflicts.

Conflict summary embedding:

- Report must embed merge-conflict summary text inline under relevant PR section.
- Avoid requiring opening separate files.

HTML safety:

- When embedding any untrusted text (agent summary, file paths), HTML-escape it.
- Put large text blocks inside `<pre>`.

### Sample Report (HTML)
Report must be very vanilla HTML (no libraries). Use `<table>` for PR table. Minimal/no CSS.

Emoji scheme: only two statuses.

- ✅ means no needs-attention signals detected.
- ⚠️ means needs attention.

Example shape:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>PR Updater Report (2026-05-05T12:00:00Z)</title>
  </head>
  <body>
    <h1>PR Updater Report</h1>
    <p><strong>Run:</strong> 2026-05-05T12:00:00Z</p>
    <p><strong>Repo:</strong> owner/name</p>

    <h2>Needs Attention</h2>
    <ul>
      <li>⚠️ <a href="https://github.com/owner/name/pull/123/files">PR #123</a> conflict resolved (pending push)</li>
      <li>⚠️ <a href="https://github.com/owner/name/pull/124/files">PR #124</a> PR diff changed after merge (pending push)</li>
      <li>⚠️ <a href="https://github.com/owner/name/pull/130/files">PR #130</a> skipped (fork head out of scope)</li>
    </ul>

    <h2>Stacks</h2>
    <ul>
      <li>main &larr; feat/base &larr; feat/child</li>
      <li>main &larr; fix/one-off</li>
    </ul>

    <h2>PRs</h2>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead>
        <tr>
          <th>Status</th>
          <th>PR</th>
          <th>Base -&gt; Head</th>
          <th>Updated</th>
          <th>Conflicts</th>
          <th>PR Diff Changed</th>
          <th>Review-Needed Files</th>
          <th>Pending Push</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>⚠️</td>
          <td><a href="https://github.com/owner/name/pull/123/files">#123</a></td>
          <td>main -&gt; feat/base</td>
          <td>yes</td>
          <td>resolved</td>
          <td>yes</td>
          <td><code>src/foo.ts</code></td>
          <td>yes</td>
        </tr>
        <tr>
          <td>✅</td>
          <td><a href="https://github.com/owner/name/pull/200/files">#200</a></td>
          <td>main -&gt; chore/docs</td>
          <td>yes</td>
          <td>none</td>
          <td>no</td>
          <td></td>
          <td>yes</td>
        </tr>
      </tbody>
    </table>

    <h2>PR #123 Conflict Summary</h2>
    <pre>
<conflict summary markdown/text pasted here>
    </pre>
  </body>
</html>
```

Unattended runs:

- Never prompt.
- Exit code non-zero only for “global failure” (e.g. auth missing). Otherwise exit 0 and rely on report.

## Push Approval Flow
`run` creates local commits but does not push.

`push` command:

1. Loads pending list from state.
2. For each PR pending push:
   - Ensure branch still matches expected `afterHeadSha`.
   - Push to `origin`.
3. Update state: pending cleared, pushedAt timestamp.

Push refspec:

- `git push origin <localToolBranch>:refs/heads/<headRefName>`

## Dry Run
`run --dry-run` behavior:

- Allowed: fetch remote refs, compute signals, generate report.
- Forbidden: create/update local tool branches, create commits, run conflict agent, update pending state, push.

## Concurrency / Safety
- Single-instance lock per repo in state dir.
  - If lock exists and younger than stale timeout (e.g. 2h): skip repo run, report ⚠️.
  - If stale: break lock and proceed.
- Per repo operations should be sequential by default; optional parallelism later (risk: rate limits, disk contention).
- Always fetch before merge.
- Never delete non-tool branches automatically. Tool may delete branches under `pr-updater/` during TTL/force cleanup.
- Never force push. 

## Authentication
- Requires `gh auth status` OK.
- Git operations rely on same auth (HTTPS with gh credential helper or SSH).

## Observability
- Log levels: error/warn/info/debug.
- `--json` output for integration.

## Testing Plan
- Unit tests for core logic.
- Command execution tests: mock `git` and `gh` binaries using `@levibostian/mock-a-bin` to snapshot executed commands (assert command sequence and arguments). No real git repos.

## Cron / Background Runs
Hourly unattended runs handled by user via cron/launchd calling:

- `pr-updater run --repo owner/name`

Default intended cron is running without `--repo` to update all configured repos:

- `pr-updater run`

Tool must be non-interactive in this mode and produce report file for later review.

## Open Questions
1. Fork-head support: skip (v0) vs support pushing to fork remote. fork support out of scope. 
2. Pending TTL behavior: 24h good default? should it be configurable per repo. yes. 
3. Per-file “viewed/unviewed” state: out of scope. Use git-based signals; user reviews via PR `/files` URL when ⚠️.

## Raycast Menu Bar Extension
Goal: fast visibility + one-click actions.

Approach:

- Provide stable JSON output for Raycast to read.
  - Derived from `state/latest.json`.
  - `pr-updater status --json` returns:
    - `hasWarning: boolean` (any repo has pending push or needs attention)
    - `pendingCount: number` (aggregate)
    - `needsAttentionCount: number` (aggregate, non-pending warnings)
    - `repos: Array<{ repo: string, pendingCount: number, needsAttentionCount: number, latestReportUrl: string|null }>`

Raycast (Menu Bar Command) behavior:

- Title/subtitle shows `pendingCount` and/or `needsAttentionCount`.
- Actions:
  - Open latest report.
  - Run now (`pr-updater run --repo owner/name`).
  - Push pending (`pr-updater push --repo owner/name`).

Important: extension supports multiple repos. Keep icon simple: either ✅ or ⚠️.

Menu bar icon rule (aggregate):

- If `hasWarning`: show ⚠️
- Else: show ✅

Out of scope for v0:

- Raycast UI beyond menu bar command.
