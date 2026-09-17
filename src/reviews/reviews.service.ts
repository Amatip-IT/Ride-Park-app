import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from 'src/schemas/review.schema';
import { Taxi, TaxiDocument } from 'src/schemas/taxi.schema';
import { Chauffeur, ChauffeurDocument } from 'src/schemas/chauffeur.schema';
import {
  ParkingSpace,
  ParkingSpaceDocument,
} from 'src/schemas/parking-space.schema';
import { Response } from 'src/common/interfaces/response.interface';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    @InjectModel(Taxi.name) private taxiModel: Model<TaxiDocument>,
    @InjectModel(Chauffeur.name)
    private chauffeurModel: Model<ChauffeurDocument>,
    @InjectModel(ParkingSpace.name)
    private parkingSpaceModel: Model<ParkingSpaceDocument>,
  ) {}

  /**
   * Clients often send the provider/driver User id. Map that to the service document id.
   */
  private async resolveServiceId(
    serviceType: string,
    serviceId: string,
  ): Promise<{ ok: true; serviceId: string } | { ok: false; message: string }> {
    if (!Types.ObjectId.isValid(serviceId)) {
      return { ok: false, message: 'Invalid service id' };
    }

    if (serviceType === 'taxi') {
      const byId = await this.taxiModel.findById(serviceId).select('_id').lean();
      if (byId) return { ok: true, serviceId: String(byId._id) };
      const byUser = await this.taxiModel
        .findOne({ user: serviceId })
        .select('_id')
        .lean();
      if (byUser) return { ok: true, serviceId: String(byUser._id) };
      // Allow reviewing by user id even if taxi profile record is missing
      return { ok: true, serviceId };
    }

    if (serviceType === 'driver') {
      const byId = await this.chauffeurModel
        .findById(serviceId)
        .select('_id')
        .lean();
      if (byId) return { ok: true, serviceId: String(byId._id) };
      const byUser = await this.chauffeurModel
        .findOne({ user: serviceId })
        .select('_id')
        .lean();
      if (byUser) return { ok: true, serviceId: String(byUser._id) };
      return { ok: true, serviceId };
    }

    if (serviceType === 'parking') {
      const byId = await this.parkingSpaceModel
        .findById(serviceId)
        .select('_id')
        .lean();
      if (byId) return { ok: true, serviceId: String(byId._id) };
      const byOwner = await this.parkingSpaceModel
        .findOne({ owner: serviceId })
        .select('_id')
        .sort({ createdAt: -1 })
        .lean();
      if (byOwner) return { ok: true, serviceId: String(byOwner._id) };
      return { ok: true, serviceId };
    }

    return { ok: false, message: 'Invalid service type' };
  }

  async createReview(
    reviewerId: string,
    data: CreateReviewDto,
  ): Promise<Response> {
    try {
      if (data.bookingId) {
        const existing = await this.reviewModel.findOne({
          reviewer: reviewerId,
          booking: data.bookingId,
        });
        if (existing) {
          return {
            success: false,
            message: 'You have already reviewed this booking',
          };
        }
      }

      const resolved = await this.resolveServiceId(
        data.serviceType,
        data.serviceId,
      );
      if (!resolved.ok) {
        return { success: false, message: resolved.message };
      }

      const review = new this.reviewModel({
        reviewer: reviewerId,
        serviceType: data.serviceType,
        serviceId: resolved.serviceId,
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

  async getReviewsForService(
    serviceType: string,
    serviceId: string,
    page = 1,
    limit = 20,
  ): Promise<Response> {
    try {
      const resolved = await this.resolveServiceId(serviceType, serviceId);
      const lookupId = resolved.ok ? resolved.serviceId : serviceId;
      const skip = (page - 1) * limit;

      const match = {
        serviceType,
        serviceId: {
          $in: Array.from(
            new Set(
              [lookupId, serviceId].filter((id) => Types.ObjectId.isValid(id)),
            ),
          ),
        },
      };

      const [reviews, total] = await Promise.all([
        this.reviewModel
          .find(match)
          .populate('reviewer', 'firstName lastName')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.reviewModel.countDocuments(match).exec(),
      ]);

      const avgResult = await this.reviewModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
            count: { $sum: 1 },
          },
        },
      ]);

      const avgRating =
        avgResult.length > 0 ? Math.round(avgResult[0].avgRating * 10) / 10 : 0;
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
