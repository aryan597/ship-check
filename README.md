# Pet Patrol 🐕🏘️

**See what your coding agent does, decide what deserves a human, and keep a tamper-evident receipt trail.**

Pet Patrol is a local-first hackathon demo. Mochi, your repo watchdog, walks a planted trap-repo replay in a tiny town. Low-impact reads pass, a write pauses at the toll gate for approval, and secret paths or dangerous commands are blocked. Each decision is recorded in a SHA-256 hash chain.

## Run it

Requires Node.js 20+; no npm install, API key, or network access is needed.

```sh
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173), then click **Replay trap run**. At the toll gate choose **Approve this action** or **Deny and log**. Click **Verify receipts** to validate the chain. Receipts are stored in `data/receipts.jsonl` on your machine.

The demo includes a pre-planted `.env` path, `curl | bash`, and a repository instruction injection attempt. They are fake event strings; no shell command is executed and no secret is read or included.

## What works today

- Local replay, with a pause for human approval and explicit blocked events.
- Deterministic local policy rules for read, write, secret-path, traversal, dangerous-command, and instruction-injection examples.
- Live event/receipt UI over Server-Sent Events.
- SHA-256 chained JSONL receipts and verification of order and content.
- A local pre-flight filename scan endpoint (`POST /api/scan`); it does not open file contents. If `OPENAI_API_KEY` is set, it can optionally request a short Responses API summary using only the count of flagged filenames, not their names or contents.
- A small `POST /api/events` ingest endpoint for normalized events.
- An observation-only Codex CLI adapter in `adapters/codex-json.mjs`.

This prototype does **not** intercept arbitrary agent actions. In particular, `codex exec --json` emits a JSONL observation stream. The documented event families include `item.started` / `item.completed`, with command details under `item`; receiving those after execution begins does not create a veto point. Claude Code supports hooks such as `PreToolUse`, which can be configured as an enforcement adapter. Hook input schemas and policy decisions need adapter-specific handling; don't treat this demo's generic event endpoint as a hardened security boundary.

The current UI is self-contained and uses CSS-drawn 2.5D scenery rather than loading a 3D library, so the demo still renders offline. Receipt wording is deterministic. The optional AI scan summary can be enabled with `OPENAI_API_KEY`; it sends only a count of flagged filenames, and the local summary remains available if the API call fails.

## Codex event adapter shape

Current Codex CLI docs describe `codex exec --json` as newline-delimited JSON events. Example events have `type: "item.started"` or `"item.completed"` and an `item`, e.g. `item.type: "command_execution"` and `item.command`. The read-only adapter maps the JSONL stream into Pet Patrol's normalized event shape and sets `observeOnly: true`:

```json
{"id":"event-1","actor":"Codex","kind":"command","action":"Run command","command":"npm test","risk":"low","observeOnly":true}
```

The UI labels these `OBS · AUTO`, `OBS · CONFIRM`, or `OBS · BLOCK` to show the policy classification without claiming the event was stopped. The endpoint is currently unauthenticated and intended for localhost demo use only. Event observation does not stop the underlying process.

Try the observer from another terminal with `node adapters/codex-json.mjs "Summarize this repository"`. Set `CODEX_REPO=/path/to/repo` to choose its working directory and `PET_PATROL_URL` to change the local server address. This launches an actual Codex run and does not gate its actions; use a disposable project and normal Codex sandbox/approval settings.

## Claude Code hook direction

Claude Code documents hooks including `PreToolUse` for tool gating and `PostToolUse` for after-action observation. A real adapter would read the hook JSON from stdin, normalize tool name/input, call the local policy engine, then return a documented hook response that allows, denies, or asks for permission. The hook command needs timeout and fail-closed behavior tested per hook type. That adapter is not yet implemented.

## Demo script (about 60 seconds)

1. Start Pet Patrol and show the quiet town.
2. Start **Replay trap run**. Point out a safe read walking through town.
3. At the toll gate, approve the small source-file write.
4. Show `.env` and `curl | bash` turn red and the repo-injected instruction get blocked.
5. Click **Verify receipts** and show the chain head and verified receipt count.

Suggested narration: “Codex helped me check the live CLI event format instead of guessing. That exposed an important boundary: its JSON stream is for observation, while a true veto needs a pre-tool hook. So this demo is honest about what it can enforce and uses a replay to make the human gate reliable.”

## Safety and limitations

- Bind address is loopback (`127.0.0.1`); don't expose this server to a network.
- The HTTP API accepts same-origin browser requests and local CLI calls. It has no login layer and should only be used on the local machine.
- Policy matching is a demo heuristic, not a complete security policy. It can miss obfuscated commands and misclassify benign ones.
- Hash chaining detects edits to the JSONL content and ordering, but the file is not signed or stored remotely; an attacker able to rewrite the whole file can recompute the chain.
- The replay and policy decisions are simulated; this is not yet a safe agent sandbox or production approval broker.
- No real repository scan, code contents, secrets, or personal data are included in the fixture.

## Credits

Core application code, UI, fixture, and CSS scenery were created for the DevDay Exchange Community Hackathon. No third-party code or visual assets are bundled. The UI uses system fonts; Google Fonts is an optional CSS import and falls back locally when offline.

## References

- [Codex docs](https://developers.openai.com/codex)
- [Codex quickstart](https://developers.openai.com/codex/quickstart)
- [Codex CLI reference](https://developers.openai.com/codex/cli/reference)
- [Codex `--json` event format example](https://developers.openai.com/blog/eval-skills)
- [Claude Code hooks reference](https://docs.anthropic.com/en/docs/claude-code/hooks)
- [OpenAI developer quickstart (Responses API)](https://developers.openai.com/api/docs/quickstart)
- [OpenAI Cookbook](https://developers.openai.com/cookbook)
- [Hackathon event](https://luma.com/dde-ldn-hack)
