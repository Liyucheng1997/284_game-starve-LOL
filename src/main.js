// ============================================================
// 入口:英雄选择 → 开始游戏
// ============================================================
import { HEROES } from './heroes.js';
import { makeHeroPortrait } from './textures.js';
import { Game } from './game.js';

const cardsEl = document.getElementById('hero-cards');
const startBtn = document.getElementById('start-btn');
let selected = null;

Object.values(HEROES).forEach(hero => {
  const card = document.createElement('div');
  card.className = 'hero-card paper-panel';
  const portrait = makeHeroPortrait(hero.id);
  card.appendChild(portrait);
  const skillsHtml = hero.skills
    .map(sk => `<div><b>${sk.key}</b> ${sk.name} — ${sk.desc}</div>`)
    .join('');
  card.insertAdjacentHTML('beforeend', `
    <h2>${hero.name}</h2>
    <div class="role">${hero.role} · ${hero.desc}</div>
    <div class="skills">${skillsHtml}</div>
  `);
  card.addEventListener('click', () => {
    document.querySelectorAll('.hero-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selected = hero.id;
    startBtn.disabled = false;
  });
  cardsEl.appendChild(card);
});

startBtn.addEventListener('click', () => {
  if (!selected) return;
  document.getElementById('hero-select').classList.add('hidden');
  const game = new Game(selected);
  window.game = game; // 便于调试
  game.start();
  // 首次点击进入指针锁定
  setTimeout(() => game.lockPointer(), 100);
});
