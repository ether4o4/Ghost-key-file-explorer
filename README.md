# 👻 Ghost Key — File Intelligence System

> A forensic-grade file intelligence system disguised as a file explorer.

Ghost Key is a **local-first, privacy-first** file engine that tracks, tags, links, and analyzes files with zero cloud dependency. It's not just a file manager — it's a **data intelligence platform** for reconstructing timelines, clustering related evidence, and surfacing behavioral patterns.

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
