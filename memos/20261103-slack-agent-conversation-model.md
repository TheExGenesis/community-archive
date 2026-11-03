# Slack agent: conversation model, and what the field does (2026-11-03)

Christine's expectation after the first threads: "I was expecting to be able
to talk normally." The agent treated a thread as a one-shot task and refused
replies once it was `stopped` or `merged`. This memo records what the
Slack-collaborator products do and what we copied.

## What the state of the art does

Sources: Claude Tag docs (claude.com/docs/claude-tag), Devin
(docs.devin.ai/integrations/slack), OpenAI Codex in Slack
(learn.chatgpt.com/docs/third-party/slack), GitHub Copilot cloud agent in
Slack (docs.github.com, Aug 2026 changelog), Cursor
(cursor.com/docs/integrations/slack), Factory (docs.factory.com/integrations/slack),
Linear agent guidelines (linear.app/developers/aig), Slack's AI app platform
(docs.slack.dev/ai).

| Pattern                                                                                                                               | Who                                                                                     | What we do now                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Thread = one durable session; no re-mention after the first tag; the human keeps talking before and after anything ships              | Claude Tag ("a session in a thread belongs to everyone there"), Copilot, Factory, Devin | Yes: `fleet/slack` resumes the Claude session on every reply, in every state; a merged or stopped thread goes on                     |
| Acknowledge in seconds, then stay quiet with one checklist edited in place                                                            | Claude Tag (emoji reaction, "On it…" checklist), Linear (first response within 10 s)    | 👀 on the message at once; one status line that appears with the first tool call and is edited, no per-tool messages                 |
| Status reactions on the trigger message                                                                                               | Cursor (⏳ ✅ ❌), Devin                                                                | ✅ or ❌ on the message when the turn ends                                                                                           |
| Short final report; durable deliverables as you go                                                                                    | Claude Tag ("Done. Eight items closed, three open.")                                    | Terse voice rule in `INSTRUCTIONS.md`; every `done` is a PR, every Tier 0 PR merges itself on green CI                               |
| Multi-item asks: one task per thread, or a list worked through                                                                        | Claude Tag prompt library ("start a new thread per issue"), Devin `!new`                | A `next` field: the agent ships one change, the harness resumes it with the next step (up to `FLEET_SLACK_MAX_CHAIN`, 5)             |
| Gate merges with enforced rules, not bot judgement                                                                                    | Claude Tag good-habits, Copilot's extra approval                                        | The merge guard (open, mergeable, CI green, no Tier 1 path) plus GitHub branch rules; Tier 1 is always a human                       |
| Plan first on non-trivial work                                                                                                        | Cursor, Claude Tag                                                                      | Rule: say what you found in one message, then start                                                                                  |
| Bang commands (`!status`, `!restart`, `!fork`), thumbs-down mutes                                                                     | Claude Tag, Devin                                                                       | `status`, `runs`, `run <id>`, `help`, `stop`; the rest later                                                                         |
| Slack-native agent status ("Working…" with a Stop button, `agents.sessions.setStatus`), streaming replies, plan blocks, code channels | Slack platform (docs.slack.dev/ai)                                                      | Not yet: needs the `assistant:write` scope and the agent container in the app manifest; worth a follow-up once the basics feel right |

## How a thread works now

- One worktree per thread at a stable path, so Claude Code's session (keyed
  by cwd) resumes across jobs; swept after 72 idle hours and recreated on
  the next message.
- A job = branch + run directory + PR. The first `done` opens the PR; more
  edits while it is open land on it; after it merges or closes, the next
  `done` starts a new branch in the same worktree.
- The agent's memory is `$FLEET_HOME/memory/MEMORY.md`, shared across
  threads and quoted into every system prompt.
- Progress: 👀, an edited status line once tools are used, the agent's own
  short text, ✅/❌ on the message. A plain answer is just the text.
