import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadImage, type Image } from '@napi-rs/canvas';

/**
 * The little square beside an item's name.
 *
 * Wowhead serves these by a short name the tooltip data already carries -
 * "inv_sword_39" - so the website sends the name and the bot fetches the
 * picture. They never change, so the first raid to sell an item pays for it
 * and every raid after reads it off the disk.
 */

const CACHE_DIR = join(process.cwd(), 'data', 'item-icons');
const SOURCE = 'https://wow.zamimg.com/images/wow/icons/medium';

/** Long enough that a slow CDN is a missing icon, not a post nobody gets. */
const TIMEOUT_MS = 4000;

/** How many to ask for at once, so forty items are not forty round trips. */
const POOL = 8;

/** In-memory as well, so one post does not read the same file twice. */
const loaded = new Map<string, Image>();

/**
 * Only what Wowhead's own names contain.
 *
 * The name reaches here from a website that read it from a third party, and it
 * is about to become a file path and a URL. Anything else is not an icon name.
 */
function isSafeName(name: string): boolean {
  return /^[a-z0-9_-]{1,64}$/i.test(name);
}

async function fromDisk(name: string): Promise<Buffer | null> {
  try {
    return await readFile(join(CACHE_DIR, `${name}.jpg`));
  } catch {
    return null;
  }
}

async function fromWowhead(name: string): Promise<Buffer | null> {
  try {
    const response = await fetch(`${SOURCE}/${name}.jpg`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const body = Buffer.from(await response.arrayBuffer());

    try {
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(join(CACHE_DIR, `${name}.jpg`), body);
    } catch {
      // Unwritable cache costs a fetch next time, not this icon.
    }

    return body;
  } catch {
    return null;
  }
}

/**
 * Every icon that could be found, by name.
 *
 * One that cannot - a name Wowhead does not know, a CDN that will not answer -
 * is simply absent, and the row is drawn without it. A missing square is worth
 * less than a post that does not go out.
 */
export async function loadItemIcons(names: string[]): Promise<Map<string, Image>> {
  const wanted = [...new Set(names.filter(isSafeName))].filter((name) => !loaded.has(name));

  for (let i = 0; i < wanted.length; i += POOL) {
    await Promise.all(wanted.slice(i, i + POOL).map(async (name) => {
      const bytes = (await fromDisk(name)) ?? (await fromWowhead(name));

      if (!bytes) {
        return;
      }

      try {
        loaded.set(name, await loadImage(bytes));
      } catch {
        // Not a picture after all. Drawn without it.
      }
    }));
  }

  return loaded;
}
