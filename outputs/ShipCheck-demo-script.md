# ShipCheck demo — voiceover and screen direction

**Target duration:** 75–90 seconds. Read at a calm, confident pace.

## 0–10s — Open

**On screen:** ShipCheck hero.

**Voiceover:** “Every developer has faced this moment: you find a useful-looking GitHub repository, and the next step is npm install. But what is that code about to do to your machine?”

## 10–22s — Promise

**On screen:** Paste `local:demo/trap-repo`, click Scan.

**Voiceover:** “ShipCheck answers that before you clone, install, or run anything. It downloads a read-only source tarball and inspects it locally. Nothing from the repository is executed.”

## 22–40s — Live evidence

**On screen:** Live feed followed by the DO NOT RUN verdict.

**Voiceover:** “Here is our planted trap repository. ShipCheck finds a postinstall script that downloads and runs a shell command. That means npm install could execute remote code immediately. The verdict is: do not run.”

## 40–58s — Why trust it

**On screen:** Show `package.json`, then `src/index.js` and `.env` findings.

**Voiceover:** “This is not a vague warning. Every result includes the file, line, source snippet, and a plain-English explanation. It found environment variables being sent to a webhook, and committed credential-shaped values. The displayed keys are masked, and the fixture uses fake values.”

## 58–70s — Injection and precision

**On screen:** Prompt-injection finding, then switch to `sindresorhus/ky`.

**Voiceover:** “It also spots hidden instructions aimed at AI reviewers. And precision matters: a scan of Ky has no critical findings. ShipCheck distinguishes runtime risks from examples, tests, and documentation.”

## 70–85s — Close

**On screen:** Return to the ShipCheck headline and verdict panel.

**Voiceover:** “ShipCheck gives you the evidence to decide whether a repository is safe to run. It never clones, installs, or executes the target. It just tells you what you are about to trust.”

## ElevenLabs settings

- Voice: clear, grounded, technical but not dramatic.
- Pace: about 0.95×.
- Export: WAV or high-bitrate MP3.
- Leave half a second of silence between sections for screen cuts.
