// ============================================================
// MOBA 新增贴图:小兵 / 防御塔 / 基地 / 场上英雄 / 装备图标
// 与 textures.js 同一套手绘工具
// ============================================================
import { INK, seed, rnd, makeCanvas, wobbly, wobblyEllipse, inkStroke, makeHeroPortrait } from './textures.js';

// ---------------- 小兵:猪人(0 长矛卫兵 / 1 火把手) ----------------
export function makePigmanTexture(variant = 0) {
  seed(5000 + variant * 9);
  const w = 224, h = 288, c = makeCanvas(w, h), ctx = c.getContext('2d');
  const cx = w / 2;
  // 腿
  ctx.fillStyle = '#c99a86';
  wobbly(ctx, [[cx - 30, h * .78], [cx - 32, h * .97], [cx - 12, h * .97], [cx - 10, h * .78]], 3, true); ctx.fill(); inkStroke(ctx, 4);
  wobbly(ctx, [[cx + 10, h * .78], [cx + 12, h * .97], [cx + 32, h * .97], [cx + 30, h * .78]], 3, true); ctx.fill(); inkStroke(ctx, 4);
  // 身体 + 马甲
  ctx.fillStyle = '#d9a894';
  wobblyEllipse(ctx, cx, h * .64, 48, 44, 3); ctx.fill(); inkStroke(ctx, 5);
  ctx.fillStyle = variant ? '#7a4a2a' : '#3d5a7a';
  wobbly(ctx, [[cx - 40, h * .56], [cx, h * .5], [cx + 40, h * .56], [cx + 36, h * .78], [cx - 36, h * .78]], 3, true);
  ctx.fill(); inkStroke(ctx, 4);
  // 头
  ctx.fillStyle = '#e0b29e';
  wobblyEllipse(ctx, cx, h * .32, 44, 40, 3); ctx.fill(); inkStroke(ctx, 5);
  // 耳朵
  wobbly(ctx, [[cx - 34, h * .2], [cx - 50, h * .08], [cx - 22, h * .16]], 2, true); ctx.fill(); inkStroke(ctx, 4);
  wobbly(ctx, [[cx + 34, h * .2], [cx + 50, h * .08], [cx + 22, h * .16]], 2, true); ctx.fill(); inkStroke(ctx, 4);
  // 猪鼻
  ctx.fillStyle = '#c98a7a';
  wobblyEllipse(ctx, cx, h * .37, 18, 12, 1); ctx.fill(); inkStroke(ctx, 3.5);
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(cx - 6, h * .37, 3, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 6, h * .37, 3, 0, 7); ctx.fill();
  // 眼
  ctx.beginPath(); ctx.arc(cx - 18, h * .28, 4, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 18, h * .28, 4, 0, 7); ctx.fill();
  if (variant === 0) {
    // 长矛
    ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 7;
    wobbly(ctx, [[cx + 56, h * .95], [cx + 70, h * .1]], 3); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    wobbly(ctx, [[cx + 56, h * .95], [cx + 70, h * .1]], 3); ctx.stroke();
    ctx.fillStyle = '#b8c0c4';
    wobbly(ctx, [[cx + 62, h * .14], [cx + 72, h * .01], [cx + 80, h * .14]], 2, true); ctx.fill(); inkStroke(ctx, 3);
  } else {
    // 火把
    ctx.strokeStyle = '#5a4028'; ctx.lineWidth = 8;
    wobbly(ctx, [[cx + 50, h * .74], [cx + 66, h * .3]], 3); ctx.stroke();
    ctx.fillStyle = '#f6a03a'; ctx.shadowColor = '#ffb040'; ctx.shadowBlur = 18;
    wobbly(ctx, [[cx + 54, h * .32], [cx + 62, h * .16], [cx + 68, h * .06], [cx + 76, h * .18], [cx + 80, h * .3]], 4, true);
    ctx.fill(); ctx.shadowBlur = 0;
  }
  return c;
}

// ---------------- 攻城:皮弗娄牛 ----------------
export function makeBeefaloTexture() {
  seed(5100);
  const w = 320, h = 288, c = makeCanvas(w, h), ctx = c.getContext('2d');
  const cx = w / 2, cy = h * .55;
  ctx.strokeStyle = INK; ctx.lineWidth = 12;
  [[-60, 0], [-30, 6], [30, 6], [60, 0]].forEach(([dx, dy]) => {
    wobbly(ctx, [[cx + dx, cy + 40 + dy], [cx + dx + 2, h * .96]], 3); ctx.stroke();
  });
  // 毛茸茸的躯干
  ctx.fillStyle = '#5a4430';
  wobblyEllipse(ctx, cx + 10, cy, 100, 70, 12); ctx.fill(); inkStroke(ctx, 6);
  ctx.strokeStyle = '#3e2e1e'; ctx.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const x = cx - 70 + rnd() * 160, y = cy - 40 + rnd() * 80;
    wobbly(ctx, [[x, y], [x + (rnd() - .5) * 10, y + 14]], 2); ctx.stroke();
  }
  // 头(朝左)
  ctx.fillStyle = '#4a3624';
  wobblyEllipse(ctx, cx - 90, cy + 4, 42, 38, 4); ctx.fill(); inkStroke(ctx, 5);
  ctx.fillStyle = '#7a6a5a';
  wobblyEllipse(ctx, cx - 104, cy + 22, 22, 14, 2); ctx.fill(); inkStroke(ctx, 3);
  // 角
  ctx.fillStyle = '#e8dcbb';
  wobbly(ctx, [[cx - 118, cy - 20], [cx - 144, cy - 50], [cx - 128, cy - 12]], 2, true); ctx.fill(); inkStroke(ctx, 4);
  wobbly(ctx, [[cx - 70, cy - 24], [cx - 50, cy - 56], [cx - 60, cy - 16]], 2, true); ctx.fill(); inkStroke(ctx, 4);
  // 眼
  ctx.fillStyle = '#e8e0ce';
  wobblyEllipse(ctx, cx - 96, cy - 6, 6, 7, 1); ctx.fill(); inkStroke(ctx, 2);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(cx - 96, cy - 5, 2.5, 0, 7); ctx.fill();
  // 鞍(我方标记)
  ctx.fillStyle = '#3d5a7a';
  wobbly(ctx, [[cx - 10, cy - 66], [cx + 40, cy - 70], [cx + 44, cy - 40], [cx - 6, cy - 36]], 3, true); ctx.fill(); inkStroke(ctx, 4);
  return c;
}

// ---------------- 防御塔 ----------------
export function makeTowerTexture(team) {
  seed(5200 + (team === 'red' ? 50 : 0));
  const w = 224, h = 480, c = makeCanvas(w, h), ctx = c.getContext('2d');
  const cx = w / 2;
  if (team === 'blue') {
    // 篝火图腾:木桩 + 火盆
    ctx.fillStyle = '#5c5a52';
    wobbly(ctx, [[cx - 70, h * .98], [cx - 56, h * .86], [cx + 56, h * .86], [cx + 70, h * .98]], 4, true); ctx.fill(); inkStroke(ctx, 5);
    ctx.fillStyle = '#6b4a2a';
    wobbly(ctx, [[cx - 34, h * .87], [cx - 26, h * .26], [cx + 26, h * .26], [cx + 34, h * .87]], 4, true); ctx.fill(); inkStroke(ctx, 6);
    // 图腾脸
    ctx.strokeStyle = '#3d2a16'; ctx.lineWidth = 4;
    for (let k = 0; k < 3; k++) {
      const y = h * (.36 + k * .17);
      wobbly(ctx, [[cx - 28, y - 30], [cx + 28, y - 30]], 2); ctx.stroke();
      ctx.fillStyle = '#e0b83a';
      ctx.beginPath(); ctx.arc(cx - 12, y - 8, 4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 12, y - 8, 4, 0, 7); ctx.fill();
      wobbly(ctx, [[cx - 12, y + 12], [cx, y + 18], [cx + 12, y + 12]], 2); ctx.stroke();
    }
    // 蓝色布旗
    ctx.fillStyle = '#3d6a9f';
    wobbly(ctx, [[cx + 28, h * .3], [cx + 84, h * .34], [cx + 70, h * .42], [cx + 86, h * .5], [cx + 28, h * .48]], 3, true);
    ctx.fill(); inkStroke(ctx, 4);
    // 火盆
    ctx.fillStyle = '#4a4a52';
    wobbly(ctx, [[cx - 56, h * .2], [cx - 40, h * .28], [cx + 40, h * .28], [cx + 56, h * .2]], 3, true); ctx.fill(); inkStroke(ctx, 5);
    ctx.fillStyle = '#f6892a'; ctx.shadowColor = '#ffb040'; ctx.shadowBlur = 26;
    wobbly(ctx, [[cx - 44, h * .2], [cx - 30, h * .1], [cx - 12, h * .06], [cx, h * .01], [cx + 14, h * .07], [cx + 32, h * .1], [cx + 44, h * .2]], 6, true);
    ctx.fill();
    ctx.fillStyle = '#f6c54a';
    wobbly(ctx, [[cx - 22, h * .2], [cx - 10, h * .12], [cx, h * .07], [cx + 12, h * .13], [cx + 22, h * .2]], 4, true); ctx.fill();
    ctx.shadowBlur = 0;
  } else {
    // 暗影方尖碑:黑石 + 紫焰
    ctx.fillStyle = '#2a2630';
    wobbly(ctx, [[cx - 72, h * .98], [cx - 58, h * .86], [cx + 58, h * .86], [cx + 72, h * .98]], 4, true); ctx.fill(); inkStroke(ctx, 5);
    ctx.fillStyle = '#34303c';
    wobbly(ctx, [[cx - 44, h * .87], [cx - 30, h * .24], [cx, h * .16], [cx + 30, h * .24], [cx + 44, h * .87]], 4, true); ctx.fill(); inkStroke(ctx, 6);
    ctx.strokeStyle = '#b070f0'; ctx.lineWidth = 4.5; ctx.shadowColor = '#b070f0'; ctx.shadowBlur = 14;
    wobblyEllipse(ctx, cx, h * .4, 14, 18, 2); ctx.stroke();
    wobbly(ctx, [[cx, h * .46], [cx, h * .6]], 2); ctx.stroke();
    wobbly(ctx, [[cx - 14, h * .66], [cx + 14, h * .66]], 2); ctx.stroke();
    wobbly(ctx, [[cx - 10, h * .74], [cx + 10, h * .78]], 2); ctx.stroke();
    // 尖刺
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#1e1a24';
    wobbly(ctx, [[cx - 40, h * .6], [cx - 76, h * .5], [cx - 42, h * .52]], 2, true); ctx.fill(); inkStroke(ctx, 4);
    wobbly(ctx, [[cx + 40, h * .5], [cx + 78, h * .42], [cx + 38, h * .44]], 2, true); ctx.fill(); inkStroke(ctx, 4);
    // 顶部暗影之火
    ctx.fillStyle = '#8a4ad0'; ctx.shadowColor = '#c080ff'; ctx.shadowBlur = 26;
    wobbly(ctx, [[cx - 30, h * .2], [cx - 22, h * .1], [cx - 6, h * .05], [cx, h * .01], [cx + 8, h * .06], [cx + 24, h * .1], [cx + 30, h * .2]], 6, true);
    ctx.fill();
    ctx.fillStyle = '#e0c8ff';
    wobblyEllipse(ctx, cx, h * .14, 8, 12, 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  return c;
}

// ---------------- 基地水晶 ----------------
export function makeNexusTexture(team) {
  seed(5300 + (team === 'red' ? 50 : 0));
  const w = 384, h = 448, c = makeCanvas(w, h), ctx = c.getContext('2d');
  const cx = w / 2;
  if (team === 'blue') {
    // 永恒篝火:石圈 + 巨大火焰 + 浮空蓝晶
    ctx.fillStyle = '#e8892a'; ctx.shadowColor = '#ffb040'; ctx.shadowBlur = 40;
    wobbly(ctx, [[cx - 140, h * .88], [cx - 110, h * .55], [cx - 60, h * .38], [cx - 30, h * .2], [cx, h * .1],
      [cx + 30, h * .22], [cx + 70, h * .36], [cx + 112, h * .55], [cx + 140, h * .88]], 10, true);
    ctx.fill();
    ctx.fillStyle = '#f6c54a';
    wobbly(ctx, [[cx - 80, h * .88], [cx - 50, h * .58], [cx, h * .32], [cx + 50, h * .58], [cx + 80, h * .88]], 6, true); ctx.fill();
    ctx.fillStyle = '#7ab8f0'; ctx.shadowColor = '#9ad0ff'; ctx.shadowBlur = 30;
    wobbly(ctx, [[cx, h * .02], [cx + 30, h * .14], [cx, h * .3], [cx - 30, h * .14]], 3, true); ctx.fill();
    ctx.shadowBlur = 0; inkStroke(ctx, 4);
    ctx.fillStyle = '#5c5a52';
    for (let i = 0; i < 7; i++) {
      const x = cx - 150 + i * 50;
      wobblyEllipse(ctx, x, h * .92, 30, 22, 4); ctx.fill(); inkStroke(ctx, 5);
    }
  } else {
    // 暗影王座
    ctx.fillStyle = '#2a2630';
    wobbly(ctx, [[cx - 150, h * .98], [cx - 130, h * .82], [cx + 130, h * .82], [cx + 150, h * .98]], 4, true); ctx.fill(); inkStroke(ctx, 6);
    ctx.fillStyle = '#3a2a40';
    wobbly(ctx, [[cx - 100, h * .84], [cx - 110, h * .3], [cx - 70, h * .12], [cx, h * .04], [cx + 70, h * .12], [cx + 110, h * .3], [cx + 100, h * .84]], 6, true);
    ctx.fill(); inkStroke(ctx, 7);
    ctx.fillStyle = '#5a2a3a';
    wobbly(ctx, [[cx - 66, h * .82], [cx - 70, h * .34], [cx, h * .2], [cx + 70, h * .34], [cx + 66, h * .82]], 5, true); ctx.fill(); inkStroke(ctx, 5);
    // 扶手
    ctx.fillStyle = '#2a2630';
    wobbly(ctx, [[cx - 140, h * .62], [cx - 66, h * .58], [cx - 66, h * .68], [cx - 136, h * .72]], 3, true); ctx.fill(); inkStroke(ctx, 5);
    wobbly(ctx, [[cx + 140, h * .62], [cx + 66, h * .58], [cx + 66, h * .68], [cx + 136, h * .72]], 3, true); ctx.fill(); inkStroke(ctx, 5);
    // 暗影宝珠 + 眼
    ctx.fillStyle = '#b070f0'; ctx.shadowColor = '#c080ff'; ctx.shadowBlur = 34;
    wobblyEllipse(ctx, cx, h * .42, 34, 34, 3); ctx.fill();
    ctx.fillStyle = '#f0e0ff';
    wobblyEllipse(ctx, cx, h * .42, 10, 18, 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = INK;
    wobblyEllipse(ctx, cx, h * .42, 3.5, 12, 1); ctx.fill();
  }
  return c;
}

// ---------------- 场上英雄(基于立绘;敌方蒙上暗影) ----------------
export function makeHeroSprite(heroId, team) {
  const src = makeHeroPortrait(heroId);
  const s = src.width, c = makeCanvas(s, s), ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  if (team === 'red') {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(46,14,64,.5)';
    ctx.fillRect(0, 0, s, s);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ff5040'; ctx.shadowColor = '#ff3020'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(s / 2 - 14, s * .32, 4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s / 2 + 16, s * .32, 4, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
  }
  return c;
}

// ---------------- 装备图标 ----------------
export function makeItemIcon(id) {
  seed(6000 + id.length * 13 + id.charCodeAt(0));
  const s = 72, c = makeCanvas(s, s), ctx = c.getContext('2d');
  ctx.fillStyle = '#2a241a'; ctx.fillRect(0, 0, s, s);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const line = (pts, color, w = 5) => { ctx.strokeStyle = color; ctx.lineWidth = w; wobbly(ctx, pts, 1.5); ctx.stroke(); };
  const blob = (pts, color) => { ctx.fillStyle = color; wobbly(ctx, pts, 1.5, true); ctx.fill(); inkStroke(ctx, 2.5); };
  const glowDot = (x, y, r, color) => {
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10;
    wobblyEllipse(ctx, x, y, r, r, 1); ctx.fill(); ctx.shadowBlur = 0;
  };
  switch (id) {
    case 'flint': blob([[18, 56], [40, 22], [54, 16], [48, 34], [24, 60]], '#9aa0a4'); line([[18, 58], [10, 66]], '#6b4a2a', 6); break;
    case 'logsuit': blob([[16, 18], [56, 18], [60, 58], [12, 58]], '#7a5a34'); line([[16, 32], [56, 32]], INK, 2.5); line([[14, 46], [58, 46]], INK, 2.5); break;
    case 'cane': line([[24, 64], [44, 14]], '#c9a227', 6); line([[44, 14], [56, 16], [58, 26]], '#c9a227', 6); break;
    case 'spear': line([[12, 62], [52, 20]], '#6b4a2a', 5); blob([[48, 14], [62, 8], [58, 24]], '#b8c0c4'); break;
    case 'football': blob([[12, 46], [16, 22], [36, 12], [56, 22], [60, 46]], '#a87a5a'); line([[36, 14], [36, 46]], '#e8dcbb', 3); break;
    case 'iceamulet': line([[16, 12], [36, 34], [56, 12]], '#c9a227', 3); blob([[36, 30], [50, 44], [36, 62], [22, 44]], '#7ab8f0'); break;
    case 'firestaff': line([[16, 64], [44, 22]], '#6b4a2a', 6); glowDot(48, 18, 10, '#e0503a'); break;
    case 'hambat': line([[14, 62], [32, 40]], '#e8dcbb', 6); blob([[28, 44], [30, 22], [48, 10], [62, 20], [54, 40]], '#c06a6a'); break;
    case 'marble': blob([[14, 16], [58, 16], [62, 60], [10, 60]], '#c8c4ba'); line([[22, 30], [34, 44], [28, 54]], '#8a867c', 2.5); break;
    case 'crown': blob([[12, 52], [14, 22], [26, 36], [36, 14], [46, 36], [58, 22], [60, 52]], '#7a9a6a'); glowDot(36, 44, 5, '#e0b83a'); break;
    case 'darksword': blob([[18, 60], [50, 14], [58, 18], [26, 64]], '#4a3a5a'); line([[14, 50], [32, 64]], '#9a6ad0', 4); glowDot(52, 18, 3, '#e04040'); break;
    case 'lifeamulet': line([[16, 12], [36, 30], [56, 12]], '#c9a227', 3); blob([[36, 26], [52, 40], [36, 62], [20, 40]], '#d04040'); break;
    case 'potion': blob([[26, 20], [46, 20], [52, 58], [20, 58]], '#c06070'); line([[28, 14], [44, 14]], '#e8dcbb', 5); break;
  }
  ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, s, s);
  return c;
}
