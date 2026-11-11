const { send, handler } = require("../lib/http");
const { ensureSchema } = require("../lib/db");
const { cleanupExpired } = require("../lib/storage");
module.exports = handler(async (req, res) => {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return send(res, 401, { error: "Unauthorized." });
  await ensureSchema();
  send(res, 200, { deleted: await cleanupExpired() });
});
