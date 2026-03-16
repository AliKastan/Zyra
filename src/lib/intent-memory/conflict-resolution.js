'use strict';

/**
 * Conflict Resolution
 *
 * Handles cases where a new prompt conflicts with existing intent.
 * Returns a modified IntentUpdate with conflicts resolved before merging.
 *
 * Current conflict rules:
 *
 * 1. Platform conflict: "make it mobile only" → replace platforms with ['mobile'],
 *    keep all other features (do not erase web-specific features from memory).
 *
 * 2. Design conflict: new designIntent always wins (latest style instruction is authoritative).
 *
 * 3. App goal conflict: only NEW_PROJECT changeType replaces the app goal.
 *    A mid-session prompt like "actually it's a marketplace" updates appGoal.
 *
 * 4. Billing on/off conflict: billingRequired can be set false only by
 *    explicit removal ("remove payments", "remove billing").
 *
 * 5. Integration conflict: adding Resend after SendGrid keeps both (union).
 *    Switching requires explicit "use X instead of Y" phrasing (not yet implemented,
 *    defaults to union — avoids accidental removal).
 */

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve conflicts between an incoming IntentUpdate and the existing memory.
 * Returns a (possibly modified) copy of the update with conflicts handled.
 *
 * @param {import('./types').IntentUpdate}      update
 * @param {import('./types').UserIntentMemory}  memory
 * @returns {{ update: import('./types').IntentUpdate, conflicts: string[] }}
 */
function resolveConflicts(update, memory) {
  const resolved = { ...update };
  const conflicts = [];

  // ── 1. Platform replacement conflict ─────────────────────────────────────
  if (update.changeType === 'CHANGE_PLATFORM' && update.platforms?.length > 0) {
    const oldPlatforms = memory.platforms.join('+');
    const newPlatforms = update.platforms.join('+');
    if (oldPlatforms !== newPlatforms) {
      conflicts.push(
        `Platform changed from [${memory.platforms.join(', ')}] to [${update.platforms.join(', ')}]. ` +
        `Existing features are preserved.`,
      );
    }
    // The platforms array in update will replace existing — already handled by CHANGE_PLATFORM logic in merge
  }

  // ── 2. Design tone conflict ───────────────────────────────────────────────
  if (update.designIntent && memory.designIntent && update.designIntent !== memory.designIntent) {
    conflicts.push(
      `Design tone changed from "${memory.designIntent}" to "${update.designIntent}".`,
    );
    // No action needed — new designIntent simply wins (handled in mergeIntent)
  }

  // ── 3. App goal mid-session update ───────────────────────────────────────
  if (update.changeType !== 'NEW_PROJECT' && update.appGoal && memory.appGoal) {
    // Promote to NEW_PROJECT if user is clearly pivoting
    const pivot = /actually|instead|no,|wait,|change the app|pivoting|different app/i.test(update.appGoal);
    if (pivot) {
      resolved.changeType = 'NEW_PROJECT';
      conflicts.push(`App goal updated: "${memory.appGoal}" → "${update.appGoal}"`);
    } else {
      // Keep existing appGoal, ignore new one (mid-session clarifications don't change the goal)
      resolved.appGoal = undefined;
    }
  }

  // ── 4. Accidental feature loss prevention ────────────────────────────────
  // If this is a style-only change, do not include removeFeatures accidentally
  if (update.changeType === 'CHANGE_STYLE') {
    if (resolved.removeFeatures && resolved.removeFeatures.length > 0) {
      conflicts.push(
        `Style change detected, but removal signals were also found. ` +
        `Preserving existing features to avoid accidental loss.`,
      );
      resolved.removeFeatures = [];
    }
    // Also preserve boolean flags on style changes
    resolved.authRequired    = undefined;
    resolved.billingRequired = undefined;
    resolved.adminRequired   = undefined;
  }

  // ── 5. Integration "instead of" detection (conservative) ─────────────────
  // Future: detect "use Resend instead of SendGrid" and remove SendGrid.
  // For now: union (safe default).

  return { update: resolved, conflicts };
}

module.exports = { resolveConflicts };
