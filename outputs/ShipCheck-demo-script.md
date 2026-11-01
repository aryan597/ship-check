# ShipCheck demo video — 75 to 90 seconds

## 0–10 seconds: Promise

Show the hero and say: “Never npm install a stranger’s repo blind. ShipCheck reads a public repository tarball before you clone or install it.”

## 10–25 seconds: Offline setup

Paste `local:demo/trap-repo` and start the scan. Say: “This is a planted trap repository, so the demo works without Wi-Fi.”

## 25–45 seconds: Evidence

Show the live feed, then the verdict. Say: “The scanner never executes the repository. It finds a postinstall command that downloads and runs a shell script, fake committed credentials, and code that sends environment variables to a webhook.”

## 45–60 seconds: Explain trust

Open two findings. Say: “Every finding includes the file, line, source snippet, and a plain-English explanation. It is evidence, not a model guess.”

## 60–75 seconds: Precision

Scan `sindresorhus/ky`. Say: “Precision matters: our regression scan of Ky has no critical findings. Test and documentation paths are treated differently from runtime source.”

## 75–90 seconds: Close

Return to the headline. Say: “ShipCheck gives developers a safer first look before running unfamiliar code. It only downloads and inspects a tarball; it never clones, installs, or executes it.”
