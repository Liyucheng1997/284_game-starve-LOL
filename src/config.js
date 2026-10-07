// ============================================================
// MOBA 配置:地图布局 / 单位数值 / 装备 / 难度
// 坐标系:x 向右,z 向下(小地图同向)。蓝方(玩家)在左下,红方在右上。
// ============================================================

export const MAP_HALF = 100;           // 地图半边长
export const PLAY_HALF = 96;           // 可活动范围
export const WAVE_INTERVAL = 30;       // 兵线间隔(秒)
export const FIRST_WAVE = 15;          // 第一波出兵时间
export const DAY_LENGTH = 240;         // 昼夜周期(秒)
export const SHOP_RANGE = 20;          // 泉水商店范围
export const FOUNTAIN_RANGE = 13;      // 泉水回血/激光范围
export const RECALL_TIME = 6;          // 回城读条
export const MAX_LEVEL = 18;
export const BARON_FIRST = 420;        // 树精巨人首次刷新
export const BARON_RESPAWN = 300;

export const BASES = {
  blue: { nexus: [-74, 74], fountain: [-91, 91] },
  red: { nexus: [74, -74], fountain: [91, -91] },
};

// 兵线路径(从蓝方基地到红方基地)
export const LANES = {
  top: [[-76, 76], [-80, 58], [-80, -70], [-70, -80], [58, -80], [76, -76]],
  mid: [[-76, 76], [76, -76]],
  bot: [[-76, 76], [-58, 80], [70, 80], [80, 70], [80, -58], [76, -76]],
};
export const LANE_NAMES = { top: '上路', mid: '中路', bot: '下路' };

// 防御塔(tier 1 外塔,2 内塔)。红方坐标为蓝方中心对称
const BLUE_TOWERS = [
  { lane: 'top', tier: 1, pos: [-80, -12] }, { lane: 'top', tier: 2, pos: [-80, 28] },
  { lane: 'mid', tier: 1, pos: [-24, 24] }, { lane: 'mid', tier: 2, pos: [-46, 46] },
  { lane: 'bot', tier: 1, pos: [12, 80] }, { lane: 'bot', tier: 2, pos: [-28, 80] },
];
const MIRROR_LANE = { top: 'bot', mid: 'mid', bot: 'top' };
export const TOWERS = [
  ...BLUE_TOWERS.map(t => ({ ...t, team: 'blue' })),
  ...BLUE_TOWERS.map(t => ({ team: 'red', lane: MIRROR_LANE[t.lane], tier: t.tier, pos: [-t.pos[0], -t.pos[1]] })),
];

// 野怪营地(蓝方半区,红方中心对称)
const BLUE_CAMPS = [
  { id: 'blueBuff', name: '冰霜猎犬王', mobs: ['icehound'], pos: [-50, 10], respawn: 120 },
  { id: 'redBuff', name: '火焰猎犬王', mobs: ['firehound'], pos: [-10, 50], respawn: 120 },
  { id: 'spiderA', name: '蜘蛛巢', mobs: ['spiderwarrior', 'spiderling', 'spiderling'], pos: [-60, 30], respawn: 75 },
  { id: 'spiderB', name: '蜘蛛巢', mobs: ['spiderwarrior', 'spiderling', 'spiderling'], pos: [-30, 60], respawn: 75 },
  { id: 'houndA', name: '猎犬丘', mobs: ['wildhound', 'wildhound'], pos: [-36, -6], respawn: 90 },
  { id: 'houndB', name: '猎犬丘', mobs: ['wildhound', 'wildhound'], pos: [6, 36], respawn: 90 },
];
export const CAMPS = [
  ...BLUE_CAMPS.map(c => ({ ...c, id: 'b_' + c.id })),
  ...BLUE_CAMPS.map(c => ({ ...c, id: 'r_' + c.id, pos: [-c.pos[0], -c.pos[1]] })),
  { id: 'tentacles', name: '触手沼泽', mobs: ['tentacle', 'tentacle', 'tentacle'], pos: [38, 38], respawn: 100, spread: 4.5 },
];
export const BARON_POS = [-38, -38];

// ---------------- 单位数值 ----------------
// 小兵:hp/dmg 随波次成长
export const MINIONS = {
  blue: {
    melee: { tex: 'pig_melee', name: '猪人卫兵', w: 2.0, h: 2.6, r: 0.8, hp: 230, dmg: 12, atkCd: 1.25, reach: 2.3, speed: 4.0, gold: 21, xp: 32 },
    ranged: { tex: 'pig_ranged', name: '猪人火把手', w: 2.0, h: 2.6, r: 0.8, hp: 165, dmg: 20, atkCd: 1.6, reach: 7.5, speed: 4.0, gold: 15, xp: 26, ranged: 0xf6a03a },
    siege: { tex: 'beefalo', name: '皮弗娄牛', w: 3.4, h: 3.2, r: 1.3, hp: 560, dmg: 34, atkCd: 2.0, reach: 2.8, speed: 3.7, gold: 55, xp: 65, siege: true },
  },
  red: {
    melee: { tex: 'spider', name: '暗影蜘蛛', w: 2.2, h: 2.2, r: 0.8, hp: 230, dmg: 12, atkCd: 1.25, reach: 2.3, speed: 4.0, gold: 21, xp: 32 },
    ranged: { tex: 'shadow', name: '暗影术士', w: 2.2, h: 2.4, r: 0.8, hp: 165, dmg: 20, atkCd: 1.6, reach: 7.5, speed: 4.0, gold: 15, xp: 26, ranged: 0x9a6ad0 },
    siege: { tex: 'hound', name: '暗影猎犬', w: 3.0, h: 3.0, r: 1.2, hp: 560, dmg: 34, atkCd: 2.0, reach: 2.8, speed: 3.7, gold: 55, xp: 65, siege: true },
  },
};

export const STRUCTURES = {
  tower1: { name: '防御塔', hp: 2600, armor: 40, range: 13, atkCd: 1.0, gold: 250, teamGold: 80, xp: 150 },
  tower2: { name: '内塔', hp: 3200, armor: 50, range: 13, atkCd: 1.0, gold: 300, teamGold: 100, xp: 200 },
  nexus: { name: '基地水晶', hp: 5000, armor: 30, range: 12, atkCd: 1.2, gold: 0, teamGold: 0, xp: 0 },
};

// 野怪
export const MONSTERS = {
  spiderling: { tex: 'spider', name: '小蜘蛛', w: 1.8, h: 1.8, r: 0.7, hp: 300, dmg: 14, atkCd: 1.2, reach: 2.2, speed: 4.6, gold: 18, xp: 40, armor: 8 },
  spiderwarrior: { tex: 'spider', name: '蜘蛛战士', w: 2.9, h: 2.9, r: 1.0, hp: 650, dmg: 24, atkCd: 1.3, reach: 2.6, speed: 4.6, gold: 45, xp: 90, armor: 15, tint: [1, 0.7, 0.55] },
  wildhound: { tex: 'hound', name: '猎犬', w: 2.6, h: 2.6, r: 1.0, hp: 480, dmg: 20, atkCd: 1.1, reach: 2.6, speed: 5.4, gold: 35, xp: 70, armor: 12 },
  firehound: { tex: 'hound', name: '火焰猎犬王', w: 3.6, h: 3.6, r: 1.3, hp: 1400, dmg: 34, atkCd: 1.3, reach: 3, speed: 5, gold: 90, xp: 180, armor: 20, tint: [1, 0.5, 0.35], buff: 'red' },
  icehound: { tex: 'hound', name: '冰霜猎犬王', w: 3.6, h: 3.6, r: 1.3, hp: 1400, dmg: 30, atkCd: 1.3, reach: 3, speed: 5, gold: 90, xp: 180, armor: 20, tint: [0.5, 0.75, 1], buff: 'blue' },
  tentacle: { tex: 'tentacle', name: '触手', w: 2.6, h: 4.2, r: 1.1, hp: 700, dmg: 45, atkCd: 1.6, reach: 4.6, speed: 0, gold: 40, xp: 80, armor: 20, static: true, hazard: true },
  treeguard: { tex: 'treeguard', name: '树精巨人', w: 6.5, h: 9, r: 2.2, hp: 5200, dmg: 80, atkCd: 2.0, reach: 5, speed: 3, gold: 250, xp: 500, armor: 40, boss: true, buff: 'baron' },
};

// 增益效果
export const BUFFS = {
  red: { name: '炎魔之心', dur: 90, color: '#e0603a', desc: '普攻灼烧并减速敌人' },
  blue: { name: '冰霜之心', dur: 90, color: '#5a9ad0', desc: '冷却缩减 +15%,法力回复 ×3' },
  baron: { name: '树精祝福', dur: 150, color: '#8fd06c', desc: '攻击 +30,回复加快,附近小兵强化' },
};

// ---------------- 装备 ----------------
export const ITEMS = {
  flint: { name: '燧石小刀', cost: 350, ad: 12, desc: '+12 攻击力' },
  logsuit: { name: '木甲', cost: 450, hp: 150, armor: 12, desc: '+150 生命 · +12 护甲' },
  cane: { name: '步行手杖', cost: 550, speed: 0.12, desc: '+12% 移动速度' },
  spear: { name: '战斗长矛', cost: 950, ad: 25, crit: 0.1, desc: '+25 攻击 · +10% 暴击' },
  football: { name: '猪皮头盔', cost: 950, hp: 260, armor: 22, desc: '+260 生命 · +22 护甲' },
  iceamulet: { name: '寒冰护符', cost: 1000, mp: 200, cdr: 0.15, mpRegen: 3, desc: '+200 法力 · 15% 冷却缩减' },
  firestaff: { name: '火焰法杖', cost: 1500, ad: 38, cdr: 0.1, desc: '+38 攻击 · 10% 冷却缩减' },
  hambat: { name: '火腿棒', cost: 1600, ad: 40, lifesteal: 0.12, desc: '+40 攻击 · 12% 生命偷取' },
  marble: { name: '大理石甲', cost: 1900, hp: 480, armor: 48, speed: -0.04, desc: '+480 生命 · +48 护甲 · 略微减速' },
  crown: { name: '铥矿皇冠', cost: 2300, hp: 350, armor: 35, cdr: 0.1, desc: '+350 生命 · +35 护甲 · 受击时获得 200 护盾(20 秒冷却)' },
  darksword: { name: '暗夜剑', cost: 2700, ad: 72, crit: 0.15, desc: '+72 攻击 · +15% 暴击' },
  lifeamulet: { name: '重生护符', cost: 2800, hp: 300, ad: 20, desc: '+300 生命 · +20 攻击 · 阵亡时原地复活一次(护符碎裂)' },
};
export const POTION = { name: '治疗药膏', cost: 50, max: 5, heal: 180, dur: 10 };
export const MAX_ITEMS = 6;

// ---------------- 难度 ----------------
export const DIFFICULTY = {
  easy: { name: '新手', desc: '敌方英雄伤害 -25%,反应慢', aiDmg: 0.75, aiGold: 0.8, think: 0.45, castChance: 0.45, aggro: 0.8 },
  normal: { name: '老手', desc: '标准对局', aiDmg: 1.0, aiGold: 1.0, think: 0.25, castChance: 0.8, aggro: 1.0 },
  hard: { name: '噩梦', desc: '敌方伤害 +20%、经济 +30%,凶狠越塔', aiDmg: 1.2, aiGold: 1.3, think: 0.14, castChance: 1.0, aggro: 1.25 },
};

// ---------------- 工具 ----------------
export function laneLength(path) {
  let L = 0;
  for (let i = 0; i < path.length - 1; i++) L += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
  return L;
}

// 沿路径距离 s 处的点
export function pointAt(path, s) {
  if (s <= 0) return { x: path[0][0], z: path[0][1] };
  for (let i = 0; i < path.length - 1; i++) {
    const [x1, z1] = path[i], [x2, z2] = path[i + 1];
    const seg = Math.hypot(x2 - x1, z2 - z1);
    if (s <= seg) return { x: x1 + (x2 - x1) * s / seg, z: z1 + (z2 - z1) * s / seg };
    s -= seg;
  }
  const last = path[path.length - 1];
  return { x: last[0], z: last[1] };
}

// 点在路径上的投影:返回 { s, d }(沿路距离, 到路径的垂直距离)
export function projectOnPath(path, x, z) {
  let best = { s: 0, d: Infinity }, acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [x1, z1] = path[i], [x2, z2] = path[i + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const seg = Math.hypot(dx, dz);
    let t = ((x - x1) * dx + (z - z1) * dz) / (seg * seg);
    t = Math.max(0, Math.min(1, t));
    const px = x1 + dx * t, pz = z1 + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { s: acc + seg * t, d };
    acc += seg;
  }
  return best;
}
