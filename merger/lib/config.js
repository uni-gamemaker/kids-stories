const mb = (v, d) => Math.round(Number(process.env[v] || d) * 1024 * 1024);
module.exports = {
  MAX_SOURCES: Number(process.env.MAX_SOURCES || 10),
  MIN_SOURCES: 2,
  MAX_FILE_BYTES: mb("MAX_FILE_MB", 100),
  MAX_TOTAL_BYTES: mb("MAX_TOTAL_MB", 200),   // /tmp on Vercel is 512 MB: sources + output must fit
  MAX_OUTPUT_BYTES: mb("MAX_OUTPUT_MB", 150),
  MAX_TOTAL_SECONDS: Number(process.env.MAX_TOTAL_SECONDS || 600),
  UPLOAD_CHUNK_BYTES: 4 * 1024 * 1024,        // stays under Vercel's 4.5 MB request body limit
  ROW_BYTES: 2 * 1024 * 1024,                 // size of one stored blob row
  TTL_HOURS: 24,
  STALE_PROCESSING_MS: 10 * 60 * 1000,
};
