/* =============================================================
   EMBERFALL: NIGHTSWARM — vanilla JS prototype
   Single-file implementation. No external assets, no fetch.
   Procedural pixel-art sprites drawn into offscreen canvases
   at boot, then blitted each frame.
   ============================================================= */

(() => {
'use strict';

/* ---------- Palette (matches design doc §12) ---------- */
const PAL = {
  bg0: '#0d0a14', bg1: '#1c1a2b', bg2: '#3a2f4a',
  mauve: '#6b4a7a', pink: '#c98aab',
  cream: '#f3d0a3', amber: '#ffb84a', orange: '#ff6b3d', red: '#d63d2e',
  teal: '#4ac1bd', deepTeal: '#2d6e7e', deeperTeal: '#1a3b4f',
  darkGreen: '#2a5a3d', green: '#6fa86c',
  paper: '#e8e3d6', white: '#ffffff'
};

/* ---------- Seedable RNG (Mulberry32) ---------- */
let _seed = (Date.now() & 0xffffffff) >>> 0;
function seedRng(s) { _seed = (s >>> 0) || 1; }
function rand() {
  _seed = (_seed + 0x6D2B79F5) >>> 0;
  let t = _seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randRange = (a, b) => a + rand() * (b - a);
const randInt = (a, b) => Math.floor(randRange(a, b + 1));
const choice = arr => arr[Math.floor(rand() * arr.length)];
function weightedPick(entries, weightKey = 'weight') {
  let total = 0; for (const e of entries) total += e[weightKey];
  let r = rand() * total;
  for (const e of entries) { r -= e[weightKey]; if (r <= 0) return e; }
  return entries[entries.length - 1];
}

/* =============================================================
   GAME DATA
   ============================================================= */

const CHARACTERS = [
  { id: 'wyck',    name: 'Wyck',    flavor: 'Lantern-Keeper of the last flame.',
    starter: 'ember_beam',    passive: { type: 'pickup_radius', value: 0.10 },
    color: PAL.amber, unlock: { type: 'default' } },
  { id: 'ferren',  name: 'Ferren',  flavor: 'Heretic nun who weaponized prayer.',
    starter: 'hymn_wave',     passive: { type: 'weapon_area', value: 0.15 },
    color: PAL.pink, unlock: { type: 'survive', minutes: 5, hint: 'Survive 5 min as Wyck' } },
  { id: 'brom',    name: 'Brom',    flavor: 'Drunken smith who throws what he forges.',
    starter: 'anvil_toss',    passive: { type: 'damage', value: 0.20, speedPenalty: 0.10 },
    color: PAL.orange, unlock: { type: 'level', value: 30, hint: 'Reach Lv 30 in any run' } },
  { id: 'vespa',   name: 'Vespa',   flavor: 'A cursed witch made of brambles.',
    starter: 'thorn_halo',    passive: { type: 'contact_aura', value: 5 },
    color: PAL.green, unlock: { type: 'kill_boss', boss: 'belltyrant', hint: 'Slay the Bell Tyrant' } },
  { id: 'sable',   name: 'Sable',   flavor: 'Ghost child piloting their own shadow.',
    starter: 'shade_daggers', passive: { type: 'phase_iframe', value: 0.5, every: 8 },
    color: PAL.teal, unlock: { type: 'no_damage', minutes: 1, hint: 'Take no damage for 60s' } },
  { id: 'halberd', name: 'Halberd', flavor: 'Decommissioned watchman with a shotgun-pike.',
    starter: 'scattershot',   passive: { type: 'crit_lifesteal', heal: 1, capPerSec: 3 },
    color: PAL.cream, unlock: { type: 'shards_spent', value: 1500, hint: 'Spend 1500 shards in shop' } }
];

const ENEMIES = {
  husk:     { name: 'Husk',        hp: 8,  speed: 55,  dmg: 5,  weight: 100, size: 12, color: PAL.mauve,    behavior: 'chase' },
  crawler:  { name: 'Crawler',     hp: 5,  speed: 90,  dmg: 4,  weight: 60,  size: 10, color: PAL.pink,     behavior: 'chase' },
  brute:    { name: 'Brute',       hp: 38, speed: 38,  dmg: 12, weight: 25,  size: 18, color: PAL.deepTeal, behavior: 'chase' },
  vexbat:   { name: 'Vexbat',      hp: 8,  speed: 90,  dmg: 4,  weight: 35,  size: 11, color: PAL.teal,     behavior: 'weave' },
  spitter:  { name: 'Spitter',     hp: 12, speed: 40,  dmg: 5,  weight: 20,  size: 13, color: PAL.green,    behavior: 'ranged' },
  hexer:    { name: 'Hexer',       hp: 20, speed: 30,  dmg: 5,  weight: 8,   size: 16, color: PAL.orange,   behavior: 'aura' },
  reaver:   { name: 'Reaver',      hp: 18, speed: 60,  dmg: 7,  weight: 15,  size: 14, color: PAL.red,      behavior: 'dash' },
  lurker:   { name: 'Lurker',      hp: 14, speed: 70,  dmg: 6,  weight: 10,  size: 14, color: PAL.bg2,      behavior: 'burrow' },
  grub:     { name: 'Grub Swarm',  hp: 22, speed: 45,  dmg: 5,  weight: 12,  size: 14, color: PAL.darkGreen, behavior: 'splitter' },
  pillar:   { name: 'Bone Pillar', hp: 60, speed: 0,   dmg: 6,  weight: 6,   size: 20, color: PAL.cream,    behavior: 'turret' },
  wraith:   { name: 'Wraith',      hp: 25, speed: 55,  dmg: 7,  weight: 7,   size: 16, color: PAL.deeperTeal, behavior: 'phase' },
  nullhound:{ name: 'Nullhound',   hp: 16, speed: 110, dmg: 6,  weight: 4,   size: 13, color: PAL.bg0,      behavior: 'sprint' },
  // Spawned by grub on death (not in spawn tables)
  grublet:  { name: 'Grublet',     hp: 3,  speed: 70,  dmg: 3,  weight: 0,   size: 8,  color: PAL.green,    behavior: 'chase' }
};

// Bosses
const BOSSES = {
  marrow:     { name: 'Marrow Knight', hp: 600,   speed: 40, dmg: 14, size: 28, color: PAL.cream,  behavior: 'charge' },
  belltyrant: { name: 'Bell Tyrant',   hp: 2400,  speed: 35, dmg: 16, size: 34, color: PAL.amber,  behavior: 'bell_ring' },
  reaper:     { name: 'Final Reaper',  hp: 35000, speed: 45, dmg: 22, size: 40, color: PAL.bg0,    behavior: 'reaper' }
};

// Spawn tables per minute. Index 0 = minute 0..1, etc.
const SPAWN_TABLES = [
  /* 0:00 */ [ ['husk', 100] ],
  /* 1:00 */ [ ['husk', 80], ['crawler', 40] ],
  /* 2:00 */ [ ['husk', 60], ['crawler', 50], ['brute', 25], ['spitter', 15] ],
  /* 3:00 */ [ ['husk', 60], ['crawler', 50], ['brute', 25], ['spitter', 20] ],
  /* 4:00 */ [ ['husk', 50], ['crawler', 40], ['brute', 25], ['spitter', 20], ['vexbat', 30], ['pillar', 6] ],
  /* 5:00 */ [ ['husk', 50], ['crawler', 50], ['brute', 30], ['spitter', 25], ['vexbat', 35], ['hexer', 8], ['pillar', 8] ],
  /* 6:00 */ [ ['husk', 40], ['crawler', 40], ['brute', 35], ['spitter', 25], ['vexbat', 40], ['hexer', 10], ['reaver', 14] ],
  /* 7:00 */ [ ['husk', 40], ['crawler', 40], ['brute', 35], ['spitter', 25], ['vexbat', 35], ['hexer', 12], ['reaver', 18] ],
  /* 8:00 */ [ ['husk', 35], ['crawler', 40], ['brute', 35], ['vexbat', 35], ['hexer', 12], ['reaver', 18], ['lurker', 12], ['grub', 14] ],
  /* 9:00 */ [ ['husk', 30], ['crawler', 35], ['brute', 35], ['vexbat', 35], ['hexer', 14], ['reaver', 20], ['lurker', 14], ['grub', 16], ['nullhound', 6] ],
  /*10:00 */ [ ['husk', 30], ['crawler', 30], ['brute', 35], ['vexbat', 30], ['hexer', 14], ['reaver', 20], ['lurker', 14], ['grub', 16], ['nullhound', 8], ['wraith', 10] ],
  /*11:00 */ [ ['husk', 25], ['crawler', 30], ['brute', 35], ['vexbat', 30], ['hexer', 16], ['reaver', 24], ['lurker', 16], ['grub', 18], ['nullhound', 10], ['wraith', 14] ],
  /*12:00+*/ [ ['husk', 20], ['crawler', 25], ['brute', 35], ['vexbat', 30], ['hexer', 16], ['reaver', 26], ['lurker', 18], ['grub', 20], ['nullhound', 12], ['wraith', 18], ['pillar', 10] ]
].map(rows => rows.map(([id, weight]) => ({ id, weight })));

const EVENTS = [
  { at: 120,  kind: 'boss',        boss: 'marrow',     fired: false },
  { at: 240,  kind: 'chest',       fired: false },
  { at: 360,  kind: 'boss',        boss: 'belltyrant', fired: false },
  { at: 480,  kind: 'chest',       fired: false },
  { at: 540,  kind: 'elite_swarm', fired: false },
  { at: 720,  kind: 'chest',       fired: false },
  { at: 900,  kind: 'elite_swarm', fired: false },
  { at: 1080, kind: 'chest',       fired: false },
  { at: 1200, kind: 'boss',        boss: 'reaper',     fired: false }  // 20:00 final
];

/* ---------- Weapons ----------
   atkRate is seconds between fires.
   Damage scales +15% per level. */
const WEAPONS = {
  ember_beam: {
    name: 'Ember Beam', icon: '∿', type: 'beam',
    dmg: 4, atkRate: 0.18, range: 220, projSpeed: 800, pierce: 99,
    desc: 'Continuous beam. Pierces all.', tier: 'C'
  },
  hymn_wave: {
    name: 'Hymn Wave', icon: '◯', type: 'aoe_ring',
    dmg: 12, atkRate: 2.4, range: 150, projSpeed: 320, pierce: 99,
    desc: 'Concentric ring. Slows enemies.', tier: 'C'
  },
  anvil_toss: {
    name: 'Anvil Toss', icon: '◧', type: 'projectile',
    dmg: 28, atkRate: 1.4, range: 280, projSpeed: 280, pierce: 0,
    desc: 'Heavy lobbed projectile. Knockback.', tier: 'C'
  },
  thorn_halo: {
    name: 'Thorn Halo', icon: '✦', type: 'orbit',
    dmg: 6, atkRate: 0.15, range: 80, projSpeed: 0, pierce: 99,
    desc: '3 thorns orbit you. Bleed on hit.', tier: 'C'
  },
  shade_daggers: {
    name: 'Shade Daggers', icon: '✕', type: 'projectile_burst',
    dmg: 9, atkRate: 0.7, range: 240, projSpeed: 380, pierce: 0,
    desc: '2 daggers in your facing direction.', tier: 'C', count: 2
  },
  scattershot: {
    name: 'Scattershot Pike', icon: '※', type: 'projectile_burst',
    dmg: 6, atkRate: 1.1, range: 200, projSpeed: 360, pierce: 0,
    desc: '5-pellet cone. 25% crit ×2.', tier: 'C', count: 5, spread: 0.5, critChance: 0.25, critMult: 2.0
  },
  salt_circle: {
    name: 'Salt Circle', icon: '◌', type: 'aura',
    dmg: 3, atkRate: 0.25, range: 110, projSpeed: 0, pierce: 99,
    desc: 'Damaging ring under your feet.', tier: 'U'
  },
  stormnail: {
    name: 'Stormnail', icon: '↯', type: 'homing',
    dmg: 18, atkRate: 0.9, range: 320, projSpeed: 320, pierce: 0,
    desc: 'Homing nail. Light tracking.', tier: 'U'
  },
  glasspipe: {
    name: 'Glasspipe Mortar', icon: '◉', type: 'mortar',
    dmg: 22, atkRate: 1.8, range: 300, projSpeed: 220, pierce: 99,
    desc: 'Lobs shells. AoE on impact.', tier: 'U', aoe: 50, ignite: 2
  },
  veinlight: {
    name: 'Veinlight Whip', icon: '~', type: 'whip',
    dmg: 14, atkRate: 1.0, range: 140, projSpeed: 0, pierce: 99,
    desc: 'Two whips, alternating sides.', tier: 'U'
  },
  bells: {
    name: 'Tower of Bells', icon: '☗', type: 'bell',
    dmg: 35, atkRate: 2.0, range: 250, projSpeed: 0, pierce: 99,
    desc: 'Bells fall on enemies. Stuns.', tier: 'R', aoe: 60
  },
  frostlamp: {
    name: 'Frostlamp', icon: '❄', type: 'aura_slow',
    dmg: 1, atkRate: 0.1, range: 130, projSpeed: 0, pierce: 99,
    desc: 'Cold aura. Slows enemies 35%.', tier: 'R'
  },
  censer: {
    name: 'Censer Chain', icon: '⛓', type: 'orbit',
    dmg: 11, atkRate: 0.4, range: 110, projSpeed: 0, pierce: 99,
    desc: '2 censers swing. Burn DOT.', tier: 'R', orbitCount: 2, burn: 4
  },
  boomerang: {
    name: "Reaver's Boomerang", icon: '◐', type: 'boomerang',
    dmg: 16, atkRate: 1.6, range: 280, projSpeed: 320, pierce: 99,
    desc: 'Returns. +50% on return hit.', tier: 'R'
  },
  nullspike: {
    name: 'Nullspike Trap', icon: '✶', type: 'mine',
    dmg: 40, atkRate: 0.8, range: 0, projSpeed: 0, pierce: 99,
    desc: 'Drops behind you. AoE on contact.', tier: 'R', aoe: 70
  },
  // Evolutions
  pyre_of_saints: {
    name: 'Pyre of Saints', icon: '☼', type: 'evo_pyre',
    dmg: 60, atkRate: 1.0, range: 220, projSpeed: 800, pierce: 99,
    desc: 'EVOLVED. Pulses + auto-targeting beams.', tier: 'L', evolution: true
  },
  black_anvil: {
    name: 'The Black Anvil', icon: '◼', type: 'evo_anvil',
    dmg: 180, atkRate: 1.6, range: 320, projSpeed: 260, pierce: 99,
    desc: 'EVOLVED. Cluster of 3 anvils, AoE.', tier: 'L', evolution: true, aoe: 80
  },
  choirfire: {
    name: 'Choirfire', icon: '✠', type: 'evo_choir',
    dmg: 90, atkRate: 1.5, range: 280, projSpeed: 0, pierce: 99,
    desc: 'EVOLVED. Bells fall in salt zone, ×2 dmg in zone.', tier: 'L', evolution: true, aoe: 70
  }
};

const STARTER_ALLOWED = ['ember_beam','hymn_wave','anvil_toss','thorn_halo','shade_daggers','scattershot'];

// Evolution recipes — both source weapons must be max level + catalyst owned.
// On pick: source weapons are removed, evolution added at level 8.
const EVOLUTIONS = [
  { id: 'pyre_of_saints', from: ['hymn_wave', 'ember_beam'],     catalyst: 'saints_brand' },
  { id: 'black_anvil',    from: ['anvil_toss', 'glasspipe'],     catalyst: 'forge_coal' },
  { id: 'choirfire',      from: ['bells', 'salt_circle'],        catalyst: 'choirstone' }
];

/* ---------- Artifacts (one-time pickups) ---------- */
const ARTIFACTS = {
  cracked_lens:    { name: 'Cracked Lens',    desc: '+20% projectile speed.',                tier: 'C', stat: 'projSpeedMul', value: 1.20 },
  old_bandolier:   { name: 'Old Bandolier',   desc: '+1 projectile to burst weapons.',       tier: 'U', stat: 'projCountAdd', value: 1 },
  wickwax_tin:     { name: 'Wickwax Tin',     desc: '+25% weapon area.',                     tier: 'C', stat: 'areaMul',      value: 1.25 },
  iron_heel:       { name: 'Iron Heel',       desc: '+15% move speed.',                      tier: 'C', stat: 'moveSpeedMul', value: 1.15 },
  greedy_heart:    { name: 'Greedy Heart',    desc: '+50% pickup radius.',                   tier: 'C', stat: 'pickupRadMul', value: 1.50 },
  pale_coin:       { name: 'Pale Coin',       desc: '+20% ember (XP) gained.',               tier: 'U', stat: 'xpMul',        value: 1.20 },
  iron_lung:       { name: 'Iron Lung',       desc: '+25 max HP, fully healed.',             tier: 'C', stat: 'maxHpAdd',     value: 25 },
  marrow_charm:    { name: 'Marrow Charm',    desc: '+15% crit chance, +25% crit dmg.',      tier: 'R', stat: 'critBundle',   value: 1 },
  fractured_hourglass: { name: 'Fractured Hourglass', desc: '−15% all weapon cooldowns.',    tier: 'R', stat: 'cdMul',        value: 0.85 },
  splinter_lodestone:  { name: 'Splinter Lodestone',  desc: 'Projectiles pierce +1.',        tier: 'U', stat: 'pierceAdd',    value: 1 },
  // New
  bloodtithe:      { name: 'Bloodtithe',      desc: 'Heal 1 HP per 50 kills.',                tier: 'U', stat: 'flag_bloodtithe' },
  saints_brand:    { name: "Saint's Brand",   desc: '+20% AoE damage. (Catalyst)',            tier: 'R', stat: 'aoeDmgMul',    value: 1.20, catalyst: true },
  forge_coal:      { name: 'Forge Coal',      desc: '+30% projectile damage. (Catalyst)',     tier: 'R', stat: 'projDmgMul',   value: 1.30, catalyst: true },
  choirstone:      { name: 'Choirstone',      desc: '+1 extra bell drop. (Catalyst)',         tier: 'R', stat: 'bellExtra',    value: 1,    catalyst: true },
  echo_bell:       { name: 'Echo Bell',       desc: 'Every 8s, repeat your last attack.',     tier: 'R', stat: 'flag_echo' },
  nightshade_vial: { name: 'Nightshade Vial', desc: 'Hurt enemies take +15% from all sources.', tier: 'U', stat: 'flag_nightshade' },
  ash_reservoir:   { name: 'Ash Reservoir',   desc: 'Burning enemies explode on death.',      tier: 'R', stat: 'flag_ash' },
  cold_vow:        { name: 'Cold Vow',        desc: 'First hit on a fresh enemy +50%.',       tier: 'U', stat: 'flag_coldvow' },
  mirror_shroud:   { name: 'Mirror Shroud',   desc: '10% chance to dodge any hit.',           tier: 'U', stat: 'dodgeChance',  value: 0.10 },
  last_light:      { name: 'Last Light',      desc: 'At 1 HP: 4s invuln + 200 dmg burst (1/run).', tier: 'L', stat: 'flag_lastlight' }
};

/* =============================================================
   GLOBAL STATE
   ============================================================= */
const W = 960, H = 640;          // canvas internal resolution
const VIEW_R = 640;              // off-screen spawn ring radius (just past corners)
const TILE = 64;
const cnv = document.getElementById('game');
const ctx = cnv.getContext('2d');
ctx.imageSmoothingEnabled = false;

const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');
mctx.imageSmoothingEnabled = false;

const META_KEY = 'emberfall_meta_v1';

const META_DEFAULT = {
  shards: 0,
  shardsSpent: 0,
  upgrades: { hp: 0, dmg: 0, speed: 0, xp: 0 },
  victories: 0,
  bestTime: 0,
  maxLevel: 0,
  wyck5min: false,
  noDamage60: false,
  bossesKilled: {}
};

const SHOP_DEFS = [
  { id: 'hp',    name: 'Iron Lung',     stat: '+10 max HP / tier',    max: 10, costFn: t => 50 * (t + 1) },
  { id: 'dmg',   name: 'Honed Edge',    stat: '+3% damage / tier',    max: 15, costFn: t => 60 * (t + 1) },
  { id: 'speed', name: 'Quick Step',    stat: '+2% move speed / tier',max: 10, costFn: t => 70 * (t + 1) },
  { id: 'xp',    name: 'Hungering Eye', stat: '+3% XP / tier',        max: 10, costFn: t => 80 * (t + 1) }
];

let meta = loadMeta();

const game = {
  running: false,
  paused: false,
  ended: false,
  cardOpen: false,
  t: 0,                     // run time (s)
  killCount: 0,
  emberCount: 0,
  shardsThisRun: 0,
  charDef: null,
  player: null,
  enemies: [],
  bullets: [],
  pickups: [],
  particles: [],
  floats: [],
  events: [],
  cam: { x: 0, y: 0 },
  inputDir: { x: 0, y: 0 },
  facing: { x: 1, y: 0 },
  pendingBoss: null,
  spawnAccum: 0
};

/* =============================================================
   PROCEDURAL SPRITES
   ============================================================= */
const SPRITES = {};

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function px(c, x, y, color) {
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(x, y, 1, 1);
}
function rect(c, x, y, w, h, color) {
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

/* Build sprites once at boot. Each character/enemy is a small canvas. */
function buildSprites() {
  // Characters (16x20)
  for (const ch of CHARACTERS) {
    const c = makeCanvas(16, 20);
    // Cape / body
    rect(c, 4, 6, 8, 10, ch.color);
    rect(c, 5, 5, 6, 1, ch.color);
    // Head
    rect(c, 5, 2, 6, 4, PAL.cream);
    // Eyes
    px(c, 6, 4, PAL.bg0); px(c, 9, 4, PAL.bg0);
    // Hood/hat shadow
    rect(c, 5, 1, 6, 1, PAL.bg2);
    // Belt
    rect(c, 4, 11, 8, 1, PAL.bg2);
    // Boots
    rect(c, 4, 16, 3, 3, PAL.bg2);
    rect(c, 9, 16, 3, 3, PAL.bg2);
    // Lantern / weapon hint
    if (ch.id === 'wyck')  { rect(c, 12, 9, 3, 4, PAL.amber); px(c, 13, 8, PAL.cream); }
    if (ch.id === 'ferren'){ rect(c, 0,  9, 3, 4, PAL.pink); px(c, 1, 8, PAL.cream); }
    if (ch.id === 'brom')  { rect(c, 12, 9, 3, 3, PAL.bg2); rect(c, 11, 9, 1, 3, PAL.bg2); }
    SPRITES['char_' + ch.id] = c;
  }

  // Enemies — simple silhouettes
  function enemySprite(size, body, accent, eye = PAL.red) {
    const c = makeCanvas(size, size);
    const m = Math.floor(size / 8);
    rect(c, m, m, size - 2 * m, size - 2 * m, body);
    rect(c, m + 1, m + 1, size - 2 * m - 2, 1, accent);
    // eyes
    px(c, Math.floor(size / 3), Math.floor(size / 2) - 1, eye);
    px(c, Math.floor(size * 2 / 3) - 1, Math.floor(size / 2) - 1, eye);
    // legs
    rect(c, m, size - m, 2, m, PAL.bg2);
    rect(c, size - m - 2, size - m, 2, m, PAL.bg2);
    return c;
  }
  SPRITES.enemy_husk    = enemySprite(16, PAL.mauve,    PAL.bg2,        PAL.red);
  SPRITES.enemy_crawler = enemySprite(14, PAL.pink,     PAL.mauve,      PAL.red);
  SPRITES.enemy_brute   = enemySprite(22, PAL.deepTeal, PAL.deeperTeal, PAL.amber);
  SPRITES.enemy_vexbat  = enemySprite(14, PAL.teal,     PAL.deepTeal,   PAL.cream);
  SPRITES.enemy_spitter = enemySprite(16, PAL.green,    PAL.darkGreen,  PAL.amber);
  SPRITES.enemy_hexer   = enemySprite(20, PAL.orange,   PAL.red,        PAL.cream);
  SPRITES.enemy_reaver  = enemySprite(16, PAL.red,      PAL.bg2,        PAL.amber);
  SPRITES.enemy_lurker  = enemySprite(16, PAL.bg2,      PAL.deeperTeal, PAL.amber);
  SPRITES.enemy_grub    = enemySprite(18, PAL.darkGreen, PAL.bg2,       PAL.green);
  SPRITES.enemy_grublet = enemySprite(10, PAL.green,    PAL.darkGreen,  PAL.cream);
  SPRITES.enemy_wraith  = enemySprite(18, PAL.deeperTeal, PAL.deepTeal, PAL.cream);
  SPRITES.enemy_nullhound = enemySprite(14, PAL.bg0,    PAL.bg2,        PAL.red);

  // Bone Pillar — stationary, ornate
  {
    const c = makeCanvas(22, 26);
    rect(c, 8,  2,  6,  4, PAL.cream);
    rect(c, 6,  6,  10, 14, PAL.cream);
    rect(c, 8,  4,  2,  2, PAL.bg0);
    rect(c, 12, 4,  2,  2, PAL.bg0);
    rect(c, 4, 20, 14, 4, PAL.bg2);
    rect(c, 7,  8,  2,  2, PAL.bg2);
    rect(c, 13, 8,  2,  2, PAL.bg2);
    rect(c, 9, 12,  4,  2, PAL.bg2);
    SPRITES.enemy_pillar = c;
  }

  // Bosses
  {
    const c = makeCanvas(36, 36);
    rect(c, 6, 8, 24, 24, PAL.cream);
    rect(c, 8, 6, 20, 4, PAL.bg2);
    rect(c, 6, 12, 24, 2, PAL.amber);
    rect(c, 12, 18, 4, 4, PAL.red);
    rect(c, 20, 18, 4, 4, PAL.red);
    rect(c, 14, 26, 8, 2, PAL.bg2);
    SPRITES.boss_marrow = c;
  }
  {
    // Bell Tyrant — brass robed figure
    const c = makeCanvas(40, 40);
    rect(c, 10, 4,  20, 8,  PAL.amber);  // bell head
    rect(c, 12, 2,  16, 4,  PAL.cream);
    rect(c, 14, 8,  12, 2,  PAL.bg2);
    rect(c, 8,  12, 24, 22, PAL.orange);
    rect(c, 10, 14, 20, 2,  PAL.amber);
    rect(c, 14, 18, 4,  4,  PAL.red);
    rect(c, 22, 18, 4,  4,  PAL.red);
    rect(c, 16, 28, 8,  2,  PAL.bg0);
    rect(c, 8,  34, 8,  4,  PAL.bg2);
    rect(c, 24, 34, 8,  4,  PAL.bg2);
    SPRITES.boss_belltyrant = c;
  }
  {
    // Final Reaper — black hooded
    const c = makeCanvas(48, 48);
    rect(c, 12, 6,  24, 12, PAL.bg0);
    rect(c, 16, 4,  16, 4,  PAL.bg2);
    rect(c, 18, 10, 4,  4,  PAL.red);
    rect(c, 26, 10, 4,  4,  PAL.red);
    rect(c, 8,  18, 32, 22, PAL.bg0);
    rect(c, 10, 20, 28, 2,  PAL.bg2);
    rect(c, 14, 24, 20, 4,  PAL.bg2);
    // Scythe
    rect(c, 38, 4,  2,  30, PAL.cream);
    rect(c, 32, 4,  8,  4,  PAL.cream);
    rect(c, 28, 6,  4,  4,  PAL.cream);
    SPRITES.boss_reaper = c;
  }

  // Pickups
  {
    const c = makeCanvas(8, 8);
    rect(c, 2, 2, 4, 4, PAL.teal);
    rect(c, 3, 1, 2, 1, PAL.cream);
    rect(c, 3, 6, 2, 1, PAL.deepTeal);
    SPRITES.pickup_ember = c;
  }
  {
    const c = makeCanvas(10, 10);
    rect(c, 3, 3, 4, 4, PAL.amber);
    rect(c, 2, 4, 1, 2, PAL.cream);
    rect(c, 7, 4, 1, 2, PAL.cream);
    rect(c, 4, 2, 2, 1, PAL.cream);
    SPRITES.pickup_gold = c;
  }
  {
    const c = makeCanvas(10, 10);
    rect(c, 3, 4, 4, 3, PAL.red);
    rect(c, 4, 3, 2, 1, PAL.red);
    rect(c, 3, 3, 1, 1, PAL.pink);
    SPRITES.pickup_heart = c;
  }
  {
    const c = makeCanvas(12, 12);
    rect(c, 2, 4, 8, 6, PAL.bg2);
    rect(c, 2, 3, 8, 1, PAL.amber);
    rect(c, 5, 6, 2, 2, PAL.amber);
    SPRITES.pickup_chest = c;
  }

  // Tile
  {
    const c = makeCanvas(TILE, TILE);
    const g = c.getContext('2d');
    g.fillStyle = PAL.bg1; g.fillRect(0, 0, TILE, TILE);
    // cobble specks
    for (let i = 0; i < 18; i++) {
      const x = Math.floor(rand() * TILE), y = Math.floor(rand() * TILE);
      g.fillStyle = rand() < 0.5 ? PAL.bg2 : PAL.deeperTeal;
      g.fillRect(x, y, 2, 2);
    }
    // cracks
    g.fillStyle = PAL.bg0;
    g.fillRect(0, 0, TILE, 1); g.fillRect(0, 0, 1, TILE);
    SPRITES.tile = c;
  }
}

/* =============================================================
   META / SAVE
   ============================================================= */
function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return structuredClone(META_DEFAULT);
    const parsed = JSON.parse(raw);
    return Object.assign(structuredClone(META_DEFAULT), parsed);
  } catch (e) {
    return structuredClone(META_DEFAULT);
  }
}
function saveMeta() {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {}
}

/* =============================================================
   INPUT
   ============================================================= */
const keys = new Set();
window.addEventListener('keydown', e => {
  keys.add(e.key.toLowerCase());
  if (e.key === 'p' || e.key === 'P') togglePause();
  if (game.cardOpen && (e.key === '1' || e.key === '2' || e.key === '3')) {
    const idx = parseInt(e.key, 10) - 1;
    pickCard(idx);
  }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

function readInput() {
  let x = 0, y = 0;
  if (keys.has('a') || keys.has('arrowleft'))  x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  if (keys.has('w') || keys.has('arrowup'))    y -= 1;
  if (keys.has('s') || keys.has('arrowdown'))  y += 1;
  const m = Math.hypot(x, y) || 1;
  return { x: x / m, y: y / m, mag: Math.hypot(x, y) };
}

/* =============================================================
   SCALING FORMULAS  (design doc §9, tuned harder)
   ============================================================= */
function scaleHP(base, t)  { const m = t / 60; return base * (1 + 0.24 * m + 0.06 * Math.pow(m, 1.6)); }
function scaleDmg(base, t) { return base * (1 + 0.14 * (t / 60)); }
function rateMul(t)        { return 1 + 0.35 * (t / 60); }

/* =============================================================
   START / END RUN
   ============================================================= */
function startRun(charId) {
  const ch = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];
  game.charDef = ch;

  // Player base, with meta upgrades
  const hpBonus  = meta.upgrades.hp * 10;
  const dmgBonus = meta.upgrades.dmg * 0.03;
  const spdBonus = meta.upgrades.speed * 0.02;
  const xpBonus  = meta.upgrades.xp * 0.03;

  const baseHp = 100 + hpBonus;
  game.player = {
    x: 0, y: 0,
    hp: baseHp, maxHp: baseHp,
    speed: 140 * (1 + spdBonus) * (ch.passive.type === 'damage' ? (1 - (ch.passive.speedPenalty || 0)) : 1),
    pickupRad: 38,
    weapons: [{ id: ch.starter, lvl: 1, cd: 0, phase: 0 }],
    artifacts: [],
    level: 1, xp: 0, xpToNext: 5,
    hurtFlash: 0,
    invuln: 0,
    iframeOnLevel: 0,
    flags: {
      bloodtithe: false, echo: false, nightshade: false, ash: false,
      coldvow: false, lastlight: false, lastlightUsed: false,
      bellExtra: 0, haveLifesteal: false,
      // Sable iframe passive
      sableTimer: 0, sableEvery: 0
    },
    healTokens: 0,
    // Sable / Vespa / Halberd passive setup
    contactAuraDps: ch.passive.type === 'contact_aura' ? ch.passive.value : 0,
    noDamageStreak: 0,
    // Stat modifiers (start defaults)
    mods: {
      damageMul: 1 + dmgBonus + (ch.passive.type === 'damage' ? ch.passive.value : 0),
      areaMul:  1 + (ch.passive.type === 'weapon_area' ? ch.passive.value : 0),
      cdMul: 1.0,
      projSpeedMul: 1.0,
      projDmgMul: 1.0,
      aoeDmgMul: 1.0,
      projCountAdd: 0,
      pierceAdd: 0,
      pickupRadMul: 1 + (ch.passive.type === 'pickup_radius' ? ch.passive.value : 0),
      moveSpeedMul: 1.0,
      xpMul: 1 + xpBonus,
      maxHpAdd: 0,
      critChance: 0,
      critMult: 1.5,
      dodgeChance: 0
    }
  };
  game.player.pickupRad *= game.player.mods.pickupRadMul;
  if (ch.passive.type === 'phase_iframe') {
    game.player.flags.sableEvery = ch.passive.every || 8;
    game.player.flags.sableDuration = ch.passive.value || 0.5;
    game.player.flags.sableTimer = ch.passive.every || 8;
  }
  if (ch.passive.type === 'crit_lifesteal') {
    game.player.flags.haveLifesteal = true;
    game.player.healTokens = 3;
  }

  game.t = 0;
  game.killCount = 0;
  game.emberCount = 0;
  game.shardsThisRun = 0;
  game.enemies = [];
  game.bullets = [];
  game.pickups = [];
  game.particles = [];
  game.floats = [];
  game.cam = { x: 0, y: 0 };
  game.events = EVENTS.map(e => ({ ...e, fired: false }));
  game.spawnAccum = 0;
  game.running = true;
  game.paused = false;
  game.ended = false;
  game.cardOpen = false;
  game.reaperKilledThisRun = false;
  game.victoryFired = false;

  hideOverlay('title-overlay');
  hideOverlay('end-overlay');
  hideOverlay('card-overlay');
  document.getElementById('hud').style.visibility = 'visible';
  document.getElementById('char-name').textContent = ch.name;
}

function endRun(victory) {
  if (game.ended) return;
  game.ended = true;
  game.running = false;

  // Award shards
  meta.shards += game.shardsThisRun;
  if (victory) meta.victories++;
  if (game.t > meta.bestTime) meta.bestTime = game.t;
  saveMeta();

  // Show end overlay
  document.getElementById('end-title').textContent = victory
    ? 'You held the night.'
    : 'You fell to the night.';
  const stats = document.getElementById('end-stats');
  stats.innerHTML = `
    <span class="k">Time</span><span>${fmtTime(game.t)}</span>
    <span class="k">Level</span><span>${game.player.level}</span>
    <span class="k">Kills</span><span>${game.killCount}</span>
    <span class="k">Embers</span><span>${game.emberCount}</span>
    <span class="k">Shards Earned</span><span>★ ${game.shardsThisRun}</span>
    <span class="k">Total Shards</span><span>★ ${meta.shards}</span>`;
  showOverlay('end-overlay');
}

/* =============================================================
   SPAWNING
   ============================================================= */
function currentSpawnTable() {
  const m = Math.min(Math.floor(game.t / 60), SPAWN_TABLES.length - 1);
  return SPAWN_TABLES[m];
}

function spawnEnemyAtRing(typeId, isElite = false) {
  const def = ENEMIES[typeId];
  if (!def) return;
  const ang = rand() * Math.PI * 2;
  const r = VIEW_R + randRange(-30, 30);
  const x = game.player.x + Math.cos(ang) * r;
  const y = game.player.y + Math.sin(ang) * r;
  const hpMul = isElite ? 5 : 1;
  const dmgMul = isElite ? 1.3 : 1;
  game.enemies.push({
    type: typeId,
    x, y, vx: 0, vy: 0,
    hp: scaleHP(def.hp, game.t) * hpMul,
    maxHp: scaleHP(def.hp, game.t) * hpMul,
    dmg: scaleDmg(def.dmg, game.t) * dmgMul,
    speed: def.speed,
    size: def.size,
    color: def.color,
    elite: isElite,
    phase: rand() * Math.PI * 2,
    cooldown: 0,
    knockback: { x: 0, y: 0 }
  });
}

function spawnBoss(bossId) {
  const def = BOSSES[bossId];
  if (!def) return;
  const ang = rand() * Math.PI * 2;
  const r = VIEW_R + 60;
  const hpMul = 1 + 0.08 * (game.t / 60);
  game.enemies.push({
    type: 'boss_' + bossId,
    boss: true,
    bossId,
    x: game.player.x + Math.cos(ang) * r,
    y: game.player.y + Math.sin(ang) * r,
    vx: 0, vy: 0,
    hp: def.hp * hpMul,
    maxHp: def.hp * hpMul,
    dmg: def.dmg * (1 + 0.10 * (game.t / 60)),
    speed: def.speed,
    size: def.size,
    color: def.color,
    phase: 0, cooldown: 1.5,
    knockback: { x: 0, y: 0 }
  });
  pushFloat(game.player.x, game.player.y - 60, def.name + ' approaches!', PAL.amber, 2.0);
}

function spawnTick(dt) {
  // Spawn budget — tuned harder
  const baseRate = 2.2; // base enemies per second
  const budget = baseRate * rateMul(game.t) * dt;
  game.spawnAccum += budget;

  const cap = Math.floor(60 + 18 * (game.t / 60));
  const table = currentSpawnTable();

  while (game.spawnAccum >= 1) {
    if (game.enemies.length >= cap) { game.spawnAccum = 0; break; }
    const pick = weightedPick(table);
    const elite = game.t > 120 && rand() < (game.t > 420 ? 0.06 : (game.t > 240 ? 0.03 : 0.015));
    spawnEnemyAtRing(pick.id, elite);
    game.spawnAccum -= 1;
  }

  // Events
  for (const ev of game.events) {
    if (!ev.fired && game.t >= ev.at) {
      ev.fired = true;
      if (ev.kind === 'boss') spawnBoss(ev.boss);
      if (ev.kind === 'chest') {
        const ang = rand() * Math.PI * 2; const r = 220;
        game.pickups.push({ kind: 'chest', x: game.player.x + Math.cos(ang) * r, y: game.player.y + Math.sin(ang) * r, life: 9999 });
        pushFloat(game.player.x, game.player.y - 60, 'A chest shimmers nearby.', PAL.amber, 1.6);
      }
      if (ev.kind === 'elite_swarm') {
        for (let i = 0; i < 10; i++) spawnEnemyAtRing('husk', true);
        pushFloat(game.player.x, game.player.y - 60, 'Elite swarm!', PAL.orange, 1.6);
      }
    }
  }
}

/* =============================================================
   WEAPON FIRING
   ============================================================= */
function fireWeapons(dt) {
  for (const w of game.player.weapons) {
    const def = WEAPONS[w.id];
    if (!def) continue;
    const cdMul = game.player.mods.cdMul;
    w.cd -= dt;
    w.phase += dt;

    // Orbits update every frame regardless of cd
    if (def.type === 'orbit') {
      // Orbit weapons don't fire as discrete shots; they're handled in updateBullets
      // We keep persistent thorn entities so check for missing ones.
      ensureOrbits(w);
      continue;
    }
    if (def.type === 'aura') {
      if (w.cd > 0) continue;
      // Aura damages all enemies within range
      const range = def.range * game.player.mods.areaMul;
      for (const e of game.enemies) {
        const dx = e.x - game.player.x, dy = e.y - game.player.y;
        if (dx * dx + dy * dy <= range * range) {
          applyHit(e, scaledDamage(def.dmg, w.lvl), false);
        }
      }
      w.cd = def.atkRate * cdMul;
      continue;
    }

    if (w.cd > 0) continue;
    w.cd = def.atkRate * cdMul;

    if (def.type === 'beam') {
      const tgt = nearestEnemy(game.player.x, game.player.y, def.range);
      if (!tgt) continue;
      const ang = Math.atan2(tgt.y - game.player.y, tgt.x - game.player.x);
      // Beam = thin fast projectile that pierces all
      game.bullets.push(makeBullet({
        x: game.player.x, y: game.player.y, ang,
        speed: def.projSpeed * game.player.mods.projSpeedMul,
        dmg: scaledDamage(def.dmg, w.lvl),
        life: def.range / def.projSpeed,
        pierce: 99, kind: 'beam', size: 4, color: PAL.amber, lvl: w.lvl
      }));
    }
    else if (def.type === 'aoe_ring') {
      const radius = def.range * game.player.mods.areaMul;
      game.bullets.push({
        kind: 'ring',
        x: game.player.x, y: game.player.y,
        r: 12, rMax: radius,
        speed: def.projSpeed,
        dmg: scaledDamage(def.dmg, w.lvl, 'aoe'),
        life: 0.7,
        hit: new Set(),
        color: PAL.pink, lvl: w.lvl
      });
    }
    else if (def.type === 'projectile') {
      const tgt = nearestEnemy(game.player.x, game.player.y, def.range);
      const ang = tgt
        ? Math.atan2(tgt.y - game.player.y, tgt.x - game.player.x)
        : Math.atan2(game.facing.y, game.facing.x);
      game.bullets.push(makeBullet({
        x: game.player.x, y: game.player.y, ang,
        speed: def.projSpeed * game.player.mods.projSpeedMul,
        dmg: scaledDamage(def.dmg, w.lvl, 'projectile'),
        life: def.range / def.projSpeed,
        pierce: def.pierce + game.player.mods.pierceAdd,
        kind: 'anvil', size: 8, color: PAL.bg2,
        knockback: 200, lvl: w.lvl
      }));
    }
    else if (def.type === 'projectile_burst') {
      const count = (def.count || 1) + game.player.mods.projCountAdd;
      const baseAng = (def.spread)
        ? Math.atan2(game.facing.y, game.facing.x)
        : (() => { const t = nearestEnemy(game.player.x, game.player.y, def.range);
                   return t ? Math.atan2(t.y - game.player.y, t.x - game.player.x)
                            : Math.atan2(game.facing.y, game.facing.x); })();
      const spread = def.spread || 0.2;
      for (let i = 0; i < count; i++) {
        const ang = baseAng + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0);
        let dmg = scaledDamage(def.dmg, w.lvl, 'projectile');
        let crit = false;
        const cc = (def.critChance || 0) + game.player.mods.critChance;
        if (rand() < cc) { dmg *= (def.critMult || game.player.mods.critMult); crit = true; }
        game.bullets.push(makeBullet({
          x: game.player.x, y: game.player.y, ang,
          speed: def.projSpeed * game.player.mods.projSpeedMul,
          dmg, life: def.range / def.projSpeed,
          pierce: def.pierce + game.player.mods.pierceAdd,
          kind: 'dagger', size: 5, color: crit ? PAL.amber : PAL.cream,
          isCrit: crit, lvl: w.lvl
        }));
      }
    }
    else if (def.type === 'homing') {
      const tgt = nearestEnemy(game.player.x, game.player.y, def.range);
      if (!tgt) { w.cd = 0.2; continue; }
      const ang = Math.atan2(tgt.y - game.player.y, tgt.x - game.player.x);
      game.bullets.push(makeBullet({
        x: game.player.x, y: game.player.y, ang,
        speed: def.projSpeed * game.player.mods.projSpeedMul,
        dmg: scaledDamage(def.dmg, w.lvl, 'projectile'),
        life: def.range / def.projSpeed * 1.4,
        pierce: def.pierce + game.player.mods.pierceAdd,
        kind: 'homing', size: 6, color: PAL.teal,
        homingTarget: tgt, lvl: w.lvl
      }));
    }
    else if (def.type === 'mortar') {
      const tgt = nearestEnemy(game.player.x, game.player.y, def.range);
      if (!tgt) { w.cd = 0.3; continue; }
      const flightTime = Math.hypot(tgt.x - game.player.x, tgt.y - game.player.y) / def.projSpeed;
      game.bullets.push({
        kind: 'mortar', x: game.player.x, y: game.player.y,
        sx: game.player.x, sy: game.player.y, tx: tgt.x, ty: tgt.y,
        t: 0, ttotal: flightTime,
        dmg: scaledDamage(def.dmg, w.lvl) * (game.player.mods.aoeDmgMul || 1),
        aoe: (def.aoe || 50) * game.player.mods.areaMul,
        life: flightTime + 0.05, ignite: def.ignite || 0,
        color: PAL.orange, hit: new Set(), lvl: w.lvl
      });
    }
    else if (def.type === 'whip') {
      // Two whip arcs left/right, alternating each fire
      w.flip = !w.flip;
      const dir = w.flip ? 1 : -1;
      // Whip is a short-lived rectangular sweep on the side of the player
      game.bullets.push({
        kind: 'whip', x: game.player.x + dir * (def.range / 2), y: game.player.y,
        ox: dir * (def.range / 2), oy: 0,
        w: def.range, h: 50,
        dmg: scaledDamage(def.dmg, w.lvl),
        life: 0.18, color: PAL.pink, hit: new Set(), critOnSecond: true, side: dir, lvl: w.lvl
      });
    }
    else if (def.type === 'bell') {
      // Drop bells on N nearest enemies
      const drops = 1 + (game.player.flags.bellExtra || 0);
      const range = def.range * game.player.mods.areaMul;
      const candidates = game.enemies
        .filter(e => !e.dead && Math.hypot(e.x - game.player.x, e.y - game.player.y) < range)
        .slice(0, 12);
      for (let i = 0; i < drops; i++) {
        const tgt = candidates.length > 0 ? choice(candidates) : null;
        const x = tgt ? tgt.x : game.player.x + randRange(-range, range);
        const y = tgt ? tgt.y : game.player.y + randRange(-range, range);
        game.bullets.push({
          kind: 'bell', x, y, fallY: y - 200, t: 0, ttotal: 0.5,
          dmg: scaledDamage(def.dmg, w.lvl) * (game.player.mods.aoeDmgMul || 1),
          aoe: (def.aoe || 60) * game.player.mods.areaMul,
          life: 0.6, color: PAL.cream, hit: new Set(), stun: 0.5, lvl: w.lvl
        });
      }
    }
    else if (def.type === 'aura_slow') {
      const range = def.range * game.player.mods.areaMul;
      for (const e of game.enemies) {
        const dx = e.x - game.player.x, dy = e.y - game.player.y;
        if (dx * dx + dy * dy < range * range) {
          applyHit(e, scaledDamage(def.dmg, w.lvl), false);
          e.slowUntil = game.t + 0.5;
        }
      }
    }
    else if (def.type === 'boomerang') {
      const tgt = nearestEnemy(game.player.x, game.player.y, def.range);
      const ang = tgt ? Math.atan2(tgt.y - game.player.y, tgt.x - game.player.x)
                       : Math.atan2(game.facing.y, game.facing.x);
      const range = def.range;
      game.bullets.push({
        kind: 'boomerang', x: game.player.x, y: game.player.y,
        ox: game.player.x, oy: game.player.y,
        ang, speed: def.projSpeed * game.player.mods.projSpeedMul,
        range, t: 0, ttotal: (range / def.projSpeed) * 2,
        dmg: scaledDamage(def.dmg, w.lvl, 'projectile'),
        life: (range / def.projSpeed) * 2 + 0.05,
        color: PAL.amber, hit: new Set(), returning: false, hitOut: new Set(), lvl: w.lvl
      });
    }
    else if (def.type === 'mine') {
      // Drop a mine where the player was a moment ago
      const ox = game.player.x - game.facing.x * 24;
      const oy = game.player.y - game.facing.y * 24;
      game.bullets.push({
        kind: 'mine', x: ox, y: oy,
        dmg: scaledDamage(def.dmg, w.lvl) * (game.player.mods.aoeDmgMul || 1),
        aoe: (def.aoe || 60) * game.player.mods.areaMul,
        life: 12, color: PAL.bg2, armed: 0.4, hit: new Set(), lvl: w.lvl
      });
    }
    else if (def.type === 'evo_pyre') {
      // Big expanding ring + 3 auto-aim beams
      const radius = def.range * game.player.mods.areaMul * 1.4;
      game.bullets.push({
        kind: 'ring', x: game.player.x, y: game.player.y,
        r: 16, rMax: radius, speed: def.projSpeed,
        dmg: scaledDamage(def.dmg, w.lvl) * (game.player.mods.aoeDmgMul || 1),
        life: 0.9, hit: new Set(), color: PAL.amber, lvl: w.lvl
      });
      // 3 auto-targeted beams
      const targets = [];
      for (const e of game.enemies) {
        const dx = e.x - game.player.x, dy = e.y - game.player.y;
        if (dx * dx + dy * dy < radius * radius) targets.push(e);
        if (targets.length >= 3) break;
      }
      for (const tgt of targets) {
        const ang = Math.atan2(tgt.y - game.player.y, tgt.x - game.player.x);
        game.bullets.push(makeBullet({
          x: game.player.x, y: game.player.y, ang,
          speed: def.projSpeed,
          dmg: scaledDamage(def.dmg, w.lvl) * 0.5,
          life: radius / def.projSpeed,
          pierce: 99, kind: 'beam', size: 5, color: PAL.cream, lvl: w.lvl
        }));
      }
    }
    else if (def.type === 'evo_anvil') {
      // 3 anvils thrown in a fan
      const tgt = nearestEnemy(game.player.x, game.player.y, def.range);
      const baseAng = tgt ? Math.atan2(tgt.y - game.player.y, tgt.x - game.player.x)
                          : Math.atan2(game.facing.y, game.facing.x);
      for (let i = -1; i <= 1; i++) {
        const ang = baseAng + i * 0.18;
        const cx = game.player.x + Math.cos(baseAng) * (def.range * 0.6);
        const cy = game.player.y + Math.sin(baseAng) * (def.range * 0.6);
        const tx = cx + Math.cos(ang) * 60;
        const ty = cy + Math.sin(ang) * 60;
        const ftime = Math.hypot(tx - game.player.x, ty - game.player.y) / def.projSpeed;
        game.bullets.push({
          kind: 'mortar', x: game.player.x, y: game.player.y,
          sx: game.player.x, sy: game.player.y, tx, ty,
          t: 0, ttotal: ftime,
          dmg: scaledDamage(def.dmg, w.lvl) * (game.player.mods.aoeDmgMul || 1),
          aoe: (def.aoe || 80) * game.player.mods.areaMul,
          life: ftime + 0.05, ignite: 0,
          color: PAL.bg0, hit: new Set(), lvl: w.lvl
        });
      }
    }
    else if (def.type === 'evo_choir') {
      // Place a salt zone, drop bells inside it
      const range = def.range * game.player.mods.areaMul;
      // Salt zone (persistent damaging zone)
      game.bullets.push({
        kind: 'zone', x: game.player.x, y: game.player.y, r: range * 0.5,
        dmg: scaledDamage(8, w.lvl) * (game.player.mods.aoeDmgMul || 1),
        life: 4, tick: 0.25, lastTick: 0, color: PAL.cream, hit: new Set(), lvl: w.lvl
      });
      // Drop bells inside
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + rand() * 0.4;
        const r = range * 0.4 * rand();
        const x = game.player.x + Math.cos(ang) * r;
        const y = game.player.y + Math.sin(ang) * r;
        game.bullets.push({
          kind: 'bell', x, y, fallY: y - 200, t: 0, ttotal: 0.5,
          dmg: scaledDamage(def.dmg, w.lvl) * (game.player.mods.aoeDmgMul || 1) * 2,
          aoe: (def.aoe || 70) * game.player.mods.areaMul,
          life: 0.6, color: PAL.amber, hit: new Set(), stun: 0.5, lvl: w.lvl
        });
      }
    }
  }

  // Echo Bell artifact: every 8s, fire the most recent weapon's attack again
  if (game.player.flags.echo) {
    game.player.echoTimer = (game.player.echoTimer || 0) + dt;
    if (game.player.echoTimer >= 8) {
      game.player.echoTimer = 0;
      const lastW = game.player.weapons[game.player.weapons.length - 1];
      if (lastW) { lastW.cd = 0; pushFloat(game.player.x, game.player.y - 32, '↻ Echo', PAL.teal, 0.8); }
    }
  }

  // Update orbits each frame
  updateOrbits(dt);
}

function ensureOrbits(weaponInst) {
  const def = WEAPONS[weaponInst.id];
  const baseCount = def.orbitCount || 3;
  const desired = baseCount + Math.floor((weaponInst.lvl - 1) / 2);
  // Refresh existing orbits' lvl + dmg in case the weapon leveled up
  let count = 0;
  for (const b of game.bullets) {
    if (b.kind === 'orbit' && b.weaponId === weaponInst.id) {
      count++;
      b.lvl = weaponInst.lvl;
      b.dmg = scaledDamage(def.dmg, weaponInst.lvl);
      b.r   = def.range * game.player.mods.areaMul;
    }
  }
  for (let i = count; i < desired; i++) {
    game.bullets.push({
      kind: 'orbit', weaponId: weaponInst.id,
      angOff: (i / desired) * Math.PI * 2,
      r: def.range * game.player.mods.areaMul,
      speed: 3.0,
      dmg: scaledDamage(def.dmg, weaponInst.lvl),
      hitMap: new Map(),
      x: 0, y: 0, life: 9999, size: 6,
      color: weaponInst.id === 'censer' ? PAL.orange : PAL.green,
      burn: def.burn || 0, lvl: weaponInst.lvl
    });
  }
}
function updateOrbits(dt) {
  // Orbits handled within updateBullets render+collision
}

function scaledDamage(baseDmg, lvl, kind) {
  const m = game.player.mods;
  let mul = m.damageMul;
  if (kind === 'projectile') mul *= (m.projDmgMul || 1);
  if (kind === 'aoe')        mul *= (m.aoeDmgMul || 1);
  return baseDmg * (1 + 0.15 * (lvl - 1)) * mul;
}

function makeBullet(o) {
  return Object.assign({
    x: 0, y: 0, ang: 0, speed: 0, dmg: 0,
    life: 0.5, pierce: 0, kind: 'beam', size: 3, color: PAL.amber,
    hit: new Set(), knockback: 0, lvl: 1
  }, o);
}

// 0..1 boost based on weapon level (lvl 1 → 0, lvl 8 → 1)
function lvlBoost(b) { return Math.max(0, Math.min(1, (((b && b.lvl) || 1) - 1) / 7)); }

function nearestEnemy(x, y, maxR) {
  let best = null, bestD2 = (maxR || 1e9) * (maxR || 1e9);
  for (const e of game.enemies) {
    const dx = e.x - x, dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = e; }
  }
  return best;
}

/* =============================================================
   COLLISION / HITS
   ============================================================= */
function applyHit(enemy, dmg, fromBullet) {
  if (enemy.dead) return;
  // Cold Vow: first hit on a fresh enemy +50%
  if (game.player.flags.coldvow && !enemy.everHit) dmg *= 1.5;
  // Nightshade Vial: previously-hurt enemies take +15%
  if (game.player.flags.nightshade && enemy.everHit) dmg *= 1.15;
  enemy.everHit = true;
  enemy.hp -= dmg;
  pushFloat(enemy.x, enemy.y - 6, Math.round(dmg).toString(),
    dmg >= 50 ? PAL.amber : PAL.cream, 0.6);
  for (let i = 0; i < 3; i++) {
    game.particles.push({
      x: enemy.x, y: enemy.y,
      vx: randRange(-60, 60), vy: randRange(-60, 60),
      life: 0.3, color: enemy.color
    });
  }
  if (enemy.hp <= 0) killEnemy(enemy);
}

function killEnemy(enemy) {
  if (enemy.dead) return;
  enemy.dead = true;
  game.killCount++;

  // Bloodtithe: heal 1 per 50 kills
  if (game.player.flags.bloodtithe && game.killCount % 50 === 0) {
    game.player.hp = Math.min(game.player.maxHp, game.player.hp + 1);
    pushFloat(game.player.x, game.player.y - 18, '+1 HP', PAL.red, 0.6);
  }

  // Ash Reservoir: burning enemies explode on death
  if (game.player.flags.ash && enemy.burnUntil && game.t < enemy.burnUntil) {
    for (const e of game.enemies) {
      if (e === enemy || e.dead) continue;
      const dx = e.x - enemy.x, dy = e.y - enemy.y;
      if (dx * dx + dy * dy < 40 * 40) applyHit(e, 30 * game.player.mods.damageMul, false);
    }
    for (let i = 0; i < 12; i++) {
      game.particles.push({ x: enemy.x, y: enemy.y, vx: randRange(-150, 150), vy: randRange(-150, 150), life: 0.45, color: PAL.orange });
    }
  }

  // Grub Swarm: spawn 3 grublets
  if (enemy.type === 'grub') {
    const def = ENEMIES.grublet;
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2;
      game.enemies.push({
        type: 'grublet',
        x: enemy.x + Math.cos(ang) * 8,
        y: enemy.y + Math.sin(ang) * 8,
        vx: 0, vy: 0,
        hp: scaleHP(def.hp, game.t), maxHp: scaleHP(def.hp, game.t),
        dmg: scaleDmg(def.dmg, game.t),
        speed: def.speed, size: def.size, color: def.color,
        phase: rand() * Math.PI * 2, cooldown: 0,
        knockback: { x: 0, y: 0 }
      });
    }
  }

  // Drops
  if (enemy.boss) {
    spawnPickup('chest', enemy.x, enemy.y);
    spawnPickup('heart', enemy.x + 14, enemy.y);
    for (let i = 0; i < 3; i++) {
      const a = rand() * Math.PI * 2;
      spawnPickup('gold', enemy.x + Math.cos(a) * 12, enemy.y + Math.sin(a) * 12);
    }
    const reward = enemy.bossId === 'reaper' ? 50 : (enemy.bossId === 'belltyrant' ? 15 : 5);
    game.shardsThisRun += reward;
    pushFloat(enemy.x, enemy.y - 30, '+' + reward + ' ★', PAL.amber, 1.6);
    // Track unlock progress
    meta.bossesKilled = meta.bossesKilled || {};
    meta.bossesKilled[enemy.bossId] = true;
    saveMeta();
    // Per-run flag for victory check
    if (enemy.bossId === 'reaper') game.reaperKilledThisRun = true;
  } else {
    if (rand() < (enemy.elite ? 1.0 : 0.85)) {
      spawnPickup(enemy.elite ? 'gold' : 'ember', enemy.x, enemy.y);
    }
    if (rand() < 0.006) spawnPickup('heart', enemy.x, enemy.y);
    if (rand() < (enemy.elite ? 0.5 : 0.005)) game.shardsThisRun++;
  }
  // Death burst
  for (let i = 0; i < 8; i++) {
    game.particles.push({
      x: enemy.x, y: enemy.y,
      vx: randRange(-100, 100), vy: randRange(-100, 100),
      life: 0.5, color: enemy.color
    });
  }
}

function spawnPickup(kind, x, y) {
  game.pickups.push({ kind, x, y, life: 60, vx: randRange(-30, 30), vy: randRange(-50, -10) });
}

function spawnEnemyBolt(x, y, ang, speed, dmg, color) {
  game.bullets.push({
    x, y, ang,
    vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
    speed, dmg, life: 2.5, pierce: 0, kind: 'enemy_bolt',
    size: 4, color, isEnemy: true, hit: new Set()
  });
}

/* =============================================================
   BOSS BEHAVIORS
   ============================================================= */
function updateBossBehavior(e, dt) {
  if (e.bossId === 'marrow') {
    // Cross-bolt fan every 2.8s, with an extra arc at low HP
    e.cooldown -= dt;
    if (e.cooldown <= 0) {
      e.cooldown = e.hp / e.maxHp < 0.5 ? 2.0 : 2.8;
      const arms = e.hp / e.maxHp < 0.5 ? 6 : 4;
      for (let i = 0; i < arms; i++) {
        const ang = (i / arms) * Math.PI * 2 + e.phase;
        spawnEnemyBolt(e.x, e.y, ang, 220, e.dmg, PAL.cream);
      }
    }
  }
  else if (e.bossId === 'belltyrant') {
    // Every 3.5s: ring out + summon 8 husks (faster than before)
    e.cooldown -= dt;
    if (e.cooldown <= 0) {
      e.cooldown = 3.5;
      game.bullets.push({
        kind: 'enemy_ring', x: e.x, y: e.y, r: 16, rMax: 380,
        speed: 260, dmg: e.dmg, life: 1.6, hit: new Set(),
        isEnemy: true, color: PAL.amber
      });
      for (let i = 0; i < 8; i++) {
        const ang = rand() * Math.PI * 2, r = 80;
        const def = ENEMIES.husk;
        game.enemies.push({
          type: 'husk',
          x: e.x + Math.cos(ang) * r, y: e.y + Math.sin(ang) * r,
          vx: 0, vy: 0,
          hp: scaleHP(def.hp, game.t), maxHp: scaleHP(def.hp, game.t),
          dmg: scaleDmg(def.dmg, game.t),
          speed: def.speed, size: def.size, color: def.color,
          phase: rand() * Math.PI * 2, cooldown: 0,
          knockback: { x: 0, y: 0 }
        });
      }
    }
  }
  else if (e.bossId === 'reaper') {
    const pct = e.hp / e.maxHp;
    e.cooldown -= dt;
    if (pct > 0.5) {
      // Phase 1: 5-shot bolt fan every 1.8s
      if (e.cooldown <= 0) {
        e.cooldown = 1.8;
        const baseAng = Math.atan2(game.player.y - e.y, game.player.x - e.x);
        for (let i = -2; i <= 2; i++) {
          spawnEnemyBolt(e.x, e.y, baseAng + i * 0.20, 260, e.dmg, PAL.bg2);
        }
      }
    } else if (pct > 0.2) {
      // Phase 2: ring + bolt every 2.8s
      if (e.cooldown <= 0) {
        e.cooldown = 2.8;
        game.bullets.push({
          kind: 'enemy_ring', x: e.x, y: e.y, r: 16, rMax: 360,
          speed: 240, dmg: e.dmg, life: 1.6, hit: new Set(),
          isEnemy: true, color: PAL.red
        });
        const baseAng = Math.atan2(game.player.y - e.y, game.player.x - e.x);
        spawnEnemyBolt(e.x, e.y, baseAng, 260, e.dmg, PAL.bg2);
      }
    } else {
      // Phase 3: enraged — faster + 12-way burst
      e.speed = 85;
      if (e.cooldown <= 0) {
        e.cooldown = 1.0;
        const baseAng = Math.atan2(game.player.y - e.y, game.player.x - e.x);
        for (let i = 0; i < 12; i++) {
          spawnEnemyBolt(e.x, e.y, baseAng + (i / 12) * Math.PI * 2, 230, e.dmg, PAL.bg0);
        }
      }
    }
  }
}

/* =============================================================
   UPDATE
   ============================================================= */
function update(dt) {
  if (!game.running || game.paused || game.cardOpen) return;
  game.t += dt;

  // Player movement
  const inp = readInput();
  if (inp.mag > 0) { game.facing.x = inp.x; game.facing.y = inp.y; }
  game.player.x += inp.x * game.player.speed * game.player.mods.moveSpeedMul * dt;
  game.player.y += inp.y * game.player.speed * game.player.mods.moveSpeedMul * dt;

  // Camera follows player
  game.cam.x = game.player.x;
  game.cam.y = game.player.y;

  // Hurt flash decay
  game.player.hurtFlash = Math.max(0, game.player.hurtFlash - dt);
  game.player.invuln = Math.max(0, game.player.invuln - dt);

  // Sable: every N seconds, gain a brief invuln
  if (game.player.flags.sableEvery > 0) {
    game.player.flags.sableTimer -= dt;
    if (game.player.flags.sableTimer <= 0) {
      game.player.flags.sableTimer = game.player.flags.sableEvery;
      game.player.invuln = Math.max(game.player.invuln, game.player.flags.sableDuration);
      pushFloat(game.player.x, game.player.y - 30, 'phase', PAL.teal, 0.6);
    }
  }

  // Track no-damage streak for Sable's unlock
  game.player.noDamageStreak += dt;
  if (game.player.noDamageStreak >= 60) {
    if (!meta.noDamage60) { meta.noDamage60 = true; saveMeta(); }
  }

  // Vespa: contact aura damages enemies touching the player
  if (game.player.contactAuraDps > 0) {
    for (const e of game.enemies) {
      if (e.dead) continue;
      const dx = e.x - game.player.x, dy = e.y - game.player.y;
      const reach = (e.size / 2) + 16;
      if (dx * dx + dy * dy < reach * reach) {
        applyHit(e, game.player.contactAuraDps * dt, false);
      }
    }
  }

  // Spawn director
  spawnTick(dt);

  // Fire weapons
  fireWeapons(dt);

  // Pre-pass: collect Hexer aura buffs
  const hexers = [];
  for (const e of game.enemies) {
    if (!e.dead && e.type === 'hexer') hexers.push(e);
  }

  // Update enemies
  for (const e of game.enemies) {
    let tx = game.player.x, ty = game.player.y;
    const def = ENEMIES[e.type] || (e.boss ? BOSSES[e.bossId] : null);
    e.phase += dt;

    // Hexer aura: speed bonus to nearby allies
    let speedMul = 1;
    if (e.type !== 'hexer') {
      for (const h of hexers) {
        const ddx = e.x - h.x, ddy = e.y - h.y;
        if (ddx * ddx + ddy * ddy < 100 * 100) { speedMul = 1.25; break; }
      }
    }

    // Frostlamp slow
    if (e.slowUntil && game.t < e.slowUntil) speedMul *= 0.65;

    // Status DOTs (burn from Censer)
    if (e.burnUntil && game.t < e.burnUntil) {
      e.burnAccum = (e.burnAccum || 0) + (e.burnDps || 0) * dt;
      while (e.burnAccum >= 1) {
        applyHit(e, 1, false);
        e.burnAccum -= 1;
        if (e.dead) break;
      }
      if (e.dead) continue;
    }

    if (def && def.behavior === 'weave') {
      const sway = Math.sin(e.phase * 4) * 30;
      tx += -Math.sin(e.phase * 0.5) * sway;
      ty += Math.cos(e.phase * 0.5) * sway;
    }
    else if (def && def.behavior === 'ranged') {
      const distToPlayer = Math.hypot(e.x - game.player.x, e.y - game.player.y);
      if (distToPlayer < 220) { tx = e.x - (game.player.x - e.x); ty = e.y - (game.player.y - e.y); }
      e.cooldown -= dt;
      if (e.cooldown <= 0 && distToPlayer < 260) {
        e.cooldown = 1.6;
        const ang = Math.atan2(game.player.y - e.y, game.player.x - e.x);
        spawnEnemyBolt(e.x, e.y, ang, 200, e.dmg, PAL.green);
      }
    }
    else if (def && def.behavior === 'dash') {
      // Reaver: dash every ~3s, 0.4s telegraph then 0.5s dash at 3x speed
      e.cooldown = (e.cooldown || 0) - dt;
      if (e.dashState === undefined) e.dashState = 'idle';
      if (e.dashState === 'idle' && e.cooldown <= 0) {
        e.dashState = 'tell';
        e.dashTimer = 0.4;
      } else if (e.dashState === 'tell') {
        e.dashTimer -= dt;
        if (e.dashTimer <= 0) {
          e.dashState = 'dash';
          e.dashTimer = 0.5;
          const ang = Math.atan2(game.player.y - e.y, game.player.x - e.x);
          e.dashVx = Math.cos(ang) * e.speed * 3;
          e.dashVy = Math.sin(ang) * e.speed * 3;
        }
      } else if (e.dashState === 'dash') {
        e.dashTimer -= dt;
        if (e.dashTimer <= 0) { e.dashState = 'idle'; e.cooldown = 2.0; }
      }
    }
    else if (def && def.behavior === 'burrow') {
      // Lurker cycle: burrow (invisible, intangible) → surface → chase
      if (!e.lurkPhase) e.lurkPhase = 'surface';
      if (e.lurkPhase === 'chase') {
        e.lurkTimer = (e.lurkTimer || 4) - dt;
        if (e.lurkTimer <= 0) { e.lurkPhase = 'burrow'; e.lurkTimer = 1.6; }
      } else if (e.lurkPhase === 'burrow') {
        e.lurkTimer -= dt;
        if (e.lurkTimer <= 0) {
          // Surface near player
          const ang = rand() * Math.PI * 2, r = randRange(80, 160);
          e.x = game.player.x + Math.cos(ang) * r;
          e.y = game.player.y + Math.sin(ang) * r;
          e.lurkPhase = 'surface'; e.lurkTimer = 0.4;
        }
      } else if (e.lurkPhase === 'surface') {
        e.lurkTimer -= dt;
        if (e.lurkTimer <= 0) { e.lurkPhase = 'chase'; e.lurkTimer = 4.0; }
      }
    }
    else if (def && def.behavior === 'turret') {
      // Bone Pillar: stationary, fires shards every 1.5s
      tx = e.x; ty = e.y;
      e.cooldown = (e.cooldown || 1.0) - dt;
      if (e.cooldown <= 0) {
        e.cooldown = 1.0;
        const ang = Math.atan2(game.player.y - e.y, game.player.x - e.x);
        spawnEnemyBolt(e.x, e.y, ang, 240, e.dmg, PAL.cream);
      }
    }
    else if (def && def.behavior === 'sprint') {
      // Nullhound: lock direction at sight; sprint in line
      if (!e.sprintLock) {
        const ang = Math.atan2(game.player.y - e.y, game.player.x - e.x);
        e.sprintVx = Math.cos(ang); e.sprintVy = Math.sin(ang);
        e.sprintLock = true;
      }
      tx = e.x + e.sprintVx * 1000;
      ty = e.y + e.sprintVy * 1000;
    }
    // (chase / phase / aura / splitter all use default chase)

    // Compute movement
    let vx, vy;
    if (e.dashState === 'dash') {
      vx = e.dashVx; vy = e.dashVy;
    } else if (e.dashState === 'tell') {
      vx = 0; vy = 0;
    } else if (def && def.behavior === 'turret') {
      vx = 0; vy = 0;
    } else if (def && def.behavior === 'burrow' && (e.lurkPhase === 'burrow' || e.lurkPhase === 'surface')) {
      vx = 0; vy = 0;
    } else {
      const dx = tx - e.x, dy = ty - e.y;
      const m = Math.hypot(dx, dy) || 1;
      vx = (dx / m) * e.speed * speedMul;
      vy = (dy / m) * e.speed * speedMul;
    }
    e.vx = vx; e.vy = vy;
    e.x += (vx + e.knockback.x) * dt;
    e.y += (vy + e.knockback.y) * dt;
    e.knockback.x *= 0.85; e.knockback.y *= 0.85;

    // Touch damage — skip if intangible (lurker burrow)
    const intangible = (def && def.behavior === 'burrow' && e.lurkPhase === 'burrow');
    if (!intangible && game.player.invuln <= 0) {
      const ddx = e.x - game.player.x, ddy = e.y - game.player.y;
      const reach = (e.size / 2) + 8;
      if (ddx * ddx + ddy * ddy < reach * reach) {
        if (e.type === 'nullhound' && game.player.weapons.length > 0) {
          // Strip a weapon level (cosmetic punish — min 1)
          const w = choice(game.player.weapons);
          if (w.lvl > 1) { w.lvl--; pushFloat(game.player.x, game.player.y - 28, '-1 weapon Lv', PAL.red, 1.2); }
        }
        damagePlayer(e.dmg);
      }
    }

    // Boss behaviors
    if (e.boss) updateBossBehavior(e, dt);
  }

  // Halberd lifesteal token regen
  if (game.player.flags.haveLifesteal) {
    game.player.healTokens = Math.min(3, (game.player.healTokens || 0) + 3 * dt);
  }

  // Update bullets
  for (const b of game.bullets) {
    if (b.kind === 'orbit') {
      b.angOff += b.speed * dt;
      b.x = game.player.x + Math.cos(b.angOff) * b.r;
      b.y = game.player.y + Math.sin(b.angOff) * b.r;
      for (const e of game.enemies) {
        if (e.dead) continue;
        const dx = e.x - b.x, dy = e.y - b.y;
        const d2 = dx * dx + dy * dy;
        const reach = (e.size / 2) + b.size;
        if (d2 < reach * reach) {
          const last = b.hitMap.get(e) || -1;
          if (game.t - last > 0.4) {
            applyHit(e, b.dmg, true);
            if (b.burn) { e.burnUntil = game.t + 3; e.burnDps = b.burn; }
            b.hitMap.set(e, game.t);
          }
        }
      }
      continue;
    }
    if (b.kind === 'ring') {
      b.r += b.speed * dt;
      b.life -= dt;
      for (const e of game.enemies) {
        if (e.dead || b.hit.has(e)) continue;
        const dx = e.x - b.x, dy = e.y - b.y;
        const d = Math.hypot(dx, dy);
        if (Math.abs(d - b.r) < 14) {
          applyHit(e, b.dmg, true);
          b.hit.add(e);
        }
      }
      continue;
    }
    if (b.kind === 'enemy_ring') {
      b.r += b.speed * dt;
      b.life -= dt;
      // Damage player on first contact only
      if (!b.hit.has('player') && game.player.invuln <= 0) {
        const dx = game.player.x - b.x, dy = game.player.y - b.y;
        const d = Math.hypot(dx, dy);
        if (Math.abs(d - b.r) < 18) {
          damagePlayer(b.dmg);
          b.hit.add('player');
        }
      }
      continue;
    }
    if (b.kind === 'mortar') {
      b.t += dt;
      const k = Math.min(1, b.t / b.ttotal);
      b.x = b.sx + (b.tx - b.sx) * k;
      b.y = b.sy + (b.ty - b.sy) * k;
      // Render arc handled in render via b.arcY (visual only)
      b.arcY = -Math.sin(k * Math.PI) * 60;
      b.life -= dt;
      if (k >= 1 && !b.exploded) {
        b.exploded = true;
        for (const e of game.enemies) {
          if (e.dead) continue;
          const dx = e.x - b.x, dy = e.y - b.y;
          if (dx * dx + dy * dy < b.aoe * b.aoe) {
            applyHit(e, b.dmg, true);
            if (b.ignite) { e.burnUntil = game.t + b.ignite; e.burnDps = e.burnDps ? Math.max(e.burnDps, 3) : 3; }
          }
        }
        for (let i = 0; i < 14; i++) {
          game.particles.push({ x: b.x, y: b.y, vx: randRange(-180, 180), vy: randRange(-180, 180), life: 0.4, color: PAL.orange });
        }
        b.life = 0;
      }
      continue;
    }
    if (b.kind === 'whip') {
      // Whip is a sweep at the player's side; follow player while alive
      b.life -= dt;
      b.x = game.player.x + b.ox;
      b.y = game.player.y + b.oy;
      for (const e of game.enemies) {
        if (e.dead || b.hit.has(e)) continue;
        const dx = e.x - b.x, dy = e.y - b.y;
        if (Math.abs(dx) < b.w / 2 && Math.abs(dy) < b.h / 2) {
          let dmg = b.dmg;
          if (b.critOnSecond && b._isSecond) dmg *= 2;
          applyHit(e, dmg, true);
          b.hit.add(e);
        }
      }
      continue;
    }
    if (b.kind === 'bell') {
      b.t += dt;
      const k = Math.min(1, b.t / b.ttotal);
      // Render position lerps from fallY → y
      b.renderY = b.fallY + (b.y - b.fallY) * k;
      b.life -= dt;
      if (k >= 1 && !b.exploded) {
        b.exploded = true;
        for (const e of game.enemies) {
          if (e.dead) continue;
          const dx = e.x - b.x, dy = e.y - b.y;
          if (dx * dx + dy * dy < b.aoe * b.aoe) {
            applyHit(e, b.dmg, true);
            if (b.stun) e.knockback.x *= 0; // basic stun = none for now
          }
        }
        for (let i = 0; i < 18; i++) {
          game.particles.push({ x: b.x, y: b.y, vx: randRange(-200, 200), vy: randRange(-200, 200), life: 0.5, color: PAL.cream });
        }
        b.life = 0;
      }
      continue;
    }
    if (b.kind === 'boomerang') {
      b.t += dt;
      // Out for first half, back for second
      const half = b.ttotal / 2;
      let cx, cy;
      if (b.t < half) {
        // Travel out
        const k = b.t / half;
        cx = b.ox + Math.cos(b.ang) * b.range * k;
        cy = b.oy + Math.sin(b.ang) * b.range * k;
        b.returning = false;
      } else {
        const k = (b.t - half) / half;
        // Return toward CURRENT player position
        const farX = b.ox + Math.cos(b.ang) * b.range;
        const farY = b.oy + Math.sin(b.ang) * b.range;
        cx = farX + (game.player.x - farX) * k;
        cy = farY + (game.player.y - farY) * k;
        b.returning = true;
      }
      b.x = cx; b.y = cy;
      b.life -= dt;
      // Hit pool: separate sets for out and return so each enemy can be hit twice
      const hitSet = b.returning ? b.hit : b.hitOut;
      for (const e of game.enemies) {
        if (e.dead || hitSet.has(e)) continue;
        const dx = e.x - b.x, dy = e.y - b.y;
        if (dx * dx + dy * dy < (e.size / 2 + 6) * (e.size / 2 + 6)) {
          applyHit(e, b.dmg * (b.returning ? 1.5 : 1.0), true);
          hitSet.add(e);
        }
      }
      continue;
    }
    if (b.kind === 'mine') {
      b.life -= dt;
      b.armed -= dt;
      if (b.armed > 0) continue;
      // Triggers on enemy contact
      for (const e of game.enemies) {
        if (e.dead) continue;
        const dx = e.x - b.x, dy = e.y - b.y;
        if (dx * dx + dy * dy < 14 * 14) {
          // Detonate
          for (const e2 of game.enemies) {
            if (e2.dead) continue;
            const ddx = e2.x - b.x, ddy = e2.y - b.y;
            if (ddx * ddx + ddy * ddy < b.aoe * b.aoe) applyHit(e2, b.dmg, true);
          }
          for (let i = 0; i < 16; i++) {
            game.particles.push({ x: b.x, y: b.y, vx: randRange(-220, 220), vy: randRange(-220, 220), life: 0.5, color: PAL.amber });
          }
          b.life = 0;
          break;
        }
      }
      continue;
    }
    if (b.kind === 'zone') {
      b.life -= dt;
      b.lastTick += dt;
      if (b.lastTick >= b.tick) {
        b.lastTick = 0;
        for (const e of game.enemies) {
          if (e.dead) continue;
          const dx = e.x - b.x, dy = e.y - b.y;
          if (dx * dx + dy * dy < b.r * b.r) applyHit(e, b.dmg, false);
        }
      }
      continue;
    }

    if (b.kind === 'homing' && b.homingTarget && !b.homingTarget.dead) {
      const tx = b.homingTarget.x - b.x, ty = b.homingTarget.y - b.y;
      const targetAng = Math.atan2(ty, tx);
      let da = targetAng - b.ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      b.ang += Math.max(-3, Math.min(3, da)) * dt;
    }

    const vx = (b.vx != null) ? b.vx : Math.cos(b.ang) * b.speed;
    const vy = (b.vy != null) ? b.vy : Math.sin(b.ang) * b.speed;
    b.x += vx * dt;
    b.y += vy * dt;
    b.life -= dt;

    if (b.isEnemy) {
      if (game.player.invuln <= 0) {
        const dx = game.player.x - b.x, dy = game.player.y - b.y;
        if (dx * dx + dy * dy < 12 * 12) {
          damagePlayer(b.dmg);
          b.life = 0;
        }
      }
      continue;
    }

    // Player bullets damage enemies
    for (const e of game.enemies) {
      if (e.dead || b.hit.has(e)) continue;
      const reach = (e.size / 2) + b.size;
      const dx = e.x - b.x, dy = e.y - b.y;
      if (dx * dx + dy * dy < reach * reach) {
        applyHit(e, b.dmg, true);
        // Halberd crit lifesteal
        if (b.isCrit && game.player.flags.haveLifesteal && (game.player.healTokens || 0) >= 1) {
          game.player.healTokens -= 1;
          game.player.hp = Math.min(game.player.maxHp, game.player.hp + 1);
        }
        b.hit.add(e);
        if (b.knockback) {
          const pdx = e.x - game.player.x, pdy = e.y - game.player.y;
          const pm = Math.hypot(pdx, pdy) || 1;
          e.knockback.x = (pdx / pm) * b.knockback;
          e.knockback.y = (pdy / pm) * b.knockback;
        }
        if (b.pierce-- <= 0) { b.life = 0; break; }
      }
    }
  }

  // Update pickups
  const pr = game.player.pickupRad;
  for (const p of game.pickups) {
    if (p.kind === 'chest') {
      // Stationary
      p.life -= dt;
    } else {
      p.vy += 100 * dt; // gravity-ish
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9; p.vy *= 0.9;
      p.life -= dt;
    }
    const dx = game.player.x - p.x, dy = game.player.y - p.y;
    const d2 = dx * dx + dy * dy;
    const grabR = (p.kind === 'chest') ? 16 : pr;
    if (d2 < grabR * grabR) {
      // Magnetize then collect
      const m = Math.hypot(dx, dy) || 1;
      p.vx = (dx / m) * 320;
      p.vy = (dy / m) * 320;
      if (d2 < 12 * 12) collectPickup(p);
    }
  }

  // Update particles
  for (const pa of game.particles) {
    pa.x += pa.vx * dt; pa.y += pa.vy * dt;
    pa.vx *= 0.92; pa.vy *= 0.92;
    pa.life -= dt;
  }
  // Update floats
  for (const f of game.floats) {
    f.y -= 24 * dt;
    f.life -= dt;
  }

  // Cull
  game.enemies = game.enemies.filter(e => !e.dead && Math.hypot(e.x - game.player.x, e.y - game.player.y) < VIEW_R * 2);
  const PERSIST = new Set(['orbit', 'mine', 'zone', 'mortar', 'bell', 'boomerang', 'whip']);
  game.bullets = game.bullets.filter(b => b.life > 0 && (PERSIST.has(b.kind) || Math.hypot(b.x - game.player.x, b.y - game.player.y) < VIEW_R * 1.4));
  game.pickups = game.pickups.filter(p => !p.taken && p.life > 0);
  game.particles = game.particles.filter(p => p.life > 0);
  game.floats = game.floats.filter(f => f.life > 0);

  // Track survive-time unlock for Ferren
  if (game.charDef.id === 'wyck' && game.t >= 300 && !meta.wyck5min) {
    meta.wyck5min = true; saveMeta();
  }

  // Track max level for Brom unlock
  if (game.player.level > (meta.maxLevel || 0)) {
    meta.maxLevel = game.player.level;
    saveMeta();
  }

  // Win condition: Final Reaper killed THIS run
  if (game.reaperKilledThisRun && !game.victoryFired) {
    game.victoryFired = true;
    endRun(true);
  }
}

function damagePlayer(amount) {
  if (amount <= 0) return;
  // Mirror Shroud dodge
  if (game.player.mods.dodgeChance > 0 && rand() < game.player.mods.dodgeChance) {
    pushFloat(game.player.x, game.player.y - 24, 'dodged', PAL.teal, 0.6);
    game.player.invuln = 0.2;
    return;
  }
  game.player.hp -= amount;
  game.player.hurtFlash = 0.18;
  game.player.invuln = 0.30;
  game.player.noDamageStreak = 0;
  // Last Light: at 1 HP threshold, fire once
  if (game.player.flags.lastlight && !game.player.flags.lastlightUsed && game.player.hp <= 1) {
    game.player.flags.lastlightUsed = true;
    game.player.hp = Math.max(1, game.player.hp);
    game.player.invuln = 4.0;
    pushFloat(game.player.x, game.player.y - 40, '✦ LAST LIGHT ✦', PAL.amber, 2.0);
    // Clear-screen burst: 200 damage to all enemies in 360px
    for (const e of game.enemies) {
      if (e.dead) continue;
      const dx = e.x - game.player.x, dy = e.y - game.player.y;
      if (dx * dx + dy * dy < 360 * 360) applyHit(e, 200, false);
    }
    for (let i = 0; i < 60; i++) {
      const a = rand() * Math.PI * 2, sp = randRange(180, 320);
      game.particles.push({ x: game.player.x, y: game.player.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.7, color: PAL.amber });
    }
  }
  if (game.player.hp <= 0) {
    game.player.hp = 0;
    endRun(false);
  }
}

function collectPickup(p) {
  if (p.taken) return;
  p.taken = true;
  if (p.kind === 'ember') {
    const v = 1 * game.player.mods.xpMul;
    game.player.xp += v;
    game.emberCount += 1;
    while (game.player.xp >= game.player.xpToNext) levelUp();
  } else if (p.kind === 'gold') {
    const v = 5 * game.player.mods.xpMul;
    game.player.xp += v;
    game.emberCount += 5;
    while (game.player.xp >= game.player.xpToNext) levelUp();
  } else if (p.kind === 'heart') {
    game.player.hp = Math.min(game.player.maxHp, game.player.hp + 20);
    pushFloat(game.player.x, game.player.y - 20, '+20 HP', PAL.red, 0.8);
  } else if (p.kind === 'chest') {
    // Chest: if any evolution is eligible, offer it; otherwise normal level-up.
    const evos = getEligibleEvolutions();
    if (evos.length > 0) {
      offerEvolutions(evos);
    } else {
      game.player.xp = game.player.xpToNext - 0.001;
      levelUp();
    }
  }
}

/* =============================================================
   EVOLUTION SYSTEM
   ============================================================= */
function getEligibleEvolutions() {
  const ownedW = new Map();
  for (const w of game.player.weapons) ownedW.set(w.id, w);
  const ownedA = new Set(game.player.artifacts.map(a => a.id));
  const result = [];
  for (const evo of EVOLUTIONS) {
    if (!ownedA.has(evo.catalyst)) continue;
    let allMax = true;
    for (const src of evo.from) {
      const w = ownedW.get(src);
      if (!w || w.lvl < 8) { allMax = false; break; }
    }
    if (allMax) result.push(evo);
  }
  return result;
}

function offerEvolutions(evos) {
  // Build evolution cards
  const cards = evos.map(evo => {
    const def = WEAPONS[evo.id];
    const sources = evo.from.map(id => WEAPONS[id].name).join(' + ');
    return {
      type: 'evolution', evoId: evo.id, evoFrom: evo.from, rarity: 'L',
      title: def.name, tag: 'EVOLUTION',
      desc: `${sources}<br>${def.desc}`
    };
  });
  game.cardOpen = true;
  game.pendingCards = cards;
  showCardOverlay(cards);
}

/* =============================================================
   LEVEL-UP CARDS
   ============================================================= */
function levelUp() {
  game.player.xp -= game.player.xpToNext;
  game.player.level++;
  game.player.xpToNext = Math.floor(5 * Math.pow(1.12, game.player.level));
  pushFloat(game.player.x, game.player.y - 30, 'LEVEL UP', PAL.amber, 1.0);

  // Build card pool
  const pool = [];

  // Existing weapon upgrades
  for (const w of game.player.weapons) {
    if (w.lvl < 8) {
      pool.push({
        type: 'weapon_lvl', weaponId: w.id, rarity: 'C',
        title: WEAPONS[w.id].name + ' Lv ' + (w.lvl + 1),
        tag: 'Upgrade',
        desc: '+15% damage. Refines effect.'
      });
    }
  }
  // New weapons (up to 6 active) — evolution weapons NEVER offered as base picks
  if (game.player.weapons.length < 6) {
    const owned = new Set(game.player.weapons.map(w => w.id));
    for (const id of Object.keys(WEAPONS)) {
      if (owned.has(id)) continue;
      const def = WEAPONS[id];
      if (def.evolution) continue;
      pool.push({
        type: 'weapon_new', weaponId: id, rarity: def.tier,
        title: def.name, tag: 'New Weapon', desc: def.desc
      });
    }
  }
  // New artifacts (up to 6 active)
  if (game.player.artifacts.length < 6) {
    const owned = new Set(game.player.artifacts.map(a => a.id));
    for (const id of Object.keys(ARTIFACTS)) {
      if (owned.has(id)) continue;
      const def = ARTIFACTS[id];
      pool.push({
        type: 'artifact', artifactId: id, rarity: def.tier,
        title: def.name, tag: 'Artifact', desc: def.desc
      });
    }
  }

  // Pick 3 unique random
  const offered = [];
  const tries = pool.slice();
  while (offered.length < 3 && tries.length > 0) {
    const i = Math.floor(rand() * tries.length);
    offered.push(tries[i]);
    tries.splice(i, 1);
  }
  if (offered.length === 0) {
    // Heal as fallback
    game.player.hp = Math.min(game.player.maxHp, game.player.hp + 30);
    return;
  }

  game.cardOpen = true;
  game.pendingCards = offered;
  showCardOverlay(offered);
}

function pickCard(idx) {
  const card = game.pendingCards && game.pendingCards[idx];
  if (!card) return;
  if (card.type === 'weapon_lvl') {
    const w = game.player.weapons.find(x => x.id === card.weaponId);
    if (w) w.lvl = Math.min(8, w.lvl + 1);
  } else if (card.type === 'weapon_new') {
    game.player.weapons.push({ id: card.weaponId, lvl: 1, cd: 0, phase: 0 });
  } else if (card.type === 'artifact') {
    applyArtifact(card.artifactId);
    game.player.artifacts.push({ id: card.artifactId });
  } else if (card.type === 'evolution') {
    // Remove sources, add evolution at level 8
    game.player.weapons = game.player.weapons.filter(w => !card.evoFrom.includes(w.id));
    // Strip orbit bullets for any removed orbit weapon
    game.bullets = game.bullets.filter(b => !(b.kind === 'orbit' && card.evoFrom.includes(b.weaponId)));
    game.player.weapons.push({ id: card.evoId, lvl: 8, cd: 0, phase: 0 });
    pushFloat(game.player.x, game.player.y - 40, '✦ EVOLVED ✦', PAL.orange, 1.6);
  }
  hideOverlay('card-overlay');
  game.cardOpen = false;
  game.pendingCards = null;
}

function applyArtifact(id) {
  const a = ARTIFACTS[id];
  const m = game.player.mods;
  const f = game.player.flags;
  switch (a.stat) {
    case 'projSpeedMul': m.projSpeedMul *= a.value; break;
    case 'projCountAdd': m.projCountAdd += a.value; break;
    case 'areaMul':      m.areaMul *= a.value; break;
    case 'moveSpeedMul': m.moveSpeedMul *= a.value; break;
    case 'pickupRadMul':
      m.pickupRadMul *= a.value;
      game.player.pickupRad *= a.value;
      break;
    case 'xpMul':        m.xpMul *= a.value; break;
    case 'maxHpAdd':
      game.player.maxHp += a.value;
      game.player.hp = game.player.maxHp;
      break;
    case 'cdMul':        m.cdMul *= a.value; break;
    case 'pierceAdd':    m.pierceAdd += a.value; break;
    case 'critBundle':   m.critChance += 0.15; m.critMult += 0.25; break;
    case 'projDmgMul':   m.projDmgMul *= a.value; break;
    case 'aoeDmgMul':    m.aoeDmgMul *= a.value; break;
    case 'bellExtra':    f.bellExtra += a.value; break;
    case 'dodgeChance':  m.dodgeChance += a.value; break;
    case 'flag_bloodtithe':  f.bloodtithe = true; break;
    case 'flag_echo':        f.echo = true; break;
    case 'flag_nightshade':  f.nightshade = true; break;
    case 'flag_ash':         f.ash = true; break;
    case 'flag_coldvow':     f.coldvow = true; break;
    case 'flag_lastlight':   f.lastlight = true; break;
  }
}

/* =============================================================
   FLOATS / UI HELPERS
   ============================================================= */
function pushFloat(x, y, text, color, life) {
  game.floats.push({ x, y, text, color: color || PAL.cream, life: life || 0.7 });
}

function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

/* =============================================================
   RENDERING
   ============================================================= */
function render() {
  // Clear
  ctx.fillStyle = PAL.bg0;
  ctx.fillRect(0, 0, W, H);

  // Tile floor (parallax against camera)
  const tileImg = SPRITES.tile;
  const ox = -Math.floor(game.cam.x % TILE) - TILE;
  const oy = -Math.floor(game.cam.y % TILE) - TILE;
  for (let y = oy; y < H + TILE; y += TILE) {
    for (let x = ox; x < W + TILE; x += TILE) {
      ctx.drawImage(tileImg, x, y);
    }
  }

  ctx.save();
  ctx.translate(W / 2 - game.cam.x, H / 2 - game.cam.y);

  // Pickup radius hint
  ctx.strokeStyle = 'rgba(255,184,74,0.15)';
  ctx.beginPath();
  ctx.arc(game.player.x, game.player.y, game.player.pickupRad, 0, Math.PI * 2);
  ctx.stroke();

  // Visible auras for Salt Circle / Frostlamp — scaled by level
  for (const w of game.player.weapons) {
    const def = WEAPONS[w.id];
    if (!def) continue;
    const isAura = def.type === 'aura' || def.type === 'aura_slow';
    if (!isAura) continue;
    const r = def.range * game.player.mods.areaMul;
    const lb = Math.max(0, (w.lvl - 1) / 7);
    const isFrost = def.type === 'aura_slow';
    const baseAlpha = 0.10 + lb * 0.18;
    // Soft fill
    ctx.save();
    ctx.fillStyle = isFrost
      ? `rgba(74,193,189,${baseAlpha})`
      : `rgba(243,208,163,${baseAlpha})`;
    ctx.beginPath();
    ctx.arc(game.player.x, game.player.y, r, 0, Math.PI * 2);
    ctx.fill();
    // Outline pulse
    const pulse = 0.5 + 0.5 * Math.sin(game.t * (isFrost ? 4 : 6));
    ctx.strokeStyle = isFrost
      ? `rgba(74,193,189,${0.45 + lb * 0.4 * pulse})`
      : `rgba(255,184,74,${0.45 + lb * 0.4 * pulse})`;
    ctx.lineWidth = 1 + Math.round(lb * 2);
    ctx.beginPath();
    ctx.arc(game.player.x, game.player.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // Inner runic ring at lvl 4+
    if (lb > 0.4) {
      ctx.strokeStyle = isFrost
        ? `rgba(232,227,214,${0.25 + lb * 0.25})`
        : `rgba(255,184,74,${0.25 + lb * 0.25})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(game.player.x, game.player.y, r * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // Ambient particles at lvl 5+
    if (lb > 0.5 && rand() < 0.3) {
      const a = rand() * Math.PI * 2;
      const rr = r * (0.7 + rand() * 0.3);
      game.particles.push({
        x: game.player.x + Math.cos(a) * rr,
        y: game.player.y + Math.sin(a) * rr,
        vx: -Math.cos(a) * 20, vy: -Math.sin(a) * 20,
        life: 0.4, color: isFrost ? PAL.teal : PAL.cream
      });
    }
  }

  // Pickups
  for (const p of game.pickups) {
    let img;
    if (p.kind === 'ember') img = SPRITES.pickup_ember;
    else if (p.kind === 'gold') img = SPRITES.pickup_gold;
    else if (p.kind === 'heart') img = SPRITES.pickup_heart;
    else if (p.kind === 'chest') img = SPRITES.pickup_chest;
    if (img) ctx.drawImage(img, Math.round(p.x - img.width / 2), Math.round(p.y - img.height / 2));
  }

  // Enemies
  for (const e of game.enemies) {
    // Lurker is invisible while burrowed
    if (e.type === 'lurker' && e.lurkPhase === 'burrow') continue;
    const img = e.boss ? SPRITES['boss_' + e.bossId] : SPRITES['enemy_' + e.type];
    // Wraith renders translucent
    const isPhase = (e.type === 'wraith');
    if (isPhase) ctx.globalAlpha = 0.55;
    if (img) {
      const w = img.width, h = img.height;
      if (e.elite) {
        ctx.save();
        ctx.drawImage(img, Math.round(e.x - w / 2), Math.round(e.y - h / 2));
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(255,107,61,0.35)';
        ctx.fillRect(Math.round(e.x - w / 2), Math.round(e.y - h / 2), w, h);
        ctx.restore();
      } else {
        ctx.drawImage(img, Math.round(e.x - w / 2), Math.round(e.y - h / 2));
      }
    } else {
      ctx.fillStyle = e.color;
      ctx.fillRect(Math.round(e.x - e.size / 2), Math.round(e.y - e.size / 2), e.size, e.size);
    }
    if (isPhase) ctx.globalAlpha = 1;
    // Boss HP bar
    if (e.boss) {
      ctx.fillStyle = PAL.bg0;
      ctx.fillRect(Math.round(e.x - 28), Math.round(e.y - e.size - 8), 56, 6);
      ctx.fillStyle = PAL.red;
      ctx.fillRect(Math.round(e.x - 28), Math.round(e.y - e.size - 8), Math.round(56 * (e.hp / e.maxHp)), 6);
      // Boss name above bar
      ctx.fillStyle = PAL.cream;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      const def = BOSSES[e.bossId];
      if (def) ctx.fillText(def.name, e.x, e.y - e.size - 12);
    }
  }

  // Bullets
  for (const b of game.bullets) {
    if (b.kind === 'ring') {
      const lb = lvlBoost(b);
      const stroke = 4 + Math.round(lb * 5);          // 4 → 9
      ctx.strokeStyle = b.color === PAL.amber
        ? `rgba(255,184,74,${0.55 + lb * 0.4})`
        : `rgba(201,138,171,${0.55 + lb * 0.4})`;
      ctx.lineWidth = stroke;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
      // Inner echo ring at lvl 4+
      if (lb > 0.4) {
        ctx.strokeStyle = `rgba(243,208,163,${0.3 + lb * 0.3})`;
        ctx.lineWidth = Math.max(1, stroke - 3);
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(4, b.r - 6 - lb * 4), 0, Math.PI * 2);
        ctx.stroke();
      }
      // Outer halo at lvl 7+
      if (lb > 0.7) {
        ctx.strokeStyle = `rgba(255,255,255,${0.2 + (lb - 0.7) * 0.6})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      continue;
    }
    if (b.kind === 'orbit') {
      const lb = lvlBoost(b);
      const sz = 3 + Math.round(lb * 3);              // 3 → 6 half-size
      const isCenser = b.burn > 0;
      // Outer halo
      if (lb > 0.2) {
        ctx.fillStyle = isCenser
          ? `rgba(255,107,61,${0.18 + lb * 0.18})`
          : `rgba(111,168,108,${0.18 + lb * 0.18})`;
        const halo = sz + 2 + Math.round(lb * 3);
        ctx.fillRect(Math.round(b.x - halo), Math.round(b.y - halo), halo * 2, halo * 2);
      }
      // Body
      ctx.fillStyle = isCenser ? PAL.orange : PAL.green;
      ctx.fillRect(Math.round(b.x - sz), Math.round(b.y - sz), sz * 2, sz * 2);
      // Bright core
      ctx.fillStyle = isCenser ? PAL.amber : PAL.cream;
      const core = Math.max(1, sz - 2);
      ctx.fillRect(Math.round(b.x - core), Math.round(b.y - core), core * 2, core * 2);
      // Lvl 6+: spark trail
      if (lb > 0.6 && rand() < 0.4) {
        game.particles.push({
          x: b.x, y: b.y,
          vx: randRange(-30, 30), vy: randRange(-30, 30),
          life: 0.25, color: isCenser ? PAL.amber : PAL.cream
        });
      }
      continue;
    }
    if (b.kind === 'beam') {
      const lb = lvlBoost(b);
      const len = 12 + Math.round(lb * 14);           // 12 → 26
      const thick = 4 + Math.round(lb * 4);           // 4 → 8
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.ang);
      // Outer halo
      if (lb > 0.3) {
        ctx.fillStyle = `rgba(255,184,74,${0.18 + lb * 0.22})`;
        ctx.fillRect(-len / 2 - 3, -thick / 2 - 2, len + 6, thick + 4);
      }
      // Body
      ctx.fillStyle = PAL.amber;
      ctx.fillRect(-len / 2, -thick / 2, len, thick);
      // Bright core
      ctx.fillStyle = PAL.cream;
      ctx.fillRect(-len / 4, -Math.max(1, thick / 2 - 1), len / 2, Math.max(2, thick - 2));
      // White-hot tip at lvl 6+
      if (lb > 0.6) {
        ctx.fillStyle = PAL.white;
        ctx.fillRect(len / 4, -1, len / 4, 2);
      }
      ctx.restore();
      // Spark trail at lvl 5+
      if (lb > 0.5 && rand() < 0.5) {
        game.particles.push({
          x: b.x - Math.cos(b.ang) * 6, y: b.y - Math.sin(b.ang) * 6,
          vx: randRange(-40, 40), vy: randRange(-40, 40),
          life: 0.2, color: PAL.amber
        });
      }
      continue;
    }
    if (b.kind === 'anvil') {
      const lb = lvlBoost(b);
      const w = 10 + Math.round(lb * 6);              // 10 → 16
      const h = 8 + Math.round(lb * 4);               // 8 → 12
      // Halo
      if (lb > 0.4) {
        ctx.fillStyle = `rgba(107,74,122,${0.25 + lb * 0.25})`;
        ctx.fillRect(Math.round(b.x - w / 2 - 2), Math.round(b.y - h / 2 - 2), w + 4, h + 4);
      }
      ctx.fillStyle = PAL.bg2;
      ctx.fillRect(Math.round(b.x - w / 2), Math.round(b.y - h / 2), w, h);
      ctx.fillStyle = PAL.mauve;
      ctx.fillRect(Math.round(b.x - w / 2 + 2), Math.round(b.y - h / 2), w - 4, 1);
      // Iron rim at lvl 5+
      if (lb > 0.5) {
        ctx.fillStyle = PAL.cream;
        ctx.fillRect(Math.round(b.x - w / 2), Math.round(b.y + h / 2 - 1), w, 1);
      }
      // Spark on the move at lvl 6+
      if (lb > 0.6 && rand() < 0.3) {
        game.particles.push({
          x: b.x, y: b.y,
          vx: randRange(-50, 50), vy: randRange(-50, 50),
          life: 0.3, color: PAL.amber
        });
      }
      continue;
    }
    if (b.kind === 'dagger') {
      const lb = lvlBoost(b);
      const len = 8 + Math.round(lb * 6);             // 8 → 14
      const thick = 2 + Math.round(lb * 2);           // 2 → 4
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.ang);
      // Halo
      if (lb > 0.3) {
        ctx.fillStyle = b.isCrit
          ? `rgba(255,184,74,${0.3 + lb * 0.3})`
          : `rgba(243,208,163,${0.2 + lb * 0.25})`;
        ctx.fillRect(-len / 2 - 2, -thick / 2 - 1, len + 4, thick + 2);
      }
      // Body
      ctx.fillStyle = b.color;
      ctx.fillRect(-len / 2, -thick / 2, len, thick);
      // Hilt
      ctx.fillStyle = PAL.bg2;
      ctx.fillRect(-len / 2 - 1, -thick / 2, 1, thick);
      // Bright spine at lvl 5+
      if (lb > 0.5) {
        ctx.fillStyle = b.isCrit ? PAL.white : PAL.amber;
        ctx.fillRect(-len / 2 + 1, 0, len - 2, 1);
      }
      ctx.restore();
      continue;
    }
    if (b.kind === 'homing') {
      const lb = lvlBoost(b);
      const len = 10 + Math.round(lb * 8);            // 10 → 18
      const thick = 4 + Math.round(lb * 3);           // 4 → 7
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.ang);
      // Halo
      if (lb > 0.3) {
        ctx.fillStyle = `rgba(74,193,189,${0.25 + lb * 0.3})`;
        ctx.fillRect(-len / 2 - 2, -thick / 2 - 2, len + 4, thick + 4);
      }
      ctx.fillStyle = PAL.teal;
      ctx.fillRect(-len / 2, -thick / 2, len, thick);
      ctx.fillStyle = PAL.cream;
      ctx.fillRect(len / 4, -1, len / 4, 2);
      // Lightning forks at lvl 6+
      if (lb > 0.6) {
        ctx.fillStyle = PAL.white;
        ctx.fillRect(-len / 4, -thick / 2 - 1, 2, thick + 2);
        ctx.fillRect( len / 8, -thick / 2 - 1, 2, thick + 2);
      }
      ctx.restore();
      // Spark trail at lvl 5+
      if (lb > 0.5 && rand() < 0.45) {
        game.particles.push({
          x: b.x - Math.cos(b.ang) * 4, y: b.y - Math.sin(b.ang) * 4,
          vx: randRange(-20, 20), vy: randRange(-20, 20),
          life: 0.3, color: PAL.teal
        });
      }
      continue;
    }
    if (b.kind === 'enemy_bolt') {
      ctx.fillStyle = b.color || PAL.green;
      ctx.fillRect(Math.round(b.x - 3), Math.round(b.y - 3), 6, 6);
      ctx.fillStyle = PAL.darkGreen;
      ctx.fillRect(Math.round(b.x - 1), Math.round(b.y - 1), 2, 2);
      continue;
    }
    if (b.kind === 'enemy_ring') {
      ctx.strokeStyle = 'rgba(214,61,46,0.7)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    if (b.kind === 'mortar') {
      const lb = lvlBoost(b);
      const sz = 4 + Math.round(lb * 4);              // 4 → 8 half
      const ay = b.arcY || 0;
      // Ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(Math.round(b.x - sz), Math.round(b.y - 1), sz * 2, 2);
      // Halo
      if (lb > 0.3) {
        ctx.fillStyle = `rgba(255,107,61,${0.25 + lb * 0.3})`;
        const halo = sz + 2;
        ctx.fillRect(Math.round(b.x - halo), Math.round(b.y + ay - halo), halo * 2, halo * 2);
      }
      ctx.fillStyle = b.color || PAL.orange;
      ctx.fillRect(Math.round(b.x - sz), Math.round(b.y + ay - sz), sz * 2, sz * 2);
      ctx.fillStyle = PAL.amber;
      ctx.fillRect(Math.round(b.x - sz / 2), Math.round(b.y + ay - sz / 2), sz, sz);
      // Bright core at lvl 5+
      if (lb > 0.5) {
        ctx.fillStyle = PAL.cream;
        ctx.fillRect(Math.round(b.x - 1), Math.round(b.y + ay - 1), 2, 2);
      }
      continue;
    }
    if (b.kind === 'whip') {
      const lb = lvlBoost(b);
      ctx.save();
      ctx.globalAlpha = Math.min(1, b.life * 8);
      // Halo at lvl 4+
      if (lb > 0.4) {
        ctx.fillStyle = `rgba(201,138,171,${0.25 + lb * 0.25})`;
        const padW = 6 + Math.round(lb * 6);
        const padH = 6;
        ctx.fillRect(Math.round(b.x - b.w / 2 - padW / 2), Math.round(b.y - b.h / 2 - padH / 2), b.w + padW, b.h + padH);
      }
      ctx.fillStyle = PAL.pink;
      ctx.fillRect(Math.round(b.x - b.w / 2), Math.round(b.y - b.h / 2), b.w, b.h);
      // Bright core stripe(s)
      ctx.fillStyle = PAL.cream;
      ctx.fillRect(Math.round(b.x - b.w / 2), Math.round(b.y - 1), b.w, 2);
      if (lb > 0.5) {
        ctx.fillStyle = PAL.white;
        ctx.fillRect(Math.round(b.x - b.w / 2), Math.round(b.y), b.w, 1);
      }
      ctx.restore();
      continue;
    }
    if (b.kind === 'bell') {
      const lb = lvlBoost(b);
      const ry = b.renderY || b.y;
      const w = 6 + Math.round(lb * 4);                // half-width: 6 → 10
      const h = 5 + Math.round(lb * 3);                // half-height: 5 → 8
      // Halo
      if (lb > 0.3) {
        ctx.fillStyle = `rgba(255,184,74,${0.25 + lb * 0.3})`;
        ctx.fillRect(Math.round(b.x - w - 2), Math.round(ry - h - 2), (w + 2) * 2, (h + 2) * 2);
      }
      // Shadow / target marker
      ctx.fillStyle = PAL.bg2;
      ctx.fillRect(Math.round(b.x - 1), Math.round(b.y - 1), 2, 2);
      // Bell body
      ctx.fillStyle = PAL.cream;
      ctx.fillRect(Math.round(b.x - w), Math.round(ry - h), w * 2, h * 2);
      ctx.fillStyle = PAL.amber;
      ctx.fillRect(Math.round(b.x - w + 2), Math.round(ry - h + 2), (w - 2) * 2, (h - 2) * 2);
      if (lb > 0.5) {
        ctx.fillStyle = PAL.white;
        ctx.fillRect(Math.round(b.x - 2), Math.round(ry - h + 2), 4, 2);
      }
      continue;
    }
    if (b.kind === 'boomerang') {
      const lb = lvlBoost(b);
      const arm = 6 + Math.round(lb * 5);              // 6 → 11
      const thick = 2 + Math.round(lb * 2);            // 2 → 4
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(game.t * (16 + lb * 14));             // spins faster too
      // Halo
      if (lb > 0.3) {
        ctx.fillStyle = `rgba(255,184,74,${0.2 + lb * 0.3})`;
        ctx.fillRect(-arm - 2, -2, (arm + 2) * 2, 4);
        ctx.fillRect(-2, -arm - 2, 4, (arm + 2) * 2);
      }
      ctx.fillStyle = PAL.amber;
      ctx.fillRect(-arm, -thick / 2, arm * 2, thick);
      ctx.fillRect(-thick / 2, -arm, thick, arm * 2);
      // Bright core at lvl 5+
      if (lb > 0.5) {
        ctx.fillStyle = PAL.cream;
        ctx.fillRect(-arm + 1, 0, arm * 2 - 2, 1);
        ctx.fillRect(0, -arm + 1, 1, arm * 2 - 2);
      }
      ctx.restore();
      // Trail at lvl 6+
      if (lb > 0.6 && rand() < 0.35) {
        game.particles.push({
          x: b.x, y: b.y,
          vx: randRange(-20, 20), vy: randRange(-20, 20),
          life: 0.3, color: PAL.amber
        });
      }
      continue;
    }
    if (b.kind === 'mine') {
      const lb = lvlBoost(b);
      const pulse = (Math.sin(game.t * 6) * 0.5 + 0.5);
      const sz = 5 + Math.round(lb * 3);              // 5 → 8 half
      // Halo
      if (lb > 0.3) {
        ctx.fillStyle = `rgba(255,107,61,${(0.15 + lb * 0.25) * (0.5 + pulse * 0.5)})`;
        const halo = sz + 4;
        ctx.fillRect(Math.round(b.x - halo), Math.round(b.y - halo), halo * 2, halo * 2);
      }
      ctx.fillStyle = PAL.bg2;
      ctx.fillRect(Math.round(b.x - sz), Math.round(b.y - sz), sz * 2, sz * 2);
      ctx.fillStyle = b.armed > 0 ? PAL.orange : PAL.red;
      ctx.globalAlpha = 0.6 + pulse * 0.4;
      ctx.fillRect(Math.round(b.x - 2), Math.round(b.y - 2), 4, 4);
      ctx.globalAlpha = 1;
      // Cross spikes at lvl 5+
      if (lb > 0.5) {
        ctx.fillStyle = PAL.cream;
        ctx.fillRect(Math.round(b.x - sz - 2), Math.round(b.y), 2, 1);
        ctx.fillRect(Math.round(b.x + sz),     Math.round(b.y), 2, 1);
        ctx.fillRect(Math.round(b.x), Math.round(b.y - sz - 2), 1, 2);
        ctx.fillRect(Math.round(b.x), Math.round(b.y + sz),     1, 2);
      }
      continue;
    }
    if (b.kind === 'zone') {
      const lb = lvlBoost(b);
      ctx.save();
      ctx.globalAlpha = 0.18 + lb * 0.18;
      ctx.fillStyle = PAL.cream;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.7 + lb * 0.3;
      ctx.strokeStyle = PAL.cream;
      ctx.lineWidth = 1 + Math.round(lb * 2);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
      // Inner runic ring at lvl 4+
      if (lb > 0.4) {
        ctx.strokeStyle = `rgba(255,184,74,${0.4 + lb * 0.3})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.7, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }
  }

  // Lurker burrow tells (a small dust patch where they'll surface)
  for (const e of game.enemies) {
    if (e.type === 'lurker' && e.lurkPhase === 'burrow' && e.lurkTimer < 0.6) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = PAL.bg2;
      ctx.fillRect(Math.round(e.x - 6), Math.round(e.y - 2), 12, 4);
      ctx.restore();
    }
    if (e.type === 'wraith') {
      // Render translucent over default
    }
    // Reaver dash telegraph
    if (e.type === 'reaver' && e.dashState === 'tell') {
      ctx.save();
      ctx.strokeStyle = PAL.red;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(game.player.x, game.player.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Player
  {
    const img = SPRITES['char_' + game.charDef.id];
    if (game.player.hurtFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(img, Math.round(game.player.x - img.width / 2), Math.round(game.player.y - img.height / 2));
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(214,61,46,0.6)';
      ctx.fillRect(Math.round(game.player.x - img.width / 2), Math.round(game.player.y - img.height / 2), img.width, img.height);
      ctx.restore();
    } else {
      ctx.drawImage(img, Math.round(game.player.x - img.width / 2), Math.round(game.player.y - img.height / 2));
    }
  }

  // Particles
  for (const p of game.particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
  }

  // Float text
  ctx.font = '10px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';
  for (const f of game.floats) {
    ctx.fillStyle = f.color;
    ctx.globalAlpha = Math.min(1, f.life * 1.6);
    ctx.fillText(f.text, Math.round(f.x), Math.round(f.y));
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Subtle vignette
  const grd = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 480);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  drawMinimap();
}

function drawMinimap() {
  const w = mini.width, h = mini.height;
  mctx.fillStyle = PAL.bg0;
  mctx.fillRect(0, 0, w, h);
  const scale = 0.06;
  // enemies
  for (const e of game.enemies) {
    const x = w / 2 + (e.x - game.player.x) * scale;
    const y = h / 2 + (e.y - game.player.y) * scale;
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    mctx.fillStyle = e.boss ? PAL.amber : (e.elite ? PAL.orange : PAL.red);
    mctx.fillRect(x, y, e.boss ? 3 : 2, e.boss ? 3 : 2);
  }
  // pickups (chests only)
  for (const p of game.pickups) {
    if (p.kind !== 'chest') continue;
    const x = w / 2 + (p.x - game.player.x) * scale;
    const y = h / 2 + (p.y - game.player.y) * scale;
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    mctx.fillStyle = PAL.cream;
    mctx.fillRect(x - 1, y - 1, 3, 3);
  }
  // player
  mctx.fillStyle = PAL.amber;
  mctx.fillRect(w / 2 - 1, h / 2 - 1, 3, 3);
}

/* =============================================================
   DOM HUD
   ============================================================= */
function updateHUD() {
  if (!game.player) return;
  const hpFill = document.getElementById('hp-fill');
  hpFill.style.width = Math.max(0, (game.player.hp / game.player.maxHp) * 100) + '%';
  document.getElementById('hp-text').textContent = `${Math.ceil(game.player.hp)} / ${Math.ceil(game.player.maxHp)}`;
  document.getElementById('xp-fill').style.width = ((game.player.xp / game.player.xpToNext) * 100) + '%';
  document.getElementById('lvl-text').textContent = game.player.level;
  document.getElementById('run-time').textContent = fmtTime(game.t);
  document.getElementById('ember-count').textContent = game.emberCount;
  document.getElementById('kill-count').textContent = game.killCount;

  // Weapon icons
  const wRow = document.getElementById('weapons-row');
  const aRow = document.getElementById('artifacts-row');
  if (wRow.dataset.sig !== weaponSig()) {
    wRow.innerHTML = '';
    for (const w of game.player.weapons) {
      const def = WEAPONS[w.id];
      const el = document.createElement('div');
      let cls = 'icon';
      if (w.lvl >= 8)      cls += ' lvl-max';
      else if (w.lvl >= 6) cls += ' lvl-high';
      else if (w.lvl >= 4) cls += ' lvl-mid';
      el.className = cls;
      el.innerHTML = `${def.icon}<span class="lvl-pip">${w.lvl}</span>`;
      el.title = def.name + ' Lv ' + w.lvl;
      wRow.appendChild(el);
    }
    wRow.dataset.sig = weaponSig();
  }
  if (aRow.dataset.sig !== artifactSig()) {
    aRow.innerHTML = '';
    for (const a of game.player.artifacts) {
      const def = ARTIFACTS[a.id];
      const el = document.createElement('div');
      el.className = 'icon';
      el.textContent = def.name[0];
      el.title = def.name + ' — ' + def.desc;
      aRow.appendChild(el);
    }
    aRow.dataset.sig = artifactSig();
  }
}
function weaponSig()  { return game.player.weapons.map(w => w.id + w.lvl).join(','); }
function artifactSig(){ return game.player.artifacts.map(a => a.id).join(','); }

function showCardOverlay(cards) {
  const root = document.getElementById('cards');
  root.innerHTML = '';
  cards.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'card rarity-' + (c.rarity || 'C');
    el.innerHTML = `
      <div class="card-tag">${c.tag}</div>
      <div class="card-name">${c.title}</div>
      <div class="card-desc">${c.desc}</div>
      <span class="card-key">[${i + 1}]</span>`;
    el.onclick = () => pickCard(i);
    root.appendChild(el);
  });
  showOverlay('card-overlay');
}

function showOverlay(id) { document.getElementById(id).classList.remove('hidden'); }
function hideOverlay(id) { document.getElementById(id).classList.add('hidden'); }

function togglePause() {
  if (!game.running || game.cardOpen || game.ended) return;
  game.paused = !game.paused;
  if (game.paused) showOverlay('pause-overlay');
  else hideOverlay('pause-overlay');
}

/* =============================================================
   TITLE / META SHOP / CHARACTER SELECT
   ============================================================= */
function isCharUnlocked(ch) {
  const u = ch.unlock || {};
  if (u.type === 'default') return true;
  if (u.type === 'survive') return !!meta.wyck5min;
  if (u.type === 'level')   return (meta.maxLevel || 0) >= u.value;
  if (u.type === 'kill_boss') return !!(meta.bossesKilled && meta.bossesKilled[u.boss]);
  if (u.type === 'no_damage') return !!meta.noDamage60;
  if (u.type === 'shards_spent') return (meta.shardsSpent || 0) >= u.value;
  return false;
}

function buildTitleScreen() {
  document.getElementById('shard-balance').textContent = '★ ' + meta.shards;

  // Character cards
  const cs = document.getElementById('char-select');
  cs.innerHTML = '';
  CHARACTERS.forEach((ch, i) => {
    const def = WEAPONS[ch.starter];
    const unlocked = isCharUnlocked(ch);
    const el = document.createElement('div');
    el.className = 'card rarity-C' + (unlocked ? '' : ' locked');
    if (unlocked) {
      el.innerHTML = `
        <div class="card-tag">Character</div>
        <div class="card-name">${ch.name}</div>
        <div class="card-desc">
          <em>${ch.flavor}</em><br>
          Starter: <b>${def.name}</b><br>
          Passive: ${describePassive(ch.passive)}
        </div>
        <span class="card-key">START</span>`;
      el.onclick = () => startRun(ch.id);
    } else {
      el.innerHTML = `
        <div class="card-tag">Locked</div>
        <div class="card-name">${ch.name}</div>
        <div class="card-desc">
          <em>${ch.flavor}</em><br>
          Unlock: <b>${ch.unlock.hint}</b>
        </div>
        <span class="card-key">🔒</span>`;
      el.style.opacity = '0.45';
      el.style.cursor = 'not-allowed';
    }
    cs.appendChild(el);
  });

  // Shop
  const shop = document.getElementById('shop');
  shop.innerHTML = '';
  for (const def of SHOP_DEFS) {
    const tier = meta.upgrades[def.id];
    const cost = def.costFn(tier);
    const maxed = tier >= def.max;
    const el = document.createElement('div');
    el.className = 'shop-item' + (maxed ? ' maxed' : '');
    el.innerHTML = `
      <span class="shop-name">${def.name} <span class="shop-cost">${maxed ? 'MAX' : '★ ' + cost}</span></span>
      <span class="shop-stat">${def.stat}</span><br>
      <small>Tier ${tier} / ${def.max}</small>`;
    el.onclick = () => {
      if (maxed) return;
      if (meta.shards < cost) { flash(el); return; }
      meta.shards -= cost;
      meta.upgrades[def.id]++;
      meta.shardsSpent = (meta.shardsSpent || 0) + cost;
      saveMeta();
      buildTitleScreen();
    };
    shop.appendChild(el);
  }
}

function describePassive(p) {
  if (p.type === 'pickup_radius') return `+${(p.value * 100) | 0}% pickup radius`;
  if (p.type === 'weapon_area')   return `+${(p.value * 100) | 0}% weapon area`;
  if (p.type === 'damage')        return `+${(p.value * 100) | 0}% damage, −${(p.speedPenalty * 100) | 0}% move speed`;
  if (p.type === 'contact_aura')  return `Contact aura: ${p.value} DPS to touching foes`;
  if (p.type === 'phase_iframe')  return `Brief invuln every ${p.every || 8}s`;
  if (p.type === 'crit_lifesteal') return `Crits heal +${p.heal} HP (cap ${p.capPerSec}/s)`;
  return '—';
}

function flash(el) {
  el.style.transition = 'background 80ms';
  const old = el.style.background;
  el.style.background = PAL.red;
  setTimeout(() => { el.style.background = old; }, 120);
}

/* =============================================================
   MAIN LOOP
   ============================================================= */
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.running) {
    update(dt);
    render();
    updateHUD();
  }
  requestAnimationFrame(loop);
}

/* =============================================================
   BOOT
   ============================================================= */
buildSprites();
buildTitleScreen();

document.getElementById('hud').style.visibility = 'hidden';
document.getElementById('resume-btn').onclick = togglePause;
document.getElementById('quit-btn').onclick = () => {
  hideOverlay('pause-overlay');
  endRun(false);
};
document.getElementById('end-btn').onclick = () => {
  hideOverlay('end-overlay');
  document.getElementById('hud').style.visibility = 'hidden';
  buildTitleScreen();
  showOverlay('title-overlay');
};

requestAnimationFrame(loop);

// Expose for tinkering in DevTools
window.Emberfall = { game, WEAPONS, ENEMIES, ARTIFACTS, CHARACTERS, meta, seedRng };

})();
