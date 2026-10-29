# Review of the recovered explorer source

Reviewed input: `c7219aee06ec61d76d326349c81dbd87894a96fe` from
`backup/skywork-ghost-key-2026-10-28`, based on main at
`30e4acbe1514e8b6955bbe82b5217c1a8706c79f`.

The recovered single/dual-pane layout, touch adaptations and Limbo archive
workflow are retained. Original source/APK recovery files remain unchanged in
`skywork-backup/`.

Before promotion, review reproduced and repaired unsafe rename collisions,
folder-into-descendant moves, stale refresh results, expired drag payloads,
Limbo source overwrites and destination selection, archive validation after
unbounded decompression, and invalid/off-screen saved window bounds. Existing
filesystem validation from source checkpoint `c16abe0` was integrated without
discarding the recovered layout or archive work. Native path checks use the
existing permissions and preserve the application ID and SDK targets.

The ZIP engine checks metadata before allocating expanded contents, validates
size and CRC, rejects path collisions, and compares repackaged bytes. Its
documented 64 MiB limits and unsupported formats remain acceptance constraints.

The test command no longer ignores TypeScript failures. CI runs regression
tests, active explorer lint, Android compilation/JVM tests/lint and signature
verification. Release publishing is manual so a merge cannot silently overwrite
the existing APK with an unrelated ephemeral debug signing key.

At review: 55 host tests, the production web build, active explorer lint and
source whitespace checks pass. See CI for Android results on the exact commit.
Full-repository lint includes retained legacy source and is not claimed clean.

Chromium checks with real OPFS handles behind a substituted folder picker pass
copy/collision, rename, move, delete, byte hashes, preference reload, cache
updates/offline use, and Limbo extraction/placement/discard. Layout checks cover
single/dual mode persistence, split sizing, Close-button hit targets, saved
desktop bounds on a phone viewport and rotation. These do not test the OS folder
picker or native Android touch/provider integration; Android long-press menu
behavior remains unverified.

No Android device/provider acceptance was performed here. The native backend
uses file paths rather than SAF, and external races or interruptions can leave
partial destinations. Staging cache may be evicted. These changes do not add
Recycle Bin, rollback, transaction recovery, a stable release signing key or an
independent native file-provider implementation.
