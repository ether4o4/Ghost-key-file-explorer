# Explorer regression checks

From the repository root, using Node 20.19+ or a supported newer Node release:

```sh
npm ci
npm run build
npm test
```

`npm test` compiles the archive imports with TypeScript errors treated as
failures, then runs the Node test files. The build separately checks the active
application's TypeScript graph.

Coverage includes archive bounds, paths, corruption and byte round trips;
filesystem collisions, source identity, failed writes and folder ancestry;
drop-event lifetime; stale listing results; preferences and saved window bounds;
Limbo destination selection, workspace preservation and cleanup; and service
worker update/offline behavior.

Filesystem fixtures use disposable Linux files behind a browser-handle test
double. Native adapter tests use a plugin test double. Neither establishes
Android permission/provider behavior. The archive tests use real ZIP bytes.

After `npx cap sync android`, the Android checks are:

```sh
cd android
./gradlew assembleDebug testDebugUnitTest lintDebug
```

The focused JVM tests exercise the native validation helper on the host, not a
phone. APK signature verification is also separate from installation testing.
