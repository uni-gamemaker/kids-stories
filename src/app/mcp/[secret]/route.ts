import { serveMcp } from "@/lib/mcp/handler";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 300;
type Ctx = { params: { secret: string } };
const handle = (req: Request, { params }: Ctx) => serveMcp(req, params.secret);
export const GET = handle; export const POST = handle; export const DELETE = handle;
