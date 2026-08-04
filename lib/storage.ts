/**
 * Uploads a file to Cloudflare R2 via API route
 * @param file The file object to upload
 * @param module Optional module path (e.g., 'ferramentas', 'usuarios')
 * @returns The public URL of the uploaded file
 */
export async function uploadFile(file: File, module = 'geral'): Promise<string | null> {
  try {
    const response = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}&module=${module}`, {
      method: 'POST',
      body: file,
      headers: {
        'content-type': file.type || 'application/octet-stream'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Upload failed:', errorData);
      throw new Error(errorData.details || errorData.error || 'Erro desconhecido no upload');
    }

    const data = await response.json();
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
