/**
 * fallbackGenerator — last-resort game generator.
 *
 * Called when all AI generation attempts fail (timeout, parse failure, etc.).
 * Produces a simple but fully playable tap-to-survive mobile game that always works.
 *
 * The generated game:
 * - Fills the phone screen
 * - Has working touch controls
 * - Has a score counter and game over / retry loop
 * - Persists best score to localStorage
 * - Requires zero external dependencies
 */

const { slugify } = require('../utils/slugify');

/**
 * Extract a game title from the user prompt.
 */
function extractTitle(prompt) {
  if (!prompt) return 'Mobile Game';
  const gameMatch = prompt.match(/(?:make|build|create|generate)?\s*(?:a|an)?\s*([\w\s-]{3,30}?)\s*game/i);
  if (gameMatch) return toTitleCase(gameMatch[1].trim()) + ' Game';
  const words = prompt.replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2).slice(0, 4);
  if (words.length >= 2) return toTitleCase(words.join(' '));
  return 'Mobile Game';
}

function toTitleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Generate a simple but real playable fallback game.
 * Produces 3 files: index.html, css/style.css, js/game.js
 *
 * @param {string} userPrompt
 * @param {object} [plan]
 * @returns {{ projectName, files, _fallback: true }}
 */
function generateFallback(userPrompt, plan) {
  const projectName = slugify(userPrompt || 'mobile-game') || 'mobile-game';
  const gameTitle   = extractTitle(userPrompt) || plan?.game_name || 'Tap Survivor';
  const storageKey  = projectName + '_best';

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <title>${gameTitle}</title>
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <canvas id="game-canvas"></canvas>

  <!-- HUD overlay -->
  <div id="hud" class="hud hidden">
    <div id="score-display" class="score-display">0</div>
    <button id="pause-btn" class="pause-btn" type="button">&#9646;&#9646;</button>
  </div>

  <!-- Main Menu -->
  <div id="screen-menu" class="screen">
    <div class="screen-content">
      <h1 class="game-title">${gameTitle}</h1>
      <p class="game-subtitle">Dodge the falling blocks. Survive as long as you can.</p>
      <div class="best-score-display" id="menu-best">Best: 0</div>
      <button id="play-btn" class="btn btn-primary" type="button">Play</button>
    </div>
  </div>

  <!-- Pause Screen -->
  <div id="screen-pause" class="screen hidden">
    <div class="screen-content">
      <h2 class="screen-title">Paused</h2>
      <button id="resume-btn" class="btn btn-primary" type="button">Resume</button>
      <button id="menu-from-pause-btn" class="btn btn-secondary" type="button">Main Menu</button>
    </div>
  </div>

  <!-- Game Over Screen -->
  <div id="screen-gameover" class="screen hidden">
    <div class="screen-content">
      <h2 class="screen-title">Game Over</h2>
      <div class="final-score" id="final-score">Score: 0</div>
      <div class="best-score-display" id="gameover-best">Best: 0</div>
      <button id="retry-btn" class="btn btn-primary" type="button">Play Again</button>
      <button id="menu-from-gameover-btn" class="btn btn-secondary" type="button">Menu</button>
    </div>
  </div>

  <script src="js/game.js"></script>
</body>
</html>`;

  const styleCss = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d0d1a;
  --bg2:#1a0a2e;
  --primary:#6c63ff;
  --primary-dark:#5a52e0;
  --accent:#ff6b6b;
  --text:#f0f0f0;
  --text-dim:rgba(240,240,240,0.6);
  --radius:14px;
  --font:system-ui,-apple-system,'Segoe UI',sans-serif;
}
html,body{width:100%;height:100%;overflow:hidden;background:var(--bg);font-family:var(--font);touch-action:none;-webkit-user-select:none;user-select:none}
canvas#game-canvas{display:block;position:fixed;top:0;left:0;width:100%;height:100%}
.hud{position:fixed;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:48px 16px 12px;pointer-events:none;z-index:10}
.hud.hidden{display:none}
.score-display{font-size:2rem;font-weight:800;color:var(--text);text-shadow:0 2px 12px rgba(0,0,0,.6)}
.pause-btn{pointer-events:all;width:44px;height:44px;border:none;border-radius:50%;background:rgba(255,255,255,.12);color:var(--text);font-size:1rem;cursor:pointer;-webkit-tap-highlight-color:transparent}
.screen{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(13,13,26,.92);backdrop-filter:blur(8px);z-index:20;animation:fadeIn .2s ease}
.screen.hidden{display:none}
.screen-content{display:flex;flex-direction:column;align-items:center;gap:16px;padding:40px 32px;text-align:center;max-width:340px;width:100%}
.game-title{font-size:2.4rem;font-weight:900;color:var(--text);letter-spacing:-.03em;line-height:1.1}
.game-subtitle{font-size:1rem;color:var(--text-dim);margin-bottom:8px}
.screen-title{font-size:1.8rem;font-weight:800;color:var(--text)}
.final-score{font-size:2rem;font-weight:700;color:var(--primary)}
.best-score-display{font-size:.95rem;color:var(--text-dim)}
.btn{display:block;width:100%;max-width:240px;padding:16px 24px;border:none;border-radius:var(--radius);font-size:1rem;font-weight:700;cursor:pointer;transition:transform .1s ease,opacity .1s ease;-webkit-tap-highlight-color:transparent}
.btn:active{transform:scale(.96);opacity:.85}
.btn-primary{background:var(--primary);color:#fff}
.btn-primary:hover{background:var(--primary-dark)}
.btn-secondary{background:rgba(255,255,255,.07);color:var(--text);border:1px solid rgba(255,255,255,.12)}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}`;

  const gameJs = `// ${gameTitle} — Mobile Fallback Game
(function(){'use strict';

const canvas=document.getElementById('game-canvas');
const ctx=canvas.getContext('2d');
const STORAGE_KEY='${storageKey}';

function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
window.addEventListener('resize',resize);resize();

// State
let gameState='menu';
let score=0,bestScore=0,lastTime=0;

// Try load best score
try{bestScore=parseInt(localStorage.getItem(STORAGE_KEY)||'0',10)||0;}catch(_){}

// Player
let player={x:0,y:0,w:50,h:50};

// Blocks
let blocks=[],spawnTimer=0,spawnRate=1.2,gameSpeed=150,speedTimer=0;

// Floats
let floats=[];

// Pointer
let pointerX=null;

// DOM refs
const hud=document.getElementById('hud');
const scoreEl=document.getElementById('score-display');
const screenMenu=document.getElementById('screen-menu');
const screenPause=document.getElementById('screen-pause');
const screenOver=document.getElementById('screen-gameover');
const finalScoreEl=document.getElementById('final-score');

function updateBestDisplays(){
  const t='Best: '+bestScore;
  const m=document.getElementById('menu-best');
  const g=document.getElementById('gameover-best');
  if(m)m.textContent=t;
  if(g)g.textContent=t;
}

function showScreen(name){
  screenMenu.classList.add('hidden');
  screenPause.classList.add('hidden');
  screenOver.classList.add('hidden');
  hud.classList.add('hidden');
  if(name==='menu'){screenMenu.classList.remove('hidden');updateBestDisplays();}
  if(name==='pause'){screenPause.classList.remove('hidden');}
  if(name==='gameover'){screenOver.classList.remove('hidden');updateBestDisplays();}
  if(name==='playing'){hud.classList.remove('hidden');}
}

function initGame(){
  player.x=canvas.width/2-25;
  player.y=canvas.height-100;
  blocks=[];floats=[];score=0;
  spawnTimer=0;spawnRate=1.2;gameSpeed=150;speedTimer=0;
  if(scoreEl)scoreEl.textContent='0';
}

function startGame(){
  initGame();gameState='playing';showScreen('playing');
  lastTime=0;requestAnimationFrame(gameLoop);
}

function pauseGame(){if(gameState!=='playing')return;gameState='paused';showScreen('pause');}

function resumeGame(){
  if(gameState!=='paused')return;gameState='playing';showScreen('playing');
  lastTime=0;requestAnimationFrame(gameLoop);
}

function endGame(){
  gameState='gameover';
  if(score>bestScore){bestScore=score;try{localStorage.setItem(STORAGE_KEY,bestScore);}catch(_){}}
  if(finalScoreEl)finalScoreEl.textContent='Score: '+score;
  showScreen('gameover');
}

function goMenu(){gameState='menu';showScreen('menu');}

function spawnBlock(){
  const w=40+Math.random()*40;
  blocks.push({x:Math.random()*(canvas.width-w),y:-60,w,h:28+Math.random()*18,speed:gameSpeed+Math.random()*40,hue:Math.random()*360});
}

function rectsOverlap(a,b){
  return a.x+4<b.x+b.w&&a.x+a.w-4>b.x&&a.y+4<b.y+b.h&&a.y+a.h-4>b.y;
}

function update(dt){
  // Move player toward pointer or use arrow keys
  let targetX=player.x;
  if(pointerX!==null) targetX=pointerX-player.w/2;
  else if(keysDown['ArrowLeft']||keysDown['a']) targetX=player.x-280*dt;
  else if(keysDown['ArrowRight']||keysDown['d']) targetX=player.x+280*dt;
  player.x+=Math.sign(targetX-player.x)*Math.min(280*dt,Math.abs(targetX-player.x));
  player.x=Math.max(0,Math.min(canvas.width-player.w,player.x));

  // Difficulty ramp
  speedTimer+=dt;
  if(speedTimer>=6){speedTimer=0;gameSpeed=Math.min(400,gameSpeed+20);spawnRate=Math.max(0.4,spawnRate-0.08);}

  // Spawn
  spawnTimer+=dt;
  if(spawnTimer>=spawnRate){spawnTimer=0;spawnBlock();}

  // Blocks
  for(let i=blocks.length-1;i>=0;i--){
    const b=blocks[i];
    b.y+=b.speed*dt;
    if(b.y>canvas.height+80){
      blocks.splice(i,1);score++;
      if(scoreEl)scoreEl.textContent=score;
      floats.push({text:'+1',x:b.x+b.w/2,y:canvas.height-80,vy:-60,alpha:1,life:0.8});
      continue;
    }
    if(rectsOverlap(player,b)){endGame();return;}
  }

  // Floats
  for(let i=floats.length-1;i>=0;i--){
    const f=floats[i];f.y+=f.vy*dt;f.life-=dt;f.alpha=Math.max(0,f.life/0.8);
    if(f.life<=0)floats.splice(i,1);
  }
}

function roundRect(x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const g=ctx.createLinearGradient(0,0,0,canvas.height);
  g.addColorStop(0,'#0d0d1a');g.addColorStop(1,'#1a0a2e');
  ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);

  // Grid
  ctx.strokeStyle='rgba(255,255,255,0.03)';ctx.lineWidth=1;
  for(let x=0;x<canvas.width;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
  for(let y=0;y<canvas.height;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}

  // Blocks
  for(const b of blocks){
    ctx.save();ctx.fillStyle='hsl('+b.hue+',80%,60%)';
    ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=12;
    roundRect(b.x,b.y,b.w,b.h,6);ctx.fill();ctx.restore();
  }

  // Player
  ctx.save();ctx.fillStyle='#6c63ff';ctx.shadowColor='#6c63ff';ctx.shadowBlur=20;
  roundRect(player.x,player.y,player.w,player.h,10);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.25)';roundRect(player.x+6,player.y+6,player.w-12,8,4);ctx.fill();
  ctx.restore();

  // Floats
  ctx.save();ctx.font='bold 18px system-ui';ctx.textAlign='center';
  for(const f of floats){ctx.globalAlpha=f.alpha;ctx.fillStyle='#ffd43b';ctx.fillText(f.text,f.x,f.y);}
  ctx.globalAlpha=1;ctx.restore();
}

function gameLoop(ts){
  if(gameState!=='playing')return;
  const dt=lastTime?Math.min((ts-lastTime)/1000,0.05):0.016;
  lastTime=ts;update(dt);draw();requestAnimationFrame(gameLoop);
}

// Input
canvas.addEventListener('pointermove',e=>{
  if(gameState!=='playing')return;
  const r=canvas.getBoundingClientRect();pointerX=e.clientX-r.left;
},{passive:true});
canvas.addEventListener('pointerdown',e=>{
  if(gameState!=='playing')return;
  const r=canvas.getBoundingClientRect();pointerX=e.clientX-r.left;
},{passive:true});
canvas.addEventListener('pointerup',()=>{pointerX=null;});
canvas.addEventListener('pointercancel',()=>{pointerX=null;});

const keysDown={};
window.addEventListener('keydown',e=>{
  keysDown[e.key]=true;
  if(e.key==='Escape'&&gameState==='playing')pauseGame();
  if(e.key==='Escape'&&gameState==='paused')resumeGame();
});
window.addEventListener('keyup',e=>{keysDown[e.key]=false;});

// Buttons
function on(id,fn){const el=document.getElementById(id);if(el)el.addEventListener('click',fn);}
on('play-btn',startGame);
on('pause-btn',pauseGame);
on('resume-btn',resumeGame);
on('retry-btn',startGame);
on('menu-from-pause-btn',goMenu);
on('menu-from-gameover-btn',goMenu);

// Init
(function(){
  const g=ctx.createLinearGradient(0,0,0,canvas.height);
  g.addColorStop(0,'#0d0d1a');g.addColorStop(1,'#1a0a2e');
  ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);
  updateBestDisplays();showScreen('menu');
})();

})();`;

  return {
    projectName,
    _fallback: true,
    files: [
      { path: 'index.html',    content: indexHtml },
      { path: 'css/style.css', content: styleCss  },
      { path: 'js/game.js',    content: gameJs     },
    ],
  };
}

module.exports = { generateFallback };
