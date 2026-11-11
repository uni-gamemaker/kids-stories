const { send, handler } = require("../lib/http");
const C = require("../lib/config");
module.exports = handler(async (req, res) => send(res, 200, {
  maxSources: C.MAX_SOURCES, minSources: C.MIN_SOURCES, maxFileMB: Math.round(C.MAX_FILE_BYTES / 1048576),
  maxTotalMB: Math.round(C.MAX_TOTAL_BYTES / 1048576), maxTotalSeconds: C.MAX_TOTAL_SECONDS, uploadChunkBytes: C.UPLOAD_CHUNK_BYTES, ttlHours: C.TTL_HOURS,
}));
