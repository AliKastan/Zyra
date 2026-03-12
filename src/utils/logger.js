const LEVELS = { info: 'INFO', warn: 'WARN', error: 'ERROR', success: 'SUCCESS', debug: 'DEBUG' };

function format(level, message, meta) {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts}] [${level}] ${message}${metaStr}`;
}

const logger = {
  info(message, meta) {
    console.log(format(LEVELS.info, message, meta));
  },
  warn(message, meta) {
    console.warn(format(LEVELS.warn, message, meta));
  },
  error(message, meta) {
    console.error(format(LEVELS.error, message, meta));
  },
  success(message, meta) {
    console.log(format(LEVELS.success, message, meta));
  },
  debug(message, meta) {
    if (process.env.DEBUG) {
      console.log(format(LEVELS.debug, message, meta));
    }
  },
};

module.exports = logger;
