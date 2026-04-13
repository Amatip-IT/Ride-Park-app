import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Review, ReviewDocument } from 'src/schemas/review.schema';
import { Response } from 'src/common/interfaces/response.interface';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
  ) {}

  /**
   * Create a review for a service
   */
  async createReview(
    reviewerId: string,
    data: {
      serviceType: string;
      serviceId: string;
      bookingId?: string;
      rating: number;
      comment?: string;
    },
  ): Promise<Response> {
    try {
      // Check if user already reviewed this booking
      if (data.bookingId) {
        const existing = await this.reviewModel.findOne({
          reviewer: reviewerId,
          booking: data.bookingId,
        });
        if (existing) {
          return { success: false, message: 'You have already reviewed this booking' };
        }
      }

      // Validate rating
      if (data.rating < 1 || data.rating > 5) {
        return { success: false, message: 'Rating must be between 1 and 5' };
      }

      const review = new this.reviewModel({
        reviewer: reviewerId,
        serviceType: data.serviceType,
        serviceId: data.serviceId,
        booking: data.bookingId || undefined,
        rating: data.rating,
        comment: data.comment?.trim() || undefined,
      });

      await review.save();

      return {
        success: true,
        data: review,
        message: 'Review submitted successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to submit review: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get reviews for a specific service
   */
  async getReviewsForService(
    serviceType: string,
    serviceId: string,
    page = 1,
    limit = 20,
  ): Promise<Response> {
    try {
      const skip = (page - 1) * limit;

      const [reviews, total] = await Promise.all([
        this.reviewModel
          .find({ serviceType, serviceId })
          .populate('reviewer', 'firstName lastName')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.reviewModel.countDocuments({ serviceType, serviceId }).exec(),
      ]);

      // Calculate average rating
      const avgResult = await this.reviewModel.aggregate([
        { $match: { serviceType, serviceId } },
        { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]);

      const avgRating = avgResult.length > 0 ? Math.round(avgResult[0].avgRating * 10) / 10 : 0;
      const totalReviews = avgResult.length > 0 ? avgResult[0].count : 0;

      return {
        success: true,
        data: {
          reviews,
          averageRating: avgRating,
          totalReviews,
        },
        message: `Found ${total} review(s)`,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch reviews: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
