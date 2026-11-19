// The only server-side touchpoint with Vercel Blob, so media storage can move
// (e.g. to R2) without changing callers. Reads BLOB_READ_WRITE_TOKEN from env.
import { BlobNotFoundError, del, head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export async function headBlob(url: string): Promise<{ size: number; contentType: string; pathname: string } | null> {
  try {
    const b = await head(url);
    return { size: b.size, contentType: b.contentType, pathname: b.pathname };
  } catch (e) {
    if (e instanceof BlobNotFoundError) return null;
    throw e;
  }
}

// Deleting a blob that's already gone counts as success.
export async function deleteBlob(url: string): Promise<void> {
  try {
    await del(url);
  } catch (e) {
    if (!(e instanceof BlobNotFoundError)) throw e;
  }
}

// Issues a client upload token after `authorize` approves the request.
// No upload-completed callback: Blob can't reach localhost, so the client
// records the upload itself (recordSeasonMedia) once it finishes.
export async function handleMediaUpload(
  request: Request,
  body: unknown,
  authorize: (pathname: string, clientPayload: string | null) => Promise<{ allowedContentTypes: string[]; maximumSizeInBytes: number }>,
): Promise<unknown> {
  return handleUpload({
    request,
    body: body as HandleUploadBody,
    onBeforeGenerateToken: async (pathname, clientPayload) => ({ ...(await authorize(pathname, clientPayload)), addRandomSuffix: true }),
  });
}
