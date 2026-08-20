import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/proxy';

function normalizeHost(value: string | undefined) { return (value ?? '').trim().toLowerCase().replace(/:\d+$/, ''); }

export async function proxy(request: NextRequest) {
  const { response, authenticated } = await updateSession(request);
  const pathname = request.nextUrl.pathname;
  const host = normalizeHost(request.nextUrl.hostname);
  const cardapioHost = normalizeHost(process.env.GMN_CARDAPIO_HOST);
  const deliveryHost = normalizeHost(process.env.GMN_DELIVERY_HOST);
  const publicHost = (cardapioHost && host === cardapioHost) || (deliveryHost && host === deliveryHost);
  const publicPath = Boolean(publicHost) || pathname.startsWith('/cardapio/') || pathname.startsWith('/delivery/') || pathname.startsWith('/api/public/') || pathname.startsWith('/api/internal/');
  if (!authenticated && !publicPath) {
    const portal = process.env.GMN_PORTAL_URL;
    return NextResponse.redirect(new URL(portal ? `/login?next=${encodeURIComponent(request.url)}` : '/login', portal ?? request.url));
  }
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] };
