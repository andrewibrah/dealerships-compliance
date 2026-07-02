import { StorageClient } from '@supabase/storage-js';

const BUCKET = 'documents';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

function getStorageClient() {
  const url = `${process.env.SUPABASE_URL}/storage/v1`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return new StorageClient(url, {
    apikey: key,
    Authorization: `Bearer ${key}`,
  });
}

export async function storagePut(
  fileName: string,
  data: Buffer | Uint8Array,
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
