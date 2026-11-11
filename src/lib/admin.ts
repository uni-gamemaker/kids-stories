// Optional admin protection for the dashboard API: set ADMIN_TOKEN in production.
export function requireAdmin(req: Request): Response | null {
  const t = process.env.ADMIN_TOKEN;
  if (!t) return null;
  if (req.headers.get("x-admin-token") === t) return null;
  return Response.json({ error: "Unauthorized: missing or wrong admin token." }, { status: 401 });
}
