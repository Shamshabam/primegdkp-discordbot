import { join } from 'node:path';
import type { Config } from '../config.js';
import { JsonFileStore } from './json-file-store.js';
import type { SignupStore } from './signup-store.js';

export function createStore(config: Config): SignupStore {
  if (config.storeDriver === 'api') {
    throw new Error('API-backed store is not implemented yet — build the website first, then add this.');
  }

  return new JsonFileStore(join(process.cwd(), 'data', 'store.json'));
}

export type { SignupStore } from './signup-store.js';
