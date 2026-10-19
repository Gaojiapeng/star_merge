# Stellar Forge · 合成大恒星

A single-screen star-merging game in the spirit of *Suika* / 合成大西瓜. Drop stars, merge matching ones into bigger stars, let massive stars explode, and grow a black hole into the heart of a galaxy.

**▶ [Play in your browser](https://gaojiapeng.github.io/star_merge/)**

Runs in any modern browser, desktop or mobile. English by default; 中文 is available under **Options → Language**.

## How to play

- **Drop:** tap or click in the field. Hold to keep dropping, and drag to aim. On a keyboard, use the arrow keys or A / D to aim, Space to drop and P to pause.
- **Merge:** two stars of the same class merge into the next class:
  **M → K → G → F → A → B → O9V → O6V → O3V**. O3V is the largest and can't merge.
- **Stars age:** massive stars (B and O) explode as supernovae and leave a neutron star or a black hole. Smaller stars eventually become white dwarfs.
- **Compact objects:**
  - Black holes, neutron stars and white dwarfs feed on a star they touch.
  - When two of them meet, they spiral together for 5 seconds and merge. This works for two black holes, two neutron stars, or a black hole with a neutron star or a white dwarf.
- **Win:** grow a black hole to **500 M☉**.
- **Lose:** stars stay above the danger line for 3 seconds.
- **Inspect:** this mode shows any body's mass and its element layers, which change as a star ages.

## Run locally

No build step and no dependencies; you only need [Node.js](https://nodejs.org/) 20.11 or newer.

```bash
npm run dev    # serves dist/ at http://127.0.0.1:4173
npm test       # simulation, interaction and optics tests
```

The `dist/` folder is the whole game and can be hosted as static files.

## Project layout

| Path | Contents |
| --- | --- |
| `dist/simulation.js` | Game rules and physics, deterministic and independent of the renderer |
| `dist/renderer.js` | Canvas rendering, particles and effects |
| `dist/optics.js` | WebGL gravitational-lensing and accretion-disk pass |
| `dist/app.js`, `dist/index.html`, `dist/style.css` | Interface |
| `dist/i18n.js` | English and Chinese text |
| `tools/` | Scripts that regenerate the textures and the lensing lookup table |
| `tests/` | Node test suite |

## Credits

All textures are generated procedurally by `tools/generate-assets.mjs`. The black-hole lensing adapts equations from Eric Bruneton's [black_hole_shader](https://github.com/ebruneton/black_hole_shader) (BSD-3-Clause). The gravitational-wave ripple adapts code from [algometrix/blackhole-sim](https://github.com/algometrix/blackhole-sim) (MIT). See [`dist/THIRD_PARTY.md`](dist/THIRD_PARTY.md) for the details.

The physics is inspired by real astrophysics but simplified and exaggerated for gameplay. It is not a scientific simulation.
