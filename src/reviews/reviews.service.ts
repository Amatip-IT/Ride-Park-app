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

  async getReviewedBookingIds(reviewerId: string): Promise<Response> {
    try {
      if (!Types.ObjectId.isValid(reviewerId)) {
        return { success: true, message: 'No reviews yet', data: { bookingIds: [] } };
      }

      const reviews = await this.reviewModel
        .find({
          reviewer: reviewerId,
          booking: { $exists: true, $ne: null },
        })
        .select('booking')
        .lean();

      return {
        success: true,
        message: 'Reviews loaded',
        data: {
          bookingIds: reviews
            .map((review) => (review.booking ? String(review.booking) : ''))
            .filter(Boolean),
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to load reviews: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Profile id, user id, and sibling listings that belong to the same provider.
   * Reviews may have been stored against any of those ids.
   */
  private async relatedServiceIds(
    serviceType: string,
    serviceId: string,
  ): Promise<string[]> {
    const ids = new Set<string>();
    if (serviceId) ids.add(String(serviceId));
    if (!Types.ObjectId.isValid(serviceId)) return [];

    if (serviceType === 'parking') {
      const space = await this.parkingSpaceModel
        .findById(serviceId)
        .select('owner')
        .lean();
      const ownerId = space?.owner ? String(space.owner) : serviceId;
      ids.add(ownerId);
      const spaces = await this.parkingSpaceModel
        .find({ owner: ownerId })
        .select('_id')
        .lean();
      spaces.forEach((row) => ids.add(String(row._id)));
    }

    if (serviceType === 'driver') {
      const profile = await this.chauffeurModel
        .findById(serviceId)
        .select('user')
        .lean();
      const userId = profile?.user ? String(profile.user) : serviceId;
      ids.add(userId);
      const profiles = await this.chauffeurModel
        .find({ user: userId })
        .select('_id')
        .lean();
      profiles.forEach((row) => ids.add(String(row._id)));
    }

    if (serviceType === 'taxi') {
      const profile = await this.taxiModel
        .findById(serviceId)
        .select('user')
        .lean();
      const userId = profile?.user ? String(profile.user) : serviceId;
      ids.add(userId);
      const profiles = await this.taxiModel
        .find({ user: userId })
        .select('_id')
        .lean();
      profiles.forEach((row) => ids.add(String(row._id)));
    }

    return [...ids].filter((id) => Types.ObjectId.isValid(id));
  }

  async decorateListings(
    serviceType: 'parking' | 'driver' | 'taxi',
    items: any[],
  ): Promise<any[]> {
    const plains = items.map((item) =>
      typeof item?.toObject === 'function' ? item.toObject() : { ...item },
    );
    if (plains.length === 0) return plains;

    const personIdOf = (item: any) => {
      const person = serviceType === 'parking' ? item.owner : item.user;
      if (!person) return '';
      if (person._id) return String(person._id);
      return String(person);
    };

    const idToPerson = new Map<string, string>();
    for (const item of plains) {
      const listingId = String(item._id || '');
      const personId = personIdOf(item);
      if (listingId) idToPerson.set(listingId, personId || listingId);
      if (personId) idToPerson.set(personId, personId);
    }

    const personIds = [
      ...new Set(
        plains.map(personIdOf).filter((id) => Types.ObjectId.isValid(id)),
      ),
    ];

    if (personIds.length > 0 && serviceType === 'parking') {
      const spaces = await this.parkingSpaceModel
        .find({ owner: { $in: personIds } })
        .select('_id owner')
        .lean();
      spaces.forEach((row) => {
        idToPerson.set(String(row._id), String(row.owner));
      });
    }

    if (personIds.length > 0 && serviceType === 'driver') {
      const profiles = await this.chauffeurModel
        .find({ user: { $in: personIds } })
        .select('_id user')
        .lean();
      profiles.forEach((row) => {
        idToPerson.set(String(row._id), String(row.user));
      });
    }

    if (personIds.length > 0 && serviceType === 'taxi') {
      const profiles = await this.taxiModel
        .find({ user: { $in: personIds } })
        .select('_id user')
        .lean();
      profiles.forEach((row) => {
        idToPerson.set(String(row._id), String(row.user));
      });
    }

    const matchIds = [...idToPerson.keys()].filter((id) =>
      Types.ObjectId.isValid(id),
    );
    const buckets = new Map<string, { sum: number; count: number }>();

    if (matchIds.length > 0) {
      const rows = await this.reviewModel.aggregate([
        {
          $match: {
            serviceType,
            serviceId: { $in: matchIds.map((id) => new Types.ObjectId(id)) },
          },
        },
        {
          $group: {
            _id: '$serviceId',
            sum: { $sum: '$rating' },
            count: { $sum: 1 },
          },
        },
      ]);

      for (const row of rows) {
        const person = idToPerson.get(String(row._id)) || String(row._id);
        const bucket = buckets.get(person) || { sum: 0, count: 0 };
        bucket.sum += row.sum;
        bucket.count += row.count;
        buckets.set(person, bucket);
      }
    }

    return plains.map((item) => {
      const listingId = String(item._id || '');
      const personId = personIdOf(item) || idToPerson.get(listingId) || listingId;
      const bucket = buckets.get(personId);
      const totalReviews = bucket?.count || 0;
      const averageRating = totalReviews
        ? Math.round((bucket!.sum / totalReviews) * 10) / 10
        : 0;
      return { ...item, averageRating, totalReviews };
    });
  }

  async getReviewsForService(
    serviceType: string,
    serviceId: string,
    page = 1,
    limit = 20,
  ): Promise<Response> {
    try {
      const relatedIds = await this.relatedServiceIds(serviceType, serviceId);
      const skip = (page - 1) * limit;

      const match = {
        serviceType,
        serviceId: {
          $in: relatedIds.map((id) => new Types.ObjectId(id)),
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
