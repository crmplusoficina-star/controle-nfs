import { NextRequest, NextResponse } from 'next/server';
import { getS3Client, R2_BUCKET_NAME } from '@/lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';

export async function POST(req: NextRequest) {
  try {
    const filename = req.nextUrl.searchParams.get('filename') || 'file';
    const moduleName = req.nextUrl.searchParams.get('module') || 'geral';
    
    const body = await req.arrayBuffer();
    const buffer = Buffer.from(body);
    
    const s3Client = getS3Client();
    
    // Create a unique key
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    const extension = filename.split('.').pop();
    const cleanFilename = filename.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
    const key = `${moduleName}/${cleanFilename}_${timestamp}_${random}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: req.headers.get('content-type') || 'application/octet-stream',
    });

    await s3Client.send(command);

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    
    return NextResponse.json({ url: publicUrl, key });
  } catch (error: any) {
    console.error('Upload API Error:', error);
    return NextResponse.json({ error: 'Upload failed', details: error.message }, { status: 500 });
  }
}
