import { createCanvas } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import { FONT, WOW_CLASS_COLORS } from './roster.js';
import { formatGold, type LootHistoryPost } from './loot-history-post.js';

/**
 * A raid's loot drawn as a picture, the way the website lists it.
 *
 * Discord will not colour text in a message, and its one coloured code block
 * has eight colours to choose from - so an epic and a rare come out the same
 * shade of blue-ish, and a warrior and a rogue the same yellow. Those colours
 * are the point: a player reads the quality before the name.
 *
 * So it is drawn, the same way the roster already is.
 */

/** What each item quality is coloured in game. */
const QUALITY_COLORS: Record<number, string> = {
  0: '#9d9d9d', // Poor
  1: '#ffffff', // Common
  2: '#1eff00', // Uncommon
  3: '#0070dd', // Rare
  4: '#a335ee', // Epic
  5: '#ff8000', // Legendary
  6: '#e6cc80', // Artifact
};

const BACKGROUND = '#0f1116';
const HEADER_TEXT = '#e6cc80';
const SUBTLE = '#7a828f';
const ROW_STRIPE = '#161a22';

const PADDING = 16;
const HEADER_H = 46;
const ROW_H = 24;
const GOLD_W = 90;
const BUYER_W = 150;
const MIN_ITEM_W = 260;

/**
 * Wide enough for the longest item name, rather than cutting them all to fit.
 *
 * "Leggings of Apocalypse" truncated to "Leggings of Apoca..." is the thing
 * the website already does and the thing worth not copying here: there is no
 * hover on a picture to see the rest.
 */
function itemColumnWidth(items: LootHistoryPost['items']): number {
  const measure = createCanvas(10, 10).getContext('2d');
  measure.font = `13px "${FONT}"`;

  const widest = items.reduce(
    (max, line) => Math.max(max, measure.measureText(line.item).width),
    0,
  );

  return Math.max(MIN_ITEM_W, Math.ceil(widest) + 16);
}

export function renderLootHistory(post: LootHistoryPost): Buffer {
  const itemW = itemColumnWidth(post.items);
  const width = PADDING * 2 + itemW + BUYER_W + GOLD_W;
  const height = PADDING * 2 + HEADER_H + Math.max(1, post.items.length) * ROW_H;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, width, height);

  ctx.textBaseline = 'middle';

  ctx.font = `bold 16px "${FONT} Bold"`;
  ctx.fillStyle = HEADER_TEXT;
  ctx.fillText(post.raidName, PADDING, PADDING + 12);

  ctx.font = `12px "${FONT}"`;
  ctx.fillStyle = SUBTLE;
  ctx.fillText(
    `${post.date}  -  Total pot: ${formatGold(post.totalPot)}  -  ${post.items.length} items`,
    PADDING,
    PADDING + 32,
  );

  if (post.items.length === 0) {
    ctx.fillStyle = SUBTLE;
    ctx.fillText('Nothing was sold.', PADDING, PADDING + HEADER_H + ROW_H / 2);

    return canvas.toBuffer('image/png');
  }

  post.items.forEach((line, i) => {
    const top = PADDING + HEADER_H + i * ROW_H;
    const middle = top + ROW_H / 2;

    // Banded, because forty rows of three columns are read across and the eye
    // loses the line without something holding it.
    if (i % 2 === 1) {
      ctx.fillStyle = ROW_STRIPE;
      ctx.fillRect(PADDING - 6, top, width - PADDING * 2 + 12, ROW_H);
    }

    ctx.font = `13px "${FONT}"`;
    ctx.textAlign = 'left';
    ctx.fillStyle = QUALITY_COLORS[line.quality ?? 4] ?? QUALITY_COLORS[4];
    ctx.fillText(line.item, PADDING, middle);

    ctx.fillStyle = (line.className && WOW_CLASS_COLORS[line.className]) || '#c9d1d9';
    ctx.fillText(line.buyer, PADDING + itemW, middle);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd100';
    ctx.fillText(formatGold(line.gold), width - PADDING, middle);
  });

  return canvas.toBuffer('image/png');
}

/** The picture, ready to hang on a message. */
export function lootHistoryAttachment(post: LootHistoryPost): AttachmentBuilder {
  return new AttachmentBuilder(renderLootHistory(post), { name: 'loot-history.png' });
}
