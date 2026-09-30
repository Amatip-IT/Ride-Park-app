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
import { CreateReviewDto } from './dto/create-review.dto';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * POST /reviews
   * Create a review (must be logged in)
   */
  @Post()
  @UseGuards(AuthGuard)
  async createReview(@Req() req: any, @Body() body: CreateReviewDto) {
    const userId = req.user._id || req.user.id;

    const result = await this.reviewsService.createReview(
      String(userId),
      body,
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * GET /reviews/mine
   * Booking ids the signed-in user has already reviewed
   */
  @Get('mine')
  @UseGuards(AuthGuard)
  async getMine(@Req() req: any) {
    const userId = req.user._id || req.user.id;
    const result = await this.reviewsService.getReviewedBookingIds(String(userId));
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
