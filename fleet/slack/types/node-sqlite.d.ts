// Minimal typing of node:sqlite (Node 22.13+), enough for fleet/slack/src/store.ts.
// The repository's @types/node predates the module.
declare module 'node:sqlite' {
  export type SQLInputValue = null | number | bigint | string | Uint8Array
  export interface StatementResultingChanges {
    changes: number | bigint
    lastInsertRowid: number | bigint
  }
  export class StatementSync {
    all(...params: SQLInputValue[]): Record<string, unknown>[]
    get(...params: SQLInputValue[]): Record<string, unknown> | undefined
    run(...params: SQLInputValue[]): StatementResultingChanges
  }
  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean })
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
