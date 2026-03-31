export interface SqliteDefensiveCapable {
  enableDefensive?: (enabled: boolean) => unknown;
}

export function enableSqliteDefensiveMode(database: SqliteDefensiveCapable): boolean {
  if (typeof database.enableDefensive === "function") {
    database.enableDefensive(true);
    return true;
  }
  return false;
}
