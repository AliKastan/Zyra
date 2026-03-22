/**
 * levelInjector.js
 *
 * Injects the level system (HTML, CSS, JS) into a game template's HTML source.
 * Called at build time when loading templates, NOT at runtime in the browser.
 *
 * The level system adds:
 *   - Two new states: LEVEL_COMPLETE (5) and LEVEL_TRANSITION (6)
 *   - Level config array with 5 default levels
 *   - Level progression, objectives, time limits, boss support
 *   - Level transition and level-complete overlay screens
 *   - Level progress bar and objective display during gameplay
 */

const LEVEL_CSS = `
/* ─── LEVEL BAR (during gameplay, below score) ─── */
.level-bar{position:absolute;top:48px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:8px;z-index:10;pointer-events:none;padding:0 16px}
#level-display{font-size:11px;font-weight:700;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:1px}
.level-divider{color:rgba(255,255,255,.2);font-size:11px}
.level-obj-text{font-size:11px;color:rgba(255,255,255,.4)}
#level-timer{font-size:13px;font-weight:800;color:#fff;position:absolute;right:56px;top:14px}
.level-progress-container{position:absolute;top:68px;left:20px;right:20px;height:3px;background:rgba(255,255,255,.08);border-radius:2px;z-index:10;overflow:hidden}
.level-progress-bar{height:100%;width:0%;background:linear-gradient(90deg,#00ffff,#4ECDC4);border-radius:2px;transition:width .3s ease}
.level-complete-content{display:flex;flex-direction:column;align-items:center;animation:zyraFadeIn .4s ease-out}
.level-complete-title{font-size:28px;font-weight:900;color:#FFD700;text-shadow:0 0 20px rgba(255,215,0,.3);margin:16px 0}
.level-complete-stars{display:flex;gap:8px;font-size:40px}
.level-score-label{font-size:12px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:2px}
.level-score-value{font-size:44px;font-weight:900;color:#fff}
.level-transition-content{display:flex;flex-direction:column;align-items:center;gap:12px}
.level-transition-number{font-size:16px;font-weight:800;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:4px;animation:zyraSlideUp .4s ease-out}
.level-transition-name{font-size:34px;font-weight:900;color:#fff;text-shadow:0 0 30px rgba(0,255,255,.3);animation:zyraSlideUp .4s ease-out .1s both}
.level-transition-objective{font-size:14px;color:rgba(255,255,255,.5);animation:zyraSlideUp .4s ease-out .2s both}
.level-transition-new{display:flex;align-items:center;gap:8px;animation:zyraSlideUp .4s ease-out .3s both}
.new-badge{background:#FF4757;color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:4px;letter-spacing:1px}
.level-transition-ready{font-size:13px;color:rgba(255,255,255,.3);margin-top:24px;animation:zyraSlideUp .4s ease-out .4s both}
.level-transition-countdown{font-size:64px;font-weight:900;color:#00ffff;text-shadow:0 0 40px rgba(0,255,255,.5);animation:zyraPulse .8s ease-in-out infinite;margin-top:8px}
`;

const LEVEL_HTML = `
<!-- LEVEL COMPLETE SCREEN -->
<div id="screen-level-complete" class="overlay-screen">
<div class="level-complete-content">
<div class="level-complete-stars" id="level-stars"></div>
<div class="level-complete-title">LEVEL COMPLETE!</div>
<div style="display:flex;flex-direction:column;align-items:center;margin:12px 0">
<span class="level-score-label">Score</span>
<span class="level-score-value" id="level-complete-score">0</span>
</div>
<div id="level-complete-stats" style="margin:8px 0;font-size:12px;color:rgba(255,255,255,.5)"></div>
<button id="btn-next-level" class="btn btn-primary" style="margin-top:20px">NEXT LEVEL →</button>
</div>
</div>
<!-- LEVEL TRANSITION SCREEN -->
<div id="screen-level-transition" class="overlay-screen">
<div class="level-transition-content">
<div class="level-transition-number" id="transition-level-number">LEVEL 2</div>
<div class="level-transition-name" id="transition-level-name"></div>
<div class="level-transition-objective" id="transition-objective"></div>
<div class="level-transition-new" id="transition-new-mechanic" style="display:none">
<span class="new-badge">NEW</span>
<span id="transition-new-text"></span>
</div>
<div class="level-transition-ready">Get Ready...</div>
<div class="level-transition-countdown" id="transition-countdown">3</div>
</div>
</div>
`;

// HUD elements to add inside #screen-game (after score bar)
const LEVEL_HUD_HTML = `
<div class="level-bar">
<div class="level-indicator">
<span id="level-display">Level 1</span>
<span class="level-divider">|</span>
<span id="level-objective" class="level-obj-text"></span>
</div>
<span id="level-timer" style="display:none"></span>
</div>
<div class="level-progress-container"><div class="level-progress-bar" id="level-progress-bar"></div></div>
`;

const LEVEL_JS = `
// ═══ LEVEL SYSTEM ═══
let currentLevel=1,maxLevel=5,levelScore=0,totalScore=0,levelsCompleted=0,levelStartTime=0,levelTimeLimit=0,levelObjective='',levelObjectiveCurrent=0,bossActive=false;
let _lvlCountdownId=null;

// Default level configs — template overrides via setLevelConfigs()
let levelConfigs=[
{level:1,name:'Level 1',subtitle:'Getting Started',objective:'Score 50 points',objectiveType:'score',objectiveTarget:50,timeLimit:0,background:'#0a0a2e',settings:{spawnRate:2000,enemySpeed:1,enemyHealth:1,maxEnemies:3,gravity:15,playerSpeed:5,obstacleGap:200,specialEnemies:false,bossLevel:false,newMechanic:null,powerUpChance:.1}},
{level:2,name:'Level 2',subtitle:'Picking Up Speed',objective:'Score 100 points',objectiveType:'score',objectiveTarget:100,timeLimit:0,background:'#0a1a2e',settings:{spawnRate:1600,enemySpeed:1.4,enemyHealth:1,maxEnemies:5,gravity:18,playerSpeed:5.5,obstacleGap:170,specialEnemies:false,bossLevel:false,newMechanic:null,powerUpChance:.12}},
{level:3,name:'Level 3',subtitle:'New Tricks',objective:'Score 200 points',objectiveType:'score',objectiveTarget:200,timeLimit:0,background:'#1a0a2e',settings:{spawnRate:1200,enemySpeed:1.8,enemyHealth:2,maxEnemies:6,gravity:20,playerSpeed:6,obstacleGap:150,specialEnemies:true,bossLevel:false,newMechanic:'special_enemies',powerUpChance:.15}},
{level:4,name:'Level 4',subtitle:'Danger Zone',objective:'Score 350 points',objectiveType:'score',objectiveTarget:350,timeLimit:60,background:'#2e0a1a',settings:{spawnRate:900,enemySpeed:2.3,enemyHealth:2,maxEnemies:8,gravity:22,playerSpeed:6.5,obstacleGap:130,specialEnemies:true,bossLevel:false,newMechanic:'time_limit',powerUpChance:.18}},
{level:5,name:'FINAL LEVEL',subtitle:'The Ultimate Challenge',objective:'Defeat the Boss',objectiveType:'destroy',objectiveTarget:1,timeLimit:90,background:'#2e0a0a',settings:{spawnRate:700,enemySpeed:2.8,enemyHealth:3,maxEnemies:10,gravity:25,playerSpeed:7,obstacleGap:110,specialEnemies:true,bossLevel:true,newMechanic:'boss',powerUpChance:.25}}
];

function setLevelConfigs(configs){levelConfigs=configs;maxLevel=configs.length;}
function getCurrentLevelConfig(){return levelConfigs[Math.min(currentLevel-1,levelConfigs.length-1)];}
function getLevelSettings(){return getCurrentLevelConfig().settings;}

function checkLevelObjective(){
  const c=getCurrentLevelConfig();let done=false;
  if(c.objectiveType==='score')done=levelScore>=c.objectiveTarget;
  else if(c.objectiveType==='survive')done=(performance.now()-levelStartTime)/1000>=c.objectiveTarget;
  else if(c.objectiveType==='collect'||c.objectiveType==='destroy')done=levelObjectiveCurrent>=c.objectiveTarget;
  if(done&&currentState===State.PLAYING)completeLevel();
}

function completeLevel(){
  if(animFrameId){cancelAnimationFrame(animFrameId);animFrameId=null;}
  clearAllTimers();levelsCompleted++;totalScore+=levelScore;
  if(typeof sfxWin==='function')sfxWin();
  if(currentLevel>=maxLevel){score=totalScore;changeState(State.GAMEOVER);_showVictory();}
  else changeState(State.LEVEL_COMPLETE);
}

function startNextLevel(){currentLevel++;levelScore=0;levelObjectiveCurrent=0;bossActive=false;changeState(State.LEVEL_TRANSITION);}

function beginLevel(){
  const c=getCurrentLevelConfig();levelStartTime=performance.now();levelObjective=c.objective;levelTimeLimit=c.timeLimit;
  if(typeof applyLevelSettings==='function')applyLevelSettings(c.settings);
  const ga=document.getElementById('game-area');if(ga&&c.background)ga.style.background=c.background;
  _updateLvlDisplay();_updateObjDisp();
  if(typeof resetLevelState==='function')resetLevelState();
  currentState=State.PLAYING;_showScr(State.PLAYING);isPaused=false;
  lastTimestamp=performance.now();animFrameId=requestAnimationFrame(gameLoop);
}

function addLevelScore(pts,x,y){
  levelScore+=pts;score=totalScore+levelScore;updateScoreDisplay();
  if(x!==undefined&&y!==undefined){showScorePopup(x,y,'+'+pts);spawnParticles(x,y,8,'#FFD700',{speed:80,decay:2});}
  if(typeof sfxScore==='function')sfxScore();checkLevelObjective();
}
function addObjectiveProgress(n){levelObjectiveCurrent+=(n||1);_updateObjDisp();checkLevelObjective();}

function updateLevelProgress(){
  const c=getCurrentLevelConfig(),bar=document.getElementById('level-progress-bar');if(!bar)return;
  let p=0;
  if(c.objectiveType==='score')p=Math.min(levelScore/c.objectiveTarget,1);
  else if(c.objectiveType==='survive')p=Math.min((performance.now()-levelStartTime)/1000/c.objectiveTarget,1);
  else if(c.objectiveType==='collect'||c.objectiveType==='destroy')p=Math.min(levelObjectiveCurrent/c.objectiveTarget,1);
  bar.style.width=(p*100)+'%';
  if(p>.8)bar.style.boxShadow='0 0 10px rgba(0,255,255,.5)';else bar.style.boxShadow='none';
}

function updateTimeLimit(dt){
  if(levelTimeLimit<=0)return;const el=(performance.now()-levelStartTime)/1000,rem=Math.max(0,levelTimeLimit-el);
  const te=document.getElementById('level-timer');
  if(te){te.style.display='block';te.textContent=Math.ceil(rem)+'s';te.style.color=rem<10?'#FF4757':'#fff';}
  if(rem<=0){
    const c=getCurrentLevelConfig();
    if(c.objectiveType==='survive')completeLevel();else changeState(State.GAMEOVER);
  }
}

function _updateLvlDisplay(){
  const e=document.getElementById('level-display');if(e)e.textContent='Level '+currentLevel;
  const t=document.getElementById('level-timer');if(t)t.style.display=levelTimeLimit>0?'block':'none';
}
function _updateObjDisp(){
  const c=getCurrentLevelConfig(),e=document.getElementById('level-objective');if(!e)return;
  if(c.objectiveType==='score')e.textContent=levelScore+' / '+c.objectiveTarget;
  else if(c.objectiveType==='survive'){const s=Math.floor((performance.now()-levelStartTime)/1000);e.textContent=s+'s / '+c.objectiveTarget+'s';}
  else if(c.objectiveType==='collect'||c.objectiveType==='destroy')e.textContent=levelObjectiveCurrent+' / '+c.objectiveTarget;
  else e.textContent=c.objective;
}

function _showLvlComplete(){
  document.getElementById('level-complete-score').textContent=levelScore;
  const c=getCurrentLevelConfig();let stars=1;
  if(c.objectiveType==='score'){if(levelScore>=c.objectiveTarget*2)stars=3;else if(levelScore>=c.objectiveTarget*1.3)stars=2;}
  else{stars=2;if(levelScore>100)stars=3;}
  const se=document.getElementById('level-stars');se.innerHTML='';
  for(let i=1;i<=3;i++){const s=document.createElement('span');s.textContent='\\u2B50';s.style.opacity=i<=stars?'1':'0.15';if(i<=stars)s.style.animation='zyraStar .4s ease-out '+(i*.2)+'s both';se.appendChild(s);}
}

function _showLvlTransition(){
  const c=levelConfigs[Math.min(currentLevel-1,levelConfigs.length-1)];
  document.getElementById('transition-level-number').textContent='LEVEL '+currentLevel;
  document.getElementById('transition-level-name').textContent=c.subtitle;
  document.getElementById('transition-objective').textContent=c.objective;
  const ne=document.getElementById('transition-new-mechanic'),nt=document.getElementById('transition-new-text');
  if(c.settings.newMechanic){ne.style.display='flex';const mn={'special_enemies':'Special enemies appear!','time_limit':'Time limit added!','boss':'Boss fight!','moving_platforms':'Moving platforms!','speed_boost':'Everything faster!'};nt.textContent=mn[c.settings.newMechanic]||'New challenge!';}
  else ne.style.display='none';
  if(_lvlCountdownId)clearInterval(_lvlCountdownId);
  const ce=document.getElementById('transition-countdown');let ct=3;ce.textContent=ct;ce.style.color='#00ffff';
  _lvlCountdownId=setInterval(function(){ct--;if(ct>0){ce.textContent=ct;if(typeof sfxTap==='function')sfxTap();}else if(ct===0){ce.textContent='GO!';ce.style.color='#34d399';if(typeof sfxScore==='function')sfxScore();}else{clearInterval(_lvlCountdownId);_lvlCountdownId=null;beginLevel();}},800);
}

function _showVictory(){
  const fe=document.getElementById('final-score');if(fe)fe.textContent=totalScore;
  const nh=document.getElementById('new-highscore');
  if(nh&&totalScore>highScore){nh.style.display='block';highScore=totalScore;localStorage.setItem('zyra_hs',String(highScore));}
  for(let i=0;i<5;i++){setTimeout(function(){spawnParticles(Math.random()*375,Math.random()*400,20,['#FFD700','#FF6B6B','#4ECDC4','#A78BFA'][Math.floor(Math.random()*4)],{speed:150,decay:1});},i*300);}
  if(typeof sfxWin==='function')sfxWin();
}

// Patch showScreen and changeState for level states (called from _initLevelSystem)
function _initLevelSystem(){
  const origShow=typeof _showScr==='function'?_showScr:showScreen;
  _showScr=function(s){
    origShow(s);
    const lc=document.getElementById('screen-level-complete'),lt=document.getElementById('screen-level-transition');
    if(lc)lc.style.display=s===State.LEVEL_COMPLETE?'flex':'none';
    if(lt)lt.style.display=s===State.LEVEL_TRANSITION?'flex':'none';
    if(s===State.LEVEL_COMPLETE||s===State.LEVEL_TRANSITION){const g=document.getElementById('screen-game');if(g)g.style.display='block';}
  };

  const origChange=changeState;
  changeState=function(ns){
    if(ns===State.LEVEL_COMPLETE){if(animFrameId){cancelAnimationFrame(animFrameId);animFrameId=null;}clearAllTimers();currentState=ns;_showScr(ns);_showLvlComplete();return;}
    if(ns===State.LEVEL_TRANSITION){currentState=ns;_showScr(ns);_showLvlTransition();return;}
    origChange(ns);
  };

  // Wire next-level button
  const nlb=document.getElementById('btn-next-level');
  if(nlb)nlb.addEventListener('click',function(){if(typeof sfxClick==='function')sfxClick();startNextLevel();});

  // Override startGame to go through level system
  const origStart=startGame;
  startGame=function(){
    score=0;totalScore=0;levelScore=0;currentLevel=1;levelsCompleted=0;levelObjectiveCurrent=0;bossActive=false;
    particles.length=0;clearAllTimers();
    _updateLvlDisplay();beginLevel();
  };
}
// ═══ END LEVEL SYSTEM ═══
`;

/**
 * Inject the level system into a template HTML string.
 * Adds CSS, HTML screens, HUD elements, and JS code.
 *
 * @param {string} html - The template HTML source
 * @returns {string} Modified HTML with level system injected
 */
function injectLevelSystem(html) {
  if (!html) return html;
  // Skip if already injected
  if (html.includes('LEVEL SYSTEM')) return html;

  // 1. Inject CSS before </style>
  if (html.includes('</style>')) {
    html = html.replace('</style>', LEVEL_CSS + '\n</style>');
  }

  // 2. Inject HTML screens before </body>
  if (html.includes('</body>')) {
    html = html.replace('</body>', LEVEL_HTML + '\n</body>');
  }

  // 3. Inject HUD after score-bar or btn-pause
  const scoreBarMatch = html.match(/<div[^>]*class="score-bar"[^>]*>[\s\S]*?<\/div>/i);
  if (scoreBarMatch) {
    const insertAfter = scoreBarMatch[0];
    html = html.replace(insertAfter, insertAfter + '\n' + LEVEL_HUD_HTML);
  } else {
    // Fallback: inject after btn-pause
    const pauseMatch = html.match(/<button[^>]*id="btn-pause"[^>]*>[\s\S]*?<\/button>/i);
    if (pauseMatch) {
      html = html.replace(pauseMatch[0], pauseMatch[0] + '\n' + LEVEL_HUD_HTML);
    }
  }

  // 4. Inject JS before the closing </script> of the last script block
  // Find the last </script> and inject level code before it
  const lastScriptClose = html.lastIndexOf('</script>');
  if (lastScriptClose !== -1) {
    // Also add the init call at the end
    const initCall = '\n// Init level system\nif(typeof _initLevelSystem===\"function\")_initLevelSystem();\n';
    html = html.slice(0, lastScriptClose) + '\n' + LEVEL_JS + initCall + html.slice(lastScriptClose);
  }

  // 5. Add LEVEL_COMPLETE and LEVEL_TRANSITION to State enum if present
  // Look for State = { ... } and add the new states
  html = html.replace(
    /State\s*=\s*\{\s*MENU\s*:\s*0\s*,\s*PLAYING\s*:\s*1\s*,\s*PAUSED\s*:\s*2\s*,\s*GAMEOVER\s*:\s*3\s*,\s*TUTORIAL\s*:\s*4\s*\}/,
    'State = { MENU: 0, PLAYING: 1, PAUSED: 2, GAMEOVER: 3, TUTORIAL: 4, LEVEL_COMPLETE: 5, LEVEL_TRANSITION: 6 }'
  );

  return html;
}

module.exports = { injectLevelSystem, LEVEL_CSS, LEVEL_HTML, LEVEL_HUD_HTML, LEVEL_JS };
