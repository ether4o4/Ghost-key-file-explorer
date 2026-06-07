# 👻 Ghost Key — File Explorer

> A draggable, dual-pane file explorer — Windows Explorer ergonomics, Ghost Key aesthetic.

The app boots straight into a **desktop shell**: draggable / minimizeable / maximizeable / resizable
windows, each hosting a **two-pane file manager** with real read/write access to the filesystem —
**no root required**.

## 🗂 Explorer (default app)

- **Dual panes** with a draggable splitter — copy/move between two folders side by side.
- **Drag & drop** entries between panes, into subfolders, or onto breadcrumbs. Hold **Ctrl/⌘** to copy
  (default action is move), just like Windows Explorer. Drop files in from your OS to import them.
- **Real file operations**: new folder, rename (`F2`), delete (`Del`), open. List **and** grid views,
  sortable by name / size / modified / type.
- **Full permissions, no root**:
  - **Web (Chrome / Edge):** the File System Access API grants per-folder read+write when you pick a
    folder — `Open Folder…`.
  - **Android APK:** Capacitor Filesystem + **All-Files-Access** (`MANAGE_EXTERNAL_STORAGE`, requested
    from system settings on first launch). Quick locations: Internal Storage, Download, Documents,
    DCIM, Pictures, Movies, Music.
- **No background scanning or indexing** — directories are read one level, on demand.

### Get the Android APK

- **CI artifact:** the **Build Android APK** workflow runs on every push/PR and uploads
  `Ghost-Key-File-Explorer-installable-debug-apk`.
- **Release asset:** run the **Publish Android APK** workflow (`workflow_dispatch`) to attach a stable
  `ghost-key-file-explorer.apk` to the `android-preview` release.
- **Local:** `npm run android:apk`.

> ℹ️ The original file-intelligence engine (tagging, vaults, timeline, analysis) still lives in
> `src/core/*` and `src/components/*`; the explorer is now the default surface.

---

## ✨ Core Features

### 🗂 File Engine
- **Auto-tagging** — Every imported file automatically receives `who / what / when / where` tags inferred from filename, extension, MIME type, source, and content
- **Local-first** — All data stored in browser IndexedDB via Dexie (no cloud, no account)
- **Grid + List views** — Dual display modes with file type icons, previews, size, and tag badges

### 🧲 SKU / Magnetism System
- Every file gets a unique ID: `GK-YYYY-MM-XXXX`
- Related files auto-cluster based on shared tags, source, and person
- Manual SKU linking creates permanent relationships across files (messages ↔ images ↔ backups ↔ logs)

### ⏱ Global Timeline
- Every action is recorded: import, open, tag, analyze, search, vault, limbo
- Timeline grouped by day with **activity spike detection**
- Filter by event type: Files · Tags · Vaults · Search
- Becomes a **behavior reconstruction engine** showing exactly what happened and when

### 🔐 Vault System
- AES-GCM encrypted containers using the Web Crypto API
- Three vault types:
  - **Standard** — general encrypted storage
  - **Forensic** — evidence-grade encryption
  - **Ephemeral** — auto-wipes after 24 hours
- Lock / unlock with password-derived key (PBKDF2 + SHA-256)

### ⚗ Limbo Sandbox
- Open risky files (zips, dumps, logs) in isolation
- Nothing touches your real file library
- Runs entity extraction and analysis inside the sandbox
- Release (clean) or quarantine (flagged) when done

### 🧠 Analysis Engine
- Extracts: **names**, **phone numbers**, **email addresses**, **platforms/domains**, **URLs**, **dates**, **keywords**
- Calculates a **risk score** (0–10) based on content
- Detects behavioral patterns across multiple files
- Multi-file analysis with tab navigation

---

## Android APK

Ghost Key builds as an installable Android APK through Capacitor.

- Local build: `npm run android:apk`
- GitHub build: open the **Build Android APK** workflow in GitHub Actions and download the `Ghost-Key-File-Explorer-installable-debug-apk` artifact.
- Android permissions declared: `READ_EXTERNAL_STORAGE` for Android 12 and older, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, and `READ_MEDIA_AUDIO` for Android 13+, plus legacy write access for Android 9 and older.
- The APK uses a debug signing key by default, which is installable for testing. A Play Store/release APK still needs a real release keystore.

## 📱 UI — Android-style Dual Pane

### 🏠 Homescreen
- Live stats bar (files indexed, events tracked, bundles, vaults)
- **Pinnable widgets** — drag bundles, timelines, searches, SKUs to homescreen as live data panels
- Quick actions grid + recent activity feed

### 🔍 Semantic Relational Search
Instead of `IMG_4932.jpg`, search:
```
John + Snapchat + March
```
Finds matching files across names, tags, content, source, and SKU — simultaneously.

### 📜 Timeline Panel
- Scrollable feed (like a social media timeline, but it's your data history)
- Grouped by day · Activity spikes · Filter tabs
- Color-coded event icons

### 🗄 File Pane
- Drag-and-drop file import (auto-tagged on drop)
- Grid or list view
- Multi-select → Bundle / Vault / Limbo / Analyze / Delete in one click
- File detail panel with tag editor, content preview, linked SKUs

### 📁 Left Sidebar
- Sources (Snapchat, iCloud, WhatsApp, Instagram, Desktop, …)
- Bundles · Vaults · Limbo sessions · SKU Clusters
- Flagged & pinned filters

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm 9+

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

The app seeds **demo data** on first launch: 6 files, 15 timeline events, 1 bundle, 1 vault, 1 limbo session — so you can explore all features immediately.

### Build

```bash
npm run build
npm run preview
```

---

## 🏗 Architecture

```
src/
├── core/
│   ├── db.ts          # Dexie 4 IndexedDB schema
│   ├── tagger.ts      # Auto-tagging (who/what/when/where)
│   ├── sku.ts         # SKU generation + magnetism clustering
│   ├── timeline.ts    # Immutable event recording + querying
│   ├── vault.ts       # AES-GCM vault encryption (Web Crypto)
│   ├── limbo.ts       # Sandbox isolation + entity extraction
│   ├── analyzer.ts    # Pattern/entity analysis engine
│   └── seed.ts        # Demo data for first launch
├── store/
│   └── index.ts       # Zustand state management
├── components/
│   ├── layout/        # DualPane, LeftPane
│   ├── files/         # FileCard, FilePane
│   ├── homescreen/    # Homescreen, widgets
│   ├── timeline/      # TimelinePanel
│   ├── vault/         # VaultModal
│   ├── limbo/         # LimboPanel
│   ├── analysis/      # AnalysisPanel
│   ├── search/        # SearchBar
│   ├── tags/          # TagBadge, TagEditor
│   ├── sku/           # SKUBadge, SKULinker
│   └── common/        # UI primitives, Toast
└── utils/
    └── format.ts      # Formatting helpers
```

### Tech Stack
| Layer | Library |
|---|---|
| UI framework | React 19 + TypeScript |
| Build tool | Vite 6 |
| Styling | Tailwind CSS 3 |
| Local DB | Dexie 4 (IndexedDB) |
| State | Zustand |
| Animation | Framer Motion |
| Icons | Lucide React |
| Crypto | Web Crypto API (native) |

---

## 🔒 Privacy & Security

- **Zero cloud** — no data ever leaves your device
- **No accounts** — no login, no tracking
- **Vault encryption** — AES-256-GCM with PBKDF2 key derivation
- **Ephemeral vaults** — time-limited storage that auto-destroys
- **Limbo sandbox** — suspicious files never touch your real library

---

## 🧬 What It Really Is

Once everything connects:

> This is no longer "file explorer". It becomes a **Data Intelligence System** — tracks behavior, links evidence, reconstructs timelines, surfaces patterns.

Built to be the entry point for a full data intelligence workflow.
