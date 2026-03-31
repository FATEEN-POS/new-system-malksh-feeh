# Building Fateen POS for Windows (Electron)

This guide explains how to build a Windows installer (`.exe`) and portable executable for Fateen POS using [Electron](https://www.electronjs.org/) and [electron-builder](https://www.electron.build/).

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+ installed on a Windows machine (or Windows Server in CI).
- Git — to clone the repository.

---

## Local Build

```bash
# 1. Clone the repository
git clone https://github.com/FATEEN-POS/test-pos.git
cd test-pos/desktop/electron

# 2. Install dependencies
npm install

# 3. Run locally (without packaging)
npm start

# 4. Build installer + portable EXE
npm run dist
```

Output files are placed in `dist-desktop/` at the repo root:

| File | Description |
|------|-------------|
| `Fateen POS Setup *.exe` | NSIS installer (recommended for end-users) |
| `Fateen POS *.exe` (portable) | Single-file portable executable |

---

## CI / GitHub Actions

The workflow `.github/workflows/build-windows.yml` runs automatically on every push to `main` or branches matching `copilot/**`.

You can also trigger it manually via **Actions → Build Windows EXE → Run workflow**.

Artifacts are retained for **30 days** and can be downloaded from the workflow run summary page.

---

## Configuration

Edit `desktop/electron/package.json` → `"build"` section to customise:

- `appId` — reverse-domain app identifier (default: `me.fateen1.pos`)
- `productName` — display name
- `win.target` — build targets (`nsis`, `portable`, `zip`, etc.)
- `nsis.oneClick` — set to `true` for a silent one-click installer

---

## Code Signing (Release)

For a signed production build, add the following secrets to the GitHub repository:

| Secret | Description |
|--------|-------------|
| `WIN_CSC_LINK` | Base64-encoded `.p12` / `.pfx` certificate |
| `WIN_CSC_KEY_PASSWORD` | Certificate password |

Then update the workflow step to pass them as environment variables:

```yaml
env:
  WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
  WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
```

---

## Offline Operation

The Electron app loads static HTML/CSS/JS files bundled from the repo root. It does **not** require an internet connection for the UI to render. Supabase is contacted only for:

1. Employee login validation.
2. Store subscription/licence check (with 30-day offline grace period).

All operational data (products, sales, expenses, etc.) is stored in **IndexedDB** on the user's machine.
