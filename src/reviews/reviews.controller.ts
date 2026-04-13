import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { AuthGuard } from 'src/guards/auth.guard';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * POST /reviews
   * Create a review (must be logged in)
   */
  @Post()
  @UseGuards(AuthGuard)
  async createReview(
    @Req() req: any,
    @Body() body: {
      serviceType: string;
      serviceId: string;
      bookingId?: string;
      rating: number;
      comment?: string;
    },
  ) {
    const userId = req.user._id || req.user.id;

    if (!body.serviceType || !body.serviceId || !body.rating) {
      throw new HttpException(
        { success: false, message: 'serviceType, serviceId, and rating are required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.reviewsService.createReview(userId, body);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * GET /reviews/:serviceType/:serviceId
   * Get all reviews for a specific service
   */
  @Get(':serviceType/:serviceId')
  async getReviews(
    @Param('serviceType') serviceType: string,
    @Param('serviceId') serviceId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.reviewsService.getReviewsForService(
      serviceType,
      serviceId,
      +page,
      +limit,
    );
  }
}
