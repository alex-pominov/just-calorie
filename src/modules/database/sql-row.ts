function readColumn(row: unknown, column: string): unknown {
  if (typeof row !== 'object' || row === null || !(column in row)) {
    throw new Error(`Row has no column ${column}`);
  }

  return Reflect.get(row, column);
}

export function readNumber(row: unknown, column: string): number {
  const value = readColumn(row, column);

  if (typeof value !== 'number') {
    throw new Error(`Column ${column} is not a number`);
  }

  return value;
}

export function readNullableNumber(row: unknown, column: string): number | null {
  const value = readColumn(row, column);

  if (value !== null && typeof value !== 'number') {
    throw new Error(`Column ${column} is neither a number nor null`);
  }

  return value;
}
