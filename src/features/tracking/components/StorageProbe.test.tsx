import { fireEvent, render, screen } from '@testing-library/react-native';
import { findNodeHandle, Pressable, Text, View } from 'react-native';

import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { DatabaseContext } from '@/modules/database/database.context';
import { prepareDatabase } from '@/modules/database/prepare-database';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { StorageProbe } from './StorageProbe';

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the first test, can outlast its 5 s budget (backlog #8).
const PRELOADED = [findNodeHandle, Pressable, Text, View];

describe('StorageProbe', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;
  let database: Database;

  const openDatabase = async () => {
    file = createTemporaryDatabaseFile();
    connection = openNodeSqliteDatabase(file.path);
    await prepareDatabase(connection);
    database = createDatabase(connection);
  };
  const closeDatabase = async () => {
    await connection.closeAsync();
    file.remove();
  };

  const renderProbe = () =>
    render(
      <DatabaseContext value={database}>
        <StorageProbe />
      </DatabaseContext>,
    );

  // The probe's first render, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await openDatabase();
    await renderProbe();
    await screen.findByText('Entries total: 0 kcal');
    await screen.unmount();
    await closeDatabase();
  });

  beforeEach(openDatabase);

  afterEach(closeDatabase);

  it('shows what SQLite holds for today after each control writes to it', async () => {
    await renderProbe();
    await screen.findByText('Entries total: 0 kcal');

    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Entries total: 100 kcal')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Set cap to 1200' }));
    expect(await screen.findByText('Cap snapshot: 1200 · current cap: 1200')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('togglebutton', { name: '+0' }));
    expect(await screen.findByText('Carry-over: 0 kcal · added')).toBeOnTheScreen();
  });

  it('shows the stored values again after the database is closed and reopened', async () => {
    await renderProbe();
    await screen.findByText('Entries total: 0 kcal');
    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Set cap to 1200' }));
    await screen.findByText('Cap snapshot: 1200 · current cap: 1200');
    screen.unmount();
    await connection.closeAsync();

    connection = openNodeSqliteDatabase(file.path);
    await prepareDatabase(connection);
    database = createDatabase(connection);
    await renderProbe();

    expect(await screen.findByText('Entries total: 100 kcal')).toBeOnTheScreen();
    expect(screen.getByText('Cap snapshot: 1200 · current cap: 1200')).toBeOnTheScreen();
  });
});
