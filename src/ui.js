// ============================================================
// HUD / 对话框 / 时钟 / 第一人称武器 —— 所有 DOM 层交互
// ============================================================
import { makeSkillIcon } from './textures.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor(game, hero) {
    this.game = game;
    this.hero = hero;
    this.dialogOpen = false;
    this.slots = [];
    this._bannerTimer = null;

    this.el = {
      hud: $('hud'), hpFill: $('hp-fill'), hpText: $('hp-text'),
      mpFill: $('mp-fill'), mpText: $('mp-text'), xpFill: $('xp-fill'),
      levelNum: $('level-num'), skillBar: $('skill-bar'),
      dayLabel: $('day-label'), phaseLabel: $('phase-label'),
      goldNum: $('gold-num'), killNum: $('kill-num'),
      banner: $('banner'), subbanner: $('subbanner'),
      interactTip: $('interact-tip'), toastArea: $('toast-area'),
      dialog: $('event-dialog'), dialogTitle: $('event-title'),
      dialogDesc: $('event-desc'), dialogChoices: $('event-choices'),
      damageFlash: $('damage-flash'),
      bossBar: $('boss-bar'), bossName: $('boss-name'), bossFill: $('boss-fill'),
      endScreen: $('end-screen'), endTitle: $('end-title'), endDetail: $('end-detail'),
      clock: $('clock-canvas'),
    };
    this.clockCtx = this.el.clock.getContext('2d');
    this.buildSkillBar();
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
      icon.style.width = '100%'; icon.style.height = '100%'; icon.style.borderRadius = '8px';
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

  // ---------------- 第一人称武器 ----------------
  buildWeapon() {
    const c = document.createElement('canvas');
    c.width = 360; c.height = 420;
    c.style.cssText = `position:fixed; right:4vw; bottom:-4vh; width:min(34vh,42vw); z-index:5;
      pointer-events:none; transform-origin: 80% 95%; filter: drop-shadow(0 6px 12px rgba(0,0,0,.5));`;
    document.body.appendChild(c);
    this.weaponEl = c;
    this.drawWeapon(c.getContext('2d'));
    this.attackT = -9;
    this.weaponHidden = false;
  }

  drawWeapon(ctx) {
    const ink = '#211c15';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const stroke = w => { ctx.strokeStyle = ink; ctx.lineWidth = w; ctx.stroke(); };
    // 握持的手
    const hand = (x, y) => {
      ctx.fillStyle = '#dbb890';
      ctx.beginPath(); ctx.ellipse(x, y, 34, 40, -.3, 0, 7); ctx.fill(); stroke(5);
    };
    if (this.hero.id === 'mage') {
      // 法杖
      ctx.fillStyle = '#6b4a2a';
      ctx.beginPath();
      ctx.moveTo(150, 420); ctx.lineTo(196, 118); ctx.lineTo(216, 120); ctx.lineTo(186, 420);
      ctx.closePath(); ctx.fill(); stroke(5);
      // 杖头缠枝
      ctx.strokeStyle = '#54381e'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(198, 130); ctx.quadraticCurveTo(160, 90, 206, 60);
      ctx.quadraticCurveTo(252, 92, 210, 128); ctx.stroke();
      ctx.strokeStyle = ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(198, 130); ctx.quadraticCurveTo(160, 90, 206, 60);
      ctx.quadraticCurveTo(252, 92, 210, 128); ctx.stroke();
      // 悬浮宝珠
      const g = ctx.createRadialGradient(206, 88, 4, 206, 88, 30);
      g.addColorStop(0, '#e8d0ff'); g.addColorStop(.5, '#9a6ad0'); g.addColorStop(1, 'rgba(122,74,208,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(206, 88, 30, 0, 7); ctx.fill();
      hand(168, 330);
    } else if (this.hero.id === 'warrior') {
      // 巨斧
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
      // 双匕(画一把主匕首)
      ctx.fillStyle = '#b8c4c8';
      ctx.beginPath();
      ctx.moveTo(196, 210); ctx.quadraticCurveTo(240, 120, 300, 34);
      ctx.quadraticCurveTo(300, 130, 240, 224); ctx.closePath(); ctx.fill(); stroke(5);
      ctx.strokeStyle = '#8e9ba0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(220, 190); ctx.quadraticCurveTo(260, 120, 288, 58); ctx.stroke();
      // 护手 + 柄
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
    const bobA = moving ? 10 : 3;
    const bobS = moving ? 7.5 * speedMul : 1.6;
    const bx = Math.sin(t * bobS) * bobA * .6;
    const by = Math.abs(Math.cos(t * bobS)) * bobA;
    let rot = 0, px = 0, py = 0;
    const at = t - this.attackT;
    if (at < .28) {
      const k = Math.sin((at / .28) * Math.PI);
      rot = -38 * k; px = -30 * k; py = 26 * k;
    }
    this.weaponEl.style.transform =
      `translate(${bx + px}px, ${by + py}px) rotate(${rot}deg)`;
  }

  // ---------------- 状态条 ----------------
  update() {
    const g = this.game, p = g.player;
    const setBar = (el, cur, max) => { el.style.transform = `scaleX(${Math.max(0, Math.min(1, cur / max))})`; };
    setBar(this.el.hpFill, p.hp, p.maxHp);
    setBar(this.el.mpFill, p.mp, p.maxMp);
    setBar(this.el.xpFill, p.xp, g.xpNeed());
    this.el.hpText.textContent = `${Math.ceil(p.hp)}${p.shield > 0 ? ` (+${Math.ceil(p.shield)})` : ''} / ${p.maxHp}`;
    this.el.mpText.textContent = `${Math.floor(p.mp)} / ${p.maxMp}`;
    this.el.levelNum.textContent = p.level;
    this.el.goldNum.textContent = p.gold;
    this.el.killNum.textContent = p.kills;
    this.el.dayLabel.textContent = `第 ${g.day} 天`;
    this.el.phaseLabel.textContent = g.phaseName();

    // 技能格
    this.hero.skills.forEach((sk, i) => {
      const s = this.slots[i];
      const lvl = p.skillLevels[i];
      s.slot.classList.toggle('locked', lvl === 0);
      const cdLeft = p.cooldowns[i] - g.time;
      if (lvl > 0 && cdLeft > 0) {
        const total = sk.cooldown(lvl) * (1 - p.cdr);
        s.cd.style.setProperty('--cd', `${(cdLeft / total) * 100}%`);
        s.cd.textContent = cdLeft > 1 ? Math.ceil(cdLeft) : cdLeft.toFixed(1);
      } else {
        s.cd.style.setProperty('--cd', '0%');
        s.cd.textContent = '';
      }
      [...s.pips.children].forEach((pip, pi) => pip.classList.toggle('on', pi < lvl));
      const canUp = p.skillPoints > 0 && lvl < sk.maxLevel && (sk.key !== 'R' || p.level >= 6);
      s.up.classList.toggle('hidden', !canUp);
    });

    this.drawClock();
  }

  drawClock() {
    const g = this.game, ctx = this.clockCtx, s = 128, cx = s / 2, cy = s / 2, r = 52;
    ctx.clearRect(0, 0, s, s);
    // 底盘
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
    // 指针
    const a = g.dayFrac * TAU - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
    ctx.lineWidth = 5; ctx.strokeStyle = '#f0e6c8'; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 7); ctx.fillStyle = '#f0e6c8'; ctx.fill();
  }

  // ---------------- 横幅 / 浮动消息 ----------------
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

  showInteract(html) { this.el.interactTip.innerHTML = html; this.el.interactTip.classList.remove('hidden'); }
  hideInteract() { this.el.interactTip.classList.add('hidden'); }

  damageFlash() {
    const f = this.el.damageFlash;
    f.style.transition = 'none'; f.style.opacity = 1;
    requestAnimationFrame(() => { f.style.transition = 'opacity .5s ease'; f.style.opacity = 0; });
  }

  // ---------------- 对话框 ----------------
  openDialog(title, desc, choices) {
    this.dialogOpen = true;
    this.el.dialogTitle.textContent = title;
    this.el.dialogDesc.textContent = desc;
    this.el.dialogChoices.innerHTML = '';
    choices.forEach(ch => {
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      btn.disabled = !!ch.disabled;
      btn.innerHTML = `${ch.label}${ch.sub ? `<small>${ch.sub}</small>` : ''}`;
      btn.addEventListener('click', () => {
        this.closeDialog();
        ch.action && ch.action();
        if (!this.dialogOpen) this.game.resumeFromDialog();
      });
      this.el.dialogChoices.appendChild(btn);
    });
    this.el.dialog.classList.remove('hidden');
    document.exitPointerLock && document.exitPointerLock();
  }

  closeDialog() {
    this.dialogOpen = false;
    this.el.dialog.classList.add('hidden');
  }

  // ---------------- Boss ----------------
  showBoss(name) { this.el.bossName.textContent = name; this.el.bossBar.classList.remove('hidden'); }
  updateBoss(pct) { this.el.bossFill.style.transform = `scaleX(${Math.max(0, pct)})`; }
  hideBoss() { this.el.bossBar.classList.add('hidden'); }

  // ---------------- 结算 ----------------
  endScreen(victory, detailHtml, onContinue) {
    const es = this.el.endScreen;
    es.classList.remove('hidden');
    es.classList.toggle('victory', victory);
    this.el.endTitle.textContent = victory ? '胜 利!' : '你死了';
    this.el.endDetail.innerHTML = detailHtml;
    document.exitPointerLock && document.exitPointerLock();
    if (victory && onContinue) {
      const btn = document.createElement('button');
      btn.textContent = '继续游荡';
      btn.addEventListener('click', () => { es.classList.add('hidden'); onContinue(); });
      es.appendChild(btn);
    }
  }
}
