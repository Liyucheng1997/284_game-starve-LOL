// ============================================================
// 游戏核心(MOBA):3D 世界 / 第一人称 / 三路兵线 / 防御塔 / 野区 / 英雄 AI / 经济
// 所有可战斗对象(包括玩家)都是 this.units 中的"单位",按 team 区分敌我
// ============================================================
import * as THREE from 'three';
import * as TEX from './textures.js';
import * as TEXM from './textures_moba.js';
import { HEROES } from './heroes.js';
import * as C from './config.js';
import { UI } from './ui.js';
import { sfx } from './sfx.js';
import { HeroAI } from './heroai.js';

const OTHER = { blue: 'red', red: 'blue' };
const BAR_COLOR = { blue: '#4a8fd0', red: '#c0463a', neutral: '#c9a227' };
const RING_COLOR = { blue: 0x4a8fd0, red: 0xd04a3a };

const UNIT_TEX = {
  pig_melee: () => TEXM.makePigmanTexture(0),
  pig_ranged: () => TEXM.makePigmanTexture(1),
  beefalo: TEXM.makeBeefaloTexture,
  spider: TEX.makeSpiderTexture,
  shadow: TEX.makeShadowTexture,
  hound: TEX.makeHoundTexture,
  tentacle: TEX.makeTentacleTexture,
  treeguard: TEX.makeTreeguardTexture,
};

const isStructure = u => u.kind === 'tower' || u.kind === 'nexus';
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Game {
  constructor(heroId, difficulty = 'normal') {
    this.hero = HEROES[heroId];
    this.diffKey = difficulty;
    this.diff = C.DIFFICULTY[difficulty];
    this.time = 0;
    this.dayFrac = 0.05;
    this.DAY_END = 0.6;
    this.DUSK_END = 0.72;
    this.units = [];
    this.heroes = [];
    this.towers = [];
    this.nexus = {};
    this.camps = [];
    this.projectiles = [];
    this.homing = [];
    this.particles = [];
    this.floatTexts = [];
    this.meteors = [];
    this.schedule = [];
    this.obstacles = [];
    this.rangeRings = [];
    this.score = { blue: 0, red: 0 };
    this.gameOver = false;
    this.shakeAmt = 0;
    this.keys = {};
    this.attacking = false;
    this.dash = null;
    this.bladestormUntil = 0;
    this.nextBladeTick = 0;
    this.nextWave = C.FIRST_WAVE;
    this.waveCount = 0;
    this.nextBaron = C.BARON_FIRST;
    this.baron = null;
    this.nextGoldTick = 1;
    this.nextVisionTick = 0;
    this.nextHurtFx = 0;
    this.nextInvulnWarn = 0;
    this.uid = 0;
    this.lanePaths = {};
    for (const k in C.LANES) this.lanePaths[k] = { pts: C.LANES[k], len: C.laneLength(C.LANES[k]) };

    // 玩家本身也是一个英雄单位
    this.player = this.makeHeroUnit(this.hero, 'blue', true);
    this.player.resetCooldowns = () => { this.player.cooldowns = [0, 0, 0, 0]; };

    this.initThree();
    this.buildWorld();
    this.spawnHeroes();
    this.ui = new UI(this, this.hero);
    this.initInput();
    this.fx = this.makeFx();
  }

  // ================= three.js 基础 =================
  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8a8266);
    this.scene.fog = new THREE.Fog(0x8a8266, 40, 140);

    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 320);
    this.rig = new THREE.Object3D();
    const [fx, fz] = C.BASES.blue.fountain;
    this.rig.position.set(fx + 4, 0, fz - 4);
    this.rig.rotation.y = -Math.PI / 4; // 面朝地图中央
    this.camera.position.set(0, 1.7, 0);
    this.rig.add(this.camera);
    this.scene.add(this.rig);
    this.pitch = 0;
    this.syncPlayer();

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
    this.sharedMats = {};
  }

  canvasTex(key, maker) {
    if (!this.texCache[key]) {
      const t = new THREE.CanvasTexture(maker());
      t.colorSpace = THREE.SRGBColorSpace;
      this.texCache[key] = t;
    }
    return this.texCache[key];
  }

  // shared:装饰物共用材质(减少每帧调色开销)
  makeSprite(texKey, maker, w, h, { lit = true, additive = false, shared = false } = {}) {
    let mat = shared ? this.sharedMats[texKey] : null;
    if (!mat) {
      mat = new THREE.SpriteMaterial({
        map: this.canvasTex(texKey, maker),
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      if (lit) this.litMats.push(mat);
      if (shared) this.sharedMats[texKey] = mat;
    }
    const sp = new THREE.Sprite(mat);
    sp.center.set(0.5, 0);
    sp.scale.set(w, h, 1);
    return sp;
  }

  groundStrip(x1, z1, x2, z2, width, color, y, opacity = 1) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(width, len),
      new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity })
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.atan2(x2 - x1, z2 - z1);
    m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
    this.scene.add(m);
    return m;
  }

  groundDisc(x, z, r, color, y, opacity = 1) {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 32),
      new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    this.scene.add(m);
    return m;
  }

  groundRing(x, z, r, color, opacity, width = 0.35) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(r - width, r, 72),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.06, z);
    this.scene.add(m);
    return m;
  }

  // ================= 世界搭建 =================
  buildWorld() {
    // 地面
    const gtex = this.canvasTex('ground', TEX.makeGroundTexture);
    gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
    gtex.repeat.set(22, 22);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(C.MAP_HALF * 2 + 60, C.MAP_HALF * 2 + 60),
      new THREE.MeshLambertMaterial({ map: gtex })
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // 河道(沿 z = x 对角线)
    this.groundStrip(-92, -92, 92, 92, 15, 0x2f403c, 0.012, 0.92);
    this.groundStrip(-92, -92, 92, 92, 9, 0x35504a, 0.014, 0.9);
    // 三路兵线(土路)
    for (const k in C.LANES) {
      const pts = C.LANES[k];
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
        const d = Math.hypot(x2 - x1, z2 - z1), ex = (x2 - x1) / d * 4.5, ez = (z2 - z1) / d * 4.5;
        this.groundStrip(x1 - ex, z1 - ez, x2 + ex, z2 + ez, 9, 0x6e5c40, 0.02, 0.85);
      }
    }
    // 基地与泉水
    for (const team of ['blue', 'red']) {
      const b = C.BASES[team];
      this.groundDisc(b.nexus[0], b.nexus[1], 20, team === 'blue' ? 0x5a5446 : 0x3e3640, 0.025, 0.9);
      this.groundDisc(b.fountain[0], b.fountain[1], C.FOUNTAIN_RANGE, team === 'blue' ? 0x3e5a72 : 0x4a2e52, 0.03, 0.75);
      this.groundRing(b.fountain[0], b.fountain[1], C.FOUNTAIN_RANGE, RING_COLOR[team], 0.7, 0.5);
    }
    // 泉水装饰:蓝方商人 + 篝火,红方暗影祭坛
    {
      const [bx, bz] = C.BASES.blue.fountain;
      const fire = this.makeSprite('campfire', TEX.makeCampfireTexture, 2.6, 2.6, { lit: false });
      fire.position.set(bx, 0, bz);
      this.scene.add(fire);
      this.campfire = fire;
      const merchant = this.makeSprite('merchant', TEX.makeMerchantTexture, 2.6, 3.7);
      merchant.position.set(bx + 3.5, 0, bz + 1);
      this.scene.add(merchant);
      this.fireLight = new THREE.PointLight(0xff9040, 1.6, 26, 1.4);
      this.fireLight.position.set(bx, 2, bz);
      this.scene.add(this.fireLight);
      const [rx, rz] = C.BASES.red.fountain;
      const altar = this.makeSprite('altar', TEX.makeAltarTexture, 3.4, 4.4);
      altar.position.set(rx, 0, rz);
      this.scene.add(altar);
      const shadowLight = new THREE.PointLight(0xa060ff, 1.4, 26, 1.4);
      shadowLight.position.set(C.BASES.red.nexus[0], 4, C.BASES.red.nexus[1]);
      this.scene.add(shadowLight);
    }

    // 防御塔 / 基地水晶
    C.TOWERS.forEach(t => this.spawnStructure(t.tier === 1 ? 'tower1' : 'tower2', t.team, t.pos[0], t.pos[1], t.lane, t.tier));
    for (const team of ['blue', 'red']) {
      const [x, z] = C.BASES[team].nexus;
      this.nexus[team] = this.spawnStructure('nexus', team, x, z, null, 3);
    }

    // 野怪营地
    C.CAMPS.forEach(cfg => {
      const camp = { ...cfg, x: cfg.pos[0], z: cfg.pos[1], members: [], respawnAt: 0 };
      this.camps.push(camp);
      this.groundDisc(camp.x, camp.z, cfg.spread ? 7 : 4.5, cfg.spread ? 0x2e3326 : 0x4a4230, 0.022, 0.8);
      this.spawnCamp(camp);
    });
    // 树精巨人的巢穴
    this.groundDisc(C.BARON_POS[0], C.BARON_POS[1], 9, 0x2a2a1e, 0.023, 0.85);

    // 地形装饰:树木组成野区"墙体",兵线 / 河道 / 基地保持开阔
    const clear = (x, z, margin) => {
      if (Math.abs(x) > C.PLAY_HALF - 1 || Math.abs(z) > C.PLAY_HALF - 1) return false;
      for (const k in C.LANES) if (C.projectOnPath(C.LANES[k], x, z).d < margin) return false;
      if (Math.abs(z - x) / Math.SQRT2 < margin + 1) return false;
      for (const team of ['blue', 'red']) {
        const b = C.BASES[team];
        if (Math.hypot(x - b.nexus[0], z - b.nexus[1]) < 26) return false;
        if (Math.hypot(x - b.fountain[0], z - b.fountain[1]) < 20) return false;
      }
      if (this.camps.some(c => Math.hypot(x - c.x, z - c.z) < (c.spread ? 10 : 7.5))) return false;
      if (Math.hypot(x - C.BARON_POS[0], z - C.BARON_POS[1]) < 13) return false;
      return true;
    };
    let seedN = 12345;
    const rand = () => { seedN = (seedN * 16807) % 2147483647; return (seedN - 1) / 2147483646; };
    for (let i = 0; i < 900; i++) {
      const x = (rand() * 2 - 1) * C.PLAY_HALF, z = (rand() * 2 - 1) * C.PLAY_HALF;
      if (!clear(x, z, 8.5)) continue;
      if (this.obstacles.some(o => Math.hypot(x - o.x, z - o.z) < 3.2)) continue;
      const v = Math.floor(rand() * 4);
      const h = 7 + rand() * 4;
      const sp = this.makeSprite('tree' + v, () => TEX.makeTreeTexture(v), h * 0.66, h, { shared: true });
      sp.position.set(x, 0, z);
      this.scene.add(sp);
      this.obstacles.push({ x, z, r: 1.0 });
    }
    for (let i = 0; i < 160; i++) {
      const x = (rand() * 2 - 1) * C.PLAY_HALF, z = (rand() * 2 - 1) * C.PLAY_HALF;
      if (!clear(x, z, 6)) continue;
      const v = Math.floor(rand() * 3);
      const s = 1.2 + rand() * 1.2;
      const sp = this.makeSprite('rock' + v, () => TEX.makeRockTexture(v), s, s, { shared: true });
      sp.position.set(x, 0, z);
      this.scene.add(sp);
      this.obstacles.push({ x, z, r: s * 0.5 });
    }
    for (let i = 0; i < 260; i++) {
      const x = (rand() * 2 - 1) * C.PLAY_HALF, z = (rand() * 2 - 1) * C.PLAY_HALF;
      const v = Math.floor(rand() * 3);
      const sp = this.makeSprite('grass' + v, () => TEX.makeGrassTuftTexture(v), 1.4, 1.4, { shared: true });
      sp.position.set(x, 0, z);
      this.scene.add(sp);
    }
    // 地图边缘的枯树墙
    for (let i = 0; i < 160; i++) {
      const side = i % 4, t = (Math.floor(i / 4) / 40) * 2 - 1;
      const off = C.MAP_HALF + 1 + rand() * 6;
      const pos = [[t * C.MAP_HALF, -off], [t * C.MAP_HALF, off], [-off, t * C.MAP_HALF], [off, t * C.MAP_HALF]][side];
      const v = Math.floor(rand() * 3);
      const h = 8 + rand() * 4;
      const sp = this.makeSprite('dead' + v, () => TEX.makeDeadTreeTexture(v), h * 0.8, h, { shared: true });
      sp.position.set(pos[0], 0, pos[1]);
      this.scene.add(sp);
    }
  }

  // ================= 单位创建 =================
  attachVisual(u, { texKey, maker, w, h, lit = true, tint = null, ring = null, bar = 'small', centerY = 0 }) {
    const g = new THREE.Group();
    const body = this.makeSprite(texKey, maker, w, h, { lit: false });
    body.material = body.material.clone();
    body.center.y = centerY;
    if (tint) {
      body.material.userData.base = new THREE.Color(tint[0], tint[1], tint[2]);
      body.material.color.copy(body.material.userData.base);
    }
    if (lit) this.litMats.push(body.material);
    g.add(body);
    const shadowMesh = new THREE.Mesh(
      new THREE.CircleGeometry(u.r * 0.95, 14),
      new THREE.MeshBasicMaterial({ color: 0x0a0805, transparent: true, opacity: 0.35, depthWrite: false })
    );
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.04;
    g.add(shadowMesh);
    if (ring) {
      const rm = new THREE.Mesh(
        new THREE.RingGeometry(u.r + 0.15, u.r + 0.45, 24),
        new THREE.MeshBasicMaterial({ color: ring, transparent: true, opacity: 0.8, depthWrite: false })
      );
      rm.rotation.x = -Math.PI / 2;
      rm.position.y = 0.05;
      g.add(rm);
    }
    const size = { small: [64, 10, 1.8, 0.28, 0.35], structure: [128, 14, 4.6, 0.5, 0.7], hero: [192, 44, 3.2, 0.73, 0.75] }[bar];
    const hpC = document.createElement('canvas');
    hpC.width = size[0]; hpC.height = size[1];
    const hpTex = new THREE.CanvasTexture(hpC);
    hpTex.colorSpace = THREE.SRGBColorSpace;
    const hpBar = new THREE.Sprite(new THREE.SpriteMaterial({ map: hpTex, transparent: true, depthWrite: false, depthTest: bar !== 'hero' }));
    hpBar.scale.set(size[2], size[3], 1);
    hpBar.position.y = h * (1 - centerY) + size[4];
    hpBar.renderOrder = 5;
    g.add(hpBar);
    g.position.set(u.x, 0, u.z);
    this.scene.add(g);
    Object.assign(u, { group: g, body, hpBar, hpC, hpTex, barType: bar, baseW: w, baseH: h });
    this.drawBar(u);
  }

  newUnit(fields) {
    const u = {
      id: ++this.uid, dead: false, fade: 1, armor: 0,
      nextAtk: 0, target: null, retargetT: Math.random() * 0.3,
      slowUntil: 0, slowFactor: 1, burn: null,
      knock: { x: 0, z: 0 }, fx: 0, fz: 1,
      phase: Math.random() * 7, lastDamagedAt: -99,
      visibleToBlue: true,
      ...fields,
    };
    this.units.push(u);
    return u;
  }

  spawnMinion(team, kind, lane, mult = 1, empowered = false) {
    const def = C.MINIONS[team][kind];
    const path = this.lanePaths[lane].pts;
    const start = team === 'blue' ? path[0] : path[path.length - 1];
    const waypoints = team === 'blue' ? path.slice(1) : path.slice(0, -1).reverse();
    const hpMul = (1 + this.waveCount * 0.035) * mult * (empowered ? 1.6 : 1);
    const u = this.newUnit({
      team, kind: 'minion', def, name: def.name, lane, minionType: kind,
      x: start[0] + (Math.random() - .5) * 2, z: start[1] + (Math.random() - .5) * 2,
      r: def.r, h: def.h,
      hp: def.hp * hpMul, maxHp: def.hp * hpMul,
      dmg: def.dmg * (1 + this.waveCount * 0.025) * (empowered ? 1.5 : 1),
      armor: 4 + this.waveCount * 0.4,
      speed: def.speed, reach: def.reach, waypoints, wp: 0,
    });
    const scale = empowered ? 1.2 : 1;
    this.attachVisual(u, {
      texKey: 'unit_' + def.tex, maker: UNIT_TEX[def.tex], w: def.w * scale, h: def.h * scale,
      lit: def.tex !== 'shadow', tint: empowered ? [0.75, 1, 0.65] : (team === 'red' && def.tex !== 'shadow' ? [0.75, 0.6, 0.85] : null),
      bar: 'small',
    });
    u.hpBar.visible = false;
    return u;
  }

  spawnStructure(type, team, x, z, lane, tier) {
    const def = C.STRUCTURES[type];
    const isNexus = type === 'nexus';
    const u = this.newUnit({
      team, kind: isNexus ? 'nexus' : 'tower', def, name: def.name, lane, tier,
      x, z, r: isNexus ? 3.2 : 1.8, h: isNexus ? 8 : 9,
      hp: def.hp, maxHp: def.hp, armor: def.armor, range: def.range,
      consecutive: 0, aggroHero: null, aggroUntil: 0,
    });
    const w = isNexus ? 7.5 : 4.2, h = isNexus ? 8.8 : 9;
    this.attachVisual(u, {
      texKey: (isNexus ? 'nexus_' : 'tower_') + team,
      maker: isNexus ? () => TEXM.makeNexusTexture(team) : () => TEXM.makeTowerTexture(team),
      w, h, bar: 'structure', lit: team === 'blue',
    });
    this.obstacles.push({ x, z, r: u.r, unit: u });
    if (isNexus) {
      this.groundRing(x, z, u.r + 1, RING_COLOR[team], 0.6, 0.4);
    } else {
      this.towers.push(u);
    }
    // 敌方建筑的攻击范围圈(靠近时显示)
    if (team === 'red') {
      const ring = this.groundRing(x, z, u.range, 0xd04030, 0, 0.7);
      this.rangeRings.push({ unit: u, mesh: ring });
    }
    return u;
  }

  spawnMonster(type, x, z, camp = null) {
    const def = C.MONSTERS[type];
    const u = this.newUnit({
      team: 'neutral', kind: 'monster', def, name: def.name, camp,
      x, z, homeX: x, homeZ: z, r: def.r, h: def.h,
      hp: def.hp * (1 + this.time / 1200), maxHp: def.hp * (1 + this.time / 1200),
      dmg: def.dmg * (1 + this.time / 900), armor: def.armor,
      speed: def.speed, reach: def.reach,
      returning: false, nextSummon: 0, nextSlam: 0,
    });
    this.attachVisual(u, { texKey: 'unit_' + def.tex, maker: UNIT_TEX[def.tex], w: def.w, h: def.h, tint: def.tint, bar: 'small' });
    u.hpBar.visible = false;
    if (camp) camp.members.push(u);
    return u;
  }

  spawnCamp(camp) {
    camp.members = [];
    const n = camp.mobs.length;
    camp.mobs.forEach((type, i) => {
      const a = (i / n) * Math.PI * 2 + 0.6;
      const r = n === 1 ? 0 : (camp.spread || 2.2);
      this.spawnMonster(type, camp.x + Math.cos(a) * r, camp.z + Math.sin(a) * r, camp);
    });
  }

  makeHeroUnit(heroDef, team, isPlayer) {
    const s = heroDef.stats;
    const name = heroDef.name.split('·')[1].trim();
    const [fx, fz] = C.BASES[team].fountain;
    const u = this.newUnit({
      team, kind: 'hero', isPlayer, heroDef, def: { name: heroDef.name, h: 2.6 },
      name: team === 'red' ? '影·' + name : name,
      x: fx, z: fz, r: 0.7, h: isPlayer ? 1.8 : 2.6,
      hp: s.maxHp, maxHp: s.maxHp, mp: s.maxMp, maxMp: s.maxMp,
      shield: 0, shieldUntil: 0,
      level: 1, xp: 0, skillPoints: 1, skillLevels: [0, 0, 0, 0], cooldowns: [0, 0, 0, 0],
      gold: 500, kills: 0, deaths: 0, assists: 0, cs: 0,
      items: [], potions: 0, potionHeal: null,
      baseAd: s.attackDamage, bonusAd: 0, moveSpeedMul: 1, cdr: 0, lifesteal: 0, crit: s.critChance, mpRegenBonus: 0,
      stealthUntil: 0, empowerNext: null, nextAttack: 0,
      buffs: {}, damagedBy: new Map(), respawnAt: 0, recall: null, crownReadyAt: 0,
      dash: null, bladestormUntil: 0, nextBarDraw: 0, nextRecalc: 0,
    });
    this.recalcStats(u);
    this.heroes.push(u);
    return u;
  }

  spawnHeroes() {
    // 我方:玩家 + 另外两名英雄;敌方:三名英雄(同名英雄在中路镜像对位)
    const ids = Object.keys(HEROES);
    const allyIds = ids.filter(id => id !== this.hero.id);
    const allyLanes = ['top', 'bot'];
    this.player.lane = 'mid';
    allyIds.forEach((id, i) => this.spawnAIHero(id, 'blue', allyLanes[i]));
    const enemyOrder = [this.hero.id, ...allyIds];
    ['mid', 'bot', 'top'].forEach((lane, i) => this.spawnAIHero(enemyOrder[i], 'red', lane));
  }

  spawnAIHero(id, team, lane) {
    const u = this.makeHeroUnit(HEROES[id], team, false);
    u.lane = lane;
    const [fx, fz] = C.BASES[team].fountain;
    u.x = fx + (Math.random() - .5) * 4; u.z = fz + (Math.random() - .5) * 4;
    this.attachVisual(u, {
      texKey: `hero_${id}_${team}`, maker: () => TEXM.makeHeroSprite(id, team),
      w: 3.0, h: 3.0, centerY: 0.07, ring: RING_COLOR[team], bar: 'hero',
    });
    u.ai = new HeroAI(this, u, lane);
    this.aiLevelSkill(u);
    return u;
  }

  // ================= 英雄属性 =================
  recalcStats(u) {
    const s = u.heroDef.stats, L = u.level - 1;
    let hp = s.maxHp + s.hpPerLevel * L, mp = s.maxMp + s.mpPerLevel * L;
    let ad = 0, armor = s.armor + s.armorPerLevel * L, speed = 0, cdr = 0, ls = 0, crit = s.critChance, mpRegen = 0;
    for (const id of u.items) {
      const it = C.ITEMS[id];
      hp += it.hp || 0; mp += it.mp || 0; ad += it.ad || 0; armor += it.armor || 0;
      speed += it.speed || 0; cdr += it.cdr || 0; ls += it.lifesteal || 0; crit += it.crit || 0; mpRegen += it.mpRegen || 0;
    }
    if (this.hasBuff(u, 'baron')) ad += 30;
    if (this.hasBuff(u, 'blue')) cdr += 0.15;
    const dHp = hp - u.maxHp, dMp = mp - u.maxMp;
    u.maxHp = hp; u.maxMp = mp;
    u.hp = dHp > 0 ? u.hp + dHp : Math.min(u.hp, hp);
    u.mp = dMp > 0 ? u.mp + dMp : Math.min(u.mp, mp);
    u.baseAd = s.attackDamage + s.adPerLevel * L;
    u.bonusAd = ad;
    u.armor = armor;
    u.moveSpeedMul = 1 + speed;
    u.cdr = Math.min(0.45, cdr);
    u.lifesteal = ls;
    u.crit = Math.min(0.75, crit);
    u.mpRegenBonus = mpRegen;
  }

  hasBuff(u, k) { return u.buffs && u.buffs[k] > this.time; }
  getAD(u = this.player) { return u.baseAd + u.bonusAd; }
  heroSpeed(u) {
    let sp = u.heroDef.stats.moveSpeed * u.moveSpeedMul;
    if (this.time < u.slowUntil) sp *= u.slowFactor;
    if ((u.isPlayer ? this.bladestormUntil : u.bladestormUntil) > this.time) sp *= 1.2;
    if (this.hasBuff(u, 'baron')) sp *= 1.05;
    return sp;
  }
  getSpeed() { return this.heroSpeed(this.player); }
  xpNeed(level = this.player.level) { return 100 + (level - 1) * 60; }
  respawnTime(level) { return 6 + level * 2.2 + Math.min(10, this.time / 120); }

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
      if (!this.ui.shopOpen && !this.gameOver) this.lockPointer();
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
      if (e.code === 'Tab') { e.preventDefault(); this.ui.showScoreboard(true); return; }
      this.keys[e.code] = true;
      if (this.gameOver) return;
      if (e.code === 'KeyP') { this.ui.toggleShop(); return; }
      if (e.code === 'Escape' && this.ui.shopOpen) { this.ui.toggleShop(false); return; }
      if (this.player.dead) return;
      if (e.code === 'KeyQ') this.castSkill(0);
      if (e.code === 'KeyE') this.castSkill(1);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.castSkill(2);
      if (e.code === 'KeyR') this.castSkill(3);
      if (e.code === 'KeyB') this.startRecall(this.player);
      if (e.code === 'KeyF') this.usePotion(this.player);
      if (e.code.startsWith('Digit')) {
        const n = +e.code.slice(5);
        if (n >= 1 && n <= 4) this.upgradeSkill(n - 1);
      }
    });
    document.addEventListener('keyup', e => {
      this.keys[e.code] = false;
      if (e.code === 'Tab') this.ui.showScoreboard(false);
    });
  }

  // ================= 工具 =================
  syncPlayer() { this.player.x = this.rig.position.x; this.player.z = this.rig.position.z; }
  playerPos() { return { x: this.rig.position.x, z: this.rig.position.z }; }
  forward() { return { x: -Math.sin(this.rig.rotation.y), z: -Math.cos(this.rig.rotation.y) }; }
  isNight() { return this.dayFrac >= this.DUSK_END; }
  isStealthed(u = this.player) { return this.time < u.stealthUntil; }
  phaseName() { return this.dayFrac < this.DAY_END ? '白昼' : this.dayFrac < this.DUSK_END ? '黄昏' : '黑夜'; }
  clockText() {
    const t = Math.floor(this.time);
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }
  toast(t, c) { this.ui.toast(t, c); }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  after(delay, fn) { this.schedule.push({ t: this.time + delay, fn }); }
  addGold(n) { this.player.gold = Math.max(0, this.player.gold + n); }
  heal(n) { this.healUnit(this.player, n); }
  restoreMp(n) { this.player.mp = Math.min(this.player.maxMp, this.player.mp + n); }
  fountainOf(team) { const f = C.BASES[team].fountain; return { x: f[0], z: f[1] }; }
  inShopRange(u = this.player) { return u.dead || dist(u, this.fountainOf(u.team)) < C.SHOP_RANGE; }

  healUnit(u, n) {
    if (u.dead || n <= 0) return;
    u.hp = Math.min(u.maxHp, u.hp + n);
    if (u.isPlayer && n > 30) this.fx.burst({ x: u.x, y: 1.2, z: u.z }, 0x8fd06c, 10, 3, 0.4);
  }

  // 是否敌对:中立野怪与任何阵营敌对
  hostile(a, b) { return a.team !== b.team; }

  // 观察者能否把 t 当作目标
  targetable(t, observer = null) {
    if (!t || t.dead) return false;
    if (t.kind === 'hero' && this.time < t.stealthUntil) {
      // 潜行:近身 3.5 以内才会被发现
      return observer ? dist(observer, t) < 3.5 : false;
    }
    return true;
  }

  isInvulnerable(t) {
    if (t.kind === 'tower' && t.tier === 2)
      return this.towers.some(o => o.team === t.team && o.lane === t.lane && o.tier === 1 && !o.dead);
    if (t.kind === 'nexus')
      return !this.towers.some(o => o.team === t.team && o.tier === 2 && o.dead);
    return false;
  }

  underEnemyTower(u, x = u.x, z = u.z) {
    return this.units.some(t => isStructure(t) && !t.dead && t.team === OTHER[u.team] && Math.hypot(t.x - x, t.z - z) < t.range + 0.5);
  }

  // ================= 特效 =================
  makeFx() {
    const partTex = this.canvasTex('particle', TEX.makeParticleTexture);
    const spawnPart = (pos, color, vel, size, life, gravity = 0) => {
      if (this.particles.length > 900) return;
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
    if (this.floatTexts.length > 40) return;
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

  // ================= 血条 =================
  drawBar(u) {
    if (!u.hpC) return;
    const ctx = u.hpC.getContext('2d');
    const W = u.hpC.width, H = u.hpC.height;
    ctx.clearRect(0, 0, W, H);
    const pct = Math.max(0, u.hp / u.maxHp);
    if (u.barType === 'hero') {
      ctx.font = 'bold 17px KaiTi, serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.lineWidth = 4; ctx.strokeStyle = '#000';
      const label = `Lv${u.level} ${u.name}`;
      ctx.strokeText(label, W / 2, 0);
      ctx.fillStyle = u.team === 'blue' ? '#bcd8f0' : '#f0b0a8';
      ctx.fillText(label, W / 2, 0);
      ctx.fillStyle = 'rgba(10,8,5,.85)';
      ctx.fillRect(0, 21, W, 23);
      ctx.fillStyle = u.team === 'blue' ? '#6aa84a' : '#c0463a';
      ctx.fillRect(2, 23, (W - 4) * pct, 13);
      if (u.shield > 0) {
        ctx.fillStyle = 'rgba(240,240,240,.85)';
        ctx.fillRect(2 + (W - 4) * pct, 23, Math.min((W - 4) * (1 - pct), (W - 4) * u.shield / u.maxHp), 13);
      }
      ctx.fillStyle = '#4a7ab0';
      ctx.fillRect(2, 38, (W - 4) * Math.max(0, u.mp / u.maxMp), 4);
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1;
      for (let i = 1; i < u.maxHp / 200; i++) {
        const x = 2 + (W - 4) * (i * 200 / u.maxHp);
        ctx.beginPath(); ctx.moveTo(x, 23); ctx.lineTo(x, 36); ctx.stroke();
      }
    } else {
      ctx.fillStyle = 'rgba(10,8,5,.85)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = isStructure(u) && this.isInvulnerable(u) ? '#8a8a8a' : BAR_COLOR[u.team];
      ctx.fillRect(1, 1, (W - 2) * pct, H - 2);
      if (u.barType === 'small') u.hpBar.visible = u.hp < u.maxHp;
    }
    u.hpTex.needsUpdate = true;
  }

  // ================= 伤害结算(统一入口) =================
  // type: basic 普攻(可攻击建筑) / skill 技能 / tower 防御塔 / true 真实伤害
  dealDamage(src, t, amount, { type = 'basic', crit = false, knockFrom = null, knockPower = 0, silent = false } = {}) {
    if (!t || t.dead || amount <= 0) return 0;
    if (isStructure(t)) {
      if (type === 'skill') return 0;
      if (this.isInvulnerable(t)) {
        if (src === this.player && this.time > this.nextInvulnWarn) {
          this.nextInvulnWarn = this.time + 2;
          this.toast(t.kind === 'nexus' ? '基地水晶受保护:先摧毁任意一座敌方内塔!' : '该塔受保护:先摧毁同路外塔!', 'bad');
        }
        return 0;
      }
    }
    let dmg = amount;
    if (src && src.kind === 'hero' && src.team === 'red') dmg *= this.diff.aiDmg;
    if (src && src.kind === 'minion' && isStructure(t)) dmg *= src.def.siege ? 1.5 : 0.6;
    if (type !== 'true') dmg *= 100 / (100 + Math.max(0, t.armor || 0));
    if (t.kind === 'hero') {
      if (t.heroDef.stats.damageReduction) dmg *= 1 - t.heroDef.stats.damageReduction;
      if (t.items.includes('crown') && this.time >= t.crownReadyAt) {
        t.crownReadyAt = this.time + 20;
        t.shield += 200; t.shieldUntil = this.time + 4;
        if (t.isPlayer) this.toast('铥矿皇冠:护盾激活!', 'good');
      }
      if (t.shield > 0) {
        const absorbed = Math.min(t.shield, dmg);
        t.shield -= absorbed;
        dmg -= absorbed;
      }
      if (t.recall) this.cancelRecall(t);
    }
    if (dmg <= 0) return 0;
    t.hp -= dmg;
    t.lastDamagedAt = this.time;
    if (src) {
      if (t.kind === 'hero' && src.kind === 'hero') t.damagedBy.set(src, this.time);
      t.lastAttacker = src;
    }

    if (t.isPlayer) {
      if (this.time > this.nextHurtFx) {
        this.nextHurtFx = this.time + 0.25;
        this.ui.damageFlash();
        sfx.hurt();
      }
      this.shake(Math.min(0.4, 0.1 + dmg / 300));
    } else {
      t.body.material.userData.flashUntil = this.time + 0.1;
      this.drawBar(t);
    }
    if (src === this.player && !silent) {
      this.floatText({ x: t.x, y: (t.h || 2) + 0.6, z: t.z }, String(Math.round(dmg)), crit ? '#f0c040' : '#f4ecd8', crit);
      crit ? sfx.crit() : sfx.hit();
    }

    if (src && src.kind === 'hero' && !isStructure(t)) {
      if (src.lifesteal > 0) this.healUnit(src, dmg * src.lifesteal);
      if (type === 'basic' && this.hasBuff(src, 'red')) {
        t.burn = { dps: 8 + src.level * 3, until: this.time + 3, src, next: this.time + 0.5 };
        t.slowUntil = Math.max(t.slowUntil, this.time + 1.5); t.slowFactor = Math.min(t.slowFactor, 0.8);
      }
    }
    if (src && src.kind === 'hero' && t.kind === 'hero') this.callForHelp(t, src);
    if (t.team === 'neutral' && src && !t.def.hazard) this.aggroCamp(t, src);
    if (knockFrom && knockPower && !isStructure(t) && !(t.def && (t.def.boss || t.def.static))) {
      const d = Math.hypot(t.x - knockFrom.x, t.z - knockFrom.z) || 1;
      t.knock.x += (t.x - knockFrom.x) / d * knockPower;
      t.knock.z += (t.z - knockFrom.z) / d * knockPower;
    }
    if (t.hp <= 0) this.onUnitDeath(t, src);
    return dmg;
  }

  // 英雄攻击英雄时,受害方的塔和小兵会转火攻击者
  callForHelp(victim, attacker) {
    if (!this.targetable(attacker)) return;
    for (const u of this.units) {
      if (u.dead || u.team !== victim.team) continue;
      if (isStructure(u) && dist(u, attacker) < u.range) { u.aggroHero = attacker; u.aggroUntil = this.time + 2.5; }
      else if (u.kind === 'minion' && dist(u, attacker) < 9) { u.target = attacker; u.retargetT = 2; }
    }
  }

  aggroCamp(m, src) {
    const group = m.camp ? m.camp.members : [m];
    group.forEach(g => { if (!g.dead && !g.def.hazard) { g.target = src; g.returning = false; } });
  }

  // ================= 死亡与奖励 =================
  giveGold(h, amount, at = null) {
    if (h.team === 'red') amount *= this.diff.aiGold;
    amount = Math.round(amount);
    h.gold += amount;
    if (h.isPlayer) {
      sfx.gold();
      const p = at || h;
      this.floatText({ x: p.x, y: (p.h || 2) + 1.4, z: p.z }, `+${amount}`, '#ecc94a');
    }
  }

  shareXp(team, pos, xp) {
    const near = this.heroes.filter(h => h.team === team && !h.dead && dist(h, pos) < 20);
    if (!near.length) return;
    const each = xp / near.length * (1 + 0.25 * (near.length - 1));
    near.forEach(h => this.gainXp(h, each));
  }

  gainXp(h, n) {
    if (h.level >= C.MAX_LEVEL) return;
    h.xp += n;
    while (h.level < C.MAX_LEVEL && h.xp >= this.xpNeed(h.level)) {
      h.xp -= this.xpNeed(h.level);
      h.level++;
      h.skillPoints++;
      this.recalcStats(h);
      if (h.isPlayer) {
        sfx.levelup();
        this.fx.ring(this.playerPos(), 4, 0xe0c04a);
        const ult = [6, 11, 16].includes(h.level);
        this.ui.banner(`升到 ${h.level} 级!`, ult ? '大招可以升级了!按 4 加点!' : '按 1~4 为技能加点');
      } else {
        this.aiLevelSkill(h);
        this.drawBar(h);
      }
    }
    if (h.level >= C.MAX_LEVEL) h.xp = 0;
  }

  onUnitDeath(u, killer) {
    if (u.dead) return;
    if (u.kind === 'hero' && u.items.includes('lifeamulet')) {
      u.items.splice(u.items.indexOf('lifeamulet'), 1);
      this.recalcStats(u);
      u.hp = u.maxHp * 0.4;
      this.fx.burst({ x: u.x, y: 1.4, z: u.z }, 0xf0d070, 30, 6, 0.7);
      sfx.good();
      this.toast(u.isPlayer ? '重生护符碎裂,你从死亡边缘归来!' : `${u.name} 的重生护符碎裂了!`, u.isPlayer ? 'good' : 'bad');
      return;
    }
    u.dead = true;
    u.fade = 1;
    let killerHero = killer && killer.kind === 'hero' ? killer : null;

    if (u.kind === 'minion' || u.kind === 'monster') {
      if (killerHero) {
        this.giveGold(killerHero, u.def.gold, u);
        killerHero.cs++;
      }
      if (u.kind === 'minion') this.shareXp(OTHER[u.team], u, u.def.xp);
      else if (killerHero) this.shareXp(killerHero.team, u, u.def.xp * (1 + this.time / 900));
      if (u.kind === 'monster') this.onMonsterDeath(u, killerHero);
      if (killer === this.player || (killerHero && dist(u, this.player) < 25)) {
        this.fx.burst({ x: u.x, y: u.h * 0.5, z: u.z }, u.team === 'red' ? 0x8a6ad0 : 0xc9a227, 12, 5, 0.5);
      }
    } else if (isStructure(u)) {
      this.onStructureDeath(u, killerHero);
    } else if (u.kind === 'hero') {
      this.onHeroDeath(u, killerHero, killer);
    }
  }

  onMonsterDeath(u, killerHero) {
    const camp = u.camp;
    if (camp && camp.members.every(m => m.dead)) camp.respawnAt = this.time + camp.respawn;
    if (u.def.boss) {
      this.baron = null;
      this.nextBaron = this.time + C.BARON_RESPAWN;
      this.ui.hideBoss();
      if (killerHero) {
        const team = killerHero.team;
        this.heroes.filter(h => h.team === team && !h.dead).forEach(h => {
          h.buffs.baron = this.time + C.BUFFS.baron.dur;
          this.giveGold(h, u.def.gold);
          this.recalcStats(h);
        });
        this.ui.banner(team === 'blue' ? '我方击败了树精巨人!' : '敌方击败了树精巨人!',
          team === 'blue' ? '获得「树精祝福」:攻击力提升,小兵强化' : '小心,敌方小兵将被强化!');
        team === 'blue' ? sfx.good() : sfx.bad();
      }
      return;
    }
    if (u.def.buff && killerHero) {
      killerHero.buffs[u.def.buff] = this.time + C.BUFFS[u.def.buff].dur;
      this.recalcStats(killerHero);
      if (killerHero.isPlayer) {
        const b = C.BUFFS[u.def.buff];
        this.ui.banner(`获得「${b.name}」`, b.desc);
        sfx.good();
      }
    }
  }

  onStructureDeath(u, killerHero) {
    const winnerTeam = OTHER[u.team];
    this.obstacles = this.obstacles.filter(o => o.unit !== u);
    this.fx.burst({ x: u.x, y: 3, z: u.z }, u.team === 'blue' ? 0xf6a03a : 0xa060ff, 40, 10, 1.1);
    sfx.explode();
    if (dist(u, this.player) < 40) this.shake(0.6);
    const ring = this.rangeRings.find(r => r.unit === u);
    if (ring) ring.mesh.visible = false;
    if (u.kind === 'nexus') {
      this.after(1.5, () => this.endGame(winnerTeam));
      return;
    }
    if (killerHero) this.giveGold(killerHero, u.def.gold, u);
    this.heroes.filter(h => h.team === winnerTeam).forEach(h => this.giveGold(h, u.def.teamGold));
    this.shareXp(winnerTeam, u, u.def.xp);
    // 塔变成废墟
    const rubble = this.makeSprite('rock0', () => TEX.makeRockTexture(0), 3.6, 2.4, { shared: true });
    rubble.position.set(u.x, 0, u.z);
    this.scene.add(rubble);
    const lane = C.LANE_NAMES[u.lane];
    if (u.team === 'red') { this.ui.banner('敌方防御塔已被摧毁!', `${lane}${u.tier === 2 ? '内塔' : '外塔'} · 全队获得金币`); sfx.good(); }
    else { this.ui.banner('我方防御塔被摧毁了!', `${lane}${u.tier === 2 ? '内塔' : '外塔'}失守`); sfx.bad(); }
    this.units.forEach(s => { if (isStructure(s) && !s.dead) this.drawBar(s); });
  }

  onHeroDeath(u, killerHero, killer) {
    // 没有英雄补刀时,最近 10 秒内造成伤害的敌方英雄拿人头
    let recent = null, recentT = -1;
    u.damagedBy.forEach((t, h) => {
      if (h.team !== u.team && this.time - t < 10 && t > recentT) { recent = h; recentT = t; }
    });
    if (!killerHero || killerHero.team === u.team) killerHero = recent;
    u.deaths++;
    u.respawnAt = this.time + this.respawnTime(u.level);
    if (u.recall) this.cancelRecall(u);
    u.burn = null; u.shield = 0; u.dash = null; u.bladestormUntil = 0;
    if (u.isPlayer) this.bladestormUntil = 0;
    const killerTeam = killerHero ? killerHero.team : (killer && killer.team !== 'neutral' ? killer.team : null);
    if (killerTeam) this.score[killerTeam]++;
    if (killerHero) {
      killerHero.kills++;
      this.giveGold(killerHero, 300, u);
      // 击杀者继承红/蓝 buff
      ['red', 'blue'].forEach(k => {
        if (this.hasBuff(u, k)) { killerHero.buffs[k] = u.buffs[k]; this.recalcStats(killerHero); }
      });
      this.shareXp(killerHero.team, u, 120 + u.level * 30);
    }
    u.damagedBy.forEach((t, h) => {
      if (h !== killerHero && h.team !== u.team && this.time - t < 10) { h.assists++; this.giveGold(h, 120); }
    });
    u.damagedBy.clear();
    u.buffs = {};
    this.recalcStats(u);
    this.ui.killFeed(killerHero || killer, u);
    if (u.isPlayer) this.onPlayerDeath();
    else {
      u.group.visible = false;
      this.fx.burst({ x: u.x, y: 1.5, z: u.z }, u.team === 'red' ? 0x8a6ad0 : 0x6aa0d0, 22, 6, 0.6);
      if (u.team === 'red') sfx.good();
    }
  }

  onPlayerDeath() {
    sfx.bad();
    this.attacking = false;
    this.dash = null;
    this.player.stealthUntil = 0;
    this.ui.showDeath(true);
  }

  respawnHero(u) {
    u.dead = false;
    u.hp = u.maxHp; u.mp = u.maxMp;
    u.slowUntil = 0; u.knock.x = u.knock.z = 0;
    const f = this.fountainOf(u.team);
    if (u.isPlayer) {
      this.rig.position.set(f.x + 4, 0, f.z - 4);
      this.rig.rotation.y = -Math.PI / 4;
      this.syncPlayer();
      this.ui.showDeath(false);
      this.ui.banner('你复活了', '按 P 打开商店');
    } else {
      u.x = f.x + (Math.random() - .5) * 4; u.z = f.z + (Math.random() - .5) * 4;
      u.group.visible = true;
      u.group.position.set(u.x, 0, u.z);
      u.ai.onRespawn();
    }
  }

  endGame(winner) {
    if (this.gameOver) return;
    this.gameOver = true;
    this.attacking = false;
    const win = winner === 'blue';
    win ? sfx.good() : sfx.bad();
    const p = this.player;
    const detail = (win ? '敌方的暗影王座崩塌了,荒野重归光明。' : '永恒篝火熄灭了,黑暗吞没了营地。') +
      `<br><br>对局时长 <b>${this.clockText()}</b> · 比分 <b>${this.score.blue} : ${this.score.red}</b><br>` +
      `你的战绩 <b>${p.kills} / ${p.deaths} / ${p.assists}</b> · 补刀 <b>${p.cs}</b> · 等级 <b>${p.level}</b>`;
    this.ui.endScreen(win, detail);
  }

  // ================= 回城 / 药水 / 商店 =================
  startRecall(u) {
    if (u.dead || u.recall) return;
    if (dist(u, this.fountainOf(u.team)) < C.FOUNTAIN_RANGE) return;
    u.recall = { start: this.time, until: this.time + C.RECALL_TIME };
    if (u.isPlayer) { this.toast('回城中……移动或受到伤害会打断', ''); sfx.blink(); }
  }

  cancelRecall(u) {
    if (!u.recall) return;
    u.recall = null;
    if (u.isPlayer) this.toast('回城被打断!', 'bad');
  }

  finishRecall(u) {
    u.recall = null;
    const f = this.fountainOf(u.team);
    this.fx.burst({ x: u.x, y: 1.2, z: u.z }, 0x9ad0ff, 20, 5, 0.6);
    if (u.isPlayer) {
      this.rig.position.set(f.x + 4, 0, f.z - 4);
      this.syncPlayer();
      sfx.blink();
      this.toast('已回到泉水,按 P 购物', 'good');
    } else {
      u.x = f.x + (Math.random() - .5) * 4; u.z = f.z + (Math.random() - .5) * 4;
    }
  }

  usePotion(u) {
    if (u.potions <= 0) { if (u.isPlayer) this.toast('没有治疗药膏了(在商店购买)', 'bad'); return; }
    if (u.potionHeal && u.potionHeal.until > this.time) return;
    u.potions--;
    u.potionHeal = { perSec: C.POTION.heal / C.POTION.dur, until: this.time + C.POTION.dur };
    if (u.isPlayer) sfx.potion();
  }

  buyItem(u, id) {
    if (!this.inShopRange(u)) return '只能在泉水附近购物';
    if (id === 'potion') {
      if (u.potions >= C.POTION.max) return '药膏已满';
      if (u.gold < C.POTION.cost) return '金币不足';
      u.gold -= C.POTION.cost; u.potions++;
      return null;
    }
    const it = C.ITEMS[id];
    if (u.items.length >= C.MAX_ITEMS) return '装备栏已满';
    if (u.gold < it.cost) return '金币不足';
    u.gold -= it.cost;
    u.items.push(id);
    this.recalcStats(u);
    return null;
  }

  sellItem(u, idx) {
    if (!this.inShopRange(u)) return;
    const id = u.items[idx];
    if (!id) return;
    u.items.splice(idx, 1);
    u.gold += Math.floor(C.ITEMS[id].cost * 0.6);
    this.recalcStats(u);
  }

  aiShop(u) {
    const build = u.heroDef.build;
    let guard = 0;
    while (guard++ < 6) {
      const next = build.find(id => !u.items.includes(id));
      if (!next || u.items.length >= C.MAX_ITEMS || u.gold < C.ITEMS[next].cost) break;
      this.buyItem(u, next);
    }
    while (u.potions < 2 && u.gold >= C.POTION.cost + 300 && this.buyItem(u, 'potion') === null);
  }

  // ================= 技能系统 =================
  canLevelSkill(u, i) {
    const sk = u.heroDef.skills[i], lv = u.skillLevels[i];
    if (lv >= sk.maxLevel) return false;
    if (sk.key === 'R') return lv < [6, 11, 16].filter(l => u.level >= l).length;
    return lv < Math.ceil(u.level / 2);
  }

  upgradeSkill(i) {
    const p = this.player, sk = this.hero.skills[i];
    if (p.skillPoints <= 0) return;
    if (!this.canLevelSkill(p, i)) {
      if (sk.key === 'R') this.toast('大招需要在 6 / 11 / 16 级升级!', 'bad');
      else if (p.skillLevels[i] < sk.maxLevel) this.toast('技能等级不能超过英雄等级的一半', 'bad');
      return;
    }
    p.skillLevels[i]++;
    p.skillPoints--;
    sfx.good();
    this.toast(`${sk.name} 升至 ${p.skillLevels[i]} 级!`, 'good');
  }

  aiLevelSkill(u) {
    while (u.skillPoints > 0) {
      let pick = -1;
      if (this.canLevelSkill(u, 3)) pick = 3;
      else {
        const zero = [0, 1, 2].find(i => u.skillLevels[i] === 0 && this.canLevelSkill(u, i));
        if (zero !== undefined) pick = zero;
        else pick = [0, 1, 2].find(i => this.canLevelSkill(u, i)) ?? -1;
      }
      if (pick < 0) break;
      u.skillLevels[pick]++;
      u.skillPoints--;
    }
  }

  // 通用:检查并消耗冷却与法力,返回是否成功
  trySpend(u, i) {
    const sk = u.heroDef.skills[i], lvl = u.skillLevels[i];
    if (lvl <= 0 || this.time < u.cooldowns[i]) return false;
    const cost = sk.mana(lvl);
    if (u.mp < cost) return false;
    u.mp -= cost;
    u.cooldowns[i] = this.time + sk.cooldown(lvl) * (1 - u.cdr);
    return true;
  }

  castSkill(i) {
    const p = this.player, sk = this.hero.skills[i];
    const lvl = p.skillLevels[i];
    if (lvl <= 0) { this.toast(`${sk.name} 尚未学习(按 ${i + 1} 加点)`, 'bad'); return; }
    if (this.time < p.cooldowns[i]) return;
    if (p.mp < sk.mana(lvl)) { this.toast('法力不足!', 'bad'); return; }
    this.trySpend(p, i);
    this.cancelRecall(p);
    sk.cast(this, lvl);
    this.ui.weaponAttack();
  }

  // ---- 通用战斗原语(玩家与 AI 共用) ----
  forEachHostile(team, fn) {
    for (const u of this.units) if (!u.dead && u.team !== team) fn(u);
  }

  areaDamage(src, pos, radius, dmg, { slow = null, knockPower = 0, type = 'skill' } = {}) {
    this.forEachHostile(src.team, e => {
      if (isStructure(e) && type === 'skill') return;
      const d = Math.hypot(e.x - pos.x, e.z - pos.z);
      if (d > radius + e.r) return;
      this.dealDamage(src, e, dmg, { type, knockFrom: pos, knockPower });
      if (slow && !e.dead) { e.slowUntil = this.time + slow.dur; e.slowFactor = slow.factor; }
    });
  }

  coneDamage(src, ox, oz, fx, fz, range, halfAngle, dmg, { knock = 0, basic = false, onePerTarget = null } = {}) {
    let hitAny = false;
    this.forEachHostile(src.team, e => {
      if (isStructure(e) && !basic) return;
      const dx = e.x - ox, dz = e.z - oz;
      const d = Math.hypot(dx, dz);
      if (d > range + e.r) return;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (d > 1.2 + e.r && dot < Math.cos(halfAngle)) return;
      hitAny = true;
      let amount = dmg;
      const crit = basic && Math.random() < src.crit;
      if (src.empowerNext && this.time < src.empowerNext.until) {
        amount += src.empowerNext.bonus;
        src.empowerNext = null;
      }
      if (crit) amount *= 1.8;
      this.dealDamage(src, e, amount, { type: basic ? 'basic' : 'skill', crit, knockFrom: knock ? { x: ox, z: oz } : null, knockPower: knock });
    });
    return hitAny;
  }

  // 直线弹道。owner 为发射者单位,dir 为 THREE.Vector3(已归一化)
  launchProjectile(owner, origin, dir, { speed, radius, color, trail, damage, aoe = 0, range = 26, slow = null, basic = false }) {
    const mat = new THREE.SpriteMaterial({
      map: this.canvasTex('orb_p', () => TEX.makeOrbTexture('#fff')),
      color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(radius * 2.2, radius * 2.2, 1);
    sp.position.set(origin.x, origin.y, origin.z);
    this.scene.add(sp);
    this.projectiles.push({ sp, owner, vel: dir.clone().multiplyScalar(speed), damage, aoe, radius, color, trail, slow, basic, life: range / speed });
  }

  // 追踪弹(塔、远程小兵、AI 远程普攻)
  homingShot(owner, target, { speed = 22, color = 0xf6a03a, size = 0.6, y = 1.6, onHit }) {
    const mat = new THREE.SpriteMaterial({
      map: this.canvasTex('orb_p', () => TEX.makeOrbTexture('#fff')),
      color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(size, size, 1);
    sp.position.set(owner.x, y, owner.z);
    this.scene.add(sp);
    this.homing.push({ sp, owner, target, speed, color, onHit });
  }

  meteorAt(src, point, delay, radius, dmg) {
    sfx.fireball();
    // 落点预警圈(可躲避)
    const warn = this.groundRing(point.x, point.z, radius, src.team === 'red' ? 0xff3020 : 0xf6a03a, 0.85, 0.6);
    this.fx.ring(point, radius * 0.8, 0xc03020);
    const mat = new THREE.SpriteMaterial({
      map: this.canvasTex('orb_p', () => TEX.makeOrbTexture('#fff')),
      color: 0xf66a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(3, 3, 1);
    sp.position.set(point.x + 6, 30, point.z + 4);
    this.scene.add(sp);
    this.meteors.push({ src, sp, warn, target: point, t0: this.time, t1: this.time + delay, radius, dmg, from: { x: point.x + 6, y: 30, z: point.z + 4 } });
  }

  // ---- 玩家技能接口(供 heroes.js 调用) ----
  spawnProjectile({ speed, radius, color, trail, damage, aoe = 0, basic = false }) {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const pos = new THREE.Vector3(this.rig.position.x, 1.6, this.rig.position.z).addScaledVector(dir, 0.8);
    const range = basic ? this.hero.stats.attackRange : 24;
    this.launchProjectile(this.player, pos, dir, { speed, radius, color, trail, damage, aoe, range, basic });
  }

  meleeCone(range, halfAngle, damage, { knock = 0 } = {}) {
    const f = this.forward(), p = this.playerPos();
    return this.coneDamage(this.player, p.x, p.z, f.x, f.z, range, halfAngle, damage, { knock });
  }

  aoeDamage(pos, radius, dmg, opts = {}) { this.areaDamage(this.player, pos, radius, dmg, opts); }

  // 是否从背后攻击(目标面朝方向与"目标→攻击者"相反)
  isBehind(attacker, t) {
    const dx = attacker.x - t.x, dz = attacker.z - t.z, d = Math.hypot(dx, dz) || 1;
    return (dx * t.fx + dz * t.fz) / d < -0.2;
  }

  shadowStrike(range, damage) {
    const f = this.forward();
    const p = this.playerPos();
    let best = null, bestD = 1e9;
    this.forEachHostile('blue', e => {
      if (isStructure(e)) return;
      const dx = e.x - p.x, dz = e.z - p.z;
      const d = Math.hypot(dx, dz);
      const dot = (dx * f.x + dz * f.z) / (d || 1);
      if (d < range + e.r && dot > 0.5 && d < bestD) { best = e; bestD = d; }
    });
    if (best) {
      const surprise = this.isStealthed() || this.isBehind(this.player, best);
      this.dealDamage(this.player, best, damage * (surprise ? 2 : 1), { type: 'skill', crit: surprise });
      this.fx.burst({ x: best.x, y: best.h * 0.55, z: best.z }, 0x9ad0e0, 12, 5, 0.5);
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
      if (Math.abs(nx) > C.PLAY_HALF || Math.abs(nz) > C.PLAY_HALF) break;
      this.rig.position.x = nx; this.rig.position.z = nz;
      moved += step;
    }
    // 闪现可以越过树木,但不能停在障碍物里
    this.pushOutOfObstacles(this.rig.position, 0.5);
    this.syncPlayer();
    this.fx.burst({ x: this.rig.position.x, y: 1.2, z: this.rig.position.z }, 0xb090ff, 14, 4, 0.5);
  }

  dashPlayer(dist, dur, { damage = 0, knock = 0 } = {}) {
    const f = this.forward();
    this.dash = { fx: f.x, fz: f.z, speed: dist / dur, until: this.time + dur, damage, knock, hit: new Set() };
  }

  addShield(amount, dur, u = this.player) {
    u.shield = amount;
    u.shieldUntil = this.time + dur;
  }

  setStealth(dur) {
    this.player.stealthUntil = this.time + dur;
    this.units.forEach(e => { if (e.target === this.player) e.target = null; });
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

  scheduleMeteor(point, delay, radius, dmg) { this.meteorAt(this.player, point, delay, radius, dmg); }

  bladestorm(dur, dmgPerTick) {
    this.bladestormUntil = this.time + dur;
    this.bladestormDmg = dmgPerTick;
    this.nextBladeTick = this.time;
    sfx.swing();
    this.toast('血怒旋风!', 'good');
  }

  deathLotusFrom(src, radius, hits, dmgPerHit) {
    const targets = [];
    this.forEachHostile(src.team, e => {
      if (!isStructure(e) && dist(e, src) < radius && this.targetable(e, src)) targets.push(e);
    });
    if (!targets.length) return false;
    src.stealthUntil = Math.max(src.stealthUntil, this.time + hits * 0.3 + 0.4);
    for (let h = 0; h < hits; h++) {
      this.after(0.25 * h + 0.05, () => {
        if (src.dead) return;
        if (src.isPlayer || dist(src, this.player) < 30) sfx.crit();
        targets.forEach(e => {
          if (e.dead) return;
          this.dealDamage(src, e, dmgPerHit, { type: 'skill', crit: true });
          this.fx.burst({ x: e.x, y: (e.h || 2) * 0.5, z: e.z }, 0xc9a0e8, 8, 5, 0.45);
        });
      });
    }
    return true;
  }

  deathLotus(radius, hits, dmgPerHit) {
    if (!this.deathLotusFrom(this.player, radius, hits, dmgPerHit)) {
      this.toast('周围没有目标!', 'bad');
      this.player.cooldowns[3] = this.time + 1;
    }
  }

  // ================= 普攻 =================
  tryBasicAttack() {
    const p = this.player;
    if (this.time < p.nextAttack) return;
    const s = this.hero.stats;
    p.nextAttack = this.time + s.attackCooldown;
    this.cancelRecall(p);
    this.ui.weaponAttack();
    sfx.swing();
    if (s.attackType === 'ranged') {
      this.spawnProjectile({ speed: 34, radius: 0.32, color: 0xb090ff, trail: 0x9a6ad0, damage: this.getAD(), aoe: 0, basic: true });
    } else {
      const f = this.forward();
      const hit = this.coneDamage(p, p.x, p.z, f.x, f.z, s.attackRange + 0.6, Math.PI * 0.4, this.getAD(), { basic: true });
      if (hit) this.fx.slash(0xe8dcbb);
    }
  }

  // ================= 兵线 / 野怪 / Boss 刷新 =================
  updateSpawns() {
    if (this.time >= this.nextWave) {
      this.nextWave += C.WAVE_INTERVAL;
      const n = this.waveCount++;
      for (const team of ['blue', 'red']) {
        const empowered = this.heroes.some(h => h.team === team && this.hasBuff(h, 'baron'));
        for (const lane in C.LANES) {
          const enemyInnerDown = this.towers.some(t => t.team === OTHER[team] && t.lane === lane && t.tier === 2 && t.dead);
          const kinds = ['melee', 'melee', 'melee', 'ranged', 'ranged'];
          if (n % 3 === 2 || enemyInnerDown) kinds.splice(3, 0, 'siege');
          kinds.forEach((k, i) => this.after(i * 0.8, () => { if (!this.gameOver) this.spawnMinion(team, k, lane, 1, empowered); }));
        }
      }
      if (n === 0) this.ui.banner('小兵已出动!', '跟随兵线推进 · 补刀(最后一击)才能拿到金币');
    }
    this.camps.forEach(c => {
      if (c.respawnAt && this.time >= c.respawnAt) { c.respawnAt = 0; this.spawnCamp(c); }
    });
    if (!this.baron && this.time >= this.nextBaron) {
      this.nextBaron = Infinity;
      this.baron = this.spawnMonster('treeguard', C.BARON_POS[0], C.BARON_POS[1]);
      this.ui.showBoss(this.baron.name);
      this.ui.banner('树精巨人在河道苏醒了!', '击败它可获得全队「树精祝福」');
      sfx.boss();
    }
  }

  // ================= 单位 AI =================
  moveUnit(u, vx, vz, dt, { collide = true } = {}) {
    u.x += vx * dt; u.z += vz * dt;
    if (vx || vz) { const l = Math.hypot(vx, vz); u.fx = vx / l; u.fz = vz / l; }
    if (collide) this.pushOutOfObstacles(u, u.r);
    u.x = Math.max(-C.PLAY_HALF, Math.min(C.PLAY_HALF, u.x));
    u.z = Math.max(-C.PLAY_HALF, Math.min(C.PLAY_HALF, u.z));
  }

  moveToward(u, x, z, speed, dt, stopAt = 0.3, opts) {
    const dx = x - u.x, dz = z - u.z, d = Math.hypot(dx, dz);
    if (d <= stopAt) return true;
    const step = Math.min(speed, (d - stopAt) / dt);
    this.moveUnit(u, dx / d * step, dz / d * step, dt, opts);
    return false;
  }

  pushOutOfObstacles(p, r) {
    for (const o of this.obstacles) {
      const dx = p.x - o.x, dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < o.r + r && d > 0.001) {
        p.x = o.x + dx / d * (o.r + r);
        p.z = o.z + dz / d * (o.r + r);
      }
    }
  }

  // 在 range 内寻找敌方目标(小兵优先)
  acquire(u, range, { heroes = true, neutral = false } = {}) {
    let bestMinion = null, bm = Infinity, bestHero = null, bh = Infinity, bestStruct = null, bs = Infinity;
    for (const e of this.units) {
      if (e.dead || e.team === u.team) continue;
      if (e.team === 'neutral' && !neutral) continue;
      const d = dist(e, u) - e.r;
      if (d > range) continue;
      if (e.kind === 'hero') { if (heroes && d < bh && this.targetable(e, u)) { bestHero = e; bh = d; } }
      else if (isStructure(e)) { if (d < bs && !this.isInvulnerable(e)) { bestStruct = e; bs = d; } }
      else if (d < bm) { bestMinion = e; bm = d; }
    }
    return bestMinion || bestHero || bestStruct;
  }

  validTarget(u, t, leash) {
    return t && !t.dead && this.targetable(t, u) && dist(u, t) - t.r < leash && !(isStructure(t) && this.isInvulnerable(t));
  }

  unitAttack(u, t) {
    u.nextAtk = this.time + u.def.atkCd;
    u.fx = t.x - u.x; u.fz = t.z - u.z;
    const l = Math.hypot(u.fx, u.fz) || 1; u.fx /= l; u.fz /= l;
    u.body.scale.x = u.baseW * 1.2;
    if (u.def.ranged) {
      const dmg = u.dmg;
      this.homingShot(u, t, { speed: 20, color: u.def.ranged, size: 0.5, y: u.h * 0.6, onHit: () => this.dealDamage(u, t, dmg) });
    } else {
      this.dealDamage(u, t, u.dmg);
      if (u.def.boss && dist(u, this.player) < 30) this.shake(0.35);
    }
  }

  updateMinion(u, dt) {
    u.retargetT -= dt;
    if (u.target && !this.validTarget(u, u.target, 11)) u.target = null;
    if (u.retargetT <= 0) {
      u.retargetT = 0.35 + Math.random() * 0.15;
      if (!u.target || u.target.kind !== 'hero') u.target = this.acquire(u, 8.5) || u.target;
    }
    const sp = u.speed * (this.time < u.slowUntil ? u.slowFactor : 1);
    if (u.target) {
      const t = u.target;
      if (dist(u, t) - t.r - u.r > u.reach) this.moveToward(u, t.x, t.z, sp, dt, 0, { collide: false });
      else if (this.time >= u.nextAtk) this.unitAttack(u, t);
    } else if (u.wp < u.waypoints.length) {
      const [wx, wz] = u.waypoints[u.wp];
      if (this.moveToward(u, wx, wz, sp, dt, 2, { collide: false })) u.wp++;
    }
  }

  updateStructure(u) {
    if (this.time < u.nextAtk) return;
    let t = u.target;
    if (u.aggroHero && u.aggroUntil > this.time && this.validTarget(u, u.aggroHero, u.range)) t = u.aggroHero;
    else if (!this.validTarget(u, t, u.range)) {
      t = this.acquire(u, u.range);
      if (t && isStructure(t)) t = null;
    }
    if (t !== u.target) u.consecutive = 0;
    u.target = t;
    if (!t) return;
    u.nextAtk = this.time + u.def.atkCd;
    const minutes = this.time / 60;
    const isNexus = u.kind === 'nexus';
    this.homingShot(u, t, {
      speed: 26, size: 1.1, y: u.h * 0.85, color: u.team === 'blue' ? 0xf6a03a : 0xb070f0,
      onHit: () => {
        if (t.dead) return;
        let dmg;
        if (t.kind === 'minion') dmg = t.maxHp * ({ melee: 0.45, ranged: 0.7, siege: 0.14 }[t.minionType]);
        else {
          dmg = ((isNexus ? 90 : 110) + 9 * minutes) * (1 + 0.35 * Math.min(u.consecutive, 4));
          u.consecutive++;
        }
        this.dealDamage(u, t, dmg, { type: t.kind === 'minion' ? 'true' : 'tower' });
      },
    });
  }

  updateMonster(u, dt) {
    const def = u.def;
    if (def.hazard) {
      // 触手:攻击范围内的任何单位
      if (!this.validTarget(u, u.target, def.reach)) u.target = null;
      if (!u.target) {
        for (const e of this.units) {
          if (e.dead || e.team === 'neutral' || isStructure(e)) continue;
          if (dist(e, u) - e.r < def.reach && this.targetable(e, u)) { u.target = e; break; }
        }
      }
      if (u.target && this.time >= u.nextAtk) this.unitAttack(u, u.target);
      return;
    }
    const home = { x: u.homeX, z: u.homeZ };
    const sp = u.speed * (this.time < u.slowUntil ? u.slowFactor : 1);
    if (u.target && (!this.validTarget(u, u.target, 30) || dist(u, home) > (def.boss ? 20 : 15))) {
      u.target = null; u.returning = true;
    }
    if (u.target) {
      const t = u.target;
      if (dist(u, t) - t.r - u.r > u.reach) this.moveToward(u, t.x, t.z, sp, dt, 0);
      else if (this.time >= u.nextAtk) this.unitAttack(u, t);
      if (def.boss) this.updateBoss(u);
    } else {
      if (this.moveToward(u, home.x, home.z, sp * 1.4, dt, 0.4)) u.returning = false;
      if (u.hp < u.maxHp) { u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.2 * dt); this.drawBar(u); }
    }
  }

  updateBoss(u) {
    if (this.time >= u.nextSummon) {
      u.nextSummon = this.time + 16;
      for (let i = 0; i < 2; i++) {
        const m = this.spawnMonster('spiderling', u.x + (Math.random() - .5) * 6, u.z + (Math.random() - .5) * 6);
        m.target = u.target;
      }
      if (dist(u, this.player) < 35) this.toast('树精巨人唤出了它的爪牙!', 'bad');
    }
    // 重踏:范围伤害
    if (this.time >= u.nextSlam) {
      u.nextSlam = this.time + 9;
      this.after(0.8, () => {
        if (u.dead) return;
        this.fx.ring(u, 7, 0x8a6a3a);
        if (dist(u, this.player) < 35) { sfx.explode(); this.shake(0.4); }
        this.areaDamage(u, u, 7, u.dmg * 1.2, { slow: { factor: 0.6, dur: 1.5 } });
      });
    }
  }

  updateUnits(dt) {
    for (const u of this.units) {
      if (u.isPlayer) continue;
      if (u.dead) continue;
      // 持续效果
      if (u.burn && u.kind !== 'hero') {
        if (this.time > u.burn.until) u.burn = null;
        else if (this.time >= u.burn.next) {
          u.burn.next += 0.5;
          this.dealDamage(u.burn.src, u, u.burn.dps * 0.5, { type: 'true', silent: true });
          if (u.dead) continue;
        }
      }
      switch (u.kind) {
        case 'minion': this.updateMinion(u, dt); break;
        case 'tower': case 'nexus': this.updateStructure(u); break;
        case 'monster': this.updateMonster(u, dt); break;
        case 'hero': this.updateAIHero(u, dt); break;
      }
      // 击退
      if (u.knock.x || u.knock.z) {
        this.moveUnit(u, u.knock.x, u.knock.z, dt, { collide: u.kind !== 'minion' });
        u.knock.x *= Math.pow(0.02, dt); u.knock.z *= Math.pow(0.02, dt);
        if (Math.abs(u.knock.x) + Math.abs(u.knock.z) < 0.05) u.knock.x = u.knock.z = 0;
      }
    }
    this.separateUnits();
    // 动画 / 清理
    this.units = this.units.filter(u => {
      if (u.isPlayer) return true;
      if (u.dead) {
        if (u.kind === 'hero') return true;
        u.fade -= dt * 2;
        u.body.material.opacity = Math.max(0, u.fade);
        u.hpBar.visible = false;
        if (u.fade <= 0) {
          this.scene.remove(u.group);
          const idx = this.litMats.indexOf(u.body.material);
          if (idx >= 0) this.litMats.splice(idx, 1);
          u.body.material.dispose();
          u.hpTex.dispose();
          return false;
        }
        return true;
      }
      if (!isStructure(u)) {
        u.body.scale.x += (u.baseW - u.body.scale.x) * dt * 6;
        u.body.scale.y = u.baseH * (1 + Math.sin(this.time * 6 + u.phase) * 0.035);
      }
      u.group.position.set(u.x, 0, u.z);
      return true;
    });
  }

  // 防止单位叠在一起
  separateUnits() {
    const movers = this.units.filter(u => !u.dead && !u.isPlayer && (u.kind === 'minion' || u.kind === 'hero' || (u.kind === 'monster' && !u.def.static)));
    for (let i = 0; i < movers.length; i++) {
      const a = movers[i];
      for (let j = i + 1; j < movers.length; j++) {
        const b = movers[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        if (Math.abs(dx) > 3 || Math.abs(dz) > 3) continue;
        const d = Math.hypot(dx, dz), min = (a.r + b.r) * 0.9;
        if (d < min && d > 0.001) {
          const push = (min - d) * 0.5;
          a.x -= dx / d * push; a.z -= dz / d * push;
          b.x += dx / d * push; b.z += dz / d * push;
        }
      }
    }
    // 玩家不可被挤动,但其他单位不能贴进镜头
    const p = this.player;
    if (!p.dead) {
      for (const u of movers) {
        const dx = u.x - p.x, dz = u.z - p.z, d = Math.hypot(dx, dz), min = u.r + 1.1;
        if (d < min && d > 0.001) { u.x = p.x + dx / d * min; u.z = p.z + dz / d * min; }
      }
    }
    // 结构体推开所有单位
    for (const u of movers) {
      for (const o of this.obstacles) {
        if (!o.unit) continue;
        const dx = u.x - o.x, dz = u.z - o.z, d = Math.hypot(dx, dz);
        if (d < o.r + u.r && d > 0.001) { u.x = o.x + dx / d * (o.r + u.r); u.z = o.z + dz / d * (o.r + u.r); }
      }
    }
  }

  // ================= 英雄(玩家与 AI 共用的每帧逻辑) =================
  updateHeroCommon(u, dt) {
    const s = u.heroDef.stats;
    if (u.dead) {
      if (this.time >= u.respawnAt && !this.gameOver) this.respawnHero(u);
      return;
    }
    const mpMul = this.hasBuff(u, 'blue') ? 3 : 1;
    const hpMul = this.hasBuff(u, 'baron') ? 3 : 1;
    u.hp = Math.min(u.maxHp, u.hp + (s.hpRegen + u.level * 0.15) * hpMul * dt);
    u.mp = Math.min(u.maxMp, u.mp + (s.mpRegen + u.mpRegenBonus) * mpMul * dt);
    if (this.time > u.shieldUntil) u.shield = 0;
    if (u.potionHeal) {
      if (this.time > u.potionHeal.until) u.potionHeal = null;
      else u.hp = Math.min(u.maxHp, u.hp + u.potionHeal.perSec * dt);
    }
    if (u.burn) {
      if (this.time > u.burn.until) u.burn = null;
      else if (this.time >= u.burn.next) { u.burn.next += 0.5; this.dealDamage(u.burn.src, u, u.burn.dps * 0.5, { type: 'true', silent: true }); }
    }
    // 泉水:我方回复,敌方被灼烧
    for (const team of ['blue', 'red']) {
      const f = this.fountainOf(team);
      if (Math.hypot(u.x - f.x, u.z - f.z) > C.FOUNTAIN_RANGE) continue;
      if (team === u.team) {
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.12 * dt);
        u.mp = Math.min(u.maxMp, u.mp + u.maxMp * 0.12 * dt);
      } else {
        this.dealDamage(null, u, 400 * dt, { type: 'true', silent: true });
      }
    }
    if (u.dead) return;
    if (u.recall && this.time >= u.recall.until) this.finishRecall(u);
    if (this.time >= u.nextRecalc) { u.nextRecalc = this.time + 0.5; this.recalcStats(u); }
  }

  updateAIHero(u, dt) {
    if (u.dead) return;
    u.ai.update(dt);
    if (u.dash && this.time < u.dash.until) {
      const d = u.dash;
      this.moveUnit(u, d.fx * d.speed, d.fz * d.speed, dt);
      if (d.damage > 0) this.forEachHostile(u.team, e => {
        if (isStructure(e) || d.hit.has(e) || dist(e, u) > e.r + 1.4) return;
        d.hit.add(e);
        this.dealDamage(u, e, d.damage, { type: 'skill', knockFrom: u, knockPower: d.knock });
      });
    } else u.dash = null;
    if (u.bladestormUntil > this.time && this.time >= u.nextBladeTick) {
      u.nextBladeTick = this.time + 0.45;
      this.fx.ring(u, 4.5, 0xe8892a);
      this.areaDamage(u, u, 5, u.bladestormDmg, { knockPower: 1.5 });
    }
    // 潜行时半透明
    const st = this.time < u.stealthUntil;
    u.body.material.opacity = st ? 0.18 : 1;
    if (this.time >= u.nextBarDraw) { u.nextBarDraw = this.time + 0.2; this.drawBar(u); }
    u.hpBar.visible = !st;
  }

  // ================= 投射物 / 粒子 / 陨石 / 浮字 =================
  updateProjectiles(dt) {
    this.projectiles = this.projectiles.filter(pr => {
      pr.life -= dt;
      pr.sp.position.addScaledVector(pr.vel, dt);
      if (pr.trail) this.fx.point(
        { x: pr.sp.position.x, y: pr.sp.position.y, z: pr.sp.position.z },
        pr.trail, { x: 0, y: 0.5, z: 0 }, 0.35, 0.25, 0);
      const pos = pr.sp.position;
      let exploded = false;
      for (const e of this.units) {
        if (e.dead || e.team === pr.owner.team) continue;
        if (isStructure(e) && !pr.basic) continue;
        const d = Math.hypot(pos.x - e.x, pos.z - e.z);
        if (d < e.r + pr.radius + 0.3 && pos.y < (e.h || 2) + 0.5) {
          exploded = true;
          if (pr.aoe > 0) {
            if (pr.owner.isPlayer || dist(e, this.player) < 30) sfx.explode();
            this.fx.burst({ x: pos.x, y: pos.y, z: pos.z }, pr.color, 20, 7, 0.7);
            this.areaDamage(pr.owner, { x: pos.x, z: pos.z }, pr.aoe, pr.damage, { slow: pr.slow });
          } else {
            const crit = pr.basic && Math.random() < pr.owner.crit;
            this.dealDamage(pr.owner, e, pr.damage * (crit ? 1.8 : 1), { type: pr.basic ? 'basic' : 'skill', crit });
            this.fx.burst({ x: pos.x, y: pos.y, z: pos.z }, pr.color, 8, 4, 0.4);
          }
          break;
        }
      }
      if (!exploded && (pos.y <= 0.1 || pr.life <= 0)) {
        if (pr.aoe > 0) {
          this.fx.burst({ x: pos.x, y: 0.3, z: pos.z }, pr.color, 18, 6, 0.6);
          this.areaDamage(pr.owner, { x: pos.x, z: pos.z }, pr.aoe, pr.damage, { slow: pr.slow });
        }
        exploded = true;
      }
      if (exploded) { this.scene.remove(pr.sp); pr.sp.material.dispose(); return false; }
      return true;
    });

    this.homing = this.homing.filter(h => {
      const t = h.target;
      if (t.dead) { this.scene.remove(h.sp); h.sp.material.dispose(); return false; }
      const ty = t.isPlayer ? 1.2 : (t.h || 2) * 0.55;
      const p = h.sp.position;
      const dx = t.x - p.x, dy = ty - p.y, dz = t.z - p.z;
      const d = Math.hypot(dx, dy, dz);
      const step = h.speed * dt;
      if (d <= step + 0.4) {
        this.scene.remove(h.sp); h.sp.material.dispose();
        h.onHit();
        return false;
      }
      p.x += dx / d * step; p.y += dy / d * step; p.z += dz / d * step;
      return true;
    });
  }

  updateMeteors() {
    this.meteors = this.meteors.filter(m => {
      const t = (this.time - m.t0) / (m.t1 - m.t0);
      m.warn.material.opacity = 0.4 + Math.sin(this.time * 20) * 0.3;
      if (t >= 1) {
        this.scene.remove(m.sp);
        this.scene.remove(m.warn);
        sfx.explode();
        if (dist(m.target, this.player) < 30) this.shake(0.7);
        this.fx.burst({ x: m.target.x, y: 0.5, z: m.target.z }, 0xf66a2a, 40, 12, 1.2);
        this.fx.ring(m.target, m.radius, 0xf6a03a);
        if (!m.src.dead || m.src.isPlayer) this.areaDamage(m.src, m.target, m.radius, m.dmg, { knockPower: 8 });
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
      if (pt.life <= 0) { this.scene.remove(pt.sp); pt.sp.material.dispose(); return false; }
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
      if (ft.life <= 0) {
        this.scene.remove(ft.sp);
        ft.sp.material.map.dispose(); ft.sp.material.dispose();
        return false;
      }
      ft.sp.position.y += ft.vy * dt;
      ft.sp.material.opacity = Math.min(1, ft.life * 2.5);
      return true;
    });
  }

  // ================= 视野(战争迷雾) =================
  updateVision() {
    if (this.time < this.nextVisionTick) return;
    this.nextVisionTick = this.time + 0.25;
    const night = this.isNight();
    const eyes = this.units.filter(u => u.team === 'blue' && !u.dead);
    for (const u of this.units) {
      if (u.team !== 'red' || u.dead) continue;
      const stealth = u.kind === 'hero' && this.time < u.stealthUntil;
      let seen = false;
      for (const e of eyes) {
        const r = stealth ? 3.5 : isStructure(e) ? 20 : e.kind === 'hero' ? (night ? 20 : 30) : (night ? 13 : 18);
        if (Math.abs(e.x - u.x) < r && Math.abs(e.z - u.z) < r && dist(e, u) < r) { seen = true; break; }
      }
      u.visibleToBlue = seen || isStructure(u);
      if (u.kind === 'hero') u.group.visible = u.visibleToBlue || stealth;
    }
  }

  // ================= 昼夜 =================
  updateDayNight(dt) {
    this.dayFrac += dt / C.DAY_LENGTH;
    if (this.dayFrac >= 1) { this.dayFrac -= 1; sfx.dawn(); }
    const night = this.isNight();
    if (night && !this.wasNight) { this.ui.banner('黑夜降临……', '视野范围缩小,小心埋伏'); sfx.night(); }
    this.wasNight = night;

    let f;
    if (this.dayFrac < this.DAY_END) f = 1;
    else if (this.dayFrac < this.DUSK_END) f = 1 - (this.dayFrac - this.DAY_END) / (this.DUSK_END - this.DAY_END) * 0.55;
    else if (this.dayFrac > 0.95) f = 0.45 + (this.dayFrac - 0.95) / 0.05 * 0.55;
    else f = 0.45;
    this.lightF = f;
    const dayCol = new THREE.Color(0x8a8266), nightCol = new THREE.Color(0x131624);
    const cur = nightCol.clone().lerp(dayCol, (f - 0.45) / 0.55);
    this.scene.background = cur;
    this.scene.fog.color = cur;
    this.scene.fog.near = 34 * f + 6;
    this.scene.fog.far = 130 * f + 18;
    this.hemi.intensity = 0.3 + 0.8 * f;
    this.sun.intensity = 1.3 * Math.max(0, f - 0.3);
    this.torch.intensity = (1 - f) * 2.4;
    this.fireLight.intensity = 1.2 + Math.sin(this.time * 9) * 0.25 + (1 - f) * 1.2;

    const tint = new THREE.Color().setRGB(0.32 + 0.68 * f, 0.35 + 0.65 * f, 0.47 + 0.53 * f);
    const tmp = new THREE.Color();
    this.litMats.forEach(m => {
      if (m.userData.flashUntil > this.time) m.color.setRGB(1, 0.35, 0.3);
      else if (m.userData.base) m.color.copy(tmp.copy(tint).multiply(m.userData.base));
      else m.color.copy(tint);
    });
  }

  updateRangeRings() {
    const p = this.player;
    for (const r of this.rangeRings) {
      const u = r.unit;
      if (u.dead || p.dead) { r.mesh.visible = false; continue; }
      const d = dist(u, p);
      r.mesh.visible = d < u.range + 12;
      if (!r.mesh.visible) continue;
      const aimed = u.target === p;
      r.mesh.material.opacity = aimed ? 0.75 + Math.sin(this.time * 12) * 0.2 : Math.max(0.15, 0.6 * (1 - Math.max(0, d - u.range) / 12));
      r.mesh.material.color.setHex(aimed ? 0xff2010 : 0xd04030);
    }
  }

  // ================= 玩家移动 =================
  updateMovement(dt) {
    const k = this.keys;
    const p = this.player;
    // 击退
    if (p.knock.x || p.knock.z) {
      this.rig.position.x += p.knock.x * dt; this.rig.position.z += p.knock.z * dt;
      p.knock.x *= Math.pow(0.02, dt); p.knock.z *= Math.pow(0.02, dt);
      if (Math.abs(p.knock.x) + Math.abs(p.knock.z) < 0.05) p.knock.x = p.knock.z = 0;
    }
    // 冲刺技能状态
    if (this.dash && this.time < this.dash.until) {
      const d = this.dash;
      this.rig.position.x += d.fx * d.speed * dt;
      this.rig.position.z += d.fz * d.speed * dt;
      this.pushOutOfObstacles(this.rig.position, 0.5);
      this.clampPlayer();
      this.syncPlayer();
      if (d.damage > 0) {
        this.forEachHostile('blue', e => {
          if (isStructure(e) || d.hit.has(e)) return;
          if (dist(e, p) < e.r + 1.4) {
            d.hit.add(e);
            this.dealDamage(p, e, d.damage, { type: 'skill', knockFrom: this.playerPos(), knockPower: d.knock });
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
      this.cancelRecall(p);
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      const yaw = this.rig.rotation.y;
      const wx = mx * Math.cos(yaw) + mz * Math.sin(yaw);
      const wz = -mx * Math.sin(yaw) + mz * Math.cos(yaw);
      const sp = this.getSpeed();
      this.rig.position.x += wx * sp * dt;
      this.rig.position.z += wz * sp * dt;
      p.fx = wx; p.fz = wz;
    }
    this.pushOutOfObstacles(this.rig.position, 0.5);
    this.clampPlayer();
    this.syncPlayer();
    return moving;
  }

  clampPlayer() {
    const r = this.rig.position;
    r.x = Math.max(-C.PLAY_HALF, Math.min(C.PLAY_HALF, r.x));
    r.z = Math.max(-C.PLAY_HALF, Math.min(C.PLAY_HALF, r.z));
  }

  // ================= 主循环 =================
  start() {
    this.ui.showHUD();
    this.ui.banner('欢迎来到永夜峡谷', '摧毁敌方「暗影王座」即可获胜 · 你负责中路');
    this.toast('按 1 为 Q 技能加点,按 P 打开商店购买出门装', 'good');
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!this.gameOver) this.update(dt);
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.4);
      this.camera.position.x = (Math.random() - .5) * this.shakeAmt * 0.5;
      this.camera.position.y = (this.player.dead ? 0.6 : 1.7) + (Math.random() - .5) * this.shakeAmt * 0.5;
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
  }

  update(dt) {
    this.time += dt;
    const p = this.player;
    this.syncPlayer();

    // 被动金币
    if (this.time >= this.nextGoldTick) {
      this.nextGoldTick += 1;
      if (this.time > C.FIRST_WAVE) this.heroes.forEach(h => { h.gold += h.team === 'red' ? 2 * this.diff.aiGold : 2; });
    }

    this.schedule = this.schedule.filter(t => {
      if (this.time >= t.t) { t.fn(); return false; }
      return true;
    });

    this.heroes.forEach(h => this.updateHeroCommon(h, dt));
    if (this.gameOver) return;

    let moving = false;
    if (!p.dead) {
      moving = this.updateMovement(dt);
      if (this.attacking) this.tryBasicAttack();
      if (this.time < this.bladestormUntil && this.time >= this.nextBladeTick) {
        this.nextBladeTick = this.time + 0.45;
        sfx.swing();
        this.fx.ring(this.playerPos(), 4.5, 0xe8892a);
        this.aoeDamage(this.playerPos(), 5, this.bladestormDmg, { knockPower: 1.5 });
      }
    }

    this.updateSpawns();
    this.updateUnits(dt);
    this.updateProjectiles(dt);
    this.updateMeteors();
    this.updateParticles(dt);
    this.updateFloatTexts(dt);
    this.updateVision();
    this.updateDayNight(dt);
    this.updateRangeRings();
    if (this.baron && !this.baron.dead) this.ui.updateBoss(this.baron.hp / this.baron.maxHp, dist(this.baron, p) < 30);

    this.campfire.scale.y = 2.6 * (1 + Math.sin(this.time * 11) * 0.06);
    this.renderer.domElement.style.filter = p.dead ? 'grayscale(.85) brightness(.6)' : this.isStealthed() ? 'brightness(.75) saturate(.5)' : '';

    this.ui.update();
    this.ui.updateWeapon(this.time, moving, p.moveSpeedMul);
  }
}
