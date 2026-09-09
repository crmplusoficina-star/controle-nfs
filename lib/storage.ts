/**
 * Uploads a file to Cloudflare R2 via API route
 * @param file The file object to upload
 * @param module Optional module path (e.g., 'ferramentas', 'usuarios')
 * @returns The public URL of the uploaded file
 */

const TOOL_IMAGE_MAX_BYTES = 3_000_000;
const TOOL_IMAGE_MAX_DIMENSION = 1600;

async function compressToolImage(file: File): Promise<File> {
  if (
    typeof window === 'undefined' ||
    !file.type.startsWith('image/') ||
    file.size <= TOOL_IMAGE_MAX_BYTES
  ) {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Não foi possível preparar a foto para envio.'));
      img.src = objectUrl;
    });

    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, TOOL_IMAGE_MAX_DIMENSION / largestSide);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return file;

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.82);
    });

    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto';
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function readUploadResponse(response: Response): Promise<any> {
  const raw = await response.text();

  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    if (response.status === 413 || /request entity too large|payload too large/i.test(raw)) {
      throw new Error('A foto é muito grande para envio. Tente novamente; o app agora reduz fotos grandes automaticamente.');
    }

    throw new Error(
      response.ok
        ? 'O servidor respondeu em formato inválido durante o upload.'
        : raw.slice(0, 180) || `Falha no upload (${response.status}).`
    );
  }
}

export async function uploadFile(file: File, module = 'geral'): Promise<string | null> {
  try {
    const fileToUpload = module === 'ferramentas' ? await compressToolImage(file) : file;

    const response = await fetch(
      `/api/upload?filename=${encodeURIComponent(fileToUpload.name)}&module=${encodeURIComponent(module)}`,
      {
        method: 'POST',
        body: fileToUpload,
        headers: {
          'content-type': fileToUpload.type || 'application/octet-stream',
        },
      }
    );

    const data = await readUploadResponse(response);

    if (!response.ok) {
      console.error('Upload failed:', data);
      throw new Error(data?.details || data?.error || `Falha no upload (${response.status}).`);
    }

    if (!data?.url) {
      throw new Error('Upload concluído sem URL de retorno.');
    }

    return data.url;
  } catch (error: any) {
    console.error('Storage error:', error);
    throw error;
  }
}

/**
 * Deletes a file from Cloudflare R2 via API route
 * @param url The public URL or key of the file
 */
export async function deleteFile(url: string) {
  if (!url) return true; // Nothing to delete
  try {
    // Extract key from URL if it's a full URL
    let key = url;
    if (typeof url === 'string' && url.includes('//')) {
      const urlParts = url.split('/');
      // Assuming URL format is https://public-url/module/filename_timestamp_random.ext
      // Key is everything after the hostname
      key = urlParts.slice(3).join('/');
    }

    const response = await fetch(`/api/delete?key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      console.error('Deletion failed');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Delete error:', error);
    return false;
  }
}

/**
 * Uploads a base64 string to Cloudflare R2 via API route
 * @param base64 The base64 string
 * @param filename The filename to use
 * @param module Optional module path
 * @returns The public URL
 */
export async function uploadBase64(base64: string, filename: string, module = 'geral'): Promise<string | null> {
  try {
    const res = await fetch(base64);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type });
    return uploadFile(file, module);
  } catch (error) {
    console.error('Base64 upload error:', error);
    return null;
  }
}

/**
 * Lists files (Optional, can be implemented if needed via another API route)
 */
export async function listFiles() {
  console.warn('Listing files not implemented via client');
  return [];
}
