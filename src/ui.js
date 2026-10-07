// ============================================================
// HUD / 小地图 / 商店 / 战绩表 / 死亡界面 / 第一人称武器 —— 所有 DOM 层交互
// ============================================================
import { makeSkillIcon } from './textures.js';
import { makeItemIcon } from './textures_moba.js';
import * as C from './config.js';

const $ = id => document.getElementById(id);
const iconCache = {};
const itemIconURL = id => (iconCache[id] ||= makeItemIcon(id).toDataURL());

export class UI {
  constructor(game, hero) {
    this.game = game;
    this.hero = hero;
    this.shopOpen = false;
    this.slots = [];
    this._bannerTimer = null;
    this.nextSlowUpdate = 0;

    this.el = {
      hud: $('hud'), hpFill: $('hp-fill'), hpText: $('hp-text'),
      mpFill: $('mp-fill'), mpText: $('mp-text'), xpFill: $('xp-fill'),
      levelNum: $('level-num'), skillBar: $('skill-bar'), itemBar: $('item-bar'), buffBar: $('buff-bar'),
      score: $('score'), gameClock: $('game-clock'), phaseLabel: $('phase-label'),
      goldNum: $('gold-num'), kdaNum: $('kda-num'), csNum: $('cs-num'),
      banner: $('banner'), subbanner: $('subbanner'),
      interactTip: $('interact-tip'), toastArea: $('toast-area'), killFeed: $('kill-feed'),
      damageFlash: $('damage-flash'),
      bossBar: $('boss-bar'), bossName: $('boss-name'), bossFill: $('boss-fill'),
      endScreen: $('end-screen'), endTitle: $('end-title'), endDetail: $('end-detail'),
      clock: $('clock-canvas'), minimap: $('minimap'),
      recallBar: $('recall-bar'), recallFill: $('recall-fill'),
      death: $('death-overlay'), deathTimer: $('death-timer'),
      scoreboard: $('scoreboard'), shop: $('shop'),
    };
    this.clockCtx = this.el.clock.getContext('2d');
    this.mmCtx = this.el.minimap.getContext('2d');
    this.buildSkillBar();
    this.buildItemBar();
    this.buildMinimapBase();
    this.buildShop();
    this.buildWeapon();
  }

  showHUD() { this.el.hud.classList.remove('hidden'); }

  // ---------------- 技能栏 ----------------
  buildSkillBar() {
    this.el.skillBar.innerHTML = '';
    this.hero.skills.forEach((sk, i) => {
      const slot = document.createElement('div');
      slot.className = 'skill-slot locked';
      slot.title = `${sk.name}:${sk.desc}`;
      const icon = makeSkillIcon(sk.icon);
      slot.appendChild(icon);
      const key = document.createElement('div');
      key.className = 'key'; key.textContent = sk.key === 'Shift' ? '⇧' : sk.key;
      slot.appendChild(key);
      const cd = document.createElement('div');
      cd.className = 'cd';
      slot.appendChild(cd);
      const pips = document.createElement('div');
      pips.className = 'lvl-pips';
      for (let p = 0; p < sk.maxLevel; p++) {
        const pip = document.createElement('div');
        pip.className = 'pip';
        pips.appendChild(pip);
      }
      slot.appendChild(pips);
      const up = document.createElement('div');
      up.className = 'up-btn hidden'; up.textContent = '+';
      up.title = `按 ${i + 1} 或点击加点`;
      up.addEventListener('click', e => { e.stopPropagation(); this.game.upgradeSkill(i); });
      slot.appendChild(up);
      this.el.skillBar.appendChild(slot);
      this.slots.push({ slot, cd, pips, up });
    });
  }

  // ---------------- 装备栏 ----------------
  buildItemBar() {
    this.itemSlots = [];
    this.el.itemBar.innerHTML = '';
    for (let i = 0; i < C.MAX_ITEMS; i++) {
      const s = document.createElement('div');
      s.className = 'item-slot';
      this.el.itemBar.appendChild(s);
      this.itemSlots.push(s);
    }
    const pot = document.createElement('div');
    pot.className = 'item-slot potion';
    pot.innerHTML = `<img src="${itemIconURL('potion')}"><span class="key">F</span><span class="count"></span>`;
    this.el.itemBar.appendChild(pot);
    this.potionSlot = pot;
    this._itemsSig = '';
  }

  refreshItemBar() {
    const p = this.game.player;
    const sig = p.items.join(',');
    if (sig !== this._itemsSig) {
      this._itemsSig = sig;
      this.itemSlots.forEach((s, i) => {
        const id = p.items[i];
        s.innerHTML = id ? `<img src="${itemIconURL(id)}">` : '';
        s.title = id ? `${C.ITEMS[id].name}:${C.ITEMS[id].desc}` : '';
      });
    }
    this.potionSlot.querySelector('.count').textContent = p.potions;
    this.potionSlot.classList.toggle('empty', p.potions === 0);
    this.potionSlot.classList.toggle('active', !!(p.potionHeal && p.potionHeal.until > this.game.time));
  }

  // ---------------- 第一人称武器 ----------------
  buildWeapon() {
    const c = document.createElement('canvas');
    c.width = 360; c.height = 420;
    c.style.cssText = `position:fixed; right:calc(250px + 2vw); bottom:-4vh; width:min(34vh,30vw); z-index:5;
      pointer-events:none; transform-origin: 80% 95%; filter: drop-shadow(0 6px 12px rgba(0,0,0,.5));`;
    document.body.appendChild(c);
    this.weaponEl = c;
    this.drawWeapon(c.getContext('2d'));
    this.attackT = -9;
  }

  drawWeapon(ctx) {
    const ink = '#211c15';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const stroke = w => { ctx.strokeStyle = ink; ctx.lineWidth = w; ctx.stroke(); };
    const hand = (x, y) => {
      ctx.fillStyle = '#dbb890';
      ctx.beginPath(); ctx.ellipse(x, y, 34, 40, -.3, 0, 7); ctx.fill(); stroke(5);
    };
    if (this.hero.id === 'mage') {
      ctx.fillStyle = '#6b4a2a';
      ctx.beginPath();
      ctx.moveTo(150, 420); ctx.lineTo(196, 118); ctx.lineTo(216, 120); ctx.lineTo(186, 420);
      ctx.closePath(); ctx.fill(); stroke(5);
      ctx.strokeStyle = '#54381e'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(198, 130); ctx.quadraticCurveTo(160, 90, 206, 60);
      ctx.quadraticCurveTo(252, 92, 210, 128); ctx.stroke();
      ctx.strokeStyle = ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(198, 130); ctx.quadraticCurveTo(160, 90, 206, 60);
      ctx.quadraticCurveTo(252, 92, 210, 128); ctx.stroke();
      const g = ctx.createRadialGradient(206, 88, 4, 206, 88, 30);
      g.addColorStop(0, '#e8d0ff'); g.addColorStop(.5, '#9a6ad0'); g.addColorStop(1, 'rgba(122,74,208,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(206, 88, 30, 0, 7); ctx.fill();
      hand(168, 330);
    } else if (this.hero.id === 'warrior') {
      ctx.fillStyle = '#5a4028';
      ctx.beginPath();
      ctx.moveTo(140, 420); ctx.lineTo(230, 96); ctx.lineTo(254, 102); ctx.lineTo(178, 420);
      ctx.closePath(); ctx.fill(); stroke(5);
      ctx.fillStyle = '#9a9aa2';
      ctx.beginPath();
      ctx.moveTo(238, 110); ctx.quadraticCurveTo(330, 92, 344, 22);
      ctx.quadraticCurveTo(276, 30, 232, 78); ctx.closePath(); ctx.fill(); stroke(5);
      ctx.fillStyle = '#7c7c86';
      ctx.beginPath();
      ctx.moveTo(236, 108); ctx.quadraticCurveTo(160, 96, 140, 40);
      ctx.quadraticCurveTo(212, 40, 244, 82); ctx.closePath(); ctx.fill(); stroke(5);
      hand(184, 320);
    } else {
      ctx.fillStyle = '#b8c4c8';
      ctx.beginPath();
      ctx.moveTo(196, 210); ctx.quadraticCurveTo(240, 120, 300, 34);
      ctx.quadraticCurveTo(300, 130, 240, 224); ctx.closePath(); ctx.fill(); stroke(5);
      ctx.strokeStyle = '#8e9ba0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(220, 190); ctx.quadraticCurveTo(260, 120, 288, 58); ctx.stroke();
      ctx.fillStyle = '#4c3a26';
      ctx.beginPath(); ctx.ellipse(212, 224, 40, 14, -.5, 0, 7); ctx.fill(); stroke(4);
      ctx.fillStyle = '#33291f';
      ctx.beginPath();
      ctx.moveTo(186, 240); ctx.lineTo(150, 330); ctx.lineTo(184, 342); ctx.lineTo(212, 248);
      ctx.closePath(); ctx.fill(); stroke(4);
      hand(172, 320);
    }
  }

  weaponAttack() { this.attackT = performance.now() / 1000; }

  updateWeapon(t, moving, speedMul) {
    if (!this.weaponEl) return;
    this.weaponEl.style.display = this.game.player.dead ? 'none' : '';
    const bobA = moving ? 10 : 3;
    const bobS = moving ? 7.5 * speedMul : 1.6;
    const bx = Math.sin(t * bobS) * bobA * .6;
    const by = Math.abs(Math.cos(t * bobS)) * bobA;
    let rot = 0, px = 0, py = 0;
    const at = performance.now() / 1000 - this.attackT;
    if (at < .28) {
      const k = Math.sin((at / .28) * Math.PI);
      rot = -38 * k; px = -30 * k; py = 26 * k;
    }
    this.weaponEl.style.transform = `translate(${bx + px}px, ${by + py}px) rotate(${rot}deg)`;
  }

  // ---------------- 每帧刷新 ----------------
  update() {
    const g = this.game, p = g.player;
    const setBar = (el, cur, max) => { el.style.transform = `scaleX(${Math.max(0, Math.min(1, cur / max))})`; };
    setBar(this.el.hpFill, p.hp, p.maxHp);
    setBar(this.el.mpFill, p.mp, p.maxMp);
    setBar(this.el.xpFill, p.xp, g.xpNeed(p.level));
    this.el.hpText.textContent = `${Math.max(0, Math.ceil(p.hp))}${p.shield > 0 ? ` (+${Math.ceil(p.shield)})` : ''} / ${Math.round(p.maxHp)}`;
    this.el.mpText.textContent = `${Math.floor(p.mp)} / ${Math.round(p.maxMp)}`;
    this.el.levelNum.textContent = p.level;
    this.el.goldNum.textContent = Math.floor(p.gold);
    this.el.kdaNum.textContent = `${p.kills} / ${p.deaths} / ${p.assists}`;
    this.el.csNum.textContent = p.cs;
    this.el.score.innerHTML = `<span class="blue">${g.score.blue}</span> ⚔ <span class="red">${g.score.red}</span>`;
    this.el.gameClock.textContent = g.clockText();
    this.el.phaseLabel.textContent = g.phaseName();

    // 技能格
    this.hero.skills.forEach((sk, i) => {
      const s = this.slots[i];
      const lvl = p.skillLevels[i];
      s.slot.classList.toggle('locked', lvl === 0);
      s.slot.classList.toggle('nomana', lvl > 0 && p.mp < sk.mana(lvl));
      const cdLeft = p.cooldowns[i] - g.time;
      if (lvl > 0 && cdLeft > 0) {
        const total = sk.cooldown(lvl) * (1 - p.cdr);
        s.cd.style.setProperty('--cd', `${Math.min(100, (cdLeft / total) * 100)}%`);
        s.cd.textContent = cdLeft > 1 ? Math.ceil(cdLeft) : cdLeft.toFixed(1);
      } else {
        s.cd.style.setProperty('--cd', '0%');
        s.cd.textContent = '';
      }
      [...s.pips.children].forEach((pip, pi) => pip.classList.toggle('on', pi < lvl));
      s.up.classList.toggle('hidden', !(p.skillPoints > 0 && g.canLevelSkill(p, i)));
    });

    // 回城读条
    if (p.recall) {
      this.el.recallBar.classList.remove('hidden');
      const k = (g.time - p.recall.start) / (p.recall.until - p.recall.start);
      this.el.recallFill.style.transform = `scaleX(${Math.min(1, k)})`;
    } else this.el.recallBar.classList.add('hidden');

    // 死亡倒计时
    if (p.dead) this.el.deathTimer.textContent = Math.max(0, Math.ceil(p.respawnAt - g.time));

    // 提示
    if (!p.dead && g.inShopRange()) this.showInteract('按 <b>P</b> 打开商店 · 泉水会快速回复生命与法力');
    else if (document.pointerLockElement !== g.renderer.domElement && !this.shopOpen && !p.dead)
      this.showInteract('点击屏幕 锁定视角');
    else this.hideInteract();

    this.drawMinimap();
    if (g.time >= this.nextSlowUpdate) {
      this.nextSlowUpdate = g.time + 0.25;
      this.drawClock();
      this.refreshItemBar();
      this.refreshBuffs();
      if (this.shopOpen) this.refreshShop();
      if (this.scoreboardOpen) this.renderScoreboard();
    }
  }

  refreshBuffs() {
    const g = this.game, p = g.player;
    const html = [];
    for (const k in C.BUFFS) {
      if (!g.hasBuff(p, k)) continue;
      const b = C.BUFFS[k];
      html.push(`<div class="buff" style="border-color:${b.color}" title="${b.desc}"><b style="color:${b.color}">${b.name}</b> ${Math.ceil(p.buffs[k] - g.time)}s</div>`);
    }
    if (g.time < p.stealthUntil) html.push(`<div class="buff" style="border-color:#8a98a0"><b>潜行</b></div>`);
    if (g.time < p.slowUntil) html.push(`<div class="buff" style="border-color:#7ab8f0"><b style="color:#7ab8f0">减速</b></div>`);
    this.el.buffBar.innerHTML = html.join('');
  }

  drawClock() {
    const g = this.game, ctx = this.clockCtx, s = 128, cx = s / 2, cy = s / 2, r = 52;
    ctx.clearRect(0, 0, s, s);
    ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, 7);
    ctx.fillStyle = 'rgba(20,16,10,.8)'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#211c15'; ctx.stroke();
    const seg = (a0, a1, color) => {
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0 - Math.PI / 2, a1 - Math.PI / 2);
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    };
    const TAU = Math.PI * 2;
    seg(0, g.DAY_END * TAU, '#c9a94f');
    seg(g.DAY_END * TAU, g.DUSK_END * TAU, '#a06a38');
    seg(g.DUSK_END * TAU, TAU, '#2c3a5c');
    const a = g.dayFrac * TAU - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
    ctx.lineWidth = 5; ctx.strokeStyle = '#f0e6c8'; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 7); ctx.fillStyle = '#f0e6c8'; ctx.fill();
  }

  // ---------------- 小地图 ----------------
  mm(v) { return (v + C.MAP_HALF) / (C.MAP_HALF * 2) * this.el.minimap.width; }

  buildMinimapBase() {
    const S = this.el.minimap.width;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2e3a24'; ctx.fillRect(0, 0, S, S);
    // 河道
    ctx.strokeStyle = '#2f4a52'; ctx.lineWidth = S * 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(this.mm(-92), this.mm(-92)); ctx.lineTo(this.mm(92), this.mm(92)); ctx.stroke();
    // 兵线
    ctx.strokeStyle = '#7a6a48'; ctx.lineWidth = S * 0.04; ctx.lineJoin = 'round';
    for (const k in C.LANES) {
      ctx.beginPath();
      C.LANES[k].forEach(([x, z], i) => i ? ctx.lineTo(this.mm(x), this.mm(z)) : ctx.moveTo(this.mm(x), this.mm(z)));
      ctx.stroke();
    }
    // 基地
    for (const team of ['blue', 'red']) {
      const [x, z] = C.BASES[team].nexus;
      ctx.fillStyle = team === 'blue' ? 'rgba(74,143,208,.35)' : 'rgba(208,74,58,.35)';
      ctx.beginPath(); ctx.arc(this.mm(x), this.mm(z), S * 0.11, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = '#211c15'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, S, S);
    this.mmBase = c;
  }

  drawMinimap() {
    const g = this.game, ctx = this.mmCtx, S = this.el.minimap.width;
    ctx.drawImage(this.mmBase, 0, 0);
    const dot = (x, z, r, fill, stroke) => {
      ctx.beginPath(); ctx.arc(this.mm(x), this.mm(z), r, 0, 7);
      ctx.fillStyle = fill; ctx.fill();
      if (stroke) { ctx.lineWidth = 1.5; ctx.strokeStyle = stroke; ctx.stroke(); }
    };
    // 野怪营地
    g.camps.forEach(c => {
      const alive = c.members.some(m => !m.dead);
      dot(c.x, c.z, 3, alive ? '#c9a227' : 'rgba(120,110,80,.4)');
    });
    if (g.baron && !g.baron.dead) dot(g.baron.x, g.baron.z, 6, '#8fd06c', '#211c15');
    for (const u of g.units) {
      if (u.dead || u.kind === 'hero' || u.kind === 'monster') continue;
      if (u.team === 'red' && !u.visibleToBlue) continue;
      const col = u.team === 'blue' ? '#6ab0f0' : '#f06050';
      if (u.kind === 'minion') { ctx.fillStyle = col; ctx.fillRect(this.mm(u.x) - 1.5, this.mm(u.z) - 1.5, 3, 3); }
      else {
        const s = u.kind === 'nexus' ? 9 : 6;
        ctx.fillStyle = col; ctx.fillRect(this.mm(u.x) - s / 2, this.mm(u.z) - s / 2, s, s);
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#211c15'; ctx.strokeRect(this.mm(u.x) - s / 2, this.mm(u.z) - s / 2, s, s);
      }
    }
    // 英雄
    ctx.font = 'bold 9px KaiTi, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const h of g.heroes) {
      if (h.dead || h.isPlayer) continue;
      if (h.team === 'red' && !h.visibleToBlue) continue;
      dot(h.x, h.z, 6, h.team === 'blue' ? '#3d7ac0' : '#c0402e', '#f0e6c8');
      ctx.fillStyle = '#fff';
      ctx.fillText(h.name.slice(-1), this.mm(h.x), this.mm(h.z) + 0.5);
    }
    // 玩家:箭头
    const p = g.player;
    if (!p.dead) {
      const f = g.forward(), a = Math.atan2(f.z, f.x);
      const x = this.mm(p.x), y = this.mm(p.z);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath();
      ctx.fillStyle = '#f6d24a'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#211c15'; ctx.stroke();
      ctx.restore();
    }
  }

  // ---------------- 横幅 / 浮动消息 / 击杀播报 ----------------
  banner(text, sub = '', dur = 3.5) {
    const b = this.el.banner, sb = this.el.subbanner;
    b.textContent = text; sb.textContent = sub;
    b.style.opacity = 1; sb.style.opacity = 1;
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => { b.style.opacity = 0; sb.style.opacity = 0; }, dur * 1000);
  }

  toast(text, cls = '') {
    const t = document.createElement('div');
    t.className = `toast ${cls}`;
    t.textContent = text;
    this.el.toastArea.appendChild(t);
    setTimeout(() => t.remove(), 3400);
    while (this.el.toastArea.children.length > 5) this.el.toastArea.firstChild.remove();
  }

  killFeed(killer, victim) {
    const name = u => !u ? '未知' : u.kind === 'hero' ? (u.isPlayer ? `你(${u.name})` : u.name)
      : u.kind === 'tower' || u.kind === 'nexus' ? (u.team === 'blue' ? '我方防御塔' : '敌方防御塔')
        : u.kind === 'minion' ? (u.team === 'blue' ? '我方小兵' : '敌方小兵') : u.name;
    const cls = u => !u ? '' : u.team === 'blue' ? 'blue' : u.team === 'red' ? 'red' : 'neutral';
    const row = document.createElement('div');
    row.className = 'feed-row';
    row.innerHTML = `<span class="${cls(killer)}">${name(killer)}</span> <i>⚔</i> <span class="${cls(victim)}">${name(victim)}</span>`;
    this.el.killFeed.appendChild(row);
    setTimeout(() => row.remove(), 7000);
    while (this.el.killFeed.children.length > 5) this.el.killFeed.firstChild.remove();
    if (victim.isPlayer) this.banner('你被击杀了!', `击杀者:${name(killer)}`);
    else if (killer && killer.isPlayer) this.banner('击杀!', `你击败了 ${victim.name}`, 2.2);
  }

  showInteract(html) {
    if (this._tip !== html) { this.el.interactTip.innerHTML = html; this._tip = html; }
    this.el.interactTip.classList.remove('hidden');
  }
  hideInteract() { this.el.interactTip.classList.add('hidden'); }

  damageFlash() {
    const f = this.el.damageFlash;
    f.style.transition = 'none'; f.style.opacity = 1;
    requestAnimationFrame(() => { f.style.transition = 'opacity .5s ease'; f.style.opacity = 0; });
  }

  showDeath(on) { this.el.death.classList.toggle('hidden', !on); }

  // ---------------- 战绩表(Tab) ----------------
  showScoreboard(on) {
    this.scoreboardOpen = on;
    this.el.scoreboard.classList.toggle('hidden', !on);
    if (on) this.renderScoreboard();
  }

  renderScoreboard() {
    const g = this.game;
    const row = h => `<tr class="${h.team}${h.isPlayer ? ' me' : ''}${h.dead ? ' dead' : ''}">
      <td>${h.isPlayer ? '★ ' : ''}${h.name}</td><td>${C.LANE_NAMES[h.lane] || ''}</td><td>${h.level}</td>
      <td>${h.kills} / ${h.deaths} / ${h.assists}</td><td>${h.cs}</td>
      <td class="items">${h.items.map(id => `<img src="${itemIconURL(id)}" title="${C.ITEMS[id].name}">`).join('')}</td>
      <td>${h.dead ? `复活 ${Math.ceil(h.respawnAt - g.time)}s` : ''}</td></tr>`;
    const towersLeft = team => g.towers.filter(t => t.team === team && !t.dead).length;
    this.el.scoreboard.innerHTML = `
      <h3>战绩 · ${g.clockText()} · 难度「${g.diff.name}」</h3>
      <table>
        <tr class="head"><th>营火同盟 ${g.score.blue} 杀 · 剩余 ${towersLeft('blue')} 塔</th><th>分路</th><th>等级</th><th>K / D / A</th><th>补刀</th><th>装备</th><th></th></tr>
        ${g.heroes.filter(h => h.team === 'blue').map(row).join('')}
        <tr class="head"><th>暗影议会 ${g.score.red} 杀 · 剩余 ${towersLeft('red')} 塔</th><th></th><th></th><th></th><th></th><th></th><th></th></tr>
        ${g.heroes.filter(h => h.team === 'red').map(row).join('')}
      </table>`;
  }

  // ---------------- 商店(P) ----------------
  buildShop() {
    const items = Object.entries(C.ITEMS).sort((a, b) => a[1].cost - b[1].cost);
    const card = (id, name, desc, cost) => `
      <button class="shop-item" data-id="${id}">
        <img src="${itemIconURL(id)}">
        <div class="info"><b>${name}</b><small>${desc}</small></div>
        <div class="cost">${cost}</div>
      </button>`;
    this.el.shop.innerHTML = `
      <div class="shop-head">
        <h3>神秘商人的货摊</h3>
        <div class="shop-gold">💰 <span id="shop-gold">0</span></div>
      </div>
      <div class="shop-status" id="shop-status"></div>
      <div class="shop-grid">
        ${card('potion', C.POTION.name, `${C.POTION.dur} 秒内回复 ${C.POTION.heal} 生命 · F 使用 · 最多 ${C.POTION.max} 瓶`, C.POTION.cost)}
        ${items.map(([id, it]) => card(id, it.name, it.desc, it.cost)).join('')}
      </div>
      <div class="shop-owned"><span>已有装备(点击以 60% 价格出售):</span><div id="shop-owned"></div></div>
      <div class="shop-foot">P / Esc 关闭 · 商店只能在泉水附近或阵亡时使用</div>`;
    this.el.shop.querySelectorAll('.shop-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const err = this.game.buyItem(this.game.player, btn.dataset.id);
        if (err) this.toast(err, 'bad');
        else {
          const id = btn.dataset.id;
          this.toast(`购入 ${id === 'potion' ? C.POTION.name : C.ITEMS[id].name}!`, 'gold');
        }
        this.refreshShop();
      });
    });
    this._ownedSig = null;
  }

  toggleShop(force) {
    const on = force ?? !this.shopOpen;
    this.shopOpen = on;
    this.el.shop.classList.toggle('hidden', !on);
    if (on) {
      this._ownedSig = null;
      this.refreshShop();
      document.exitPointerLock && document.exitPointerLock();
    } else if (!this.game.gameOver) this.game.lockPointer();
  }

  refreshShop() {
    const g = this.game, p = g.player;
    const inRange = g.inShopRange(p);
    $('shop-gold').textContent = Math.floor(p.gold);
    $('shop-status').textContent = inRange ? '「慢慢挑,黑夜可不长眼。」' : '你离泉水太远了 —— 回城(B)后再来购买';
    $('shop-status').classList.toggle('bad', !inRange);
    this.el.shop.querySelectorAll('.shop-item').forEach(btn => {
      const id = btn.dataset.id;
      const cost = id === 'potion' ? C.POTION.cost : C.ITEMS[id].cost;
      const full = id === 'potion' ? p.potions >= C.POTION.max : p.items.length >= C.MAX_ITEMS;
      btn.disabled = !inRange || p.gold < cost || full;
      btn.classList.toggle('affordable', p.gold >= cost);
    });
    const sig = p.items.join(',') + '|' + inRange;
    if (sig !== this._ownedSig) {
      this._ownedSig = sig;
      const owned = $('shop-owned');
      owned.innerHTML = '';
      p.items.forEach((id, i) => {
        const b = document.createElement('button');
        b.className = 'owned-item';
        b.disabled = !inRange;
        b.title = `出售 ${C.ITEMS[id].name}(+${Math.floor(C.ITEMS[id].cost * 0.6)})`;
        b.innerHTML = `<img src="${itemIconURL(id)}">`;
        b.addEventListener('click', () => { g.sellItem(p, i); this.refreshShop(); });
        owned.appendChild(b);
      });
    }
  }

  // ---------------- Boss ----------------
  showBoss(name) { this.el.bossName.textContent = name; this.el.bossBar.classList.remove('hidden'); }
  updateBoss(pct, near) {
    this.el.bossFill.style.transform = `scaleX(${Math.max(0, pct)})`;
    this.el.bossBar.classList.toggle('far', !near);
  }
  hideBoss() { this.el.bossBar.classList.add('hidden'); }

  // ---------------- 结算 ----------------
  endScreen(victory, detailHtml) {
    const es = this.el.endScreen;
    es.classList.remove('hidden');
    es.classList.toggle('victory', victory);
    this.el.endTitle.textContent = victory ? '胜 利!' : '失 败';
    this.el.endDetail.innerHTML = detailHtml;
    this.toggleShop(false);
    document.exitPointerLock && document.exitPointerLock();
  }
}
