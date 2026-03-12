function now() {
  return new Date().toISOString();
}

function elapsed(startIso) {
  const ms = Date.now() - new Date(startIso).getTime();
  return `${(ms / 1000).toFixed(2)}s`;
}

module.exports = { now, elapsed };
