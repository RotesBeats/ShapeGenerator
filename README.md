# Rayform

Interactive SVG shape generator for stars, starbursts, badges, gears and other radial shapes, with a live preview. Tweak points, radii, rounded corners, curved edges, per-beam edits and animation, then copy or download clean, standalone SVG.

**Live app:** https://YOUR-USERNAME.github.io/rayform/

<!-- Add a screenshot: save it as docs/screenshot.png and uncomment the line below -->
<!-- ![Rayform screenshot](docs/screenshot.png) -->

## Features

**Shape**
- 3 to 32 points, outer and inner radius, rotation and skew/twist for pinwheel and sawblade looks
- Real rounded corners: tips and valleys are calculated as true arcs in the path, so they stay rounded without a stroke
- Edge curve, from pinched (sparkle) to puffy, that works together with corner rounding
- Secondary beams: set a different length for every 2nd to 8th beam, or pick individual beams by hand

**Per-beam editing**
- Select any beam and change its length, angle offset and tip rounding
- Drag the tip handles on the preview to stretch a beam directly
- Symmetry lock with mirror and radial modes

**Workflow**
- Five presets and a randomize button
- Undo and redo (slider drags count as a single step)
- Favorites gallery, saved in your browser
- Dark, light and transparent preview backgrounds; the star color follows the background unless you choose one

**Animation preview**
- Spin, Pulse, Twist, Ripple, Breathe, Sway, Soften, Bloom and Flutter, with speed and intensity sliders
- Preview only: the exported SVG is always the static shape

**Export**
- Copy the SVG code or download a `.svg` file with a tightly fitted `viewBox` and a transparent background

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `R` | Randomize |
| `S` | Save to favorites |
| `C` | Copy SVG code |
| `D` | Download .SVG |
| `1` – `5` | Load preset |
| `[` `]` | Fewer / more points |
| `←` `→` | Rotate −5° / +5° |
| `P` | Play / pause animation |
| `B` | Cycle preview background |
| `H` | Show / hide selection points |
| `L` | Symmetry lock on / off |
| `Ctrl/⌘ Z` | Undo |
| `Shift+Ctrl/⌘ Z` or `Ctrl/⌘ Y` | Redo |
| `?` | Show the shortcut list |

Shortcuts pause while you are typing in a field.

## Run it locally

You need [Node.js](https://nodejs.org) (LTS).

```bash
git clone https://github.com/YOUR-USERNAME/rayform.git
cd rayform
npm install
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173).

Other scripts:

```bash
npm run build     # production build in dist/
npm run preview   # preview the production build
```

## Built with

- [React](https://react.dev) and [Vite](https://vite.dev)
- [Tailwind CSS](https://tailwindcss.com) for basic layout; the visual design is plain CSS inside the component
- [Oxlint](https://oxc.rs) for linting
- Fonts: Space Grotesk and Space Mono

## How the shapes work

The star is built from `2 × points` vertices that alternate between outer tips and inner valleys. Each corner is rounded by trimming the two edges that meet there and joining them with an arc, or with a cubic Bézier when edges are curved, so the join stays smooth. The SVG output is a single `<path>`.

## Deployment

Every push to `main` builds the app and publishes it to GitHub Pages through the workflow in `.github/workflows/deploy.yml`. In the repository settings, set **Pages → Source** to **GitHub Actions**.

## License

[MIT](LICENSE)
