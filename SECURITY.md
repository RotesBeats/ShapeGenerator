# Security Policy

## About Rayform

Rayform runs entirely in your browser. It has no server, no accounts, and no database, and it doesn't send your shapes or settings anywhere. The only data it stores is your favorites, which are kept in your browser's local storage on your own device.

Even so, security issues can still happen, for example in the app code, in a dependency, or in the way SVG files are generated.

## Supported versions

Only the latest version, the one live at https://rotesbeats.github.io/Rayform/ and on the `main` branch, receives fixes.

| Version | Supported |
| ------- | --------- |
| Latest (`main`) | Yes |
| Older commits | No |

## Reporting a vulnerability

**Please don't open a public issue for security problems.**

Use one of these private channels:

1. **GitHub private reporting (preferred):** go to the repository's **Security** tab and click **Report a vulnerability**.
2. **Email:** **pablo@linktvis.be**

Please include:

- A description of the problem and why you think it's a security issue
- Steps to reproduce it, or a short proof of concept
- The affected browser, operating system, and version, if relevant
- Any ideas for a fix, if you have them

## What to expect

This is a one-person project, so I'll do my best but can't promise fixed timelines. As a goal:

- I'll acknowledge your report within **7 days**.
- I'll give you an update on my assessment within **14 days**.
- I'll aim to fix confirmed issues quickly, depending on severity, and tell you when the fix is live.

I'll credit you in the fix or release notes if you'd like, unless you prefer to stay anonymous. Please give me reasonable time to fix the problem before you share details publicly.

## What counts as a security issue

Examples:

- Cross-site scripting (XSS), or an exported SVG that can run script or load external content
- A dependency with a known vulnerability that affects Rayform
- Problems with the deployment workflow or its permissions
- Anything that exposes private user data

## What doesn't

- Visual bugs, wrong shapes, or other non-security bugs (please open a normal issue for those)
- Issues that need physical access to someone's device or an already compromised browser
- Reports from automated scanners with no demonstrated impact
- Missing security headers on GitHub Pages, which I can't configure

## Safe harbor

If you act in good faith, avoid harming other users, and don't access or change data that isn't yours, I won't take action against you for researching and reporting a problem.
