const { listJobs, getJob, cancelJob } = require('../storage/jobStore');
const { isTerminal, STATUS_LABELS } = require('../config/jobStates');
const logger = require('../utils/logger');
let forceReleaseJob;
try { ({ forceReleaseJob } = require('../services/generationService')); } catch (_) {}

async function handleListJobs(req, res) {
  try {
    const jobs = await listJobs();
    return res.json({ jobs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function handleGetJob(req, res) {
  const { id } = req.params;
  try {
    const job = await getJob(id);
    if (!job) return res.status(404).json({ error: `Job "${id}" not found` });
    return res.json({ job });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/jobs/:id/cancel
 * Immediately marks the job cancelled in storage.
 * The running pipeline will notice this at its next checkpoint and abort.
 */
async function handleCancelJob(req, res) {
  const { id } = req.params;
  try {
    const job = await getJob(id);
    if (!job) {
      return res.status(404).json({ error: `Job "${id}" not found` });
    }

    if (isTerminal(job.status)) {
      return res.status(409).json({
        error: `Job is already ${STATUS_LABELS[job.status] || job.status} and cannot be cancelled`,
        status: job.status,
      });
    }

    const updated = await cancelJob(id);
    // Immediately free the in-memory active slot so the next generation
    // doesn't hit JOB_IN_PROGRESS while waiting for the pipeline to notice.
    if (forceReleaseJob) forceReleaseJob(id);
    logger.info(`jobsController: cancellation requested for job ${id}`);

    return res.json({
      message: 'Cancellation requested. The job will stop at its next checkpoint.',
      status: updated.status,
      jobId: id,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { handleListJobs, handleGetJob, handleCancelJob };
