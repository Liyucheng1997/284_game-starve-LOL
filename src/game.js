// ============================================================
// 游戏核心:3D 世界 / 第一人称 / 战斗 / AI / 昼夜 / 奇遇 / 升级
// ============================================================
import * as THREE from 'three';
import * as TEX from './textures.js';
import { HEROES } from './heroes.js';
import { ENCOUNTERS, ENCOUNTER_LAYOUT } from './encounters.js';
import { UI } from './ui.js';
import { sfx } from './sfx.js';

const WORLD_R = 90;          // 可活动半径
const DAY_LENGTH = 150;      // 一天的秒数
const BOSS_DAY = 3;          // Boss 苏醒之日

const ENEMY_TYPES = {
  spider: { tex: 'spider', w: 2.3, h: 2.3, r: 0.9, hp: 60, dmg: 9, speed: 3.4, reach: 2.4, aggro: 16, xp: 22, gold: [2, 6], atkCd: 1.3, name: '蜘蛛' },
  hound: { tex: 'hound', w: 2.6, h: 2.6, r: 1.0, hp: 95, dmg: 14, speed: 5.4, reach: 2.6, aggro: 34, xp: 38, gold: [4, 9], atkCd: 1.1, name: '猎犬' },
  shadow: { tex: 'shadow', w: 2.6, h: 2.6, r: 1.0, hp: 75, dmg: 13, speed: 4.4, reach: 2.4, aggro: 26, xp: 45, gold: [5, 10], atkCd: 1.2, night: true, name: '暗影' },
  tentacle: { tex: 'tentacle', w: 2.6, h: 4.2, r: 1.1, hp: 200, dmg: 24, speed: 0, reach: 4.4, aggro: 4.6, xp: 70, gold: [10, 20], atkCd: 1.6, static: true, name: '触手' },
  treeguard: { tex: 'treeguard', w: 6.5, h: 9, r: 2.2, hp: 1600, dmg: 32, speed: 2.7, reach: 4.8, aggro: 999, xp: 400, gold: [150, 220], atkCd: 2.1, boss: true, name: '树精巨人' },
};

export class Game {
  constructor(heroId) {
    this.hero = HEROES[heroId];
    this.time = 0;
    this.day = 1;
    this.dayFrac = 0.08; // 从清晨开始
    this.DAY_END = 0.55;
    this.DUSK_END = 0.72;
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.orbs = [];
    this.floatTexts = [];
    this.encounterNodes = [];
    this.obstacles = [];
    this.schedule = [];
    this.meteors = [];
    this.trial = null;
    this.boss = null;
    this.bossSpawned = false;
    this.gameOver = false;
    this.shakeAmt = 0;
    this.nextSpawn = 20;      // 开局 20 秒安全期
    this.nextHoundRaid = DAY_LENGTH * 1.4;
    this.wasNight = false;
    this.tempBuffs = {};
    this.keys = {};
    this.attacking = false;
    this.dash = null;
    this.bladestormUntil = 0;
    this.nextBladeTick = 0;

    const s = this.hero.stats;
    this.player = {
      hp: s.maxHp, maxHp: s.maxHp, mp: s.maxMp, maxMp: s.maxMp,
      shield: 0, shieldUntil: 0,
      level: 1, xp: 0, skillPoints: 1, skillLevels: [0, 0, 0, 0],
      cooldowns: [0, 0, 0, 0],
      gold: 0, kills: 0,
      baseAd: s.attackDamage, bonusAd: 0,
      moveSpeedMul: 1, cdr: 0, lifesteal: 0,
      stealthUntil: 0, empowerNext: null,
      nextAttack: 0,
      resetCooldowns: () => { this.player.cooldowns = [0, 0, 0, 0]; },
    };

    this.initThree();
    this.buildWorld();
    this.ui = new UI(this, this.hero);
    this.initInput();
    this.fx = this.makeFx();
  }

  // ================= three.js 基础 =================
  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8a8266);
    this.scene.fog = new THREE.Fog(0x8a8266, 30, 110);

    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 300);
    this.rig = new THREE.Object3D();
    this.rig.position.set(0, 0, 6);
    this.camera.position.set(0, 1.7, 0);
    this.rig.add(this.camera);
    this.scene.add(this.rig);
    this.pitch = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.hemi = new THREE.HemisphereLight(0xf0e6c8, 0x4a4632, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe8b0, 1.2);
    this.sun.position.set(30, 50, 20);
    this.scene.add(this.sun);
    this.torch = new THREE.PointLight(0xffb060, 0, 16, 1.6);
    this.torch.position.set(0, 1.6, 0);
    this.rig.add(this.torch);

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    this.litMats = [];       // 需要随昼夜变暗的 sprite 材质
    this.texCache = {};
  }

  canvasTex(key, maker) {
    if (!this.texCache[key]) {
      const t = new THREE.CanvasTexture(maker());
      t.colorSpace = THREE.SRGBColorSpace;
      this.texCache[key] = t;
    }
    return this.texCache[key];
  }

  makeSprite(texKey, maker, w, h, { lit = true, additive = false } = {}) {
    const mat = new THREE.SpriteMaterial({
      map: this.canvasTex(texKey, maker),
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    if (lit) this.litMats.push(mat);
    const sp = new THREE.Sprite(mat);
    sp.center.set(0.5, 0);
    sp.scale.set(w, h, 1);
    return sp;
  }

  // ================= 世界搭建 =================
  buildWorld() {
    // 地面
    const gtex = this.canvasTex('ground', TEX.makeGroundTexture);
    gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
    gtex.repeat.set(14, 14);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(WORLD_R + 40, 48),
      new THREE.MeshLambertMaterial({ map: gtex })
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // 篝火(出生点)
    this.campfire = this.makeSprite('campfire', TEX.makeCampfireTexture, 2.4, 2.4, { lit: false, additive: false });
    this.campfire.position.set(0, 0, 0);
    this.scene.add(this.campfire);
    this.fireLight = new THREE.PointLight(0xff9040, 1.6, 20, 1.4);
    this.fireLight.position.set(0, 1.6, 0);
    this.scene.add(this.fireLight);

    // 奇遇节点(先放,道具避开它们)
    const taken = [{ x: 0, z: 0, r: 10 }];
    ENCOUNTER_LAYOUT.forEach(cfg => {
      for (let i = 0; i < cfg.count; i++) {
        let x, z, ok = false, tries = 0;
        while (!ok && tries++ < 60) {
          const a = Math.random() * Math.PI * 2;
          const r = cfg.minR + Math.random() * (cfg.maxR - cfg.minR);
          x = Math.cos(a) * r; z = Math.sin(a) * r;
          ok = taken.every(t => Math.hypot(x - t.x, z - t.z) > t.r + 6);
        }
        taken.push({ x, z, r: 5 });
        const def = ENCOUNTERS[cfg.type];
        const texMaker = {
          chest: TEX.makeChestTexture, merchant: TEX.makeMerchantTexture,
          altar: TEX.makeAltarTexture, well: TEX.makeWellTexture, obelisk: TEX.makeObeliskTexture,
        }[def.tex];
        const sp = this.makeSprite('enc_' + def.tex, texMaker, def.w, def.h);
        sp.position.set(x, 0, z);
        this.scene.add(sp);
        this.encounterNodes.push({ type: cfg.type, def, pos: { x, z }, sprite: sp, consumed: false });
      }
    });

    // 沼泽 + 触手
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 45 + Math.random() * 38;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (taken.some(t => Math.hypot(x - t.x, z - t.z) < t.r + 5)) continue;
      taken.push({ x, z, r: 6 });
      const mud = new THREE.Mesh(
        new THREE.CircleGeometry(5.5, 20),
        new THREE.MeshLambertMaterial({ color: 0x2e3326, transparent: true, opacity: 0.9 })
      );
      mud.rotation.x = -Math.PI / 2;
      mud.position.set(x, 0.03, z);
      this.scene.add(mud);
      this.spawnEnemy('tentacle', x + (Math.random() - .5) * 3, z + (Math.random() - .5) * 3);
    }

    // 树木 / 石头 / 草
    const scatter = (n, minR, maxR, place) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = minR + Math.sqrt(Math.random()) * (maxR - minR);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (taken.some(t => Math.hypot(x - t.x, z - t.z) < t.r)) continue;
        place(x, z);
      }
    };
    scatter(110, 10, WORLD_R, (x, z) => {
      const v = Math.floor(Math.random() * 4);
      const h = 7 + Math.random() * 4;
      const sp = this.makeSprite('tree' + v, () => TEX.makeTreeTexture(v), h * 0.66, h);
      sp.position.set(x, 0, z);
      this.scene.add(sp);
      this.obstacles.push({ x, z, r: 0.9 });
    });
    scatter(34, 14, WORLD_R, (x, z) => {
      const v = Math.floor(Math.random() * 3);
      const s = 1.2 + Math.random() * 1.2;
      const sp = this.makeSprite('rock' + v, () => TEX.makeRockTexture(v), s, s);
      sp.position.set(x, 0, z);
      this.scene.add(sp);
      this.obstacles.push({ x, z, r: s * 0.5 });
    });
    scatter(80, 6, WORLD_R, (x, z) => {
      const v = Math.floor(Math.random() * 3);
      const sp = this.makeSprite('grass' + v, () => TEX.makeGrassTuftTexture(v), 1.4, 1.4);
      sp.position.set(x, 0, z);
      this.scene.add(sp);
    });
    // 世界边缘的枯树墙
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + Math.random() * 0.06;
      const r = WORLD_R + 2 + Math.random() * 8;
      const v = Math.floor(Math.random() * 3);
      const h = 8 + Math.random() * 4;
      const sp = this.makeSprite('dead' + v, () => TEX.makeDeadTreeTexture(v), h * 0.8, h);
      sp.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      this.scene.add(sp);
    }
  }

  // ================= 输入 =================
  lockPointer() {
    try {
      const r = this.renderer.domElement.requestPointerLock();
      if (r && r.catch) r.catch(() => {});
    } catch (e) { /* 某些环境下不可用 */ }
  }

  initInput() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (!this.ui.dialogOpen && !this.gameOver) this.lockPointer();
    });
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== canvas) return;
      this.rig.rotation.y -= e.movementX * 0.0021;
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - e.movementY * 0.0021));
      this.camera.rotation.x = this.pitch;
    });
    document.addEventListener('mousedown', e => {
      if (document.pointerLockElement === canvas && e.button === 0) this.attacking = true;
    });
    document.addEventListener('mouseup', e => { if (e.button === 0) this.attacking = false; });

    document.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (this.ui.dialogOpen || this.gameOver) return;
      if (e.code === 'KeyQ') this.castSkill(0);
      if (e.code === 'KeyE') this.castSkill(1);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.castSkill(2);
      if (e.code === 'KeyR') this.castSkill(3);
      if (e.code === 'KeyF') this.tryInteract();
      if (e.code.startsWith('Digit')) {
        const n = +e.code.slice(5);
        if (n >= 1 && n <= 4) this.upgradeSkill(n - 1);
      }
    });
    document.addEventListener('keyup', e => { this.keys[e.code] = false; });
  }

  // ================= 工具 =================
  playerPos() { return { x: this.rig.position.x, z: this.rig.position.z }; }
  forward() { return { x: -Math.sin(this.rig.rotation.y), z: -Math.cos(this.rig.rotation.y) }; }
  isNight() { return this.dayFrac >= this.DUSK_END; }
  isStealthed() { return this.time < this.player.stealthUntil; }
  phaseName() { return this.dayFrac < this.DAY_END ? '白昼' : this.dayFrac < this.DUSK_END ? '黄昏' : '黑夜'; }
  xpNeed() { return 50 + (this.player.level - 1) * 32; }
  buffMul(key) {
    let m = 1;
    for (const id in this.tempBuffs) {
      const b = this.tempBuffs[id];
      if (b.until > this.time && b.mods[key]) m *= b.mods[key];
    }
    return m;
  }
  getAD() { return (this.player.baseAd + this.player.bonusAd) * this.buffMul('adMul'); }
  getSpeed() { return this.hero.stats.moveSpeed * this.player.moveSpeedMul * this.buffMul('speedMul') * (this.time < this.bladestormUntil ? 1.2 : 1); }
  toast(t, c) { this.ui.toast(t, c); }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  after(delay, fn) { this.schedule.push({ t: this.time + delay, fn }); }

  addGold(n) { this.player.gold = Math.max(0, this.player.gold + n); }
  heal(n) {
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + n);
    if (n > 0) this.fx.burst({ x: this.rig.position.x, y: 1.2, z: this.rig.position.z }, 0x8fd06c, 10, 3, 0.4);
  }
  restoreMp(n) { this.player.mp = Math.min(this.player.maxMp, this.player.mp + n); }
  addMaxHp(n) { this.player.maxHp += n; this.player.hp += n; }
  addTempBuff(id, mods, dur) { this.tempBuffs[id] = { mods, until: this.time + dur }; }
  openDialog(title, desc, choices) { this.ui.openDialog(title, desc, choices); }
  resumeFromDialog() {
    if (!this.gameOver) this.lockPointer();
  }

  // ================= 特效 =================
  makeFx() {
    const partTex = this.canvasTex('particle', TEX.makeParticleTexture);
    const spawnPart = (pos, color, vel, size, life, gravity = 0) => {
      const mat = new THREE.SpriteMaterial({
        map: partTex, color, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(pos.x, pos.y, pos.z);
      sp.scale.set(size, size, 1);
      this.scene.add(sp);
      this.particles.push({ sp, vel: { ...vel }, life, maxLife: life, gravity });
    };
    return {
      burst: (pos, color, n = 14, speed = 6, size = 0.5) => {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
          spawnPart(pos, color, {
            x: Math.cos(a) * Math.cos(e) * speed * (0.4 + Math.random() * 0.6),
            y: Math.abs(Math.sin(e)) * speed * 0.7 + 1,
            z: Math.sin(a) * Math.cos(e) * speed * (0.4 + Math.random() * 0.6),
          }, size * (0.6 + Math.random() * 0.8), 0.5 + Math.random() * 0.4, 8);
        }
      },
      ring: (pos, radius, color) => {
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2;
          spawnPart({ x: pos.x, y: 0.4, z: pos.z }, color,
            { x: Math.cos(a) * radius * 1.6, y: 0.6, z: Math.sin(a) * radius * 1.6 },
            0.6, 0.45, 2);
        }
      },
      slash: (color) => {
        const f = this.forward();
        const px = this.rig.position.x + f.x * 2, pz = this.rig.position.z + f.z * 2;
        for (let i = 0; i < 10; i++) {
          spawnPart({ x: px + (Math.random() - .5), y: 1.2 + (Math.random() - .5), z: pz + (Math.random() - .5) },
            color, { x: f.x * 8 + (Math.random() - .5) * 4, y: (Math.random() - .5) * 3, z: f.z * 8 + (Math.random() - .5) * 4 },
            0.45, 0.3, 4);
        }
      },
      point: spawnPart,
    };
  }

  floatText(pos, text, color = '#f4ecd8', big = false) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.font = `bold ${big ? 56 : 40}px 'Segoe Print', 'KaiTi', cursive`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#141008'; ctx.lineWidth = 8;
    ctx.strokeText(text, 128, 48);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 48);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.position.set(pos.x, pos.y, pos.z);
    sp.scale.set(big ? 3.4 : 2.4, big ? 1.3 : 0.9, 1);
    this.scene.add(sp);
    this.floatTexts.push({ sp, life: 0.9, vy: 2.2 });
  }

  // ================= 敌人 =================
  spawnEnemy(type, x, z) {
    const def = ENEMY_TYPES[type];
    const dayScale = 1 + (this.day - 1) * 0.3;
    const g = new THREE.Group();
    const texMakers = {
      spider: TEX.makeSpiderTexture, hound: TEX.makeHoundTexture, shadow: TEX.makeShadowTexture,
      tentacle: TEX.makeTentacleTexture, treeguard: TEX.makeTreeguardTexture,
    };
    const body = this.makeSprite('en_' + type, texMakers[type], def.w, def.h, { lit: type !== 'shadow' });
    // 每个敌人独立材质便于受击闪红
    body.material = body.material.clone();
    if (type !== 'shadow') this.litMats.push(body.material);
    g.add(body);
    // 影子
    const shadowMesh = new THREE.Mesh(
      new THREE.CircleGeometry(def.r * 0.9, 12),
      new THREE.MeshBasicMaterial({ color: 0x0a0805, transparent: true, opacity: 0.35 })
    );
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.02;
    g.add(shadowMesh);
    // 血条
    const hpC = document.createElement('canvas');
    hpC.width = 64; hpC.height = 10;
    const hpTex = new THREE.CanvasTexture(hpC);
    const hpBar = new THREE.Sprite(new THREE.SpriteMaterial({ map: hpTex, transparent: true, depthWrite: false }));
    hpBar.scale.set(1.8, 0.28, 1);
    hpBar.position.y = def.h + 0.35;
    hpBar.visible = false;
    g.add(hpBar);

    g.position.set(x, 0, z);
    this.scene.add(g);
    const e = {
      type, def, group: g, body, hpBar, hpC, hpTex,
      x, z, r: def.r,
      hp: def.hp * (def.boss ? 1 : dayScale) * (1 + (this.player.level - 1) * 0.06),
      maxHp: 0,
      dmg: def.dmg * (def.boss ? 1 : (1 + (this.day - 1) * 0.12)),
      speed: def.speed, reach: def.reach,
      nextAtk: 0, aggro: false,
      slowUntil: 0, slowFactor: 1,
      knock: { x: 0, z: 0 },
      wanderT: 0, wx: x, wz: z,
      phase: Math.random() * 7,
      dead: false, fade: 1,
      nextSummon: this.time + 12,
    };
    e.maxHp = e.hp;
    this.enemies.push(e);
    if (def.boss) {
      this.boss = e;
      this.ui.showBoss(def.name);
    }
    return e;
  }

  spawnEnemiesAround(pos, type, n, r = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawnEnemy(type, pos.x + Math.cos(a) * r, pos.z + Math.sin(a) * r);
    }
  }

  drawEnemyHpBar(e) {
    const ctx = e.hpC.getContext('2d');
    ctx.clearRect(0, 0, 64, 10);
    ctx.fillStyle = 'rgba(10,8,5,.8)';
    ctx.fillRect(0, 0, 64, 10);
    ctx.fillStyle = e.def.boss ? '#b04a3d' : '#8f2f27';
    ctx.fillRect(1, 1, 62 * Math.max(0, e.hp / e.maxHp), 8);
    e.hpTex.needsUpdate = true;
    e.hpBar.visible = e.hp < e.maxHp;
  }

  damageEnemy(e, amount, { crit = false, knockFrom = null, knockPower = 0 } = {}) {
    if (e.dead) return;
    e.hp -= amount;
    e.aggro = true;
    e.body.material.userData.flashUntil = this.time + 0.12;
    this.drawEnemyHpBar(e);
    this.floatText({ x: e.x, y: e.def.h + 0.6, z: e.z },
      String(Math.round(amount)), crit ? '#f0c040' : '#f4ecd8', crit);
    crit ? sfx.crit() : sfx.hit();
    if (this.player.lifesteal > 0) this.heal(amount * this.player.lifesteal);
    if (knockFrom && !e.def.static && !e.def.boss) {
      const d = Math.hypot(e.x - knockFrom.x, e.z - knockFrom.z) || 1;
      e.knock.x += (e.x - knockFrom.x) / d * knockPower;
      e.knock.z += (e.z - knockFrom.z) / d * knockPower;
    }
    if (e.def.boss) this.ui.updateBoss(e.hp / e.maxHp);
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    e.dead = true;
    this.player.kills++;
    this.fx.burst({ x: e.x, y: e.def.h * 0.5, z: e.z }, e.type === 'shadow' ? 0x8a6ad0 : 0xc9a227, 16, 6, 0.55);
    // 经验球与金币球
    const orbTexXp = this.canvasTex('orb_xp', () => TEX.makeOrbTexture('#b090ff'));
    const orbTexGold = this.canvasTex('orb_gold', () => TEX.makeOrbTexture('#ffd24a'));
    const nXp = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < nXp; i++) {
      const mat = new THREE.SpriteMaterial({ map: orbTexXp, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(0.55, 0.55, 1);
      sp.position.set(e.x + (Math.random() - .5) * 2, 0.6, e.z + (Math.random() - .5) * 2);
      this.scene.add(sp);
      this.orbs.push({ sp, type: 'xp', value: Math.ceil(e.def.xp / nXp), phase: Math.random() * 7 });
    }
    const gold = e.def.gold[0] + Math.floor(Math.random() * (e.def.gold[1] - e.def.gold[0] + 1));
    const mat = new THREE.SpriteMaterial({ map: orbTexGold, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(0.7, 0.7, 1);
    sp.position.set(e.x, 0.6, e.z);
    this.scene.add(sp);
    this.orbs.push({ sp, type: 'gold', value: gold, phase: Math.random() * 7 });

    if (e.def.boss) {
      this.ui.hideBoss();
      this.boss = null;
      sfx.good();
      this.after(1.2, () => this.victory());
    }
  }

  // ================= 玩家伤害 =================
  damagePlayer(amount) {
    if (this.gameOver) return;
    const s = this.hero.stats;
    let dmg = amount * (1 - (s.damageReduction || 0));
    if (this.player.shield > 0) {
      const absorbed = Math.min(this.player.shield, dmg);
      this.player.shield -= absorbed;
      dmg -= absorbed;
    }
    if (dmg <= 0) return;
    this.player.hp -= dmg;
    this.ui.damageFlash();
    sfx.hurt();
    this.shake(0.25);
    if (this.player.hp <= 0) this.defeat();
  }

  damagePlayerRaw(amount) {
    this.player.hp = Math.max(1, this.player.hp - amount);
    this.ui.damageFlash();
  }

  // ================= 技能系统 =================
  upgradeSkill(i) {
    const p = this.player, sk = this.hero.skills[i];
    if (p.skillPoints <= 0) return;
    if (p.skillLevels[i] >= sk.maxLevel) return;
    if (sk.key === 'R' && p.level < 6) { this.toast('大招需要 6 级才能解锁!', 'bad'); return; }
    p.skillLevels[i]++;
    p.skillPoints--;
    sfx.good();
    this.toast(`${sk.name} 升至 ${p.skillLevels[i]} 级!`, 'good');
  }

  castSkill(i) {
    const p = this.player, sk = this.hero.skills[i];
    const lvl = p.skillLevels[i];
    if (lvl <= 0) { this.toast(`${sk.name} 尚未学习(按 ${i + 1} 加点)`, 'bad'); return; }
    if (this.time < p.cooldowns[i]) return;
    const cost = sk.mana(lvl);
    if (p.mp < cost) { this.toast('法力不足!', 'bad'); return; }
    p.mp -= cost;
    p.cooldowns[i] = this.time + sk.cooldown(lvl) * (1 - p.cdr);
    sk.cast(this, lvl);
    this.ui.weaponAttack();
  }

  // ---- 技能实现接口(供 heroes.js 调用) ----
  spawnProjectile({ speed, radius, color, trail, damage, aoe = 0 }) {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const pos = new THREE.Vector3(this.rig.position.x, 1.6, this.rig.position.z)
      .addScaledVector(dir, 0.8);
    const mat = new THREE.SpriteMaterial({
      map: this.canvasTex('orb_p', () => TEX.makeOrbTexture('#fff')),
      color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(radius * 2.2, radius * 2.2, 1);
    sp.position.copy(pos);
    this.scene.add(sp);
    this.projectiles.push({ sp, vel: dir.multiplyScalar(speed), damage, aoe, radius, color, trail, life: 2.2 });
  }

  meleeCone(range, halfAngle, damage, { knock = 0 } = {}) {
    const f = this.forward();
    const p = this.playerPos();
    let hitAny = false;
    this.enemies.forEach(e => {
      if (e.dead) return;
      const dx = e.x - p.x, dz = e.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > range + e.r) return;
      const dot = (dx * f.x + dz * f.z) / (d || 1);
      if (d > 1.2 && dot < Math.cos(halfAngle)) return;
      hitAny = true;
      let dmg = damage;
      let crit = Math.random() < (this.hero.stats.critChance || 0);
      if (this.player.empowerNext && this.time < this.player.empowerNext.until) {
        dmg += this.player.empowerNext.bonus;
        this.player.empowerNext = null;
      }
      if (crit) dmg *= 1.8;
      this.damageEnemy(e, dmg, { crit, knockFrom: knock ? p : null, knockPower: knock });
    });
    return hitAny;
  }

  shadowStrike(range, damage) {
    const f = this.forward();
    const p = this.playerPos();
    let best = null, bestD = 1e9;
    this.enemies.forEach(e => {
      if (e.dead) return;
      const dx = e.x - p.x, dz = e.z - p.z;
      const d = Math.hypot(dx, dz);
      const dot = (dx * f.x + dz * f.z) / (d || 1);
      if (d < range + e.r && dot > 0.5 && d < bestD) { best = e; bestD = d; }
    });
    if (best) {
      const surprise = this.isStealthed() || !best.aggro;
      this.damageEnemy(best, damage * (surprise ? 2 : 1), { crit: surprise });
      this.fx.burst({ x: best.x, y: best.def.h * 0.55, z: best.z }, 0x9ad0e0, 12, 5, 0.5);
    }
  }

  blinkPlayer(dist) {
    const f = this.forward();
    const from = { x: this.rig.position.x, y: 1.2, z: this.rig.position.z };
    this.fx.burst(from, 0xb090ff, 12, 4, 0.5);
    let moved = 0;
    while (moved < dist) {
      const step = Math.min(0.5, dist - moved);
      const nx = this.rig.position.x + f.x * step;
      const nz = this.rig.position.z + f.z * step;
      if (Math.hypot(nx, nz) > WORLD_R) break;
      if (this.obstacles.some(o => Math.hypot(nx - o.x, nz - o.z) < o.r + 0.5)) break;
      this.rig.position.x = nx; this.rig.position.z = nz;
      moved += step;
    }
    this.fx.burst({ x: this.rig.position.x, y: 1.2, z: this.rig.position.z }, 0xb090ff, 14, 4, 0.5);
  }

  dashPlayer(dist, dur, { damage = 0, knock = 0 } = {}) {
    const f = this.forward();
    this.dash = { fx: f.x, fz: f.z, speed: dist / dur, until: this.time + dur, damage, knock, hit: new Set() };
  }

  addShield(amount, dur) {
    this.player.shield = amount;
    this.player.shieldUntil = this.time + dur;
  }

  setStealth(dur) {
    this.player.stealthUntil = this.time + dur;
    this.enemies.forEach(e => { e.aggro = false; });
    this.fx.burst({ x: this.rig.position.x, y: 1, z: this.rig.position.z }, 0x8a98a0, 22, 5, 0.7);
    sfx.blink();
    this.toast('你隐入烟雾之中……');
  }

  aimGroundPoint(maxDist) {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const p = this.playerPos();
    const hLen = Math.hypot(dir.x, dir.z) || 0.001;
    let d;
    if (dir.y < -0.05) d = Math.min(maxDist, (1.7 / -dir.y) * hLen);
    else d = maxDist;
    return { x: p.x + (dir.x / hLen) * d, z: p.z + (dir.z / hLen) * d };
  }

  scheduleMeteor(point, delay, radius, dmg) {
    sfx.fireball();
    this.fx.ring(point, radius * 0.8, 0xc03020);
    // 下坠的火球
    const mat = new THREE.SpriteMaterial({
      map: this.canvasTex('orb_p', () => TEX.makeOrbTexture('#fff')),
      color: 0xf66a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(3, 3, 1);
    sp.position.set(point.x + 6, 30, point.z + 4);
    this.scene.add(sp);
    this.meteors.push({ sp, target: point, t0: this.time, t1: this.time + delay, radius, dmg, from: { x: point.x + 6, y: 30, z: point.z + 4 } });
  }

  bladestorm(dur, dmgPerTick) {
    this.bladestormUntil = this.time + dur;
    this.bladestormDmg = dmgPerTick;
    this.nextBladeTick = this.time;
    sfx.swing();
    this.toast('血怒旋风!', 'good');
  }

  deathLotus(radius, hits, dmgPerHit) {
    const p = this.playerPos();
    const targets = this.enemies.filter(e => !e.dead && Math.hypot(e.x - p.x, e.z - p.z) < radius);
    if (!targets.length) { this.toast('周围没有目标!', 'bad'); this.player.cooldowns[3] = this.time + 1; return; }
    this.player.stealthUntil = Math.max(this.player.stealthUntil, this.time + hits * 0.3 + 0.4);
    for (let h = 0; h < hits; h++) {
      this.after(0.25 * h + 0.05, () => {
        sfx.crit();
        targets.forEach(e => {
          if (e.dead) return;
          this.damageEnemy(e, dmgPerHit, { crit: true });
          this.fx.burst({ x: e.x, y: e.def.h * 0.5, z: e.z }, 0xc9a0e8, 8, 5, 0.45);
        });
      });
    }
  }

  // ================= 普攻 =================
  tryBasicAttack() {
    const p = this.player;
    if (this.time < p.nextAttack) return;
    const s = this.hero.stats;
    p.nextAttack = this.time + s.attackCooldown;
    this.ui.weaponAttack();
    if (s.attackType === 'ranged') {
      sfx.swing();
      this.spawnProjectile({ speed: 34, radius: 0.32, color: 0xb090ff, trail: 0x9a6ad0, damage: this.getAD(), aoe: 0 });
    } else {
      sfx.swing();
      const hit = this.meleeCone(s.attackRange + 0.6, Math.PI * 0.4, this.getAD());
      if (hit) this.fx.slash(0xe8dcbb);
    }
  }

  // ================= 交互 =================
  nearestEncounter() {
    const p = this.playerPos();
    let best = null, bestD = 3.4;
    this.encounterNodes.forEach(n => {
      if (n.consumed) return;
      const d = Math.hypot(n.pos.x - p.x, n.pos.z - p.z);
      if (d < bestD) { best = n; bestD = d; }
    });
    return best;
  }

  tryInteract() {
    const n = this.nearestEncounter();
    if (n) n.def.interact(this, n);
  }

  consumeEncounter(node) {
    node.consumed = true;
    const fade = () => {
      node.sprite.material.opacity -= 0.05;
      if (node.sprite.material.opacity > 0) requestAnimationFrame(fade);
      else this.scene.remove(node.sprite);
    };
    node.sprite.material.transparent = true;
    fade();
  }

  // ================= 试炼 =================
  startTrial(node) {
    this.trial = { node, until: this.time + 25, nextWave: this.time + 0.5 };
    this.ui.banner('试炼开始!', '在石碑附近存活 25 秒!');
    sfx.boss();
  }

  updateTrial() {
    if (!this.trial) return;
    const t = this.trial;
    if (this.time >= t.until) {
      this.ui.banner('试炼完成!', '荒野的厚礼是你的了');
      sfx.good();
      this.addGold(130);
      this.gainXp(160);
      const blessings = [
        () => { this.player.bonusAd += 12; this.toast('石碑赐福:攻击力 +12!', 'good'); },
        () => { this.addMaxHp(70); this.toast('石碑赐福:生命上限 +70!', 'good'); },
        () => { this.player.cdr = Math.min(0.4, this.player.cdr + 0.08); this.toast('石碑赐福:冷却缩减 +8%!', 'good'); },
      ];
      blessings[Math.floor(Math.random() * blessings.length)]();
      this.toast('获得 130 金币与大量经验!', 'gold');
      this.consumeEncounter(t.node);
      this.trial = null;
      return;
    }
    this.ui.el.subbanner.textContent = `试炼剩余 ${Math.ceil(t.until - this.time)} 秒`;
    this.ui.el.subbanner.style.opacity = 1;
    if (this.time >= t.nextWave) {
      t.nextWave = this.time + 6;
      this.spawnEnemiesAround(t.node.pos, 'spider', 2, 9);
      if (this.day >= 1) this.spawnEnemiesAround(t.node.pos, 'hound', 1, 11);
    }
  }

  // ================= 经验 / 升级 =================
  gainXp(n) {
    const p = this.player;
    p.xp += n;
    while (p.xp >= this.xpNeed()) {
      p.xp -= this.xpNeed();
      p.level++;
      p.skillPoints++;
      p.maxHp += 25;
      p.baseAd += 2;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3);
      p.mp = p.maxMp;
      sfx.levelup();
      this.fx.ring(this.playerPos(), 4, 0xe0c04a);
      this.ui.banner(`升到 ${p.level} 级!`, p.level === 6 ? '大招已解锁!按 4 学习!' : '按 1~4 为技能加点');
    }
  }

  // ================= 昼夜 =================
  updateDayNight(dt) {
    this.dayFrac += dt / DAY_LENGTH;
    if (this.dayFrac >= 1) {
      this.dayFrac -= 1;
      this.day++;
      this.ui.banner(`第 ${this.day} 天`, '你又熬过了一夜');
      sfx.dawn();
      // 黎明驱散暗影
      this.enemies.forEach(e => { if (e.type === 'shadow' && !e.dead) this.killEnemyQuiet(e); });
    }
    const night = this.isNight();
    if (night && !this.wasNight) {
      this.ui.banner('黑夜降临……', '篝火旁比较安全');
      sfx.night();
      if (this.day >= BOSS_DAY && !this.bossSpawned) this.spawnBoss();
    }
    this.wasNight = night;

    // 光照插值
    let f; // 亮度因子
    if (this.dayFrac < this.DAY_END) f = 1;
    else if (this.dayFrac < this.DUSK_END) f = 1 - (this.dayFrac - this.DAY_END) / (this.DUSK_END - this.DAY_END) * 0.62;
    else f = 0.38;
    this.lightF = f;
    const dayCol = new THREE.Color(0x8a8266), nightCol = new THREE.Color(0x131624);
    const cur = nightCol.clone().lerp(dayCol, (f - 0.38) / 0.62);
    this.scene.background = cur;
    this.scene.fog.color = cur;
    this.scene.fog.near = 30 * f + 8;
    this.scene.fog.far = 110 * f + 30;
    this.hemi.intensity = 0.25 + 0.85 * f;
    this.sun.intensity = 1.3 * Math.max(0, f - 0.3);
    this.torch.intensity = (1 - f) * 2.2;
    this.fireLight.intensity = 1.2 + Math.sin(this.time * 9) * 0.25 + (1 - f) * 1.2;

    // sprite 全局压暗
    const tint = new THREE.Color().setRGB(
      0.30 + 0.70 * f, 0.33 + 0.67 * f, 0.45 + 0.55 * f
    );
    this.litMats.forEach(m => {
      if (m.userData.flashUntil > this.time) m.color.setRGB(1, 0.35, 0.3);
      else m.color.copy(tint);
    });
  }

  killEnemyQuiet(e) {
    e.dead = true;
    this.fx.burst({ x: e.x, y: 1, z: e.z }, 0x8a6ad0, 10, 4, 0.5);
  }

  spawnBoss() {
    this.bossSpawned = true;
    const p = this.playerPos();
    const a = Math.random() * Math.PI * 2;
    this.spawnEnemy('treeguard', p.x + Math.cos(a) * 28, p.z + Math.sin(a) * 28);
    this.ui.banner('树精巨人被唤醒了!!', '击败它,终结这场噩梦');
    sfx.boss();
    this.shake(0.6);
  }

  // ================= 刷怪 =================
  updateSpawner() {
    if (this.time < this.nextSpawn) return;
    this.nextSpawn = this.time + 3.6;
    const cap = Math.min(16, 3 + this.day * 2 + (this.isNight() ? 3 : 0));
    const alive = this.enemies.filter(e => !e.dead && !e.def.static && !e.def.boss).length;
    if (alive >= cap) return;
    const p = this.playerPos();
    let type;
    const roll = Math.random();
    if (this.isNight()) type = roll < 0.5 ? 'shadow' : roll < 0.8 ? 'spider' : 'hound';
    else type = (roll < 0.7 || this.day < 2) ? 'spider' : 'hound';
    // 在玩家周围环形位置刷新,避开篝火
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 26 + Math.random() * 16;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (Math.hypot(x, z) > WORLD_R - 2) continue;
      if (Math.hypot(x, z) < 14) continue;
      this.spawnEnemy(type, x, z);
      break;
    }
    // 猎犬袭击事件
    if (this.day >= 2 && this.time > this.nextHoundRaid) {
      this.nextHoundRaid = this.time + DAY_LENGTH * (0.8 + Math.random() * 0.6);
      this.ui.banner('远处传来猎犬的嚎叫……', '它们闻到了你的味道');
      sfx.howl();
      this.after(4, () => {
        const pp = this.playerPos();
        this.spawnEnemiesAround({ x: pp.x, z: pp.z }, 'hound', 2 + this.day, 24);
      });
    }
  }

  // ================= 敌人 AI =================
  updateEnemies(dt) {
    const p = this.playerPos();
    const stealth = this.isStealthed();
    this.enemies = this.enemies.filter(e => {
      if (e.dead) {
        e.fade -= dt * 2;
        e.body.material.opacity = Math.max(0, e.fade);
        e.hpBar.visible = false;
        if (e.fade <= 0) {
          this.scene.remove(e.group);
          const idx = this.litMats.indexOf(e.body.material);
          if (idx >= 0) this.litMats.splice(idx, 1);
          return false;
        }
        return true;
      }
      const dx = p.x - e.x, dz = p.z - e.z;
      const dist = Math.hypot(dx, dz);
      const slowed = this.time < e.slowUntil ? e.slowFactor : 1;

      // 仇恨判定
      if (!stealth && dist < e.def.aggro) e.aggro = true;
      if (stealth) e.aggro = false;

      if (!e.def.static) {
        let vx = 0, vz = 0;
        if (e.aggro && dist > e.reach * 0.7) {
          vx = dx / dist * e.speed * slowed;
          vz = dz / dist * e.speed * slowed;
        } else if (!e.aggro) {
          // 游荡
          e.wanderT -= dt;
          if (e.wanderT <= 0) {
            e.wanderT = 3 + Math.random() * 4;
            const a = Math.random() * Math.PI * 2;
            e.wx = e.x + Math.cos(a) * 6;
            e.wz = e.z + Math.sin(a) * 6;
          }
          const wdx = e.wx - e.x, wdz = e.wz - e.z;
          const wd = Math.hypot(wdx, wdz);
          if (wd > 0.5) { vx = wdx / wd * e.speed * 0.35; vz = wdz / wd * e.speed * 0.35; }
        }
        // 暗影怪怕篝火
        if (e.type === 'shadow') {
          const fd = Math.hypot(e.x, e.z);
          if (fd < 9) { vx += e.x / fd * 6; vz += e.z / fd * 6; }
        }
        e.x += (vx + e.knock.x) * dt;
        e.z += (vz + e.knock.z) * dt;
        e.knock.x *= Math.pow(0.02, dt);
        e.knock.z *= Math.pow(0.02, dt);
        // 障碍推开
        this.obstacles.forEach(o => {
          const ox = e.x - o.x, oz = e.z - o.z;
          const od = Math.hypot(ox, oz);
          if (od < o.r + e.r && od > 0.01) {
            const push = (o.r + e.r - od);
            e.x += ox / od * push; e.z += oz / od * push;
          }
        });
        const wr = Math.hypot(e.x, e.z);
        if (wr > WORLD_R) { e.x *= WORLD_R / wr; e.z *= WORLD_R / wr; }
      }

      // 攻击
      if (e.aggro && dist < e.reach && this.time > e.nextAtk && !stealth) {
        e.nextAtk = this.time + e.def.atkCd;
        this.damagePlayer(e.dmg);
        e.body.scale.x = e.def.w * 1.25;
        if (e.def.boss) this.shake(0.35);
      }
      // Boss 召唤小怪
      if (e.def.boss && this.time > e.nextSummon) {
        e.nextSummon = this.time + 13;
        this.spawnEnemiesAround({ x: e.x, z: e.z }, 'spider', 2, 4);
        this.toast('树精巨人唤出了它的爪牙!', 'bad');
      }

      // 动画
      e.body.scale.x += (e.def.w - e.body.scale.x) * dt * 6;
      e.body.scale.y = e.def.h * (1 + Math.sin(this.time * 6 + e.phase) * 0.035);
      e.group.position.set(e.x, 0, e.z);
      return true;
    });
  }

  // ================= 投射物 / 粒子 / 陨石 / 浮字 / 球 =================
  updateProjectiles(dt) {
    this.projectiles = this.projectiles.filter(pr => {
      pr.life -= dt;
      pr.sp.position.addScaledVector(pr.vel, dt);
      if (pr.trail) this.fx.point(
        { x: pr.sp.position.x, y: pr.sp.position.y, z: pr.sp.position.z },
        pr.trail, { x: 0, y: 0.5, z: 0 }, 0.35, 0.25, 0);
      const pos = pr.sp.position;
      let exploded = false;
      // 命中敌人
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(pos.x - e.x, pos.z - e.z);
        if (d < e.r + pr.radius + 0.3 && pos.y < e.def.h + 0.5) {
          exploded = true;
          if (pr.aoe > 0) {
            sfx.explode();
            this.fx.burst({ x: pos.x, y: pos.y, z: pos.z }, pr.color, 20, 7, 0.7);
            this.aoeDamage({ x: pos.x, z: pos.z }, pr.aoe, pr.damage, {});
          } else {
            const crit = Math.random() < (this.hero.stats.critChance || 0);
            this.damageEnemy(e, pr.damage * (crit ? 1.8 : 1), { crit });
            this.fx.burst({ x: pos.x, y: pos.y, z: pos.z }, pr.color, 8, 4, 0.4);
          }
          break;
        }
      }
      if (!exploded && (pos.y <= 0.1 || pr.life <= 0)) {
        if (pr.aoe > 0) {
          sfx.explode();
          this.fx.burst({ x: pos.x, y: 0.3, z: pos.z }, pr.color, 18, 6, 0.6);
          this.aoeDamage({ x: pos.x, z: pos.z }, pr.aoe, pr.damage, {});
        }
        exploded = true;
      }
      if (exploded) { this.scene.remove(pr.sp); return false; }
      return true;
    });
  }

  aoeDamage(pos, radius, dmg, { slow = null, knockFrom = null, knockPower = 0 } = {}) {
    this.enemies.forEach(e => {
      if (e.dead) return;
      const d = Math.hypot(e.x - pos.x, e.z - pos.z);
      if (d > radius + e.r) return;
      this.damageEnemy(e, dmg, { knockFrom: knockFrom || pos, knockPower });
      if (slow) { e.slowUntil = this.time + slow.dur; e.slowFactor = slow.factor; }
    });
  }

  updateMeteors(dt) {
    this.meteors = this.meteors.filter(m => {
      const t = (this.time - m.t0) / (m.t1 - m.t0);
      if (t >= 1) {
        this.scene.remove(m.sp);
        sfx.explode();
        this.shake(0.7);
        this.fx.burst({ x: m.target.x, y: 0.5, z: m.target.z }, 0xf66a2a, 40, 12, 1.2);
        this.fx.ring(m.target, m.radius, 0xf6a03a);
        this.aoeDamage(m.target, m.radius, m.dmg, { knockPower: 8 });
        return false;
      }
      m.sp.position.set(
        m.from.x + (m.target.x - m.from.x) * t,
        m.from.y * (1 - t * t),
        m.from.z + (m.target.z - m.from.z) * t
      );
      this.fx.point({ x: m.sp.position.x, y: m.sp.position.y, z: m.sp.position.z },
        0xf6892a, { x: 0, y: 1, z: 0 }, 0.6, 0.3, 0);
      return true;
    });
  }

  updateParticles(dt) {
    this.particles = this.particles.filter(pt => {
      pt.life -= dt;
      if (pt.life <= 0) { this.scene.remove(pt.sp); return false; }
      pt.vel.y -= pt.gravity * dt;
      pt.sp.position.x += pt.vel.x * dt;
      pt.sp.position.y += pt.vel.y * dt;
      pt.sp.position.z += pt.vel.z * dt;
      if (pt.sp.position.y < 0.05) pt.sp.position.y = 0.05;
      pt.sp.material.opacity = pt.life / pt.maxLife;
      return true;
    });
  }

  updateFloatTexts(dt) {
    this.floatTexts = this.floatTexts.filter(ft => {
      ft.life -= dt;
      if (ft.life <= 0) { this.scene.remove(ft.sp); return false; }
      ft.sp.position.y += ft.vy * dt;
      ft.sp.material.opacity = Math.min(1, ft.life * 2.5);
      return true;
    });
  }

  updateOrbs(dt) {
    const p = this.playerPos();
    this.orbs = this.orbs.filter(o => {
      const dx = p.x - o.sp.position.x, dz = p.z - o.sp.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 6) {
        const sp = 4 + (6 - d) * 4;
        o.sp.position.x += dx / d * sp * dt;
        o.sp.position.z += dz / d * sp * dt;
      }
      o.sp.position.y = 0.6 + Math.sin(this.time * 3 + o.phase) * 0.15;
      if (d < 1.3) {
        if (o.type === 'xp') { this.gainXp(o.value); sfx.pickup(); }
        else { this.addGold(o.value); sfx.gold(); }
        this.scene.remove(o.sp);
        return false;
      }
      return true;
    });
  }

  // ================= 移动 =================
  updateMovement(dt) {
    const k = this.keys;
    // 冲刺技能状态
    if (this.dash && this.time < this.dash.until) {
      const d = this.dash;
      const nx = this.rig.position.x + d.fx * d.speed * dt;
      const nz = this.rig.position.z + d.fz * d.speed * dt;
      if (Math.hypot(nx, nz) < WORLD_R && !this.obstacles.some(o => Math.hypot(nx - o.x, nz - o.z) < o.r + 0.4)) {
        this.rig.position.x = nx; this.rig.position.z = nz;
      }
      if (d.damage > 0) {
        this.enemies.forEach(e => {
          if (e.dead || d.hit.has(e)) return;
          if (Math.hypot(e.x - this.rig.position.x, e.z - this.rig.position.z) < e.r + 1.4) {
            d.hit.add(e);
            this.damageEnemy(e, d.damage, { knockFrom: this.playerPos(), knockPower: d.knock });
          }
        });
      }
      this.fx.point({ x: this.rig.position.x, y: 0.8, z: this.rig.position.z },
        0xc8b880, { x: 0, y: 1, z: 0 }, 0.5, 0.3, 0);
      return true;
    }
    this.dash = null;

    let mx = 0, mz = 0;
    if (k['KeyW']) mz -= 1;
    if (k['KeyS']) mz += 1;
    if (k['KeyA']) mx -= 1;
    if (k['KeyD']) mx += 1;
    const moving = mx !== 0 || mz !== 0;
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      const yaw = this.rig.rotation.y;
      const wx = mx * Math.cos(yaw) + mz * Math.sin(yaw);
      const wz = -mx * Math.sin(yaw) + mz * Math.cos(yaw);
      const sp = this.getSpeed();
      let nx = this.rig.position.x + wx * sp * dt;
      let nz = this.rig.position.z + wz * sp * dt;
      // 障碍碰撞:推出
      this.obstacles.forEach(o => {
        const dx = nx - o.x, dz = nz - o.z;
        const d = Math.hypot(dx, dz);
        if (d < o.r + 0.5 && d > 0.01) {
          nx = o.x + dx / d * (o.r + 0.5);
          nz = o.z + dz / d * (o.r + 0.5);
        }
      });
      const wr = Math.hypot(nx, nz);
      if (wr > WORLD_R) { nx *= WORLD_R / wr; nz *= WORLD_R / wr; }
      this.rig.position.x = nx;
      this.rig.position.z = nz;
    }
    return moving;
  }

  // ================= 主循环 =================
  start() {
    this.ui.showHUD();
    this.ui.banner('欢迎来到荒野', '击杀怪物升级 · 寻找散落的奇遇 · 第 3 天夜晚 Boss 苏醒');
    this.toast('按 1 为 Q 技能加点!', 'good');
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!this.gameOver && !this.ui.dialogOpen) this.update(dt);
      // 镜头抖动
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.4);
      this.camera.position.x = (Math.random() - .5) * this.shakeAmt * 0.5;
      this.camera.position.y = 1.7 + (Math.random() - .5) * this.shakeAmt * 0.5;
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
  }

  update(dt) {
    this.time += dt;
    const p = this.player;
    const s = this.hero.stats;

    // 回复
    p.hp = Math.min(p.maxHp, p.hp + s.hpRegen * dt);
    p.mp = Math.min(p.maxMp, p.mp + s.mpRegen * dt);
    if (this.time > p.shieldUntil) p.shield = 0;
    // 篝火治疗
    if (Math.hypot(this.rig.position.x, this.rig.position.z) < 6) {
      p.hp = Math.min(p.maxHp, p.hp + 5 * dt);
    }

    // 定时任务
    this.schedule = this.schedule.filter(t => {
      if (this.time >= t.t) { t.fn(); return false; }
      return true;
    });

    const moving = this.updateMovement(dt);
    if (this.attacking) this.tryBasicAttack();

    // 旋风大招
    if (this.time < this.bladestormUntil && this.time >= this.nextBladeTick) {
      this.nextBladeTick = this.time + 0.45;
      sfx.swing();
      this.fx.ring(this.playerPos(), 4.5, 0xe8892a);
      this.aoeDamage(this.playerPos(), 5, this.bladestormDmg, { knockPower: 1.5 });
    }

    this.updateDayNight(dt);
    this.updateSpawner();
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateMeteors(dt);
    this.updateParticles(dt);
    this.updateFloatTexts(dt);
    this.updateOrbs(dt);
    this.updateTrial();

    // 篝火动画
    this.campfire.scale.y = 2.4 * (1 + Math.sin(this.time * 11) * 0.06);

    // 奇遇交互提示
    const near = this.nearestEncounter();
    if (near) this.ui.showInteract(`按 <b>F</b> ${near.def.label}`);
    else if (document.pointerLockElement !== this.renderer.domElement && !this.ui.dialogOpen)
      this.ui.showInteract('点击屏幕 锁定视角');
    else this.ui.hideInteract();

    // 潜行视觉
    this.renderer.domElement.style.filter = this.isStealthed() ? 'brightness(.75) saturate(.5)' : '';

    this.ui.update();
    this.ui.updateWeapon(this.time, moving, this.buffMul('speedMul') * this.player.moveSpeedMul);
  }

  // ================= 结局 =================
  statsHtml() {
    const p = this.player;
    return `你存活了 <b>${this.day}</b> 天 · 达到 <b>${p.level}</b> 级<br>` +
      `击杀 <b>${p.kills}</b> 只怪物 · 攒下 <b>${p.gold}</b> 金币`;
  }

  defeat() {
    this.gameOver = true;
    sfx.bad();
    this.ui.endScreen(false, `荒野吞噬了你。<br><br>${this.statsHtml()}`);
  }

  victory() {
    this.gameOver = true;
    this.ui.endScreen(true, `树精巨人轰然倒下,荒野恢复了平静。<br><br>${this.statsHtml()}`, () => {
      this.gameOver = false;
      this.resumeFromDialog();
    });
  }
}
