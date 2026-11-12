import { serveMcp } from "@/lib/mcp/handler";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 300;
const handle = (req: Request) => serveMcp(req);
export const GET = handle; export const POST = handle; export const DELETE = handle;
