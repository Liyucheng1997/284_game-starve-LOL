// ============================================================
// 英雄定义:三名英雄,LOL 式 Q/W/E/R 技能(R 六级解锁)
// cast(game, lvl) 调用 game 提供的战斗接口
// ============================================================
import { sfx } from './sfx.js';

export const HEROES = {
  mage: {
    id: 'mage',
    name: '灰烬法师 · 薇洛',
    role: '远程 · 法术爆发',
    desc: '烧穿黑夜的流浪法师',
    stats: {
      maxHp: 300, maxMp: 220, hpRegen: 1.2, mpRegen: 5.5,
      moveSpeed: 6.2, attackDamage: 22, attackRange: 16,
      attackCooldown: 0.62, attackType: 'ranged', critChance: 0.05,
    },
    skills: [
      {
        key: 'Q', icon: 'fireball', name: '烈焰火球', maxLevel: 5,
        desc: '掷出爆裂火球,命中后小范围溅射',
        cooldown: l => 3.2 - l * 0.25, mana: l => 20 + l * 4,
        cast(game, l) {
          sfx.fireball();
          game.spawnProjectile({
            speed: 26, radius: 0.5, color: 0xf6892a, trail: 0xf6a03a,
            damage: 30 + l * 18 + game.player.bonusAd * 0.6, aoe: 3.2,
          });
        },
      },
      {
        key: 'E', icon: 'frostnova', name: '冰霜新星', maxLevel: 5,
        desc: '冻结周围敌人,造成伤害并大幅减速',
        cooldown: l => 9 - l * 0.5, mana: l => 35 + l * 5,
        cast(game, l) {
          sfx.frost();
          game.fx.ring(game.playerPos(), 7, 0x9ad8f0);
          game.aoeDamage(game.playerPos(), 7, 25 + l * 14 + game.player.bonusAd * 0.4, { slow: { factor: 0.4, dur: 2.5 + l * 0.3 } });
        },
      },
      {
        key: 'Shift', icon: 'blink', name: '奥术闪现', maxLevel: 5,
        desc: '向前方瞬移一段距离',
        cooldown: l => 12 - l * 1.2, mana: l => 30,
        cast(game, l) {
          sfx.blink();
          game.blinkPlayer(7 + l * 1);
        },
      },
      {
        key: 'R', icon: 'meteor', name: '焚天陨星', maxLevel: 3,
        desc: '召唤陨石轰击视线落点,大范围毁灭',
        cooldown: l => 45 - l * 8, mana: l => 80,
        cast(game, l) {
          const p = game.aimGroundPoint(20);
          game.scheduleMeteor(p, 0.9, 6.5, 120 + l * 80 + game.player.bonusAd);
        },
      },
    ],
  },

  warrior: {
    id: 'warrior',
    name: '荒野战士 · 布洛克',
    role: '近战 · 坦克战士',
    desc: '扛着巨斧的荒原不倒翁',
    stats: {
      maxHp: 480, maxMp: 140, hpRegen: 3.5, mpRegen: 3,
      moveSpeed: 5.8, attackDamage: 34, attackRange: 3.4,
      attackCooldown: 0.85, attackType: 'melee', critChance: 0.08,
      damageReduction: 0.12,
    },
    skills: [
      {
        key: 'Q', icon: 'cleave', name: '裂地重斩', maxLevel: 5,
        desc: '挥出巨斧,顺劈前方所有敌人',
        cooldown: l => 4.5 - l * 0.3, mana: l => 18 + l * 3,
        cast(game, l) {
          sfx.swing();
          game.fx.slash(0xe8cf9a);
          game.meleeCone(5.2, Math.PI * 0.5, 40 + l * 22 + game.player.bonusAd, { knock: 3 });
        },
      },
      {
        key: 'E', icon: 'warcry', name: '战地怒吼', maxLevel: 5,
        desc: '获得护盾,并震慑减速周围敌人',
        cooldown: l => 14 - l * 0.8, mana: l => 30,
        cast(game, l) {
          sfx.shield();
          game.addShield(45 + l * 25, 5);
          game.fx.ring(game.playerPos(), 6, 0xe0b83a);
          game.aoeDamage(game.playerPos(), 6, 10, { slow: { factor: 0.55, dur: 2 } });
        },
      },
      {
        key: 'Shift', icon: 'charge', name: '蛮牛冲锋', maxLevel: 5,
        desc: '向前猛冲,撞飞沿途敌人',
        cooldown: l => 11 - l * 0.9, mana: l => 25,
        cast(game, l) {
          sfx.dash();
          game.dashPlayer(9 + l, 0.28, { damage: 30 + l * 15 + game.player.bonusAd * 0.5, knock: 6 });
        },
      },
      {
        key: 'R', icon: 'bladestorm', name: '血怒旋风', maxLevel: 3,
        desc: '化身旋风持续 5 秒,绞杀身边一切',
        cooldown: l => 50 - l * 8, mana: l => 60,
        cast(game, l) {
          game.bladestorm(5, 26 + l * 16 + game.player.bonusAd * 0.4);
        },
      },
    ],
  },

  assassin: {
    id: 'assassin',
    name: '暗影刺客 · 鸦',
    role: '近战 · 高爆刺客',
    desc: '月光下只留一道残影',
    stats: {
      maxHp: 340, maxMp: 160, hpRegen: 2, mpRegen: 4,
      moveSpeed: 7.2, attackDamage: 30, attackRange: 3,
      attackCooldown: 0.5, attackType: 'melee', critChance: 0.22,
    },
    skills: [
      {
        key: 'Q', icon: 'shadowstrike', name: '影袭', maxLevel: 5,
        desc: '瞬斩眼前之敌;背刺或潜行时必定暴击',
        cooldown: l => 3.5 - l * 0.25, mana: l => 15 + l * 3,
        cast(game, l) {
          sfx.swing();
          game.fx.slash(0x9ad0e0);
          game.shadowStrike(4, 35 + l * 20 + game.player.bonusAd * 0.8);
        },
      },
      {
        key: 'E', icon: 'smokebomb', name: '烟雾遁形', maxLevel: 5,
        desc: '掷出烟雾进入潜行,怪物失去目标',
        cooldown: l => 16 - l * 1.2, mana: l => 30,
        cast(game, l) {
          game.setStealth(2.5 + l * 0.5);
        },
      },
      {
        key: 'Shift', icon: 'dash', name: '鬼步', maxLevel: 5,
        desc: '向前疾闪,3 秒内下次攻击附加伤害',
        cooldown: l => 8 - l * 0.7, mana: l => 20,
        cast(game, l) {
          sfx.dash();
          game.dashPlayer(6 + l * 0.8, 0.16, {});
          game.player.empowerNext = { bonus: 25 + l * 12, until: game.time + 3 };
        },
      },
      {
        key: 'R', icon: 'deathlotus', name: '绝命莲华', maxLevel: 3,
        desc: '化作残影,连续瞬斩周围所有敌人',
        cooldown: l => 42 - l * 7, mana: l => 70,
        cast(game, l) {
          game.deathLotus(7, 3, 40 + l * 25 + game.player.bonusAd * 0.6);
        },
      },
    ],
  },
};
