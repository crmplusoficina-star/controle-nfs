import { S3Client } from '@aws-sdk/client-s3';

const sanitizeEnv = (val: string | undefined): string => {
  if (!val) return '';
  // Remove quotes, handle 'undefined'/'null' strings, and trim whitespace
  const sanitized = val.trim().replace(/^["']|["']$/g, '').trim();
  if (sanitized === 'undefined' || sanitized === 'null' || sanitized === '') return '';
  return sanitized;
};

// R2 Account ID should only be the hex string. If a URL is provided, extract the hex part.
export const R2_ACCOUNT_ID = sanitizeEnv(process.env.R2_ACCOUNT_ID).replace(/^https?:\/\//, '').split('.')[0];
export const R2_ACCESS_KEY_ID = sanitizeEnv(process.env.R2_ACCESS_KEY_ID);
export const R2_SECRET_ACCESS_KEY = sanitizeEnv(process.env.R2_SECRET_ACCESS_KEY);
export const R2_BUCKET_NAME = sanitizeEnv(process.env.R2_BUCKET_NAME).toLowerCase();
export const R2_PUBLIC_URL = sanitizeEnv(process.env.R2_PUBLIC_URL).replace(/\/$/, '');

let s3Client: S3Client | null = null;

export function getS3Client() {
  // Check for masked values first
  const allEnvValues = [
    process.env.R2_ACCOUNT_ID,
    process.env.R2_ACCESS_KEY_ID,
    process.env.R2_SECRET_ACCESS_KEY,
    process.env.R2_BUCKET_NAME
  ];
  
  if (allEnvValues.some(v => v && (v.includes('•') || (v.includes('*') && v.length > 5)))) {
    throw new Error('As variáveis do Cloudflare R2 contêm caracteres de máscara (• ou *). Por favor, certifique-se de copiar os valores REAIS das configurações no menu de segredos (clique no ícone de olho para ver o valor real primeiro).');
  }

  if (!s3Client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME;
    
    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      const missing = [];
      if (!accountId) missing.push('Account ID');
      if (!accessKeyId) missing.push('Access Key ID');
      if (!secretAccessKey) missing.push('Secret Access Key');
      if (!bucketName) missing.push('Bucket Name');
      
      throw new Error(`Cloudflare R2 missing: ${missing.join(', ')}`);
    }

    console.log('Initializing R2 S3Client with:', {
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      bucket: R2_BUCKET_NAME,
      region: 'auto'
    });

    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });
  }
  return s3Client;
}
