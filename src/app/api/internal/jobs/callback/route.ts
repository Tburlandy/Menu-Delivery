import { timingSafeEqual } from 'node:crypto';
import { handleMenuJobCallback } from '../../../../../modules/menu/handle-job-callback';
function authorized(request: Request) {
  const provided = Buffer.from(request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '');
  const expected = Buffer.from(process.env.GMN_INTERNAL_CALLBACK_SECRET ?? '');
  return provided.length === expected.length && provided.length > 7 && timingSafeEqual(provided, expected);
}
export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: 'invalid json' }, { status: 400 });
  return Response.json(await handleMenuJobCallback(body));
}
