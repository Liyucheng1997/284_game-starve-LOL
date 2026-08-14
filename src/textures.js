// ============================================================
// 程序化"手绘"贴图 —— 饥荒画风:歪扭墨线 + 暗淡色调 + 纸片质感
// ============================================================

const INK = '#211c15';

let _seed = 7;
function rnd() {
  _seed = (_seed * 16807) % 2147483647;
  return (_seed - 1) / 2147483646;
}
function seed(n) { _seed = n; }

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// 歪扭的手绘线条
function wobbly(ctx, pts, jitter = 2.5, close = false) {
  ctx.beginPath();
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const n = Math.max(2, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 14));
    for (let j = 0; j <= n; j++) {
      const t = j / n;
      segs.push([
        x1 + (x2 - x1) * t + (rnd() - .5) * jitter,
        y1 + (y2 - y1) * t + (rnd() - .5) * jitter,
      ]);
    }
  }
  ctx.moveTo(segs[0][0], segs[0][1]);
  for (let i = 1; i < segs.length; i++) ctx.lineTo(segs[i][0], segs[i][1]);
  if (close) ctx.closePath();
}

// 歪扭椭圆(手绘感的圆)
function wobblyEllipse(ctx, cx, cy, rx, ry, jitter = 2) {
  ctx.beginPath();
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const jr = 1 + (rnd() - .5) * (jitter / Math.max(rx, ry));
    const x = cx + Math.cos(a) * rx * jr;
    const y = cy + Math.sin(a) * ry * jr;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function inkStroke(ctx, w = 4) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

// ---------------- 地面 ----------------
export function makeGroundTexture() {
  seed(42);
  const s = 512, c = makeCanvas(s, s), ctx = c.getContext('2d');
  ctx.fillStyle = '#4a4632';
  ctx.fillRect(0, 0, s, s);
  // 斑驳色块
  for (let i = 0; i < 90; i++) {
    const shade = ['#514c37', '#443f2c', '#565137', '#3f3a28'][Math.floor(rnd() * 4)];
    ctx.fillStyle = shade;
    wobblyEllipse(ctx, rnd() * s, rnd() * s, 14 + rnd() * 42, 10 + rnd() * 30, 6);
    ctx.fill();
  }
  // 草茎划痕
  ctx.globalAlpha = .5;
  for (let i = 0; i < 240; i++) {
    const x = rnd() * s, y = rnd() * s, len = 4 + rnd() * 9;
    ctx.strokeStyle = rnd() > .5 ? '#5d5940' : '#37331f';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - .5) * 5, y - len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return c;
}

// ---------------- 树(饥荒扭曲针叶树) ----------------
export function makeTreeTexture(variant = 0) {
  seed(100 + variant * 13);
  const w = 256, h = 384, c = makeCanvas(w, h), ctx = c.getContext('2d');
  const cx = w / 2;
  const lean = (rnd() - .5) * 26; // 树身倾斜
  // 树干
  ctx.fillStyle = '#4c3a26';
  wobbly(ctx, [[cx - 13, h], [cx - 9 + lean * .4, h * .62], [cx - 5 + lean, h * .34],
    [cx + 5 + lean, h * .34], [cx + 9 + lean * .4, h * .62], [cx + 13, h]], 4, true);
  ctx.fill(); inkStroke(ctx, 5);
  // 三层扭曲的三角树冠
  const layers = [[h * .42, 92], [h * .27, 72], [h * .13, 52]];
  const greens = ['#25301c', '#2d3a22', '#354427'];
  layers.forEach(([y, r], i) => {
    ctx.fillStyle = greens[i];
    const tip = cx + lean * (1 - i * .3) + (rnd() - .5) * 10;
    wobbly(ctx, [
      [cx - r + lean * .5, y + r * .9],
      [tip - r * .18, y - r * .55],
      [tip, y - r * .8],
      [tip + r * .18, y - r * .55],
      [cx + r + lean * .5, y + r * .9],
      [cx + r * .3, y + r * .75],
      [cx - r * .3, y + r * .75],
    ], 7, true);
    ctx.fill(); inkStroke(ctx, 5);
  });
  return c;
}

// 枯树(夜晚区域装饰)
export function makeDeadTreeTexture(variant = 0) {
  seed(300 + variant * 7);
  const w = 256, h = 320, c = makeCanvas(w, h), ctx = c.getContext('2d');
  const cx = w / 2;
  ctx.strokeStyle = '#3a2e1e';
  ctx.fillStyle = '#3a2e1e';
  // 主干
  wobbly(ctx, [[cx - 11, h], [cx - 6, h * .5], [cx - 3, h * .2], [cx + 3, h * .2], [cx + 7, h * .5], [cx + 11, h]], 4, true);
  ctx.fill(); inkStroke(ctx, 5);
  // 鬼爪枝
  const branch = (x, y, ang, len, d) => {
    if (d > 2 || len < 12) return;
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    ctx.lineWidth = 6 - d * 1.8;
    wobbly(ctx, [[x, y], [x2, y2]], 5);
    inkStroke(ctx, 6 - d * 1.8);
    branch(x2, y2, ang - .5 - rnd() * .4, len * .6, d + 1);
    branch(x2, y2, ang + .3 + rnd() * .4, len * .55, d + 1);
  };
  branch(cx - 4, h * .3, -Math.PI * .72, 62, 0);
  branch(cx + 4, h * .24, -Math.PI * .3, 56, 0);
  branch(cx, h * .2, -Math.PI * .52, 48, 0);
  return c;
}

// ---------------- 石头 / 草丛 ----------------
export function makeRockTexture(variant = 0) {
  seed(500 + variant * 3);
  const s = 160, c = makeCanvas(s, s), ctx = c.getContext('2d');
  ctx.fillStyle = '#6b675c';
  wobbly(ctx, [[s * .16, s * .88], [s * .1, s * .5], [s * .32, s * .24], [s * .62, s * .18],
    [s * .88, s * .44], [s * .84, s * .88]], 5, true);
  ctx.fill(); inkStroke(ctx, 5);
  ctx.strokeStyle = '#524e45'; ctx.lineWidth = 2.5;
  wobbly(ctx, [[s * .3, s * .4], [s * .48, s * .62]], 3); ctx.stroke();
  wobbly(ctx, [[s * .6, s * .3], [s * .68, s * .55]], 3); ctx.stroke();
  return c;
}

export function makeGrassTuftTexture(variant = 0) {
  seed(700 + variant * 11);
  const s = 128, c = makeCanvas(s, s), ctx = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x = s * .2 + rnd() * s * .6;
    const hgt = s * .35 + rnd() * s * .4;
    const sway = (rnd() - .5) * 26;
    ctx.strokeStyle = ['#5a6b34', '#697c3c', '#4c5c2c'][Math.floor(rnd() * 3)];
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, s);
    ctx.quadraticCurveTo(x + sway * .3, s - hgt * .6, x + sway, s - hgt);
    ctx.stroke();
  }
  return c;
}

// ---------------- 怪物:蜘蛛 ----------------
export function makeSpiderTexture() {
  seed(1000);
  const s = 256, c = makeCanvas(s, s), ctx = c.getContext('2d');
  const cx = s / 2, cy = s * .52;
  // 八条腿
  ctx.strokeStyle = INK;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i++) {
      const baseA = side * (Math.PI * .22 + i * .3);
      const x1 = cx + Math.sin(baseA) * 40, y1 = cy + 10;
      const x2 = cx + Math.sin(baseA) * 88, y2 = cy - 18 + i * 8;
      const x3 = x2 + side * 14, y3 = s * .9;
      ctx.lineWidth = 7;
      wobbly(ctx, [[x1, y1], [x2, y2], [x3, y3]], 4);
      ctx.stroke();
    }
  }
  // 身体两团
  ctx.fillStyle = '#33291f';
  wobblyEllipse(ctx, cx, cy + 8, 52, 42, 4); ctx.fill(); inkStroke(ctx, 5);
  ctx.fillStyle = '#42352a';
  wobblyEllipse(ctx, cx, cy - 30, 38, 30, 3); ctx.fill(); inkStroke(ctx, 5);
  // 白眼 + 獠牙
  ctx.fillStyle = '#e8e0ce';
  wobblyEllipse(ctx, cx - 14, cy - 34, 9, 11, 1); ctx.fill(); inkStroke(ctx, 3);
  wobblyEllipse(ctx, cx + 14, cy - 34, 9, 11, 1); ctx.fill(); inkStroke(ctx, 3);
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(cx - 13, cy - 32, 3.5, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 15, cy - 32, 3.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#d8d0be';
  wobbly(ctx, [[cx - 12, cy - 12], [cx - 8, cy + 2], [cx - 4, cy - 10]], 1.5, true); ctx.fill(); inkStroke(ctx, 2.5);
  wobbly(ctx, [[cx + 4, cy - 10], [cx + 8, cy + 2], [cx + 12, cy - 12]], 1.5, true); ctx.fill(); inkStroke(ctx, 2.5);
  return c;
}

// ---------------- 怪物:猎犬 ----------------
export function makeHoundTexture() {
  seed(1100);
  const s = 256, c = makeCanvas(s, s), ctx = c.getContext('2d');
  const cx = s / 2, cy = s * .55;
  // 腿
  ctx.strokeStyle = INK; ctx.lineWidth = 9;
  [[-34, 0], [-14, 4], [16, 4], [34, 0]].forEach(([dx, dy]) => {
    wobbly(ctx, [[cx + dx, cy + 20 + dy], [cx + dx + 3, s * .92]], 3);
    ctx.stroke();
  });
  // 躯干
  ctx.fillStyle = '#5c4632';
  wobblyEllipse(ctx, cx, cy, 62, 36, 4); ctx.fill(); inkStroke(ctx, 5);
  // 头(朝左)
  ctx.fillStyle = '#66503a';
  wobbly(ctx, [[cx - 40, cy - 34], [cx - 86, cy - 26], [cx - 92, cy - 6], [cx - 66, cy + 8], [cx - 36, cy]], 4, true);
  ctx.fill(); inkStroke(ctx, 5);
  // 耳朵、眼、牙
  ctx.fillStyle = '#4c3826';
  wobbly(ctx, [[cx - 44, cy - 30], [cx - 36, cy - 58], [cx - 26, cy - 32]], 2, true); ctx.fill(); inkStroke(ctx, 4);
  ctx.fillStyle = '#e8e0ce';
  wobblyEllipse(ctx, cx - 62, cy - 22, 8, 8, 1); ctx.fill(); inkStroke(ctx, 3);
  ctx.fillStyle = '#8f2f27';
  ctx.beginPath(); ctx.arc(cx - 61, cy - 21, 3, 0, 7); ctx.fill();
  ctx.fillStyle = '#e8e0ce';
  for (let i = 0; i < 4; i++) {
    wobbly(ctx, [[cx - 88 + i * 12, cy - 2], [cx - 84 + i * 12, cy + 10], [cx - 80 + i * 12, cy - 2]], 1, true);
    ctx.fill(); inkStroke(ctx, 2);
  }
  // 尾巴
  ctx.strokeStyle = INK; ctx.lineWidth = 6;
  wobbly(ctx, [[cx + 58, cy - 10], [cx + 88, cy - 36]], 4); ctx.stroke();
  return c;
}

// ---------------- 怪物:暗影怪(夜晚) ----------------
export function makeShadowTexture() {
  seed(1200);
  const s = 256, c = makeCanvas(s, s), ctx = c.getContext('2d');
  const cx = s / 2;
  const g = ctx.createRadialGradient(cx, s * .5, 10, cx, s * .5, s * .48);
  g.addColorStop(0, 'rgba(30,20,45,.95)');
  g.addColorStop(.7, 'rgba(18,12,30,.8)');
  g.addColorStop(1, 'rgba(10,6,18,0)');
  ctx.fillStyle = g;
  // 飘忽的鬼影形状
  wobbly(ctx, [[cx - 60, s * .85], [cx - 70, s * .45], [cx - 30, s * .15], [cx + 30, s * .12],
    [cx + 72, s * .4], [cx + 55, s * .85], [cx + 25, s * .7], [cx, s * .88], [cx - 28, s * .68]], 10, true);
  ctx.fill();
  // 白眼
  ctx.fillStyle = '#e9e4ff';
  wobblyEllipse(ctx, cx - 20, s * .38, 10, 14, 2); ctx.fill();
  wobblyEllipse(ctx, cx + 22, s * .36, 11, 15, 2); ctx.fill();
  ctx.fillStyle = '#0a0614';
  ctx.beginPath(); ctx.arc(cx - 19, s * .40, 4, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 23, s * .38, 4, 0, 7); ctx.fill();
  return c;
}

// ---------------- 怪物:触手 ----------------
export function makeTentacleTexture() {
  seed(1300);
  const w = 192, h = 320, c = makeCanvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#4a3550';
  wobbly(ctx, [[w * .28, h], [w * .2, h * .6], [w * .42, h * .3], [w * .72, h * .12],
    [w * .8, h * .2], [w * .58, h * .42], [w * .66, h * .68], [w * .74, h]], 6, true);
  ctx.fill(); inkStroke(ctx, 5);
  // 尖刺
  ctx.fillStyle = '#3a2840';
  [[.3, .55], [.4, .38], [.6, .25]].forEach(([fx, fy]) => {
    wobbly(ctx, [[w * fx, h * fy], [w * (fx - .12), h * (fy - .06)], [w * fx, h * (fy - .1)]], 2, true);
    ctx.fill(); inkStroke(ctx, 3);
  });
  return c;
}

// ---------------- Boss:树精巨人 ----------------
export function makeTreeguardTexture() {
  seed(1400);
  const w = 320, h = 448, c = makeCanvas(w, h), ctx = c.getContext('2d');
  const cx = w / 2;
  // 腿
  ctx.fillStyle = '#4c3a26';
  wobbly(ctx, [[cx - 58, h * .62], [cx - 66, h * .97], [cx - 30, h * .97], [cx - 26, h * .64]], 5, true);
  ctx.fill(); inkStroke(ctx, 6);
  wobbly(ctx, [[cx + 26, h * .64], [cx + 30, h * .97], [cx + 66, h * .97], [cx + 58, h * .62]], 5, true);
  ctx.fill(); inkStroke(ctx, 6);
  // 躯干(粗糙树干)
  ctx.fillStyle = '#5a4630';
  wobbly(ctx, [[cx - 72, h * .68], [cx - 82, h * .38], [cx - 50, h * .2], [cx + 50, h * .18],
    [cx + 84, h * .36], [cx + 74, h * .68]], 7, true);
  ctx.fill(); inkStroke(ctx, 7);
  // 手臂
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#4c3a26';
  wobbly(ctx, [[cx - 78, h * .34], [cx - 122, h * .5], [cx - 112, h * .72], [cx - 96, h * .6], [cx - 86, h * .46]], 5, true);
  ctx.fill(); inkStroke(ctx, 6);
  wobbly(ctx, [[cx + 78, h * .32], [cx + 124, h * .46], [cx + 116, h * .7], [cx + 98, h * .58], [cx + 86, h * .44]], 5, true);
  ctx.fill(); inkStroke(ctx, 6);
  // 树冠头
  ctx.fillStyle = '#2d3a22';
  wobbly(ctx, [[cx - 62, h * .22], [cx - 30, h * .04], [cx, h * .01], [cx + 34, h * .05], [cx + 62, h * .2],
    [cx + 40, h * .24], [cx - 40, h * .24]], 8, true);
  ctx.fill(); inkStroke(ctx, 6);
  // 树洞眼 + 怒嘴
  ctx.fillStyle = '#1a130c';
  wobblyEllipse(ctx, cx - 26, h * .3, 13, 17, 2); ctx.fill(); inkStroke(ctx, 4);
  wobblyEllipse(ctx, cx + 26, h * .29, 13, 17, 2); ctx.fill(); inkStroke(ctx, 4);
  ctx.fillStyle = '#e0b83a';
  ctx.beginPath(); ctx.arc(cx - 26, h * .3, 4, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 26, h * .29, 4, 0, 7); ctx.fill();
  ctx.fillStyle = '#1a130c';
  wobbly(ctx, [[cx - 26, h * .42], [cx, h * .46], [cx + 26, h * .41], [cx + 14, h * .38], [cx - 14, h * .39]], 3, true);
  ctx.fill(); inkStroke(ctx, 4);
  // 树皮纹
  ctx.strokeStyle = '#3d2f1e'; ctx.lineWidth = 3;
  wobbly(ctx, [[cx - 30, h * .5], [cx - 24, h * .62]], 3); ctx.stroke();
  wobbly(ctx, [[cx + 20, h * .48], [cx + 28, h * .6]], 3); ctx.stroke();
  return c;
}

// ---------------- 奇遇物件 ----------------
export function makeChestTexture() {
  seed(2000);
  const s = 192, c = makeCanvas(s, s), ctx = c.getContext('2d');
  const cx = s / 2;
  // 箱体
  ctx.fillStyle = '#7a5a34';
  wobbly(ctx, [[cx - 62, s * .9], [cx - 58, s * .5], [cx + 58, s * .5], [cx + 62, s * .9]], 3, true);
  ctx.fill(); inkStroke(ctx, 5);
  // 盖子
  ctx.fillStyle = '#8a6a40';
  wobbly(ctx, [[cx - 60, s * .5], [cx - 52, s * .3], [cx + 52, s * .3], [cx + 60, s * .5]], 3, true);
  ctx.fill(); inkStroke(ctx, 5);
  // 金属条 + 锁
  ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 5;
  wobbly(ctx, [[cx - 58, s * .58], [cx + 58, s * .58]], 2); ctx.stroke();
  ctx.fillStyle = '#c9a227';
  wobblyEllipse(ctx, cx, s * .55, 11, 13, 1); ctx.fill(); inkStroke(ctx, 3);
  ctx.fillStyle = INK;
  ctx.fillRect(cx - 2.5, s * .53, 5, 9);
  return c;
}

export function makeMerchantTexture() {
  seed(2100);
  const w = 224, h = 320, c = makeCanvas(w, h), ctx = c.getContext('2d');
  const cx = w / 2;
  // 斗篷身体
  ctx.fillStyle = '#3d3547';
  wobbly(ctx, [[cx - 58, h * .95], [cx - 44, h * .4], [cx, h * .22], [cx + 44, h * .4], [cx + 58, h * .95]], 5, true);
  ctx.fill(); inkStroke(ctx, 5);
  // 兜帽
  ctx.fillStyle = '#332c3c';
  wobblyEllipse(ctx, cx, h * .26, 34, 30, 3); ctx.fill(); inkStroke(ctx, 5);
  // 帽下黑脸 + 亮眼
  ctx.fillStyle = '#120e18';
  wobblyEllipse(ctx, cx, h * .29, 24, 20, 2); ctx.fill();
  ctx.fillStyle = '#e0b83a';
  ctx.beginPath(); ctx.arc(cx - 9, h * .28, 3.5, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 9, h * .28, 3.5, 0, 7); ctx.fill();
  // 手提灯
  ctx.strokeStyle = INK; ctx.lineWidth = 4;
  wobbly(ctx, [[cx + 44, h * .5], [cx + 68, h * .46]], 3); ctx.stroke();
  ctx.fillStyle = '#e8c95a';
  wobblyEllipse(ctx, cx + 70, h * .53, 10, 12, 1); ctx.fill(); inkStroke(ctx, 3.5);
  // 背包
  ctx.fillStyle = '#6b5136';
  wobblyEllipse(ctx, cx - 40, h * .52, 24, 30, 3); ctx.fill(); inkStroke(ctx, 4);
  return c;
}

export function makeAltarTexture() {
  seed(2200);
  const w = 224, h = 288, c = makeCanvas(w, h), ctx = c.getContext('2d');
  const cx = w / 2;
  // 石台
  ctx.fillStyle = '#5c5a52';
  wobbly(ctx, [[cx - 74, h * .92], [cx - 60, h * .66], [cx + 60, h * .66], [cx + 74, h * .92]], 4, true);
  ctx.fill(); inkStroke(ctx, 5);
  // 石柱
  ctx.fillStyle = '#6b675c';
  wobbly(ctx, [[cx - 30, h * .66], [cx - 24, h * .2], [cx + 24, h * .2], [cx + 30, h * .66]], 4, true);
  ctx.fill(); inkStroke(ctx, 5);
  // 顶部符文石
  ctx.fillStyle = '#524e45';
  wobblyEllipse(ctx, cx, h * .16, 36, 26, 3); ctx.fill(); inkStroke(ctx, 5);
  // 发光符文
  ctx.strokeStyle = '#9a6ad0'; ctx.lineWidth = 4; ctx.shadowColor = '#9a6ad0'; ctx.shadowBlur = 12;
  wobbly(ctx, [[cx - 12, h * .12], [cx, h * .22], [cx + 12, h * .12]], 2); ctx.stroke();
  wobbly(ctx, [[cx - 8, h * .4], [cx + 8, h * .34]], 2); ctx.stroke();
  wobbly(ctx, [[cx - 8, h * .5], [cx + 8, h * .52]], 2); ctx.stroke();
  ctx.shadowBlur = 0;
  return c;
}

export function makeWellTexture() {
  seed(2300);
  const s = 224, c = makeCanvas(s, s), ctx = c.getContext('2d');
  const cx = s / 2;
  // 井座
  ctx.fillStyle = '#6b675c';
  wobblyEllipse(ctx, cx, s * .62, 72, 34, 4); ctx.fill(); inkStroke(ctx, 5);
  ctx.fillStyle = '#57544b';
  wobbly(ctx, [[cx - 72, s * .62], [cx - 72, s * .84], [cx + 72, s * .84], [cx + 72, s * .62]], 4, true);
  ctx.fill(); inkStroke(ctx, 5);
  // 井水(发光蓝)
  ctx.fillStyle = '#3d6a8f';
  ctx.shadowColor = '#6fb3e0'; ctx.shadowBlur = 16;
  wobblyEllipse(ctx, cx, s * .62, 52, 22, 3); ctx.fill();
  ctx.shadowBlur = 0; inkStroke(ctx, 4);
  // 微光波纹
  ctx.strokeStyle = '#8fd0f0'; ctx.lineWidth = 2.5;
  wobbly(ctx, [[cx - 30, s * .6], [cx - 6, s * .64], [cx + 20, s * .59]], 2); ctx.stroke();
  // 石块痕
  ctx.strokeStyle = '#45423a'; ctx.lineWidth = 3;
  wobbly(ctx, [[cx - 40, s * .7], [cx - 38, s * .8]], 2); ctx.stroke();
  wobbly(ctx, [[cx + 20, s * .72], [cx + 24, s * .82]], 2); ctx.stroke();
  return c;
}

export function makeObeliskTexture() {
  seed(2400);
  const w = 192, h = 320, c = makeCanvas(w, h), ctx = c.getContext('2d');
  const cx = w / 2;
  ctx.fillStyle = '#4a4a52';
  wobbly(ctx, [[cx - 42, h * .95], [cx - 30, h * .12], [cx, h * .04], [cx + 30, h * .12], [cx + 42, h * .95]], 4, true);
  ctx.fill(); inkStroke(ctx, 5);
  // 红色试炼符文
  ctx.strokeStyle = '#c05040'; ctx.lineWidth = 4.5; ctx.shadowColor = '#c05040'; ctx.shadowBlur = 10;
  wobblyEllipse(ctx, cx, h * .3, 16, 16, 2); ctx.stroke();
  wobbly(ctx, [[cx, h * .38], [cx, h * .52]], 2); ctx.stroke();
  wobbly(ctx, [[cx - 12, h * .6], [cx + 12, h * .6]], 2); ctx.stroke();
  wobbly(ctx, [[cx - 8, h * .68], [cx + 8, h * .72]], 2); ctx.stroke();
  ctx.shadowBlur = 0;
  return c;
}

export function makeCampfireTexture() {
  seed(2500);
  const s = 192, c = makeCanvas(s, s), ctx = c.getContext('2d');
  const cx = s / 2;
  // 火焰
  ctx.fillStyle = '#e8892a';
  ctx.shadowColor = '#ffb040'; ctx.shadowBlur = 22;
  wobbly(ctx, [[cx - 34, s * .72], [cx - 26, s * .45], [cx - 8, s * .3], [cx, s * .12],
    [cx + 10, s * .32], [cx + 28, s * .42], [cx + 34, s * .72]], 6, true);
  ctx.fill();
  ctx.fillStyle = '#f6c54a';
  wobbly(ctx, [[cx - 18, s * .72], [cx - 10, s * .5], [cx, s * .34], [cx + 10, s * .52], [cx + 18, s * .72]], 4, true);
  ctx.fill();
  ctx.shadowBlur = 0;
  // 柴堆
  ctx.strokeStyle = '#4c3a26'; ctx.lineWidth = 10; ctx.lineCap = 'round';
  wobbly(ctx, [[cx - 52, s * .82], [cx + 40, s * .72]], 3); ctx.stroke();
  wobbly(ctx, [[cx - 40, s * .72], [cx + 52, s * .82]], 3); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  wobbly(ctx, [[cx - 52, s * .82], [cx + 40, s * .72]], 3); ctx.stroke();
  return c;
}

// ---------------- 经验球 / 金币 ----------------
export function makeOrbTexture(color, glow) {
  const s = 64, c = makeCanvas(s, s), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
  g.addColorStop(0, '#fff');
  g.addColorStop(.35, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return c;
}

// ---------------- 粒子 ----------------
export function makeParticleTexture() {
  const s = 64, c = makeCanvas(s, s), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(.5, 'rgba(255,255,255,.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return c;
}

// ---------------- 英雄立绘(选人界面) ----------------
export function makeHeroPortrait(heroId) {
  seed(3000 + heroId.length * 31 + heroId.charCodeAt(0) * 7);
  const s = 300, c = makeCanvas(s, s), ctx = c.getContext('2d');
  const cx = s / 2;
  // 底光
  const glowColor = { mage: '#7a4ad0', warrior: '#c07030', assassin: '#4a8a9a' }[heroId];
  const g = ctx.createRadialGradient(cx, s * .5, 20, cx, s * .5, s * .55);
  g.addColorStop(0, glowColor + '44');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);

  const drawBody = (robeColor) => {
    ctx.fillStyle = robeColor;
    wobbly(ctx, [[cx - 46, s * .92], [cx - 36, s * .52], [cx, s * .44], [cx + 36, s * .52], [cx + 46, s * .92]], 4, true);
    ctx.fill(); inkStroke(ctx, 5);
  };
  const drawHead = (skin = '#e0c8a8') => {
    ctx.fillStyle = skin;
    wobblyEllipse(ctx, cx, s * .32, 40, 44, 3); ctx.fill(); inkStroke(ctx, 5);
    // 饥荒式竖线大眼
    ctx.fillStyle = '#f4f0e4';
    wobblyEllipse(ctx, cx - 15, s * .31, 9, 12, 1); ctx.fill(); inkStroke(ctx, 3);
    wobblyEllipse(ctx, cx + 15, s * .31, 9, 12, 1); ctx.fill(); inkStroke(ctx, 3);
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(cx - 14, s * .32, 3.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 16, s * .32, 3.5, 0, 7); ctx.fill();
  };

  if (heroId === 'mage') {
    drawBody('#4a3a6a');
    drawHead('#ddc5a5');
    // 尖顶法师帽
    ctx.fillStyle = '#3a2c56';
    wobbly(ctx, [[cx - 52, s * .22], [cx - 6, s * .02], [cx + 20, s * .2], [cx + 56, s * .24]], 4, true);
    ctx.fill(); inkStroke(ctx, 5);
    // 法杖
    ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 7;
    wobbly(ctx, [[cx + 58, s * .88], [cx + 66, s * .3]], 4); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    wobbly(ctx, [[cx + 58, s * .88], [cx + 66, s * .3]], 4); ctx.stroke();
    ctx.fillStyle = '#9a6ad0'; ctx.shadowColor = '#9a6ad0'; ctx.shadowBlur = 16;
    wobblyEllipse(ctx, cx + 67, s * .26, 12, 14, 2); ctx.fill();
    ctx.shadowBlur = 0; inkStroke(ctx, 3.5);
  } else if (heroId === 'warrior') {
    drawBody('#6a4a30');
    // 护甲胸片
    ctx.fillStyle = '#8a8a92';
    wobbly(ctx, [[cx - 32, s * .56], [cx, s * .5], [cx + 32, s * .56], [cx + 26, s * .74], [cx - 26, s * .74]], 3, true);
    ctx.fill(); inkStroke(ctx, 4);
    drawHead('#dbb890');
    // 角盔
    ctx.fillStyle = '#7a7a82';
    wobbly(ctx, [[cx - 42, s * .28], [cx - 40, s * .12], [cx + 40, s * .12], [cx + 42, s * .28]], 3, true);
    ctx.fill(); inkStroke(ctx, 4);
    ctx.fillStyle = '#e8dcbb';
    wobbly(ctx, [[cx - 44, s * .18], [cx - 62, s * .02], [cx - 50, s * .2]], 2, true); ctx.fill(); inkStroke(ctx, 4);
    wobbly(ctx, [[cx + 44, s * .18], [cx + 62, s * .02], [cx + 50, s * .2]], 2, true); ctx.fill(); inkStroke(ctx, 4);
    // 大斧
    ctx.strokeStyle = '#5a4028'; ctx.lineWidth = 8;
    wobbly(ctx, [[cx - 62, s * .9], [cx - 70, s * .34]], 4); ctx.stroke();
    ctx.fillStyle = '#9a9aa2';
    wobbly(ctx, [[cx - 70, s * .36], [cx - 100, s * .3], [cx - 96, s * .16], [cx - 68, s * .22]], 3, true);
    ctx.fill(); inkStroke(ctx, 4);
  } else {
    // assassin
    drawBody('#2e3e46');
    drawHead('#d5bd9d');
    // 面巾
    ctx.fillStyle = '#243239';
    wobbly(ctx, [[cx - 38, s * .34], [cx, s * .3], [cx + 38, s * .34], [cx + 30, s * .46], [cx - 30, s * .46]], 3, true);
    ctx.fill(); inkStroke(ctx, 4);
    // 兜帽
    ctx.fillStyle = '#2a3a42';
    wobbly(ctx, [[cx - 46, s * .3], [cx - 34, s * .08], [cx + 34, s * .08], [cx + 46, s * .3], [cx + 30, s * .16], [cx - 30, s * .16]], 4, true);
    ctx.fill(); inkStroke(ctx, 4);
    // 双匕首
    ctx.fillStyle = '#b8c4c8';
    wobbly(ctx, [[cx - 56, s * .6], [cx - 78, s * .42], [cx - 66, s * .62]], 2, true); ctx.fill(); inkStroke(ctx, 3.5);
    wobbly(ctx, [[cx + 56, s * .6], [cx + 78, s * .42], [cx + 66, s * .62]], 2, true); ctx.fill(); inkStroke(ctx, 3.5);
  }
  return c;
}

// ---------------- 技能图标 ----------------
export function makeSkillIcon(kind) {
  seed(4000 + kind.length * 17);
  const s = 96, c = makeCanvas(s, s), ctx = c.getContext('2d');
  const cx = s / 2, cy = s / 2;
  const bg = {
    fireball: '#5a2818', frostnova: '#1e3a50', blink: '#3a2c56', meteor: '#501e10',
    cleave: '#4a3520', warcry: '#5a4020', charge: '#3e3428', bladestorm: '#552e1a',
    shadowstrike: '#1e3038', smokebomb: '#2e3438', dash: '#24404a', deathlotus: '#301a3a',
  }[kind] || '#333';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = 5; ctx.lineCap = 'round';

  switch (kind) {
    case 'fireball':
      ctx.fillStyle = '#f6a03a'; ctx.shadowColor = '#f6a03a'; ctx.shadowBlur = 14;
      wobblyEllipse(ctx, cx + 8, cy, 20, 20, 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#f6c54a';
      wobbly(ctx, [[10, cy - 14], [cx - 8, cy - 4]], 2); ctx.stroke();
      wobbly(ctx, [[8, cy + 12], [cx - 10, cy + 8]], 2); ctx.stroke();
      break;
    case 'frostnova':
      ctx.strokeStyle = '#a8d8f0';
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        wobbly(ctx, [[cx, cy], [cx + Math.cos(a) * 30, cy + Math.sin(a) * 30]], 2); ctx.stroke();
      }
      break;
    case 'blink':
      ctx.strokeStyle = '#c8a8f0';
      wobbly(ctx, [[24, 20], [44, 46], [30, 50], [60, 78]], 2); ctx.stroke();
      wobbly(ctx, [[60, 78], [58, 62]], 2); ctx.stroke();
      wobbly(ctx, [[60, 78], [44, 74]], 2); ctx.stroke();
      break;
    case 'meteor':
      ctx.fillStyle = '#f66a2a'; ctx.shadowColor = '#f66a2a'; ctx.shadowBlur = 12;
      wobblyEllipse(ctx, cx + 12, cy + 14, 17, 17, 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#f6a03a';
      wobbly(ctx, [[12, 12], [cx + 2, cy + 4]], 2); ctx.stroke();
      wobbly(ctx, [[30, 8], [cx + 10, cy]], 2); ctx.stroke();
      break;
    case 'cleave':
      ctx.strokeStyle = '#e8d8c0';
      ctx.beginPath(); ctx.arc(cx, cy + 30, 40, -Math.PI * .85, -Math.PI * .15); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy + 40, 46, -Math.PI * .8, -Math.PI * .2); ctx.stroke();
      break;
    case 'warcry':
      wobbly(ctx, [[cx - 8, 24], [cx - 26, 40], [cx - 8, 44], [cx - 20, 70]], 2); ctx.stroke();
      wobbly(ctx, [[cx + 12, 22], [cx + 30, 38], [cx + 12, 46], [cx + 26, 68]], 2); ctx.stroke();
      break;
    case 'charge':
      wobbly(ctx, [[14, cy], [66, cy]], 2); ctx.stroke();
      wobbly(ctx, [[66, cy], [50, cy - 14]], 2); ctx.stroke();
      wobbly(ctx, [[66, cy], [50, cy + 14]], 2); ctx.stroke();
      wobbly(ctx, [[14, cy - 16], [40, cy - 16]], 2); ctx.stroke();
      wobbly(ctx, [[14, cy + 16], [40, cy + 16]], 2); ctx.stroke();
      break;
    case 'bladestorm':
      ctx.beginPath(); ctx.arc(cx, cy, 26, .3, Math.PI * 1.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 14, Math.PI, Math.PI * 2.6); ctx.stroke();
      wobbly(ctx, [[cx + 24, cy - 12], [cx + 36, cy - 22]], 2); ctx.stroke();
      break;
    case 'shadowstrike':
      ctx.fillStyle = '#c8d8e0';
      wobbly(ctx, [[cx - 4, 14], [cx + 10, 54], [cx + 2, 56], [cx - 12, 20]], 2, true); ctx.fill();
      wobbly(ctx, [[cx - 10, 60], [cx + 14, 66]], 2); ctx.stroke();
      break;
    case 'smokebomb':
      ctx.fillStyle = '#a8b0b8';
      wobblyEllipse(ctx, cx - 12, cy + 8, 15, 13, 2); ctx.fill();
      wobblyEllipse(ctx, cx + 10, cy - 2, 18, 15, 2); ctx.fill();
      wobblyEllipse(ctx, cx + 2, cy + 16, 13, 11, 2); ctx.fill();
      break;
    case 'dash':
      wobbly(ctx, [[10, 70], [50, 30]], 2); ctx.stroke();
      wobbly(ctx, [[30, 74], [70, 34]], 2); ctx.stroke();
      wobbly(ctx, [[70, 34], [70, 50]], 2); ctx.stroke();
      wobbly(ctx, [[70, 34], [54, 34]], 2); ctx.stroke();
      break;
    case 'deathlotus':
      ctx.strokeStyle = '#d0a8e8';
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
        wobbly(ctx, [[cx, cy], [cx + Math.cos(a) * 32, cy + Math.sin(a) * 32]], 2); ctx.stroke();
        const a2 = a + .28;
        wobbly(ctx, [[cx + Math.cos(a) * 32, cy + Math.sin(a) * 32], [cx + Math.cos(a2) * 20, cy + Math.sin(a2) * 20]], 2);
        ctx.stroke();
      }
      break;
  }
  // 边框
  ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, s, s);
  return c;
}
