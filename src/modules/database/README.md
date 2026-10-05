# `modules/database`

The app's one SQLite database. This module opens it, prepares the connection, runs the schema
migrations, and provides the handle every feature reads and writes through. It is the only importer of
`expo-sqlite` (a lint gateway), and it imports no feature.

## Who depends on it

Features use it for `useDatabase()`, the handle types, and the column readers. The root provider
composition uses it for `DatabaseProvider`, which must wrap everything that calls `useDatabase()`.
Until `onInit` finishes, `SQLiteProvider` renders nothing. An open or migration failure is rethrown to
the nearest error boundary.

## Constraints

- **One connection, one queue.** `createDatabase` runs every read and write, in order, on the one
  connection `SQLiteProvider` opens. Each `write` is a single `BEGIN IMMEDIATE` transaction.
  - It replaces expo-sqlite's `withExclusiveTransactionAsync`. That opens a new native connection for
    each call (`Transaction.createAsync` in expo-sqlite 57.0.3). `PRAGMA foreign_keys` is set per
    connection and is off by default. It cannot be turned on from inside the task, because `BEGIN` has
    already run.
  - `withTransactionAsync` is not used either, because a query issued elsewhere while it is open joins
    the transaction.
- **Every connection is prepared before use.** `prepareDatabase` runs as `SQLiteProvider`'s `onInit`.
  It turns on `foreign_keys` and WAL, then migrates.
- **Migrations are append-only.** They are applied in order by `PRAGMA user_version`. Each one runs in a
  transaction together with its version bump. A database whose version is higher than the list's
  length is left as it is.
- **Subscribers are notified after COMMIT,** not by expo-sqlite's change listener. SQLite's update hook
  fires for each row as it is written, before the commit. A reader that refreshed on it could read the
  old state and then receive no further event.
- **Rows arrive as `unknown`.** Each column is converted by `readNumber` or `readNullableNumber`. A
  value of the wrong type throws instead of travelling inward.
