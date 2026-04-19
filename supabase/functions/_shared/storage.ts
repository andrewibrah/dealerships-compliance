import { StorageClient } from 'npm:@supabase/storage-js';
import { ENV } from './env.ts';

const BUCKET = 'documents';

function getStorageClient() {
  const url = `${ENV.supabaseUrl}/storage/v1`;
  return new StorageClient(url, {
    apikey: ENV.supabaseServiceRoleKey,
    Authorization: `Bearer ${ENV.supabaseServiceRoleKey}`,
  });
}

export async function storagePut(
  fileName: string,
  data: Uint8Array,
  contentType = 'application/octet-stream'
): Promise<{ key: string; url: string }> {
  const storage = getStorageClient();
  const { error } = await storage.from(BUCKET).upload(fileName, data, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data: publicUrl } = storage.from(BUCKET).getPublicUrl(fileName);
  return { key: fileName, url: publicUrl.publicUrl };
}

export async function storageGet(key: string): Promise<{ key: string; url: string }> {
  const storage = getStorageClient();
  const { data } = storage.from(BUCKET).getPublicUrl(key);
  return { key, url: data.publicUrl };
}
