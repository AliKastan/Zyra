/**
 * Zyra job state machine.
 *
 * Active states  — job is still running.
 * Terminal states — job has finished; these are permanent and must never be overwritten.
 *
 * Status also serves as the stage name during active processing
 * (e.g. status "planning" means the planning stage is currently running).
 */

const ACTIVE_STATES = new Set([
  'queued',
  'planning',
  'coding',
  'reviewing',
  'finalizing',
]);

const TERMINAL_STATES = new Set([
  'completed',
  'failed',
  'cancelled',
  'timed_out',
]);

// Human-readable labels for the UI
const STATUS_LABELS = {
  queued:     'Queued',
  planning:   'Running',
  coding:     'Running',
  reviewing:  'Running',
  finalizing: 'Running',
  completed:  'Completed',
  complete:   'Completed',   // backward compat with old job records
  failed:     'Failed',
  cancelled:  'Cancelled',
  timed_out:  'Timed Out',
};

function isActive(status)   { return ACTIVE_STATES.has(status); }
function isTerminal(status) { return TERMINAL_STATES.has(status) || status === 'complete'; }

module.exports = {
  ACTIVE_STATES,
  TERMINAL_STATES,
  STATUS_LABELS,
  isActive,
  isTerminal,
};
