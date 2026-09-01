// src/common/object-id.utils.ts
import { Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';

/**
 * Validates if a string is a valid MongoDB ObjectID
 * Returns the ObjectId if valid, throws if invalid
 */
export function validateObjectId(id: string | Types.ObjectId): Types.ObjectId {
  if (id instanceof Types.ObjectId) {
    return id;
  }

  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestException(`Invalid ID format: "${id}". ID must be a 24-character hex string.`);
  }

  return new Types.ObjectId(id);
}

/**
 * Validates multiple ObjectIDs at once
 */
export function validateObjectIds(ids: Record<string, string | Types.ObjectId>): Record<string, Types.ObjectId> {
  const result: Record<string, Types.ObjectId> = {};
  const errors: string[] = [];

  for (const [key, value] of Object.entries(ids)) {
    try {
      result[key] = validateObjectId(value);
    } catch (error) {
      errors.push(`${key}: "${value}" is invalid`);
    }
  }

  if (errors.length > 0) {
    throw new BadRequestException(`Invalid ObjectIDs: ${errors.join(', ')}`);
  }

  return result;
}

/**
 * Safely converts to string, handles both ObjectId and string
 */
export function toObjectIdString(id: any): string {
  if (!id) return '';
  if (id instanceof Types.ObjectId) return id.toString();
  if (typeof id === 'string') return id;
  if (id._id) return id._id.toString();
  if (id.id) return id.id.toString();
  return id.toString ? id.toString() : '';
}
