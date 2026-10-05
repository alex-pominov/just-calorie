import { createContext } from 'react';

import type { Database } from './database.types';

export const DatabaseContext = createContext<Database | null>(null);
