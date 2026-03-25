import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { FileUploadService } from './file-upload.service';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

describe('FileUploadService', () => {
  let service: FileUploadService;
  let s3Client: jest.Mocked<S3Client>;
  let mockConfigService: ConfigService;

  beforeEach(async () => {
    // Create fresh mock for each test
    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          AWS_ACCESS_KEY_ID: 'test_access_key',
          AWS_SECRET_ACCESS_KEY: 'test_secret_key',
          AWS_REGION: 'eu-west-2',
          AWS_S3_BUCKET: 'test-bucket',
        };
        return config[key] || null;
      }),
    } as unknown as ConfigService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileUploadService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get(FileUploadService);
    s3Client = new S3Client({}) as jest.Mocked<S3Client>;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw error if AWS credentials not configured', () => {
    const emptyConfigService = {
      get: jest.fn().mockReturnValue(''),
    } as unknown as ConfigService;

    expect(() => new FileUploadService(emptyConfigService)).toThrow(
      InternalServerErrorException,
    );
  });

  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      const mockFile = {
        fieldname: 'photo',
        originalname: 'test.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('test image data'),
      } as Express.Multer.File;

      const mockSend = jest.fn().mockResolvedValue({});
      (s3Client.send as jest.Mock) = mockSend;
      // Use Object.defineProperty to properly set the private property
      Object.defineProperty(service, 's3Client', {
        value: s3Client,
        writable: true,
      });

      const result = await service.uploadFile(
        mockFile,
        'driver-documents/user123',
      );

      expect(result).toContain(
        'https://s3.eu-west-2.amazonaws.com/test-bucket/',
      );
      expect(result).toContain('driver-documents/user123/test-uuid-1234.jpg');
      expect(mockSend).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    });

    it('should generate unique filename with UUID', async () => {
      const mockFile = {
        originalname: 'photo.png',
        buffer: Buffer.from('test'),
        mimetype: 'image/png',
      } as Express.Multer.File;

      const mockSend = jest.fn().mockResolvedValue({});
      (s3Client.send as jest.Mock) = mockSend;
      Object.defineProperty(service, 's3Client', {
        value: s3Client,
        writable: true,
      });

      const result = await service.uploadFile(mockFile, 'test-folder');

      expect(result).toContain('test-uuid-1234.png');
    });

    it('should handle files without extension', async () => {
      const mockFile = {
        originalname: 'file',
        buffer: Buffer.from('test'),
        mimetype: 'application/octet-stream',
      } as Express.Multer.File;

      const mockSend = jest.fn().mockResolvedValue({});
      (s3Client.send as jest.Mock) = mockSend;
      Object.defineProperty(service, 's3Client', {
        value: s3Client,
        writable: true,
      });

      const result = await service.uploadFile(mockFile, 'test-folder');

      expect(result).toContain('test-uuid-1234.bin');
    });

    it('should throw error on S3 upload failure', async () => {
      const mockFile = {
        originalname: 'test.jpg',
        buffer: Buffer.from('test'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File;

      const mockSend = jest.fn().mockRejectedValue(new Error('S3 error'));
      (s3Client.send as jest.Mock) = mockSend;
      Object.defineProperty(service, 's3Client', {
        value: s3Client,
        writable: true,
      });

      await expect(service.uploadFile(mockFile, 'test-folder')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('uploadMultipleFiles', () => {
    it('should upload multiple files successfully', async () => {
      const mockFiles = [
        {
          originalname: 'photo1.jpg',
          buffer: Buffer.from('test1'),
          mimetype: 'image/jpeg',
        },
        {
          originalname: 'photo2.jpg',
          buffer: Buffer.from('test2'),
          mimetype: 'image/jpeg',
        },
        {
          originalname: 'photo3.jpg',
          buffer: Buffer.from('test3'),
          mimetype: 'image/jpeg',
        },
      ] as Express.Multer.File[];

      const mockSend = jest.fn().mockResolvedValue({});
      (s3Client.send as jest.Mock) = mockSend;
      Object.defineProperty(service, 's3Client', {
        value: s3Client,
        writable: true,
      });

      const results = await service.uploadMultipleFiles(
        mockFiles,
        'driver-photos',
      );

      expect(results).toHaveLength(3);
      expect(results[0]).toContain('driver-photos/test-uuid-1234.jpg');
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('should handle empty file array', async () => {
      const results = await service.uploadMultipleFiles([], 'test-folder');
      expect(results).toEqual([]);
    });
  });

  describe('deleteFile', () => {
    it('should delete file from path-style URL', async () => {
      const fileUrl =
        'https://s3.eu-west-2.amazonaws.com/test-bucket/driver-documents/file123.jpg';

      const mockSend = jest.fn().mockResolvedValue({});
      (s3Client.send as jest.Mock) = mockSend;
      Object.defineProperty(service, 's3Client', {
        value: s3Client,
        writable: true,
      });

      const result = await service.deleteFile(fileUrl);

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
    });

    it('should delete file from virtual-hosted-style URL', async () => {
      const fileUrl =
        'https://test-bucket.s3.eu-west-2.amazonaws.com/driver-documents/file123.jpg';

      const mockSend = jest.fn().mockResolvedValue({});
      (s3Client.send as jest.Mock) = mockSend;
      Object.defineProperty(service, 's3Client', {
        value: s3Client,
        writable: true,
      });

      const result = await service.deleteFile(fileUrl);

      expect(result).toBe(true);
    });

    it('should return false on delete failure', async () => {
      const fileUrl = 'https://s3.eu-west-2.amazonaws.com/test-bucket/file.jpg';

      const mockSend = jest.fn().mockRejectedValue(new Error('Delete failed'));
      (s3Client.send as jest.Mock) = mockSend;
      Object.defineProperty(service, 's3Client', {
        value: s3Client,
        writable: true,
      });

      const result = await service.deleteFile(fileUrl);

      expect(result).toBe(false);
    });
  });

  describe('validateFileType', () => {
    it('should validate allowed file type', () => {
      const mockFile = {
        mimetype: 'image/jpeg',
      } as Express.Multer.File;

      const result = service.validateFileType(mockFile, [
        'image/jpeg',
        'image/png',
      ]);

      expect(result).toBe(true);
    });

    it('should reject disallowed file type', () => {
      const mockFile = {
        mimetype: 'application/exe',
      } as Express.Multer.File;

      const result = service.validateFileType(mockFile, [
        'image/jpeg',
        'image/png',
      ]);

      expect(result).toBe(false);
    });

    it('should validate PDF files', () => {
      const mockFile = {
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      const result = service.validateFileType(mockFile, ['application/pdf']);

      expect(result).toBe(true);
    });
  });

  describe('validateFileSize', () => {
    it('should validate file size within limit', () => {
      const mockFile = {
        size: 5 * 1024 * 1024, // 5MB
      } as Express.Multer.File;

      const result = service.validateFileSize(mockFile, 10); // 10MB limit

      expect(result).toBe(true);
    });

    it('should reject file size exceeding limit', () => {
      const mockFile = {
        size: 15 * 1024 * 1024, // 15MB
      } as Express.Multer.File;

      const result = service.validateFileSize(mockFile, 10); // 10MB limit

      expect(result).toBe(false);
    });

    it('should accept file at exact size limit', () => {
      const mockFile = {
        size: 10 * 1024 * 1024, // Exactly 10MB
      } as Express.Multer.File;

      const result = service.validateFileSize(mockFile, 10);

      expect(result).toBe(true);
    });

    it('should handle small files correctly', () => {
      const mockFile = {
        size: 1024, // 1KB
      } as Express.Multer.File;

      const result = service.validateFileSize(mockFile, 10);

      expect(result).toBe(true);
    });
  });
});
