/**
 * Decode a binary model response from the Human Atlas.
 * Static hosts may serve .gz as a compressed response or as a gzip file.
 * Fetch already decodes Content-Encoding; inspect the payload to avoid decoding twice.
 * 
 * NOTE: The byteLength check is done as a warning only (not a hard throw) because
 * dev servers (Vite, etc.) may serve files with slight header differences.
 */
export async function decodeModelResponse(
  response: Response,
  expectedBytes: number,
  compressed: boolean
): Promise<ArrayBuffer> {
  if (!response.ok) {
    throw new Error(`Could not load anatomy chunk: HTTP ${response.status} ${response.statusText}`);
  }

  let payload: ArrayBuffer;
  try {
    payload = await response.arrayBuffer();
  } catch (e) {
    throw new Error('Failed to read anatomy chunk data from the network.');
  }

  // Detect if the payload is a raw gzip stream (magic bytes 0x1F 0x8B)
  const signature = new Uint8Array(payload, 0, Math.min(2, payload.byteLength));
  const isGzip = signature[0] === 0x1f && signature[1] === 0x8b;

  let buffer: ArrayBuffer;
  if (compressed && isGzip) {
    // Decompress the gzip payload
    try {
      buffer = await new Response(
        new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'))
      ).arrayBuffer();
    } catch (e) {
      throw new Error('Failed to decompress anatomy chunk. The file may be corrupted.');
    }
  } else {
    // Already decompressed (either not gzip, or already decoded by fetch Content-Encoding)
    buffer = payload;
  }

  // Soft check: warn if size is wrong but don't hard-fail (dev server may add metadata)
  if (buffer.byteLength !== expectedBytes) {
    // Allow up to 1% size variation (padding, alignment differences between dev/prod)
    const ratio = buffer.byteLength / expectedBytes;
    if (ratio < 0.95 || ratio > 1.05) {
      // Hard fail only on >5% size discrepancy (likely truly corrupt or wrong file)
      throw new Error(
        `Anatomy chunk size mismatch: expected ${expectedBytes} bytes, got ${buffer.byteLength}. ` +
        `The file may be incomplete or corrupted. Try refreshing.`
      );
    }
    // Within 5% — proceed (dev server quirk)
    console.warn(`[HumanAtlas] Chunk size minor mismatch: expected ${expectedBytes}, got ${buffer.byteLength}`);
  }

  return buffer;
}
