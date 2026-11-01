# ShipCheck

**Never npm install a stranger's repo blind.**

Paste a public GitHub repository URL. ShipCheck downloads its source tarball, inspects it in memory, and shows evidence-backed risks before you clone, install, or execute anything.

## Current checkpoint: deterministic scan

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

## How Codex helped

- Replaced the original replay prototype with the Node server, brutalist scan view, URL state, and SSE progress stream for ShipCheck.
- Implemented the in-memory gzip/tar parser so the real scan needs no package install or temporary checkout.
- Caught and fixed the distinction between a valid lifecycle script and a lifecycle script that pipes a downloaded command into a shell: both are shown, with the latter marked critical.
- Ran a live scan of `sindresorhus/ky`, validating the GitHub metadata request, tarball download, file indexing, SSE progress, and evidence rendering data.
- Tightened the deterministic scanner after `langchain-ai/langchain` produced false criticals: key detection now requires a real vendor shape and high entropy, Base64 needs an execution sink, and test or fixture paths are downgraded to informational findings.
- Added regression coverage for the false-positive cases and rescanned `langchain-ai/langchain` (SAFE TO RUN, 100/100, zero criticals) and `sindresorhus/ky` (SAFE TO RUN, 92/100, zero criticals).

## Planned next checkpoint

The planted local trap repo and deterministic recall suite are now included. Scan it without a network connection using `?repo=local:demo/trap-repo`. The three.js city and OpenAI run-plan pass have not been added yet.

### Publish the stage trap repo

From the ShipCheck repository root, after you have authenticated the GitHub CLI:

```sh
git subtree split --prefix=demo/trap-repo -b shipcheck-trap-demo
gh repo create aryan/shipcheck-trap-demo --public --description "Intentional security test fixture for ShipCheck"
git push git@github.com:aryan/shipcheck-trap-demo.git shipcheck-trap-demo:main
git branch -D shipcheck-trap-demo
```

The trap repo intentionally contains fake credential-shaped strings and malicious-looking fixture code. Its README labels it as a security test fixture; never substitute real credentials.
