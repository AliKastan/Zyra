/**
 * level-system.js
 *
 * Shared level system for Zyra game templates.
 * NOT loaded at runtime — this is a BUILD-TIME artifact.
 * The injectLevelSystem() function in levelInjector.js reads this file
 * and injects the code into each template's HTML.
 *
 * This file documents the level system API that every template must integrate.
 */

// ===== LEVEL SYSTEM STATE (add to template's state section) =====
/*
  Add to State enum:  LEVEL_COMPLETE: 5, LEVEL_TRANSITION: 6

  let currentLevel = 1;
  let maxLevel = 5;
  let levelScore = 0;
  let totalScore = 0;
  let levelsCompleted = 0;
  let levelStartTime = 0;
  let levelTimeLimit = 0;
  let levelObjective = '';
  let levelObjectiveCount = 0;
  let levelObjectiveCurrent = 0;
  let bossActive = false;
*/

// ===== LEVEL CONFIGS (template overrides this) =====
/*
  let levelConfigs = [ ... 5 level objects ... ];
  Each has: { level, name, subtitle, objective, objectiveType, objectiveTarget,
              timeLimit, background, settings: { spawnRate, enemySpeed, ... } }
*/

// ===== API for template game code =====
/*
  getCurrentLevelConfig()     → current level's config object
  getLevelSettings()          → current level's .settings sub-object
  addLevelScore(pts, x, y)   → add points + check objective + particles
  addObjectiveProgress(n)     → increment objective counter + check
  updateLevelProgress()       → update progress bar (call in game loop)
  updateObjectiveDisplay()    → update objective text (call in game loop)
  updateTimeLimit(dt)         → check time limit (call in game loop if timeLimit > 0)
  checkLevelObjective()       → check if level is complete
  completeLevel()             → trigger level complete sequence
  beginLevel()                → start the current level
  startNextLevel()            → advance to next level
  applyLevelSettings(s)       → MUST be implemented per template
  resetLevelState()           → MUST be implemented per template
*/

module.exports = {};
