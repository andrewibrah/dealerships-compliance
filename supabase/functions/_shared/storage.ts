import { StorageClient } from 'npm:@supabase/storage-js';
import { ENV } from './env.ts';

const BUCKET = 'documents';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

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
  const url = await storageGetSignedUrl(fileName);
  return { key: fileName, url };
}

export async function storageGetSignedUrl(key: string): Promise<string> {
  // Legacy rows stored a full public URL instead of a storage key
  if (key.startsWith('http')) return key;
  const storage = getStorageClient();
  const { data, error } = await storage.from(BUCKET).createSignedUrl(key, SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw new Error(`Failed to sign download URL: ${error?.message ?? 'unknown'}`);
  return data.signedUrl;
}
