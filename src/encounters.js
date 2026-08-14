// ============================================================
// 奇遇系统:散布荒野的可交互事件
// ============================================================
import { sfx } from './sfx.js';

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export const ENCOUNTERS = {
  // ---------------- 宝箱 ----------------
  chest: {
    tex: 'chest', w: 2.2, h: 2.2, label: '打开 宝箱',
    interact(game, node) {
      sfx.open();
      const roll = Math.random();
      if (roll < 0.18) {
        // 宝箱怪!
        game.toast('这是一只宝箱怪!!', 'bad');
        sfx.bad();
        game.spawnEnemiesAround(node.pos, 'spider', 3, 2.5);
        game.shake(0.4);
      } else if (roll < 0.5) {
        const g = 30 + Math.floor(Math.random() * 50);
        game.addGold(g);
        game.toast(`宝箱里有 ${g} 金币!`, 'gold');
      } else if (roll < 0.75) {
        game.heal(80);
        game.toast('宝箱里藏着一瓶陈年蜜酒,恢复 80 生命!', 'good');
        sfx.potion();
      } else {
        const buffs = [
          () => { game.player.bonusAd += 8; game.toast('拾获「磨刀石」:攻击力 +8!', 'good'); },
          () => { game.addMaxHp(40); game.toast('拾获「硬化甲片」:生命上限 +40!', 'good'); },
          () => { game.player.moveSpeedMul += 0.08; game.toast('拾获「轻羽鞋垫」:移速 +8%!', 'good'); },
          () => { game.player.cdr = Math.min(0.4, game.player.cdr + 0.08); game.toast('拾获「怀旧沙漏」:冷却缩减 +8%!', 'good'); },
        ];
        pick(buffs)();
        sfx.good();
      }
      game.consumeEncounter(node);
    },
  },

  // ---------------- 神秘商人 ----------------
  merchant: {
    tex: 'merchant', w: 2.6, h: 3.7, label: '交谈 神秘商人',
    persistent: true,
    interact(game, node) {
      node.stock = node.stock || {};
      const goods = [
        { id: 'hp', name: '治疗药剂', sub: '立即恢复 100 生命', base: 30, act: () => { game.heal(100); sfx.potion(); } },
        { id: 'mp', name: '法力药剂', sub: '立即恢复 80 法力', base: 25, act: () => { game.restoreMp(80); sfx.potion(); } },
        { id: 'ad', name: '攻击之刃', sub: '攻击力永久 +12', base: 70, act: () => { game.player.bonusAd += 12; sfx.good(); } },
        { id: 'vit', name: '守护符文', sub: '生命上限永久 +60', base: 65, act: () => { game.addMaxHp(60); sfx.good(); } },
        { id: 'boot', name: '疾行之靴', sub: '移动速度永久 +10%', base: 60, act: () => { game.player.moveSpeedMul += 0.1; sfx.good(); } },
      ];
      const choices = goods.map(g => {
        const bought = node.stock[g.id] || 0;
        const price = Math.floor(g.base * Math.pow(1.35, bought));
        return {
          label: `${g.name} — ${price} 金币`,
          sub: g.sub,
          disabled: game.player.gold < price,
          keepOpen: true,
          action() {
            game.addGold(-price);
            node.stock[g.id] = bought + 1;
            g.act();
            game.toast(`购入 ${g.name}!`, 'gold');
            ENCOUNTERS.merchant.interact(game, node); // 刷新价格
          },
        };
      });
      choices.push({ label: '离开', sub: '「路上小心,黑夜可不长眼。」', action() {} });
      game.openDialog('神秘商人', '斗篷下的家伙提着灯,压低嗓音:「旅人,看看货?都是荒野里淘来的稀罕玩意……」', choices);
    },
  },

  // ---------------- 远古祭坛 ----------------
  altar: {
    tex: 'altar', w: 2.8, h: 3.6, label: '触摸 远古祭坛',
    interact(game, node) {
      const blessings = [
        { label: '汲取「狂怒」', sub: '攻击力永久 +15', act: () => { game.player.bonusAd += 15; } },
        { label: '汲取「磐石」', sub: '生命上限永久 +80', act: () => game.addMaxHp(80) },
        { label: '汲取「湍流」', sub: '技能冷却永久缩减 10%', act: () => { game.player.cdr = Math.min(0.4, game.player.cdr + 0.1); } },
        { label: '汲取「嗜血」', sub: '获得 6% 生命偷取', act: () => { game.player.lifesteal += 0.06; } },
      ];
      const opts = blessings.sort(() => Math.random() - 0.5).slice(0, 3).map(b => ({
        label: b.label, sub: b.sub + ' · 代价:献祭 25% 当前生命',
        action() {
          const cost = Math.floor(game.player.hp * 0.25);
          game.damagePlayerRaw(cost);
          b.act();
          sfx.good();
          game.toast('祭坛的符文亮起,力量涌入你的身体!', 'good');
          game.consumeEncounter(node);
        },
      }));
      opts.push({ label: '默默离开', sub: '低语声在你身后渐渐消散……', action() {} });
      game.openDialog('远古祭坛', '布满紫色符文的石坛嗡嗡作响,古老的低语钻进你的脑海:「献上血肉,换取力量……」', opts);
    },
  },

  // ---------------- 许愿池 ----------------
  well: {
    tex: 'well', w: 2.8, h: 2.8, label: '许愿 幽光之井',
    persistent: true,
    interact(game, node) {
      game.openDialog('幽光之井', '井水泛着幽幽蓝光,似乎在期待着什么。传说向它投入金币,会有意想不到的回应……', [
        {
          label: '投入 25 金币许愿', sub: '会发生什么呢?',
          disabled: game.player.gold < 25,
          action() {
            game.addGold(-25);
            const roll = Math.random();
            if (roll < 0.3) { game.heal(9999); game.toast('一道暖流涌遍全身 —— 生命完全恢复!', 'good'); sfx.good(); }
            else if (roll < 0.5) { const g = 50 + Math.floor(Math.random() * 100); game.addGold(g); game.toast(`井底喷出金币雨!获得 ${g} 金币!`, 'gold'); sfx.gold(); }
            else if (roll < 0.7) { game.addTempBuff('wish', { adMul: 1.3, speedMul: 1.15 }, 45); game.toast('幽蓝的祝福附体:45 秒内攻击 +30%、移速 +15%!', 'good'); sfx.good(); }
            else if (roll < 0.85) { game.restoreMp(9999); game.player.resetCooldowns(); game.toast('技能冷却全部刷新,法力涌泉而出!', 'good'); sfx.frost(); }
            else { game.toast('井里传来一声蛙鸣……什么都没有发生。', 'bad'); sfx.bad(); }
          },
        },
        { label: '离开', sub: '还是攒着钱吧。', action() {} },
      ]);
    },
  },

  // ---------------- 试炼石碑 ----------------
  obelisk: {
    tex: 'obelisk', w: 2.4, h: 4, label: '挑战 试炼石碑',
    interact(game, node) {
      game.openDialog('试炼石碑', '血红色的符文构成一行古字:「勇者啊,在 25 秒内于此地存活,荒野将赐予你厚礼。」', [
        {
          label: '接受试炼', sub: '怪物将从四面八方涌来!',
          action() {
            game.startTrial(node);
          },
        },
        { label: '暂不挑战', sub: '石碑的红光暗了下去。', action() {} },
      ]);
    },
  },
};

// 随机地图奇遇的分布配置
export const ENCOUNTER_LAYOUT = [
  { type: 'merchant', count: 1, minR: 18, maxR: 26 },
  { type: 'chest', count: 5, minR: 25, maxR: 85 },
  { type: 'altar', count: 2, minR: 35, maxR: 80 },
  { type: 'well', count: 1, minR: 30, maxR: 60 },
  { type: 'obelisk', count: 2, minR: 40, maxR: 85 },
];
