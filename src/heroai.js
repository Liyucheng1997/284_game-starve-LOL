// ============================================================
// 英雄 AI:对线 / 补刀 / 换血 / 越塔判断 / 撤退回城 / 出装 / 技能连招 / 抢 Boss
// 友方与敌方 AI 共用;敌方的反应速度、施法频率、激进程度由难度决定
// ============================================================
import * as THREE from 'three';
import * as C from './config.js';
import { sfx } from './sfx.js';

const OTHER = { blue: 'red', red: 'blue' };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const isStructure = u => u.kind === 'tower' || u.kind === 'nexus';

export class HeroAI {
  constructor(game, u, lane) {
    this.g = game;
    this.u = u;
    this.lane = lane;
    this.path = game.lanePaths[lane];
    this.forward = u.team === 'blue' ? 1 : -1;
    this.state = 'base';            // base 泉水 | lane 对线 | retreat 撤退 | baron 打 Boss
    this.target = null;
    this.thinkT = Math.random() * 0.3;
    this.evadeUntil = 0;
    this.detour = null;
    this.wantMove = false;
    this.stuckClock = 0;
    this.lastPos = { x: u.x, z: u.z };
    this.track = null;              // 目标上次位置,用于预判走位
    this.melee = u.heroDef.stats.attackType === 'melee';
    this.reach = this.melee ? u.heroDef.stats.attackRange : 10;
  }

  get isRed() { return this.u.team === 'red'; }
  thinkInterval() { return this.isRed ? this.g.diff.think : 0.25; }
  castChance() { return this.isRed ? this.g.diff.castChance : 0.8; }
  aggro() { return this.isRed ? this.g.diff.aggro : 1.0; }
  leadFactor() { return this.isRed ? { easy: 0, normal: 0.5, hard: 0.95 }[this.g.diffKey] : 0.5; }

  onRespawn() { this.state = 'base'; this.target = null; this.detour = null; }

  // ---------- 兵线坐标(以己方基地为 0) ----------
  toWorldS(s) { return this.forward > 0 ? s : this.path.len - s; }
  progress(x, z) {
    const p = C.projectOnPath(this.path.pts, x, z);
    return { s: this.forward > 0 ? p.s : this.path.len - p.s, d: p.d };
  }
  lanePoint(s) { return C.pointAt(this.path.pts, this.toWorldS(Math.max(0, Math.min(this.path.len, s)))); }

  frontS() {
    let best = -1;
    for (const m of this.g.units) {
      if (m.dead || m.kind !== 'minion' || m.team !== this.u.team || m.lane !== this.lane) continue;
      const s = this.progress(m.x, m.z).s;
      if (s > best) best = s;
    }
    return best;
  }

  outerTowerS() {
    let best = 10;
    for (const t of this.g.towers) {
      if (!t.dead && t.team === this.u.team && t.lane === this.lane) best = Math.max(best, this.progress(t.x, t.z).s);
    }
    return best;
  }

  nearestEnemyStructure() {
    let best = null, bs = Infinity;
    for (const t of this.g.units) {
      if (t.dead || !isStructure(t) || t.team !== OTHER[this.u.team]) continue;
      if (t.kind !== 'nexus' && t.lane !== this.lane) continue;
      const s = this.progress(t.x, t.z).s;
      if (s < bs) { bs = s; best = t; }
    }
    return best ? { unit: best, s: bs } : null;
  }

  alliedMinionsNear(p, r) {
    let n = 0;
    for (const m of this.g.units) if (!m.dead && m.kind === 'minion' && m.team === this.u.team && dist(m, p) < r) n++;
    return n;
  }

  // 在敌方塔下是否安全(塔正在打我方小兵,或有足够小兵抗塔)
  safeUnderTowerAt(x, z) {
    for (const t of this.g.units) {
      if (t.dead || !isStructure(t) || t.team !== OTHER[this.u.team]) continue;
      if (Math.hypot(t.x - x, t.z - z) > t.range + 1) continue;
      const busy = t.target && t.target.kind === 'minion';
      if (!busy && this.alliedMinionsNear(t, t.range) < 2) return false;
    }
    return true;
  }

  towerTargetingMe() {
    return this.g.units.some(t => !t.dead && isStructure(t) && t.team === OTHER[this.u.team] && t.target === this.u);
  }

  enemyHeroesNear(r) {
    const g = this.g, u = this.u;
    return g.heroes.filter(e => e.team !== u.team && !e.dead && dist(e, u) < r && g.targetable(e, u));
  }

  enemiesNear(r) {
    let n = 0;
    for (const e of this.g.units) if (!e.dead && e.team === OTHER[this.u.team] && !isStructure(e) && dist(e, this.u) < r) n++;
    return n;
  }

  // ---------- 主循环 ----------
  update(dt) {
    const g = this.g, u = this.u;
    if (u.recall) return;            // 读条中站定
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = this.thinkInterval(); this.think(); }
    this.wantMove = false;
    this.act(dt);
    // 卡住检测:想走却没动 → 随机绕行一小段
    this.stuckClock += dt;
    if (this.stuckClock > 1) {
      const moved = Math.hypot(u.x - this.lastPos.x, u.z - this.lastPos.z);
      if (this.wantMove && moved < 0.8) {
        const a = Math.random() * Math.PI * 2;
        this.detour = { x: Math.cos(a), z: Math.sin(a), until: g.time + 0.7 };
      }
      this.lastPos = { x: u.x, z: u.z };
      this.stuckClock = 0;
    }
  }

  think() {
    const g = this.g, u = this.u;
    const hpPct = u.hp / u.maxHp;
    const atBase = Math.hypot(u.x - g.fountainOf(u.team).x, u.z - g.fountainOf(u.team).z) < C.FOUNTAIN_RANGE;
    const foes = this.enemyHeroesNear(16);
    const friends = g.heroes.filter(h => h !== u && h.team === u.team && !h.dead && dist(h, u) < 16).length + 1;

    if (atBase) {
      g.aiShop(u);
      if (hpPct < 0.95 || u.mp < u.maxMp * 0.85) { this.state = 'base'; this.target = null; return; }
      if (this.state === 'base' || this.state === 'retreat') this.state = 'lane';
    }
    if (this.state === 'base') return;
    if (hpPct < 0.55 && u.potions > 0 && !u.potionHeal) g.usePotion(u);

    // 撤退判断
    const outnumbered = foes.length > friends;
    const lowTh = 0.24 + (foes.length ? 0.08 : 0) + (outnumbered ? 0.12 : 0);
    if (this.state !== 'retreat' && hpPct < lowTh) this.state = 'retreat';
    if (this.state === 'retreat') {
      this.target = null;
      if (hpPct > 0.75) this.state = 'lane';
      else if (!foes.length && g.time - u.lastDamagedAt > 2.5 && !g.underEnemyTower(u)) g.startRecall(u);
      else this.tryEscapeSkills(foes);
      return;
    }

    // 钱够买下一件装备且状态一般 → 回家
    const next = u.heroDef.build.find(id => !u.items.includes(id));
    if (next && u.gold >= C.ITEMS[next].cost + 100 && hpPct < 0.7 && !foes.length && g.time - u.lastDamagedAt > 3
      && !g.underEnemyTower(u)) {
      g.startRecall(u);
      this.state = 'retreat';
      return;
    }

    // 被敌方塔锁定 → 立即撤出塔下
    if (this.towerTargetingMe() && !(this.target && this.target.kind === 'hero' && this.target.hp / this.target.maxHp < 0.15)) {
      this.evadeUntil = g.time + 1.2;
      this.target = null;
      return;
    }

    this.state = this.wantBaron() ? 'baron' : 'lane';
    const prev = this.target;
    this.target = this.pickTarget(foes, friends);
    if (this.target && this.target !== prev) this.track = null;
    if (this.target && Math.random() < this.castChance()) this.useSkills(this.target, foes);
    if (this.target) this.track = { x: this.target.x, z: this.target.z, t: g.time };
  }

  wantBaron() {
    const g = this.g, u = this.u, b = g.baron;
    if (!b || b.dead) return false;
    if (u.team === 'blue' && !g.player.dead && dist(g.player, b) < 16 && b.target) return true;
    const mates = g.heroes.filter(h => h.team === u.team && !h.dead && !h.isPlayer).length;
    const foesAlive = g.heroes.filter(h => h.team !== u.team && !h.dead).length;
    return mates >= 2 && foesAlive <= 1 && u.level >= 7 && u.hp / u.maxHp > 0.6;
  }

  pickTarget(foes, friends) {
    const g = this.g, u = this.u;
    const myHp = u.hp / u.maxHp, aggr = this.aggro();
    // 英雄
    let best = null, bestW = 0.05;
    for (const e of foes) {
      const d = dist(e, u);
      if (d > 13) continue;
      const eHp = e.hp / e.maxHp;
      let w = (myHp + (u.level - e.level) * 0.08) * aggr - eHp;
      if (eHp < 0.3) w += 0.35;
      if (g.time - (u.damagedBy.get(e) ?? -99) < 2) w += 0.2;
      w += 0.15 * (friends - foes.length);
      if (g.underEnemyTower(u, e.x, e.z)) {
        const dive = aggr >= 1.2 && eHp < 0.25 && myHp > 0.5;
        if (!dive) w -= 1;
      }
      w -= d * 0.015;
      if (w > bestW) { bestW = w; best = e; }
    }
    if (best) return best;
    if (this.state === 'baron') {
      const b = g.baron;
      if (b && dist(b, u) < 14) return b;
      return null;
    }
    // 小兵:优先残血的(补刀)
    let tgt = null, low = Infinity;
    for (const m of g.units) {
      if (m.dead || m.team !== OTHER[u.team] || m.kind !== 'minion') continue;
      const d = dist(m, u);
      if (d > this.reach + 7) continue;
      if (!this.safeUnderTowerAt(m.x, m.z)) continue;
      const score = m.hp + d * 8;
      if (score < low) { low = score; tgt = m; }
    }
    if (tgt) return tgt;
    // 建筑:有小兵抗塔时才拆
    for (const t of g.units) {
      if (t.dead || !isStructure(t) || t.team !== OTHER[u.team] || g.isInvulnerable(t)) continue;
      if (dist(t, u) > 18) continue;
      if ((t.target && t.target.kind === 'minion') || (!t.target && this.alliedMinionsNear(t, t.range) >= 1)) return t;
    }
    return null;
  }

  act(dt) {
    const g = this.g, u = this.u;
    if (u.dash && g.time < u.dash.until) return;
    const speed = g.heroSpeed(u);
    if (this.state === 'base') {
      const f = g.fountainOf(u.team);
      this.moveTo(f.x, f.z, speed, dt, 3);
      return;
    }
    if (this.state === 'retreat' || g.time < this.evadeUntil) { this.walkLane(-1, speed, dt); return; }
    const t = this.target;
    if (t && !t.dead && g.targetable(t, u)) {
      const d = dist(u, t) - t.r - u.r;
      if (d > this.reach - 0.3) this.moveTo(t.x, t.z, speed, dt, 0.2);
      else {
        if (!this.melee && t.kind === 'hero' && t.heroDef.stats.attackType === 'melee' && d < 3.5) this.moveAway(t, speed * 0.8, dt);
        this.basicAttack(t);
      }
      return;
    }
    if (this.state === 'baron' && g.baron) { this.moveTo(g.baron.x, g.baron.z, speed, dt, 8); return; }
    this.walkLane(0, speed, dt);
  }

  walkLane(mode, speed, dt) {
    const g = this.g, u = this.u;
    const cur = this.progress(u.x, u.z);
    if (mode < 0) {
      if (cur.s < 14) { const f = g.fountainOf(u.team); this.moveTo(f.x, f.z, speed, dt, 2); return; }
      if (cur.d > 7) { const p = this.lanePoint(cur.s - 4); this.moveTo(p.x, p.z, speed, dt, 0.5); return; }
      const p = this.lanePoint(cur.s - 7);
      this.moveTo(p.x, p.z, speed, dt, 0.5);
      return;
    }
    let want;
    const front = this.frontS();
    if (front > 0) want = front - (this.melee ? 2.5 : 6);
    else want = this.outerTowerS() - 4;
    const es = this.nearestEnemyStructure();
    if (es && want > es.s - es.unit.range - 1 && !this.safeUnderTowerAt(es.unit.x, es.unit.z)) {
      want = Math.min(want, es.s - es.unit.range - 2);
    }
    want = Math.max(4, want);
    if (cur.d > 7) { const p = this.lanePoint(cur.s); this.moveTo(p.x, p.z, speed, dt, 1); return; }
    if (Math.abs(cur.s - want) < 1.5) return;
    const p = this.lanePoint(cur.s + Math.sign(want - cur.s) * Math.min(6, Math.abs(want - cur.s)));
    this.moveTo(p.x, p.z, speed, dt, 0.3);
  }

  moveTo(x, z, speed, dt, stop = 0.3) {
    const g = this.g, u = this.u;
    this.wantMove = Math.hypot(x - u.x, z - u.z) > stop + 0.2;
    if (this.detour && g.time < this.detour.until) {
      g.moveUnit(u, this.detour.x * speed, this.detour.z * speed, dt);
      return;
    }
    g.moveToward(u, x, z, speed, dt, stop);
  }

  moveAway(t, speed, dt) {
    const dx = this.u.x - t.x, dz = this.u.z - t.z, l = Math.hypot(dx, dz) || 1;
    this.g.moveUnit(this.u, dx / l * speed, dz / l * speed, dt);
  }

  face(t) {
    const dx = t.x - this.u.x, dz = t.z - this.u.z, l = Math.hypot(dx, dz) || 1;
    this.u.fx = dx / l; this.u.fz = dz / l;
  }

  nearPlayer() { return dist(this.u, this.g.player) < 28; }

  // ---------- 普攻 ----------
  basicAttack(t) {
    const g = this.g, u = this.u;
    if (g.time < u.nextAttack) return;
    const s = u.heroDef.stats;
    u.nextAttack = g.time + s.attackCooldown * (1 + Math.random() * 0.15);
    this.face(t);
    let dmg = g.getAD(u);
    if (u.empowerNext && g.time < u.empowerNext.until) { dmg += u.empowerNext.bonus; u.empowerNext = null; }
    const crit = Math.random() < u.crit;
    if (crit) dmg *= 1.8;
    u.body.scale.x = u.baseW * 1.15;
    if (this.melee) {
      g.dealDamage(u, t, dmg, { type: 'basic', crit });
      if (this.nearPlayer()) {
        sfx.swing();
        g.fx.burst({ x: t.x, y: 1.3, z: t.z }, this.isRed ? 0xc080ff : 0xe8dcbb, 5, 3, 0.35);
      }
    } else {
      g.homingShot(u, t, { speed: 28, color: this.isRed ? 0xc060ff : 0x9ad0ff, size: 0.55, y: 1.8, onHit: () => g.dealDamage(u, t, dmg, { type: 'basic', crit }) });
    }
  }

  // ---------- 技能 ----------
  useSkills(t, foes) {
    const g = this.g, u = this.u, id = u.heroDef.id, L = u.skillLevels, bonus = u.bonusAd;
    const isHero = t.kind === 'hero';
    const d = dist(u, t);
    const cast = i => g.trySpend(u, i);
    const loud = this.nearPlayer();
    if (id === 'mage') {
      if (L[3] && isHero && d < 20 && (t.hp / t.maxHp < 0.55 || g.time < t.slowUntil) && cast(3)) {
        const aim = this.predict(t, 0.9);
        g.meteorAt(u, aim, 0.9, 6.5, 120 + L[3] * 80 + bonus);
        return;
      }
      if (L[1] && foes.some(e => dist(e, u) < 6.5) && cast(1)) {
        if (loud) sfx.frost();
        g.fx.ring(u, 7, 0x9ad8f0);
        g.areaDamage(u, u, 7, 25 + L[1] * 14 + bonus * 0.4, { slow: { factor: 0.4, dur: 2.5 + L[1] * 0.3 } });
        return;
      }
      if (L[0] && d < 19 && (isHero || u.mp > u.maxMp * 0.6) && !isStructure(t) && cast(0)) {
        if (loud) sfx.fireball();
        this.skillshot(t, 26, { radius: 0.5, color: 0xf6892a, trail: 0xf6a03a, damage: 30 + L[0] * 18 + bonus * 0.6, aoe: 3.2, range: 20 });
        return;
      }
    } else if (id === 'warrior') {
      if (L[2] && isHero && d > 4 && d < 10 && cast(2)) {
        if (loud) sfx.dash();
        this.dashToward(t, Math.min(d + 1, 9 + L[2]), 0.28, 30 + L[2] * 15 + bonus * 0.5, 6);
        return;
      }
      if (L[3] && ((isHero && d < 5) || this.enemiesNear(5) >= 3) && cast(3)) {
        u.bladestormUntil = g.time + 5;
        u.bladestormDmg = 26 + L[3] * 16 + bonus * 0.4;
        u.nextBladeTick = g.time;
        if (loud) { sfx.swing(); g.toast(`${u.name} 发动了血怒旋风!`, this.isRed ? 'bad' : 'good'); }
        return;
      }
      if (L[0] && d < 5.2 && !isStructure(t) && cast(0)) {
        this.face(t);
        if (loud) sfx.swing();
        g.fx.burst({ x: u.x + u.fx * 2, y: 1.2, z: u.z + u.fz * 2 }, 0xe8cf9a, 10, 5, 0.45);
        g.coneDamage(u, u.x, u.z, u.fx, u.fz, 5.2, Math.PI * 0.5, 40 + L[0] * 22 + bonus, { knock: 3 });
        return;
      }
      if (L[1] && u.hp / u.maxHp < 0.75 && ((isHero && d < 7) || this.enemiesNear(5) >= 2) && cast(1)) {
        if (loud) sfx.shield();
        g.addShield(45 + L[1] * 25, 5, u);
        g.fx.ring(u, 6, 0xe0b83a);
        g.areaDamage(u, u, 6, 10, { slow: { factor: 0.55, dur: 2 } });
        return;
      }
    } else if (id === 'assassin') {
      if (L[2] && isHero && d > 3 && d < 10 && cast(2)) {
        if (loud) sfx.dash();
        this.dashToward(t, Math.min(d - 1, 6 + L[2] * 0.8), 0.16, 0, 0);
        u.empowerNext = { bonus: 25 + L[2] * 12, until: g.time + 3 };
        return;
      }
      if (L[3] && isHero && d < 7 && t.hp / t.maxHp < 0.65 && cast(3)) {
        if (!g.deathLotusFrom(u, 7, 3, 40 + L[3] * 25 + bonus * 0.6)) u.cooldowns[3] = g.time + 1;
        else if (loud) g.toast(`${u.name} 发动了绝命莲华!`, this.isRed ? 'bad' : 'good');
        return;
      }
      if (L[0] && d < 4.5 && !isStructure(t) && cast(0)) {
        const surprise = g.time < u.stealthUntil || g.isBehind(u, t);
        g.dealDamage(u, t, (35 + L[0] * 20 + bonus * 0.8) * (surprise ? 2 : 1), { type: 'skill', crit: surprise });
        g.fx.burst({ x: t.x, y: 1.4, z: t.z }, 0x9ad0e0, 10, 5, 0.45);
        return;
      }
    }
  }

  tryEscapeSkills(foes) {
    if (!foes.length) return;
    const g = this.g, u = this.u, id = u.heroDef.id, L = u.skillLevels;
    const close = foes.some(e => dist(e, u) < 9);
    if (!close) return;
    if (id === 'mage' && L[2] && g.trySpend(u, 2)) {
      const f = g.fountainOf(u.team);
      const dx = f.x - u.x, dz = f.z - u.z, l = Math.hypot(dx, dz) || 1;
      g.fx.burst({ x: u.x, y: 1.2, z: u.z }, 0xb090ff, 12, 4, 0.5);
      u.x += dx / l * (7 + L[2]); u.z += dz / l * (7 + L[2]);
      g.pushOutOfObstacles(u, u.r);
      g.fx.burst({ x: u.x, y: 1.2, z: u.z }, 0xb090ff, 12, 4, 0.5);
    } else if (id === 'assassin' && L[1] && g.trySpend(u, 1)) {
      u.stealthUntil = g.time + 2.5 + L[1] * 0.5;
      g.units.forEach(e => { if (e.target === u) e.target = null; });
      g.fx.burst({ x: u.x, y: 1, z: u.z }, 0x8a98a0, 22, 5, 0.7);
    } else if (id === 'warrior' && L[1] && g.trySpend(u, 1)) {
      g.addShield(45 + L[1] * 25, 5, u);
      g.fx.ring(u, 6, 0xe0b83a);
      g.areaDamage(u, u, 6, 10, { slow: { factor: 0.55, dur: 2 } });
    }
  }

  // 预判目标在 t 秒后的位置
  predict(t, secs) {
    const tr = this.track, lead = this.leadFactor();
    if (!tr || tr.t >= this.g.time) return { x: t.x, z: t.z };
    const dtT = this.g.time - tr.t;
    const vx = (t.x - tr.x) / dtT, vz = (t.z - tr.z) / dtT;
    if (Math.hypot(vx, vz) > 15) return { x: t.x, z: t.z };
    return { x: t.x + vx * secs * lead, z: t.z + vz * secs * lead };
  }

  skillshot(t, speed, opts) {
    const u = this.u;
    const aim = this.predict(t, dist(u, t) / speed);
    const dx = aim.x - u.x, dz = aim.z - u.z, l = Math.hypot(dx, dz) || 1;
    const dir = new THREE.Vector3(dx / l, 0, dz / l);
    this.g.launchProjectile(u, { x: u.x + dir.x, y: 1.5, z: u.z + dir.z }, dir, { speed, ...opts });
  }

  dashToward(t, distance, dur, damage, knock) {
    const u = this.u;
    const dx = t.x - u.x, dz = t.z - u.z, l = Math.hypot(dx, dz) || 1;
    u.fx = dx / l; u.fz = dz / l;
    u.dash = { fx: dx / l, fz: dz / l, speed: distance / dur, until: this.g.time + dur, damage, knock, hit: new Set() };
  }
}
