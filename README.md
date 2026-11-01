# ShipCheck

**Never npm install a stranger's repo blind.**

Paste a public GitHub repository URL. ShipCheck downloads its source tarball, inspects it in memory, and shows evidence-backed risks before you clone, install, or execute anything.

## What ships

Run locally with Node.js 20+:

```sh
npm start
```

Open http://127.0.0.1:4173 and paste `github.com/owner/repo`. A shareable `?repo=owner/repo` URL starts the same scan.

The scanner makes one GitHub metadata request to resolve the default branch and one codeload tarball request. It skips binaries, files over 500 KB, common vendored folders, and scans up to 2,000 text files. Results are cached for the running server process.

Current deterministic checks provide file, line, snippet, and explanation for:

- package lifecycle scripts and shell download pipes
- committed environment files and credential-shaped strings
- environment data sent to raw IP, Pastebin, Discord, or webhook endpoints
- dynamic execution, long Base64 blobs, and zero-width characters
- prompt injection aimed at AI reviewers
- used environment variables and whether README or `.env.example` document them
- lockfile, test, and CI presence

This is a read-only scanner. It does not clone, install, or run the target repository. Findings are heuristic security signals and need human review.

ShipCheck's deterministic core works without an API key or Wi-Fi against its local trap fixture. The fake trap-repo values are deliberately planted test data; public-repo results come from real files in the downloaded tarball.

## Optional OpenAI run-plan refinement

When `OPENAI_API_KEY` is present, ShipCheck makes one server-side Responses API call after deterministic scanning. It sends only the deterministic plan, findings, README excerpt, and manifests. Repository content is untrusted data, never instructions. The structured response must cite an existing scanned source file for every command; any invalid response, API failure, or eight-second timeout silently keeps the deterministic **basic plan**.

Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in the Node service environment. Do not put either value in browser code or GitHub Pages.

## Deployment

GitHub Pages can publish the static project showcase from `docs/`. Pages cannot run the scanner because the scanner is a Node service and keeps `OPENAI_API_KEY` server-side.

Deploy the interactive scanner separately with Docker:

```sh
docker build -t shipcheck .
docker run --rm -p 4173:4173 -e OPENAI_API_KEY shipcheck
```

## How Codex helped

- Replaced the original replay prototype with the Node server, brutalist scan view, URL state, and SSE progress stream for ShipCheck.
- Implemented the in-memory gzip/tar parser so the real scan needs no package install or temporary checkout.
- Caught and fixed the distinction between a valid lifecycle script and a lifecycle script that pipes a downloaded command into a shell: both are shown, with the latter marked critical.
- Ran a live scan of `sindresorhus/ky`, validating the GitHub metadata request, tarball download, file indexing, SSE progress, and evidence rendering data.
- Tightened the deterministic scanner after `langchain-ai/langchain` produced false criticals: key detection now requires a real vendor shape and high entropy, Base64 needs an execution sink, and test or fixture paths are downgraded to informational findings.
- Added regression coverage for the false-positive cases and rescanned `langchain-ai/langchain` (SAFE TO RUN, 100/100, zero criticals) and `sindresorhus/ky` (SAFE TO RUN, 92/100, zero criticals).

## Offline demo and submission

The planted local trap repo and deterministic recall suite are included. Scan it without a network connection:

```text
http://127.0.0.1:4173/?repo=local:demo/trap-repo
```

It deliberately produces **DO NOT RUN** with evidence for a malicious install hook, fake committed keys, webhook exfiltration, Base64 execution, a shell download pipe, and reviewer-targeting prompt injection. All keys and URLs in the fixture are fake.

### 90-second demo outline

1. Start on the hero: “Never npm install a stranger's repo blind.”
2. Paste `local:demo/trap-repo`; the scan works with Wi-Fi off.
3. Show live scan progress, the `DO NOT RUN` verdict, and the file-and-line evidence for the install hook and webhook.
4. Point out masked fake secrets and the prompt-injection finding.
5. Click the shared URL in the address bar and explain that the exact same scan can be repeated.
6. Close on `Verify` quality: deterministic checks, precision regression tests, and read-only tarball inspection.

For a contrast shot, scan `sindresorhus/ky`; the precision regression result is **SAFE TO RUN**, 92/100 with no critical findings.

### Publish the stage trap repo

From the ShipCheck repository root, after you have authenticated the GitHub CLI:

```sh
git subtree split --prefix=demo/trap-repo -b shipcheck-trap-demo
gh repo create aryan/shipcheck-trap-demo --public --description "Intentional security test fixture for ShipCheck"
git push git@github.com:aryan/shipcheck-trap-demo.git shipcheck-trap-demo:main
git branch -D shipcheck-trap-demo
```

The trap repo intentionally contains fake credential-shaped strings and malicious-looking fixture code. Its README labels it as a security test fixture; never substitute real credentials.
