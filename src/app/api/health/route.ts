const required=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','GMN_CORE_INTERNAL_URL','GMN_MENU_INTERNAL_SECRET','GMN_PUBLIC_ABUSE_SECRET'] as const;
export const dynamic='force-dynamic';
export async function GET(){const missing=required.filter((name)=>!process.env[name]);const status=missing.length?503:200;return Response.json({service:'gmn-menu',status:missing.length?'degraded':'ok',config:missing.length?'missing':'ok'},{status,headers:{'cache-control':'no-store'}})}
