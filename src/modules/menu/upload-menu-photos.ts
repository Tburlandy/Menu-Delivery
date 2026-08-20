'use server';
import { randomUUID } from 'node:crypto';
import { requireMenuResourceAccess } from '../../lib/core/require-menu-access';
import { createAdminClient } from '../../lib/supabase/server';
import { enqueueCoreJob } from '../../lib/core/jobs';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGES = 20;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
function extension(type:string){return type==='image/png'?'png':type==='image/webp'?'webp':type==='image/heic'?'heic':type==='image/heif'?'heif':'jpg'}

export async function uploadMenuPhotos(menuId:string,files:File[]){
  const {user,db,menu}=await requireMenuResourceAccess(menuId,'menu:edit');
  if(!files.length||files.length>MAX_IMAGES)throw new Error('MENU_PHOTOS_REQUIRED');
  const batchId=randomUUID();
  const{error:batchError}=await db.schema('menus').from('source_batches').insert({id:batchId,menu_id:menu.id,status:'UPLOADING',created_by:user.id});if(batchError)throw batchError;
  const admin=createAdminClient();const remoteInputs:Array<{url:string;fileName:string}>=[];
  try{
    for(let index=0;index<files.length;index+=1){const file=files[index]!;if(!ALLOWED.has(file.type)||file.size<=0||file.size>MAX_IMAGE_BYTES)throw new Error('UNSUPPORTED_MENU_IMAGE');const imageId=randomUUID(),ext=extension(file.type),path=`${menu.id}/${batchId}/${String(index+1).padStart(2,'0')}-${imageId}.${ext}`;const bytes=new Uint8Array(await file.arrayBuffer());const{error:uploadError}=await admin.storage.from('menu-source-images').upload(path,bytes,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;const{error:imageError}=await db.schema('menus').from('source_images').insert({id:imageId,source_batch_id:batchId,storage_path:path,mime_type:file.type,size_bytes:file.size,position:index});if(imageError)throw imageError;const{data:signed,error:signedError}=await admin.storage.from('menu-source-images').createSignedUrl(path,6*60*60);if(signedError||!signed?.signedUrl)throw signedError??new Error('SIGNED_URL_FAILED');remoteInputs.push({url:signed.signedUrl,fileName:`menu-page-${index+1}.${ext}`})}
    const prompt='Leia todas as imagens em .inputs/remote e extraia somente o que estiver visível. Grave gmn-result.json com exatamente {"categories":[{"name":"...","items":[{"title":"...","description":"...","priceCents":2500,"confidence":0.95}]}]}. priceCents é inteiro em centavos de BRL. Omita priceCents se estiver ilegível. Não invente preços, itens ou descrições.';
    const job=await enqueueCoreJob({type:'MENU_EXTRACT',organizationId:menu.organization_id,unitId:menu.unit_id,prospectId:menu.prospect_id,idempotencyKey:`menu-extract:${batchId}`,executor:'auto',payload:{menuId:menu.id,sourceBatchId:batchId,prompt,remoteInputs}});
    const{error:updateError}=await db.schema('menus').from('source_batches').update({status:'PROCESSING',runner_job_id:(job as any).id,updated_at:new Date().toISOString()}).eq('id',batchId);if(updateError)throw updateError;return{batchId,jobId:(job as any).id}
  }catch(error){await db.schema('menus').from('source_batches').update({status:'FAILED',error_message:error instanceof Error?error.message.slice(0,1000):'MENU_UPLOAD_FAILED',updated_at:new Date().toISOString()}).eq('id',batchId);throw error}
}

export async function uploadMenuPhotosFromForm(menuId:string,formData:FormData){
  const files=formData.getAll('files').filter((value):value is File=>value instanceof File&&value.size>0);
  return uploadMenuPhotos(menuId,files);
}

export async function uploadMenuPhotosAction(menuId:string,formData:FormData){
  return uploadMenuPhotosFromForm(menuId,formData);
}
