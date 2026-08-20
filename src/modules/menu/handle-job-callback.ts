import { createAdminClient } from '../../lib/supabase/server';
import { validateExtractedMenu } from '../../domain/extracted-menu';

type Callback = {
  jobId: string;
  jobType: string;
  status: 'SUCCEEDED' | 'FAILED';
  result?: { structured?: unknown };
  error?: string | null;
};

export async function handleMenuJobCallback(input: Callback) {
  if (!['MENU_EXTRACT', 'MENU_REPROCESS'].includes(input.jobType)) return { ignored: true };
  const db = createAdminClient();
  const { data: batch, error } = await db.schema('menus').from('source_batches')
    .select('id,menu_id,status,published_version_id')
    .eq('runner_job_id', input.jobId).maybeSingle();
  if (error) throw error;
  if (!batch) return { ignored: true };
  if (batch.published_version_id) return { idempotent: true, versionId: batch.published_version_id };

  if (input.status === 'FAILED') {
    const { error: failureError } = await db.schema('menus').from('source_batches').update({
      status: 'FAILED',
      error_message: String(input.error ?? 'RUNNER_JOB_FAILED').slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq('id', batch.id);
    if (failureError) throw failureError;
    return { failed: true };
  }

  const extracted = validateExtractedMenu(input.result?.structured);
  const { data: versionId, error: acceptError } = await db.schema('menus').rpc('accept_menu_extraction', {
    p_source_batch_id: batch.id,
    p_extraction: extracted,
    p_job_id: input.jobId,
  });
  if (acceptError) throw acceptError;
  return { published: true, versionId };
}
