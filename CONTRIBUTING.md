# Contributing to Rayform

Thanks for your interest in Rayform! It's a small, one-person project, so here's how you can help and what to expect.

By taking part, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## The short version

- **Bug reports and ideas are very welcome.** Open an issue.
- **Pull requests are not accepted by default.** Please open an issue and talk to me first (see below).
- Rayform is source-available under the [PolyForm Noncommercial 1.0.0](LICENSE) license, which affects how contributions are handled.

## Reporting a bug

Before opening an issue, please check whether it has already been reported. A good bug report includes:

1. **What you did**: the steps, and the settings you used (points, radii, rounding, curve, animation, and so on).
2. **What you expected** to happen.
3. **What actually happened**: a screenshot or the exported SVG helps a lot.
4. **Your setup**: browser and version, operating system, and whether you were on the live site or running it locally.
5. **Console errors**, if any (open DevTools with `Cmd+Option+J` on Mac or `Ctrl+Shift+J` on Windows and Linux).

## Suggesting a feature

Open an issue and describe the problem you're trying to solve, not just the feature. "I need to export a shape with a hole in the middle" is easier to work with than "add a hole option". Please understand that I can't promise to build every suggestion. Rayform has a deliberately small, focused feature set.

## Pull requests

Because of the license and the possibility that Rayform grows into a commercial product later, I don't accept code contributions by default. If you'd like to contribute code:

1. **Open an issue first** and describe what you want to change and why.
2. Wait for a reply before you start work, so you don't spend time on something I can't merge.
3. If I agree, I'll explain how contributions are handled. This will likely include you confirming that you wrote the code and that I may use it under the project's license, now and in any future license.

Pull requests opened without a prior discussion may be closed without review. That's no judgement on the work.

Small fixes such as typos in the README or documentation are always fine to send directly.

## Running Rayform locally

You need [Node.js](https://nodejs.org) (version 20 or newer).

```bash
git clone https://github.com/RotesBeats/Rayform.git
cd Rayform
npm install
npm run dev
```

Then open the local address that Vite prints. To check the production build, run:

```bash
npm run build
npm run preview
```

## Code style

- Run the linter before sending anything: `npm run lint`.
- Keep the code readable. Prefer small, clear functions over clever ones.
- Don't add new dependencies without discussing it first.
- Check that SVG export still works: the exported file must open on its own in a browser and in a vector editor.

## Using what you make

Anything you export from Rayform (the SVG files) is yours to use, including for commercial work. The restriction in the license only covers the Rayform source code itself.

## Questions

For anything that isn't a bug or a feature idea, open a discussion or an issue and I'll get back to you when I can.
