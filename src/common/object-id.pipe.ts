// src/common/object-id.pipe.ts
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

@Injectable()
export class ObjectIdPipe implements PipeTransform {
  transform(value: any) {
    if (!value) {
      throw new BadRequestException('ID is required');
    }

    // If it's already an ObjectId, return it
    if (value instanceof Types.ObjectId) {
      return value;
    }

    // Validate and convert string to ObjectId
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ID format: "${value}". ID must be a 24-character hex string.`);
    }

    return new Types.ObjectId(value);
  }
}
