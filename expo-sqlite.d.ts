declare module 'expo-sqlite' {
  export interface SQLTransaction {
    executeSql(
      sqlStatement: string,
      args?: any[],
      success?: (tx: SQLTransaction, resultSet: any) => void,
      error?: (tx: SQLTransaction, error: any) => boolean | void
    ): void;
  }

  export interface Database {
    transaction(
      callback: (tx: SQLTransaction) => void,
      error?: (err: any) => void,
      success?: () => void
    ): void;
  }

  export function openDatabase(name: string): Database;
}
