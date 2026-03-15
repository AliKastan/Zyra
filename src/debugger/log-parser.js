'use strict';

/**
 * @fileoverview Log ingestion module for the self-healing deploy analyzer.
 *
 * Accepts:
 *  - Raw string blobs (build logs, stderr dumps)
 *  - JSON-structured lines (Railway, Winston, Pino)
 *  - Files on disk
 *  - stdin pipe
 *
 * Returns an array of ParsedLogLine objects ready for classification.
 */

const fs   = require('fs');
const path = require('path');

/** @typedef {import('./types').ParsedLogLine} ParsedLogLine */
/** @typedef {import('./types').LogSeverity}   LogSeverity   */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANSI_RE = /\x1B\[[0-9;]*[mGKHF]/g;

/** Severity keyword → normalized severity */
const SEVERITY_MAP = {
  fatal:   'error',
  error:   'error',
  err:     'error',
  warn:    'warn',
  warning: 'warn',
  info:    'info',
  log:     'info',
  notice:  'info',
  debug:   'debug',
  trace:   'debug',
  verbose: 'debug',
};

/** ISO-ish timestamp at start of line */
const TIMESTAMP_RE = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/;

/** Inline level tag: [ERROR], ERROR:, error -, (error) */
const INLINE_LEVEL_RE = /\[(?:error|warn|warning|info|debug|fatal|trace|verbose)\]|^(?:error|warn|warning|info|debug|fatal|trace|verbose)[:\s\-–]/i;

// ---------------------------------------------------------------------------
// Core parsers
// ---------------------------------------------------------------------------

/**
 * Parse raw log text (string) into structured lines.
 * @param {string} raw
 * @param {string} [source]
 * @returns {ParsedLogLine[]}
 */
function parseLogText(raw, source = 'unknown') {
  if (!raw || typeof raw !== 'string') return [];

  const lines  = raw.split(/\r?\n/);
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const cleaned = rawLine.replace(ANSI_RE, '').trim();
    if (!cleaned) continue;

    // Try JSON-structured log first (Railway, Winston, Pino all emit JSON lines)
    const jsonLine = tryParseJsonLine(cleaned, i + 1, source);
    if (jsonLine) {
      result.push(jsonLine);
      continue;
    }

    result.push(parsePlainLine(rawLine, cleaned, i + 1, source));
  }

  return result;
}

/**
 * Parse a log file from disk.
 * @param {string} filePath
 * @param {string} [source]
 * @returns {ParsedLogLine[]}
 */
function parseLogFile(filePath, source) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Log file not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  const src = source || path.basename(filePath, path.extname(filePath));
  return parseLogText(raw, src);
}

/**
 * Read all of stdin and parse it.
 * Resolves immediately with [] if stdin is a TTY (not piped).
 * @returns {Promise<ParsedLogLine[]>}
 */
function parseStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve([]);
      return;
    }
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end',  () => resolve(parseLogText(chunks.join(''), 'stdin')));
    process.stdin.on('error', () => resolve([]));
  });
}

/**
 * Ingest multiple sources and merge into one sorted array.
 * @param {Object} opts
 * @param {string}   [opts.logText]
 * @param {string}   [opts.logFile]
 * @param {boolean}  [opts.stdin]
 * @param {string}   [opts.source]
 * @returns {Promise<ParsedLogLine[]>}
 */
async function ingestLogs({ logText, logFile, stdin, source } = {}) {
  const parts = [];

  if (logText) {
    parts.push(...parseLogText(logText, source || 'input'));
  }

  if (logFile) {
    parts.push(...parseLogFile(logFile, source || 'file'));
  }

  if (stdin) {
    const stdinLines = await parseStdin();
    parts.push(...stdinLines);
  }

  // Stable sort: preserve original order within same timestamp
  parts.sort((a, b) => {
    if (a.timestamp && b.timestamp) return a.timestamp - b.timestamp;
    return a.lineNum - b.lineNum;
  });

  return parts;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to parse a line as JSON structured log.
 * Returns null if the line is not valid JSON.
 * @param {string} text
 * @param {number} lineNum
 * @param {string} source
 * @returns {ParsedLogLine|null}
 */
function tryParseJsonLine(text, lineNum, source) {
  if (text[0] !== '{') return null;
  try {
    const obj = JSON.parse(text);

    // Accept if it has at least a message or msg field
    const msg   = obj.message ?? obj.msg ?? obj.text ?? obj.log ?? '';
    const level = obj.level   ?? obj.severity ?? obj.type ?? 'info';
    const ts    = obj.timestamp ?? obj.time ?? obj.ts ?? null;

    if (!msg && !level) return null; // not a log object

    return {
      lineNum,
      raw:       text,
      text:      String(msg).replace(ANSI_RE, '').trim(),
      severity:  normalizeSeverity(level),
      timestamp: ts ? tryParseDate(ts) : null,
      source,
    };
  } catch (_) {
    return null;
  }
}

/**
 * Parse a plain-text log line.
 * @param {string} rawLine
 * @param {string} cleaned   - ANSI-stripped version
 * @param {number} lineNum
 * @param {string} source
 * @returns {ParsedLogLine}
 */
function parsePlainLine(rawLine, cleaned, lineNum, source) {
  const timestamp = extractTimestamp(cleaned);
  const severity  = detectSeverity(cleaned);
  const text      = stripKnownPrefixes(cleaned);

  return { lineNum, raw: rawLine, text, severity, timestamp, source };
}

/**
 * Detect severity from a plain-text line.
 * @param {string} text
 * @returns {LogSeverity}
 */
function detectSeverity(text) {
  const m = INLINE_LEVEL_RE.exec(text);
  if (m) {
    const kw = m[0].replace(/[[\]:\s\-–]/g, '').toLowerCase();
    return SEVERITY_MAP[kw] ?? 'info';
  }

  const lower = text.toLowerCase();
  if (/\bfatal\b|\bcrash(ed)?\b/.test(lower))            return 'error';
  if (/\berr(or)?\b|\bfailed\b|\bexception\b/.test(lower)) return 'error';
  if (/\bwarn(ing)?\b/.test(lower))                       return 'warn';
  if (/\bdebug\b|\btrace\b|\bverbose\b/.test(lower))      return 'debug';
  return 'info';
}

/** @param {string} text @returns {Date|null} */
function extractTimestamp(text) {
  const m = TIMESTAMP_RE.exec(text);
  return m ? tryParseDate(m[0]) : null;
}

/** @param {string|number} v @returns {Date|null} */
function tryParseDate(v) {
  try {
    // Unix seconds vs millis heuristic
    if (typeof v === 'number') {
      return v > 1e12 ? new Date(v) : new Date(v * 1000);
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch (_) { return null; }
}

/** @param {string} level @returns {LogSeverity} */
function normalizeSeverity(level) {
  return SEVERITY_MAP[String(level).toLowerCase()] ?? 'info';
}

/** Strip timestamp and level tag prefixes from a plain-text line. */
function stripKnownPrefixes(text) {
  return text
    .replace(TIMESTAMP_RE, '')                       // timestamp
    .replace(INLINE_LEVEL_RE, '')                    // level tag
    .replace(/^\s*\[?\d+\]?\s*/, '')                 // PID/index brackets
    .replace(/^[-–>|]+\s*/, '')                      // pipe/arrow separators
    .trim();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { parseLogText, parseLogFile, parseStdin, ingestLogs };
