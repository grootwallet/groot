import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const APPLICATION_ID = 0x47524353;
const VERSION = 1;
const PENDING_WINDOW_MS = 30_000;

/** @typedef {'pending'|'succeeded'|'rejected'|'unknown'} OperationStatus */
/** @typedef {{code:string,retryable:boolean,retryAfterSeconds?:number}} ErrorBody */
/** @typedef {{data?:unknown,error?:ErrorBody,httpStatus?:number}} OperationResult */
/** @typedef {{status:OperationStatus}&OperationResult} Operation */
/** @typedef {{key:string,scope:string,digest:string,effect:string,state:OperationStatus,result:string|null}} Row */

/** @param {string} path */
function openPrivateFile(path) {
  if (!isAbsolute(path)) throw new Error('The provider journal path must be absolute.');
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const directoryStat = lstatSync(directory);
  if (
    !directoryStat.isDirectory() ||
    (process.platform !== 'win32' && (directoryStat.mode & 0o077) !== 0) ||
    (process.getuid && directoryStat.uid !== process.getuid())
  )
    throw new Error('The provider journal requires a private directory.');
  const fd = openSync(
    path,
    constants.O_CREAT | constants.O_RDWR | (constants.O_NOFOLLOW ?? 0),
    0o600
  );
  try {
    const stat = fstatSync(fd);
    const entry = lstatSync(path);
    if (
      !entry.isFile() ||
      stat.nlink !== 1 ||
      stat.dev !== entry.dev ||
      stat.ino !== entry.ino ||
      (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw new Error('The provider journal requires a private file.');
  } finally {
    closeSync(fd);
  }
}

/** @param {string} [path] */
export function createLocalCoinSwapJournal(path) {
  if (path) openPrivateFile(path);
  const database = new DatabaseSync(path ?? ':memory:');
  try {
    database.exec('PRAGMA busy_timeout=2000; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;');
    const applicationId = database.prepare('PRAGMA application_id').get()?.application_id;
    const version = database.prepare('PRAGMA user_version').get()?.user_version;
    if (applicationId === 0 && version === 0) {
      if (database.prepare('SELECT name FROM sqlite_schema LIMIT 1').get())
        throw new Error('This is not a provider journal.');
      database.exec(`
        CREATE TABLE operations (
          key TEXT PRIMARY KEY,
          scope TEXT NOT NULL,
          digest TEXT NOT NULL,
          effect TEXT NOT NULL,
          trade_id TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('pending','succeeded','rejected','unknown')),
          created_at INTEGER NOT NULL,
          result TEXT
        ) STRICT;
        CREATE INDEX operation_recovery ON operations(scope, trade_id, state, effect);
        PRAGMA application_id=${APPLICATION_ID};
        PRAGMA user_version=${VERSION};
      `);
    } else if (applicationId !== APPLICATION_ID || version !== VERSION) {
      throw new Error('Unsupported provider journal format.');
    }
    database.exec('COMMIT;');
    const find = database.prepare('SELECT * FROM operations WHERE key = ?');
    const unresolved = database.prepare(`
      SELECT key, state, effect FROM operations
      WHERE scope = ? AND trade_id = ?
        AND ((state IN ('pending','unknown') AND effect = ?)
             OR (state = 'pending' AND created_at >= ?))
      ORDER BY (effect = ?) DESC LIMIT 1
    `);
    const insert = database.prepare(`
      INSERT INTO operations (key,scope,digest,effect,trade_id,state,created_at)
      VALUES (?,?,?,?,?,'pending',?)
    `);
    const save = database.prepare(`
      UPDATE operations SET state = ?, result = ? WHERE key = ? AND scope = ? AND state = 'pending'
    `);
    /** @type {Set<string>} */
    const active = new Set();
    /** @param {Row} row @returns {Operation} */
    function visible(row) {
      if (row.state === 'pending') return { status: active.has(row.key) ? 'pending' : 'unknown' };
      return { status: row.state, ...(row.result === null ? {} : JSON.parse(row.result)) };
    }

    return {
      /**
       * @param {{key:string,scope:string,digest:string,effect:string,tradeId:string}} operation
       * @returns {Operation|{status:'conflict'|'reserved'}}
       */
      reserve({ key, scope, digest, effect, tradeId }) {
        const now = Date.now();
        database.exec('BEGIN IMMEDIATE;');
        /** @type {Operation|{status:'conflict'|'reserved'}} */
        let reservation;
        try {
          const row = /** @type {Row|undefined} */ (find.get(key));
          if (row) {
            reservation =
              row.scope === scope && row.digest === digest ? visible(row) : { status: 'conflict' };
          } else {
            const blocked = /** @type {Pick<Row,'key'|'effect'|'state'>|undefined} */ (
              unresolved.get(scope, tradeId, effect, now - PENDING_WINDOW_MS, effect)
            );
            if (blocked) {
              const waiting = blocked.state === 'pending' && active.has(blocked.key);
              reservation = {
                status: blocked.effect === effect && !waiting ? 'unknown' : 'pending'
              };
            } else {
              insert.run(key, scope, digest, effect, tradeId, now);
              reservation = { status: 'reserved' };
            }
          }
          database.exec('COMMIT;');
        } catch (error) {
          database.exec('ROLLBACK;');
          throw error;
        }
        if (reservation.status === 'reserved') active.add(key);
        return reservation;
      },
      /** @param {string} key @param {string} scope */
      get(key, scope) {
        const row = /** @type {Row|undefined} */ (find.get(key));
        return row?.scope === scope ? visible(row) : undefined;
      },
      /**
       * @param {string} key @param {string} scope @param {OperationStatus} status
       * @param {OperationResult} [result]
       */
      finish(key, scope, status, result) {
        try {
          if (
            save.run(status, result === undefined ? null : JSON.stringify(result), key, scope)
              .changes !== 1
          )
            throw new Error('Provider operation journal lost its reservation.');
        } finally {
          active.delete(key);
        }
      },
      close() {
        database.close();
      }
    };
  } catch (error) {
    database.close();
    throw error;
  }
}
