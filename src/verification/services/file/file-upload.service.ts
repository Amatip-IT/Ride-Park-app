import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

// Define the Multer File type
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
}

@Injectable()
export class FileUploadService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(private configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );
    const region = this.configService.get<string>('AWS_REGION');
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET') || '';

    if (!accessKeyId || !secretAccessKey || !region || !this.bucketName) {
      console.warn('⚠️ AWS S3 credentials not configured. File uploads will fail if called.');
      return;
    }

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    console.log('AWS S3 file upload service initialized');
  }

  /**
   * Upload file to S3
   * @param file - File buffer and metadata
   * @param folder - S3 folder path (e.g., "driver-documents/user123")
   * @returns S3 file URL
   */
  async uploadFile(file: MulterFile, folder: string): Promise<string> {
    try {
      // Generate unique filename
      const parts = file.originalname.split('.');
      const fileExtension = parts.length > 1 ? parts.pop()! : 'bin';
      const uniqueId = randomUUID();
      const fileName = `${folder}/${uniqueId}.${fileExtension}`;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'private', // Private by default
      });

      await this.s3Client.send(command);

      // Return S3 URL using path-style format (required for buckets with dots)
      const region = this.configService.get<string>('AWS_REGION');
      const url = `https://s3.${region}.amazonaws.com/${this.bucketName}/${fileName}`;

      console.log(`File uploaded to S3: ${url}`);
      return url;
    } catch (error) {
      console.error('Failed to upload file to S3:', error);
      throw new InternalServerErrorException(
        'Failed to upload file. Please try again later.',
      );
    }
  }

  /**
   * Upload multiple files
   * @param files - Array of files
   * @param folder - S3 folder path
   * @returns Array of S3 URLs
   */
  async uploadMultipleFiles(
    files: MulterFile[],
    folder: string,
  ): Promise<string[]> {
    const uploadPromises = files.map((file) => this.uploadFile(file, folder));
    return Promise.all(uploadPromises);
  }

  /**
   * Delete file from S3
   * @param fileUrl - Full S3 URL
   * @returns Success status
   */
  async deleteFile(fileUrl: string): Promise<boolean> {
    try {
      // Extract key from URL (handles both path-style and virtual-hosted-style URLs)
      const url = new URL(fileUrl);
      let key: string;

      if (url.hostname.startsWith('s3.')) {
        // Path-style URL: https://s3.region.amazonaws.com/bucket/key
        const pathParts = url.pathname.substring(1).split('/');
        pathParts.shift();
        key = pathParts.join('/');
      } else {
        // Virtual-hosted-style URL: https://bucket.s3.region.amazonaws.com/key
        key = url.pathname.substring(1);
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      console.log(`File deleted from S3: ${fileUrl}`);
      return true;
    } catch (error) {
      console.error('Failed to delete file from S3:', error);
      return false;
    }
  }

  /**
   * Validate file type
   * @param file - File to validate
   * @param allowedTypes - Array of allowed MIME types
   * @returns boolean
   */
  validateFileType(file: MulterFile, allowedTypes: string[]): boolean {
    return allowedTypes.includes(file.mimetype);
  }

  /**
   * Validate file size
   * @param file - File to validate
   * @param maxSizeInMB - Maximum size in megabytes
   * @returns boolean
   */
  validateFileSize(file: MulterFile, maxSizeInMB: number): boolean {
    const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
    return file.size <= maxSizeInBytes;
  }
}
