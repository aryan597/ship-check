# Pet Patrol — 60-second demo script

## Before recording

1. In the project folder run `npm start` and open `http://127.0.0.1:4173`.
2. Use a 16:9 browser window at desktop size; keep the whole town and activity panel visible.
3. Confirm `.env` is glowing red from the pre-flight scan, then start the recording.

## Narration and clicks

**0–10 seconds — the town**  
“Pet Patrol makes a coding agent’s repo activity visible as a tiny town. Files are houses; Mochi walks the streets. Before the run, a filename-only scan has already spotted the planted secret file.”

**10–26 seconds — safe and confirm**  
Click **Replay trap run**. “Safe reads pass automatically. This source edit is different: Mochi stops at the gate beside the target house. The card shows the exact command and why it needs a decision.” Click **Approve** and show the gate lift as Mochi continues.

**26–43 seconds — blocks**  
“The planted `.env` access, `curl | bash`, and injected repo instruction are blocked and recorded. The demo never executes those strings.”

**43–53 seconds — proof**  
Click **Verify receipts**. “Every decision is in a local SHA-256 linked receipt chain. Verification checks both content and order.”

**53–60 seconds — honest integration boundary**  
“Codex’s `exec --json` observer is working, but it reports events; it cannot veto them. A real pre-action stop needs an enforcement hook, such as Claude Code’s `PreToolUse`. This replay makes the gate demo reliable offline.”

Keep the finished video under 90 seconds. Avoid showing personal repo names, terminal history, account details, or API keys. The only repo in the recording should be the synthetic trap fixture.
