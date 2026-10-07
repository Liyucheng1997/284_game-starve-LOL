// ============================================================
// 入口:选择英雄与难度 → 开始对局
// ============================================================
import { HEROES } from './heroes.js';
import { DIFFICULTY } from './config.js';
import { makeHeroPortrait } from './textures.js';
import { Game } from './game.js';

const cardsEl = document.getElementById('hero-cards');
const diffEl = document.getElementById('difficulty');
const startBtn = document.getElementById('start-btn');
let selected = null;
let difficulty = 'normal';

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

Object.entries(DIFFICULTY).forEach(([key, d]) => {
  const btn = document.createElement('button');
  btn.className = 'diff-btn' + (key === difficulty ? ' selected' : '');
  btn.innerHTML = `${d.name}<small>${d.desc}</small>`;
  btn.addEventListener('click', () => {
    difficulty = key;
    diffEl.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
  diffEl.appendChild(btn);
});

startBtn.addEventListener('click', () => {
  if (!selected) return;
  document.getElementById('hero-select').classList.add('hidden');
  const game = new Game(selected, difficulty);
  window.game = game; // 便于调试
  game.start();
  setTimeout(() => game.lockPointer(), 100);
});
