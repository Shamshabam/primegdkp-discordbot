import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import type { RosterGroups, RosterState } from './types.js';

/**
 * The font is shipped with the bot rather than taken from the machine.
 *
 * Canvas falls back to whatever the host happens to have installed, which on
 * a Windows laptop meant a bitmap face and on a bare server could mean none at
 * all. Registering one here makes the roster come out the same everywhere.
 */
const FONT = 'DejaVu Sans';

function registerFont(): void {
  const require = createRequire(import.meta.url);
  const ttf = dirname(require.resolve('dejavu-fonts-ttf/package.json'));

  GlobalFonts.registerFromPath(join(ttf, 'ttf', 'DejaVuSans.ttf'), FONT);
  GlobalFonts.registerFromPath(join(ttf, 'ttf', 'DejaVuSans-Bold.ttf'), FONT + ' Bold');
}

registerFont();

const WOW_CLASS_COLORS: Record<string, string> = {
  Warrior: '#C79C6E',
  Paladin: '#F58CBA',
  Hunter: '#ABD473',
  Rogue: '#FFF569',
  Priest: '#FFFFFF',
  Shaman: '#0070DE',
  Mage: '#69CCF0',
  Warlock: '#9482C9',
  Druid: '#FF7D0A',
};

const NUM_GROUPS = 8;
const GROUP_SIZE = 5;

const COLS = 4;
const ROWS = 2;
const GROUP_W = 200;
const GROUP_H = 160;
const SLOT_H = 24;
const HEADER_H = 26;
const PADDING = 12;
const GAP_X = 10;
const GAP_Y = 10;

/** The box drawn beside every name, and what goes in it. */
const BOX = 11;
const BOX_X = 9;

/**
 * Draw the roster exactly as the website used to draw it, plus a box beside
 * each name saying whether that player has confirmed.
 *
 * This moved off the website because the picture has to change when somebody
 * presses a button in Discord at two in the morning, and a canvas in a browser
 * nobody has open cannot be asked to redraw itself.
 */
export function drawRoster(groups: RosterGroups, state: RosterState = {}): Buffer {
  const totalW = COLS * GROUP_W + (COLS - 1) * GAP_X + PADDING * 2;
  const totalH = ROWS * GROUP_H + (ROWS - 1) * GAP_Y + PADDING * 2 + 30;

  const canvas = createCanvas(totalW, totalH);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, totalW, totalH);

  ctx.fillStyle = '#c9d1d9';
  ctx.font = `bold 14px "${FONT} Bold"`;
  ctx.textAlign = 'center';
  ctx.fillText('Prime GDKP - Raid Roster', totalW / 2, PADDING + 14);

  for (let g = 0; g < NUM_GROUPS; g++) {
    const col = g % COLS;
    const row = Math.floor(g / COLS);
    const x = PADDING + col * (GROUP_W + GAP_X);
    const y = PADDING + 24 + row * (GROUP_H + GAP_Y);

    ctx.fillStyle = '#161b22';
    ctx.beginPath();
    ctx.roundRect(x, y, GROUP_W, GROUP_H, 6);
    ctx.fill();

    ctx.fillStyle = '#8b949e';
    ctx.font = `bold 10px "${FONT} Bold"`;
    ctx.textAlign = 'center';
    ctx.fillText(`GROUP ${g + 1}`, x + GROUP_W / 2, y + 16);

    const group = groups[g] ?? [];

    for (let s = 0; s < GROUP_SIZE; s++) {
      const player = group[s] ?? null;
      const sy = y + HEADER_H + s * SLOT_H;

      ctx.fillStyle = player ? '#21262d' : '#161b22';
      ctx.beginPath();
      ctx.roundRect(x + 4, sy, GROUP_W - 8, SLOT_H - 2, 3);
      ctx.fill();

      if (!player) {
        ctx.fillStyle = '#30363d';
        ctx.font = `10px "${FONT}"`;
        ctx.textAlign = 'center';
        ctx.fillText('Empty', x + GROUP_W / 2, sy + 14);
        continue;
      }

      drawBox(ctx, x + BOX_X, sy + 6, state[key(player.characterName)]);

      ctx.fillStyle = WOW_CLASS_COLORS[player.className] || '#8b949e';
      ctx.font = `11px "${FONT}"`;
      ctx.textAlign = 'left';
      ctx.fillText(player.characterName, x + BOX_X + BOX + 6, sy + 15);
    }
  }

  return canvas.toBuffer('image/png');
}

/** An empty box, a tick, or a cross. */
function drawBox(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  x: number,
  y: number,
  answer: 'confirmed' | 'cancelled' | undefined,
): void {
  ctx.lineWidth = 1;
  ctx.strokeStyle = answer === 'confirmed' ? '#3fb950' : answer === 'cancelled' ? '#f85149' : '#484f58';
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, BOX, BOX, 2);
  ctx.stroke();

  if (!answer) return;

  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();

  if (answer === 'confirmed') {
    ctx.strokeStyle = '#3fb950';
    ctx.moveTo(x + 2.5, y + 6);
    ctx.lineTo(x + 4.6, y + 8.4);
    ctx.lineTo(x + 8.6, y + 3.2);
  } else {
    ctx.strokeStyle = '#f85149';
    ctx.moveTo(x + 3, y + 3);
    ctx.lineTo(x + 8, y + 8);
    ctx.moveTo(x + 8, y + 3);
    ctx.lineTo(x + 3, y + 8);
  }

  ctx.stroke();
}

/**
 * How a name is matched between the roster and a signup.
 *
 * The roster is typed by the raid leader and the signup by the player, so they
 * disagree about accents and apostrophes constantly - Missclick against
 * Missclìck. Folded the same way the website folds them.
 */
export function key(name: string): string {
  let folded = name.toLowerCase();

  for (const [letter, plain] of Object.entries(LETTERS)) {
    folded = folded.split(letter).join(plain);
  }

  return folded
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Letters that carry their mark inside the glyph rather than above it.
 *
 * Stripping combining marks handles an acute or an umlaut, but these do not
 * decompose into a letter and a mark - so dropping what was left turned
 * Interpol with a slashed o into "interpl", and the person pressing Confirm
 * matched no row on the roster at all. The website folds them the same way.
 */
const LETTERS: Record<string, string> = {
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  ð: 'd',
  đ: 'd',
  þ: 'th',
  ł: 'l',
};

/** Every character on the roster, by match key. */
export function rosterNames(groups: RosterGroups): Set<string> {
  const names = new Set<string>();

  for (const group of groups) {
    for (const player of group) {
      if (player) {
        names.add(key(player.characterName));
      }
    }
  }

  return names;
}
