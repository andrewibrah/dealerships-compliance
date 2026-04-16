import { put } from "@vercel/blob";

export async function storagePut(
  fileName: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const body = typeof data === "string" ? data : Buffer.from(data);
  const blob = await put(fileName, body, {
    access: "public",
    contentType,
  });
  return { key: fileName, url: blob.url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  return { key: relKey, url: relKey };
}
