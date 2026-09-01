import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { MongoError } from 'mongodb';

@Catch(MongoError)
export class MongoExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MongoExceptionFilter.name);

  catch(exception: MongoError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    this.logger.error(`MongoDB Error: ${exception.name} - ${exception.message}`);

    // Handle CastError (invalid ObjectID)
    if (exception.name === 'CastError') {
      const castError = exception as any;
      return response.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: `Invalid ID format: "${castError.value}". ID must be a 24-character hex string.`,
      });
    }

    // Handle Duplicate Key Error
    if (exception.code === 11000) {
      const duplicateError = exception as any;
      const field = Object.keys(duplicateError.keyPattern || {})[0] || 'field';
      return response.status(HttpStatus.CONFLICT).json({
        success: false,
        message: `Duplicate key error: A record with this ${field} already exists.`,
      });
    }

    // Handle Validation Error
    if (exception.name === 'ValidationError') {
      const validationError = exception as any;
      const messages = Object.values(validationError.errors || {}).map(
        (err: any) => err.message
      );
      return response.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: `Validation failed: ${messages.join(', ')}`,
      });
    }

    // Default MongoDB error
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Database error occurred. Please try again later.',
    });
  }
}
