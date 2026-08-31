import type { Faction } from './types.js';

export type CombatRole = 'tank' | 'melee' | 'ranged' | 'healer';

export interface WowSpec {
  name: string;
  emoji: string;
  roles: string[];
  combatRole: CombatRole;
}

export interface WowClass {
  name: string;
  emoji: string;
  color: number;
  faction?: 'horde' | 'alliance';
  specs: WowSpec[];
}

const CLASS_DISPLAY_ORDER = [
  'Warrior',
  'Rogue',
  'Hunter',
  'Mage',
  'Warlock',
  'Druid',
  'Priest',
  'Paladin',
  'Shaman',
];

export const WOW_CLASSES: WowClass[] = [
  {
    name: 'Warrior',
    emoji: '<:c_warrior:1543269983990194268>',
    color: 0xc69b6d,
    specs: [
      { name: 'Arms', emoji: '<:s_arms:1543270013929132163>', roles: ['DPS'], combatRole: 'melee' },
      { name: 'Fury', emoji: '<:s_fury:1543270015330164796>', roles: ['DPS'], combatRole: 'melee' },
      { name: 'Protection', emoji: '<:s_prot_war:1543270016823206010>', roles: ['Tank'], combatRole: 'tank' },
    ],
  },
  {
    name: 'Paladin',
    emoji: '<:c_paladin:1543269985609064488>',
    color: 0xf48cba,
    faction: 'alliance',
    specs: [
      { name: 'Holy', emoji: '<:s_holy_pal:1543270018349793410>', roles: ['Healer'], combatRole: 'healer' },
      { name: 'Protection', emoji: '<:s_prot_pal:1543270021139009570>', roles: ['Tank'], combatRole: 'tank' },
      { name: 'Retribution', emoji: '<:s_ret:1543270031096545280>', roles: ['DPS'], combatRole: 'melee' },
    ],
  },
  {
    name: 'Hunter',
    emoji: '<:c_hunter:1543269986783600783>',
    color: 0xaad372,
    specs: [
      { name: 'Beast Mastery', emoji: '<:s_bm:1543270032652378232>', roles: ['DPS'], combatRole: 'ranged' },
      { name: 'Marksmanship', emoji: '<:s_marks:1543270033793355799>', roles: ['DPS'], combatRole: 'ranged' },
      { name: 'Survival', emoji: '<:s_surv:1543270037534539776>', roles: ['DPS'], combatRole: 'ranged' },
    ],
  },
  {
    name: 'Rogue',
    emoji: '<:c_rogue:1543270000746561686>',
    color: 0xfff468,
    specs: [
      { name: 'Assassination', emoji: '<:s_assn:1543270039153549342>', roles: ['DPS'], combatRole: 'melee' },
      { name: 'Combat', emoji: '<:s_combat:1543270040655233064>', roles: ['DPS'], combatRole: 'melee' },
      { name: 'Subtlety', emoji: '<:s_sub:1543270044845346907>', roles: ['DPS'], combatRole: 'melee' },
    ],
  },
  {
    name: 'Priest',
    emoji: '<:c_priest:1543270003254501426>',
    color: 0xffffff,
    specs: [
      { name: 'Discipline', emoji: '<:s_disc:1543270046741041172>', roles: ['Healer'], combatRole: 'healer' },
      { name: 'Holy', emoji: '<:s_holy_pr:1543270048246796339>', roles: ['Healer'], combatRole: 'healer' },
      { name: 'Shadow', emoji: '<:s_shadow:1543270049488314479>', roles: ['DPS'], combatRole: 'ranged' },
    ],
  },
  {
    name: 'Shaman',
    emoji: '<:c_shaman:1543270005372887130>',
    color: 0x0070dd,
    faction: 'horde',
    specs: [
      { name: 'Elemental', emoji: '<:s_ele:1543270051593855116>', roles: ['DPS'], combatRole: 'ranged' },
      { name: 'Enhancement', emoji: '<:s_enh:1543270052885696532>', roles: ['DPS'], combatRole: 'melee' },
      { name: 'Restoration', emoji: '<:s_resto_sh:1543270054219485234>', roles: ['Healer'], combatRole: 'healer' },
    ],
  },
  {
    name: 'Mage',
    emoji: '<:c_mage:1543270007914373211>',
    color: 0x3fc7eb,
    specs: [
      { name: 'Arcane', emoji: '<:s_arcane:1543270055540953109>', roles: ['DPS'], combatRole: 'ranged' },
      { name: 'Fire', emoji: '<:s_fire:1543270057558286396>', roles: ['DPS'], combatRole: 'ranged' },
      { name: 'Frost', emoji: '<:s_frost:1543270060028862524>', roles: ['DPS'], combatRole: 'ranged' },
    ],
  },
  {
    name: 'Warlock',
    emoji: '<:c_warlock:1543270010850517172>',
    color: 0x8788ee,
    specs: [
      { name: 'Affliction', emoji: '<:s_affli:1543270062121558117>', roles: ['DPS'], combatRole: 'ranged' },
      { name: 'Demonology', emoji: '<:s_demo:1543270063795347627>', roles: ['DPS'], combatRole: 'ranged' },
      { name: 'Destruction', emoji: '<:s_destro:1543270065213022272>', roles: ['DPS'], combatRole: 'ranged' },
    ],
  },
  {
    name: 'Druid',
    emoji: '<:c_druid:1543270012398207007>',
    color: 0xff7c0a,
    specs: [
      { name: 'Balance', emoji: '<:s_balance:1543270066773295224>', roles: ['DPS'], combatRole: 'ranged' },
      { name: 'Feral', emoji: '<:s_feral:1543270068207624345>', roles: ['DPS', 'Tank'], combatRole: 'melee' },
      { name: 'Restoration', emoji: '<:s_resto_dr:1543270069763702955>', roles: ['Healer'], combatRole: 'healer' },
    ],
  },
];

export function classesForFaction(faction: Faction): WowClass[] {
  return WOW_CLASSES.filter((c) => !c.faction || c.faction === faction);
}

export function classDisplayOrder(faction: Faction): string[] {
  const available = new Set(classesForFaction(faction).map((c) => c.name));
  return CLASS_DISPLAY_ORDER.filter((name) => available.has(name));
}

export function findClass(name: string): WowClass | undefined {
  return WOW_CLASSES.find((c) => c.name.toLowerCase() === name.toLowerCase());
}

export function findSpec(wowClass: WowClass, specName: string): WowSpec | undefined {
  return wowClass.specs.find((s) => s.name.toLowerCase() === specName.toLowerCase());
}

/** Extracts {id, name} from a custom emoji string like <:name:id> for use in select menu options. */
export function parseCustomEmoji(emoji: string): { id: string; name: string } | string {
  const match = /^<:(\w+):(\d+)>$/.exec(emoji);
  if (match) return { name: match[1], id: match[2] };
  return emoji;
}

export function getCombatRole(className: string, specName: string): CombatRole {
  const wowClass = findClass(className);
  if (!wowClass) return 'melee';
  const spec = findSpec(wowClass, specName);
  return spec?.combatRole ?? 'melee';
}
