const path = require('path');
const fse = require('fs-extra');
const { now } = require('../utils/timestamps');
const { ACTIVE_STATES, TERMINAL_STATES, isTerminal } = require('../config/jobStates');
const logger = require('../utils/logger');

const JOBS_DIR = path.resolve(__dirname, '../../storage/jobs');

async function ensureJobsDir() {
  await fse.ensureDir(JOBS_DIR);
}

// ── Core CRUD ─────────────────────────────────────────────────────────────────

async function createJob(jobId, data) {
  await ensureJobsDir();
  const job = {
    id: jobId,
    status: 'queued',
    createdAt: now(),
    updatedAt: now(),
    logs: [],
    stages: {},
    cancelled: false,
    ...data,
  };
  await fse.writeJson(path.join(JOBS_DIR, `${jobId}.json`), job, { spaces: 2 });
  logger.info(`jobStore: created job ${jobId}`);
  return job;
}

async function getJob(jobId) {
  await ensureJobsDir();
  const filePath = path.join(JOBS_DIR, `${jobId}.json`);
  if (!(await fse.pathExists(filePath))) return null;
  try {
    return await fse.readJson(filePath);
  } catch (parseErr) {
    // File may be mid-write from a concurrent updateJob/appendJobLog call.
    // Wait briefly and retry once — enough time for the other write to finish.
    await new Promise(r => setTimeout(r, 120));
    try {
      return await fse.readJson(filePath);
    } catch (_) {
      logger.warn(`jobStore: could not parse job file for ${jobId} after retry — treating as not found`);
      return null;
    }
  }
}

/**
 * Updates a job. Refuses to overwrite terminal state unless forced.
 * This is the race-condition guard: a cancelled job can never become completed.
 */
async function updateJob(jobId, updates, { force = false } = {}) {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  // Guard: do not overwrite a terminal state with a non-terminal one
  if (!force && isTerminal(job.status)) {
    const incomingStatus = updates.status;
    if (incomingStatus && !isTerminal(incomingStatus)) {
      logger.warn(`jobStore: refused to overwrite terminal status "${job.status}" with "${incomingStatus}" for job ${jobId}`);
      return job; // silently return current job unchanged
    }
  }

  const updated = { ...job, ...updates, updatedAt: now() };
  await fse.writeJson(path.join(JOBS_DIR, `${jobId}.json`), updated, { spaces: 2 });
  return updated;
}

async function appendJobLog(jobId, message) {
  const job = await getJob(jobId);
  if (!job) return;
  const logs = job.logs || [];
  logs.push({ time: now(), message });
  // Cap at 60 lines — avoid bloated job files
  const ts = now();
  const updated = { ...job, logs: logs.slice(-60), updatedAt: ts, lastHeartbeatAt: ts };
  await fse.writeJson(path.join(JOBS_DIR, `${jobId}.json`), updated, { spaces: 2 });
}

// ── Stage tracking ────────────────────────────────────────────────────────────

/**
 * Transitions a job to a new stage. The status IS the stage name during active processing.
 */
async function setJobStage(jobId, stage) {
  const job = await getJob(jobId);
  if (!job || isTerminal(job.status)) return;
  const ts = now();
  const stages = { ...job.stages, [stage]: { startedAt: ts } };
  const updated = { ...job, status: stage, stages, updatedAt: ts, lastHeartbeatAt: ts };
  await fse.writeJson(path.join(JOBS_DIR, `${jobId}.json`), updated, { spaces: 2 });
  logger.info(`jobStore: job ${jobId} → state changed: ${stage}`);
}

async function completeJobStage(jobId, stage) {
  const job = await getJob(jobId);
  if (!job) return;
  const stages = {
    ...job.stages,
    [stage]: { ...job.stages[stage], completedAt: now() },
  };
  const updated = { ...job, stages, updatedAt: now() };
  await fse.writeJson(path.join(JOBS_DIR, `${jobId}.json`), updated, { spaces: 2 });
}

// ── Terminal transitions ───────────────────────────────────────────────────────

/**
 * Cancels a job. Immediate — sets status and the `cancelled` flag atomically.
 * No-ops if the job is already terminal.
 */
async function cancelJob(jobId) {
  const job = await getJob(jobId);
  if (!job) return null;

  if (isTerminal(job.status)) {
    logger.info(`jobStore: cancel no-op for job ${jobId} (already ${job.status})`);
    return job;
  }

  const updated = {
    ...job,
    status: 'cancelled',
    cancelled: true,
    cancelledAt: now(),
    updatedAt: now(),
  };
  await fse.writeJson(path.join(JOBS_DIR, `${jobId}.json`), updated, { spaces: 2 });
  logger.info(`jobStore: job ${jobId} → cancelled`);
  return updated;
}

/**
 * Marks a job as timed_out. No-ops if already terminal.
 */
async function markJobTimedOut(jobId, reason = 'Generation exceeded maximum duration (15 minutes)') {
  const job = await getJob(jobId);
  if (!job) return null;
  if (isTerminal(job.status)) return job;

  const updated = {
    ...job,
    status: 'timed_out',
    error: reason,
    timedOutAt: now(),
    updatedAt: now(),
  };
  await fse.writeJson(path.join(JOBS_DIR, `${jobId}.json`), updated, { spaces: 2 });
  logger.warn(`jobStore: job ${jobId} → timed_out — ${reason}`);
  return updated;
}

/**
 * Returns true if the job has been cancelled or timed out.
 * Used by the pipeline as a checkpoint before each stage.
 */
async function isJobAborted(jobId) {
  const job = await getJob(jobId);
  return job?.cancelled === true || job?.status === 'cancelled' || job?.status === 'timed_out';
}

// backward compat alias
async function isJobCancelled(jobId) {
  return isJobAborted(jobId);
}

// ── List ──────────────────────────────────────────────────────────────────────

async function listJobs() {
  await ensureJobsDir();
  const files = await fse.readdir(JOBS_DIR);
  const jobs = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      jobs.push(await fse.readJson(path.join(JOBS_DIR, file)));
    } catch (_) {}
  }
  return jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ── Stale job recovery ────────────────────────────────────────────────────────

/**
 * Called ONCE at server startup. Marks orphaned jobs from previous server sessions
 * as timed_out. Only affects jobs that:
 *   1. Are in an active state
 *   2. Were created BEFORE this server process started (createdAt < serverStartTime)
 *   3. Are at least MIN_STALE_AGE_MS old (safety buffer against clock skew / fast restarts)
 *
 * Jobs created after serverStartTime belong to this process and are never touched.
 *
 * @param {string} serverStartTime - ISO timestamp captured synchronously at process start
 */
async function recoverStaleJobs(serverStartTime) {
  // A job must be at least this old to be considered stale.
  // Prevents marking jobs as stale if the server restarted within seconds of their creation.
  const MIN_STALE_AGE_MS = 60 * 1000; // 60 seconds

  const serverStartMs = new Date(serverStartTime).getTime();
  const nowMs = Date.now();
  let recovered = 0;
  let skipped = 0;

  logger.info(`jobStore: stale recovery starting — serverStartTime=${serverStartTime}`);

  try {
    const jobs = await listJobs();
    for (const job of jobs) {
      // Only consider jobs in active states
      if (!ACTIVE_STATES.has(job.status)) continue;

      const createdAtMs = job.createdAt ? new Date(job.createdAt).getTime() : 0;
      const ageMs = nowMs - createdAtMs;

      // Guard 1: never touch jobs created in this server process
      if (createdAtMs >= serverStartMs) {
        logger.info(
          `jobStore: stale recovery SKIPPED job ${job.id}` +
          ` — created after server start (createdAt=${job.createdAt}, serverStart=${serverStartTime})`
        );
        skipped++;
        continue;
      }

      // Guard 2: never mark a job stale if it is very recently created
      // (protects against fast restart scenarios where a live job looks "pre-startup")
      if (ageMs < MIN_STALE_AGE_MS) {
        logger.info(
          `jobStore: stale recovery SKIPPED job ${job.id}` +
          ` — too young to be stale (age=${Math.round(ageMs / 1000)}s < ${MIN_STALE_AGE_MS / 1000}s min)` +
          ` createdAt=${job.createdAt}`
        );
        skipped++;
        continue;
      }

      // Job was created before this process AND is old enough — it is orphaned.
      logger.warn(
        `jobStore: stale job detected — id=${job.id}` +
        ` status="${job.status}"` +
        ` createdAt=${job.createdAt || 'missing'}` +
        ` startedAt=${job.startedAt || 'missing'}` +
        ` updatedAt=${job.updatedAt || 'missing'}` +
        ` lastHeartbeatAt=${job.lastHeartbeatAt || 'missing'}` +
        ` ageSeconds=${Math.round(ageMs / 1000)}` +
        ` serverStartTime=${serverStartTime}` +
        ` reason=created-before-this-process`
      );

      const ts = now();
      const updated = {
        ...job,
        status: 'timed_out',
        error: 'Recovered stale job from previous server session',
        timedOutAt: ts,
        updatedAt: ts,
      };
      await fse.writeJson(path.join(JOBS_DIR, `${job.id}.json`), updated, { spaces: 2 });
      logger.warn(`jobStore: recovered stale job ${job.id} (was "${job.status}", age=${Math.round(ageMs / 1000)}s)`);
      recovered++;
    }
  } catch (err) {
    logger.error('jobStore: stale recovery failed', { error: err.message });
  }

  if (recovered > 0 || skipped > 0) {
    logger.info(`jobStore: stale recovery — ${recovered} recovered, ${skipped} skipped (created after server start)`);
  }
  return recovered;
}

module.exports = {
  createJob, getJob, updateJob, appendJobLog,
  setJobStage, completeJobStage,
  cancelJob, markJobTimedOut, isJobAborted, isJobCancelled,
  listJobs, recoverStaleJobs,
};
