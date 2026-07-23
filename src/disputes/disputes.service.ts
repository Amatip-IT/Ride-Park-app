import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Dispute, DisputeDocument } from 'src/schemas/dispute.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { Ride, RideDocument } from 'src/schemas/ride.schema';
import {
  BookingRequest,
  BookingRequestDocument,
} from 'src/schemas/booking-request.schema';
import { Response } from 'src/common/interfaces/response.interface';
import { AdminService } from 'src/admin/admin.service';
import { AdminAuditService } from 'src/admin/admin-audit.service';
import { AdminAuditContext } from 'src/admin/admin-audit.types';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PaymentsService } from 'src/payments/payments.service';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    @InjectModel(Dispute.name) private disputeModel: Model<DisputeDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Ride.name) private rideModel: Model<RideDocument>,
    @InjectModel(BookingRequest.name)
    private bookingModel: Model<BookingRequestDocument>,
    private adminService: AdminService,
    private auditService: AdminAuditService,
    private notificationsService: NotificationsService,
    private paymentsService: PaymentsService,
  ) {}

  async fileDispute(
    userId: string,
    input: {
      category: string;
      description: string;
      complaintAbout?: string;
      evidenceUrls?: string[];
      relatedServiceType?: string;
      relatedServiceId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<Response> {
    try {
      if (!input.description?.trim()) {
        return { success: false, message: 'Description is required' };
      }

      if (input.complaintAbout) {
        const target = await this.userModel
          .findById(input.complaintAbout)
          .exec();
        if (!target) {
          return {
            success: false,
            message: 'The user you are complaining about was not found',
          };
        }
      }

      const dispute = await this.disputeModel.create({
        filedBy: userId,
        complaintAbout: input.complaintAbout,
        category: input.category || 'other',
        description: input.description.trim(),
        evidenceUrls: input.evidenceUrls || [],
        relatedServiceType: input.relatedServiceType,
        relatedServiceId: input.relatedServiceId,
        metadata: input.metadata,
        status: 'open',
      });

      return {
        success: true,
        data: dispute,
        message:
          'Your dispute has been submitted. Our team will review it shortly.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to file dispute: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async getMyDisputes(userId: string): Promise<Response> {
    try {
      const disputes = await this.disputeModel
        .find({ filedBy: userId })
        .populate('complaintAbout', 'firstName lastName email')
        .populate('assignedTo', 'firstName lastName')
        .sort({ createdAt: -1 })
        .exec();

      return {
        success: true,
        data: disputes,
        message: `Found ${disputes.length} dispute(s)`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch disputes: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async getDisputeById(
    disputeId: string,
    userId: string,
    isAdmin = false,
  ): Promise<Response> {
    try {
      const dispute = await this.disputeModel
        .findById(disputeId)
        .populate('filedBy', 'firstName lastName email phoneNumber role')
        .populate('complaintAbout', 'firstName lastName email phoneNumber role')
        .populate('assignedTo', 'firstName lastName email')
        .populate('resolvedBy', 'firstName lastName email')
        .exec();

      if (!dispute) {
        return { success: false, message: 'Dispute not found' };
      }

      if (!isAdmin && dispute.filedBy?.toString() !== userId) {
        return {
          success: false,
          message: 'You are not authorized to view this dispute',
        };
      }

      return { success: true, data: dispute, message: 'Dispute retrieved' };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch dispute: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async getAdminDisputes(filters: {
    status?: string;
    category?: string;
    page?: number;
    limit?: number;
  }): Promise<Response> {
    try {
      const page = Math.max(1, filters.page || 1);
      const limit = Math.min(50, Math.max(1, filters.limit || 20));
      const skip = (page - 1) * limit;

      const query: Record<string, unknown> = {};
      if (filters.status && filters.status !== 'all')
        query.status = filters.status;
      if (filters.category && filters.category !== 'all')
        query.category = filters.category;

      const [disputes, total] = await Promise.all([
        this.disputeModel
          .find(query)
          .populate('filedBy', 'firstName lastName email role')
          .populate('complaintAbout', 'firstName lastName email role')
          .populate('assignedTo', 'firstName lastName email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.disputeModel.countDocuments(query).exec(),
      ]);

      return {
        success: true,
        data: disputes,
        message: `Found ${total} dispute(s)`,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch disputes: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async investigateDispute(
    disputeId: string,
    adminId: string,
    adminNotes?: string,
    audit?: AdminAuditContext,
  ): Promise<Response> {
    try {
      const dispute = await this.disputeModel.findById(disputeId).exec();
      if (!dispute) {
        return { success: false, message: 'Dispute not found' };
      }

      if (dispute.status === 'resolved' || dispute.status === 'closed') {
        return { success: false, message: 'This dispute is already closed' };
      }

      dispute.status = 'investigating';
      dispute.assignedTo = adminId;
      if (adminNotes?.trim()) dispute.adminNotes = adminNotes.trim();
      await dispute.save();

      const filer = await this.userModel.findById(dispute.filedBy).exec();
      if (filer) {
        try {
          await this.notificationsService.sendNotification(
            dispute.filedBy.toString(),
            'Dispute Under Review',
            'An admin is now investigating your dispute. We will update you when resolved.',
            'system',
            { disputeId: dispute._id.toString() },
          );
        } catch (err) {
          this.logger.warn(`Failed to notify filer: ${err}`);
        }
      }

      await this.auditService.log(audit, {
        action: 'investigate_dispute',
        targetType: 'dispute',
        targetId: disputeId,
        newValue: { status: 'investigating', assignedTo: adminId },
        notes: adminNotes,
      });

      return {
        success: true,
        data: dispute,
        message: 'Dispute marked as under investigation',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to investigate dispute: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async resolveDispute(
    disputeId: string,
    adminId: string,
    input: {
      resolution: string;
      notes?: string;
      adminNotes?: string;
      refundAmount?: number;
      suspendReason?: string;
      providerType?: string;
      recordId?: string;
    },
    audit?: AdminAuditContext,
  ): Promise<Response> {
    try {
      const dispute = await this.disputeModel.findById(disputeId).exec();
      if (!dispute) {
        return { success: false, message: 'Dispute not found' };
      }

      if (dispute.status === 'resolved' || dispute.status === 'closed') {
        return { success: false, message: 'This dispute is already resolved' };
      }

      const actionResults: string[] = [];

      switch (input.resolution) {
        case 'override_driver_approval': {
          const recordId =
            input.recordId || (dispute.metadata?.recordId as string);
          const providerType =
            input.providerType ||
            (dispute.metadata?.providerType as string) ||
            'driver';
          if (!recordId) {
            return {
              success: false,
              message: 'recordId is required for driver approval override',
            };
          }
          const result = await this.adminService.approveDriverVerification(
            recordId,
            providerType,
            adminId,
            audit,
          );
          if (!result.success) return result;
          actionResults.push('Driver verification approved');
          break;
        }
        case 'override_provider_approval': {
          const parkingId = input.recordId || dispute.relatedServiceId;
          if (!parkingId) {
            return {
              success: false,
              message: 'Parking verification ID is required',
            };
          }
          const result = await this.adminService.approveParkingVerification(
            parkingId,
            5,
            audit,
          );
          if (!result.success) return result;
          actionResults.push('Parking provider approved');
          break;
        }
        case 'issue_refund': {
          const refundAmount =
            input.refundAmount || (dispute.metadata?.refundAmount as number);
          if (!refundAmount || refundAmount <= 0 || refundAmount > 10_000) {
            return {
              success: false,
              message: 'A valid refund amount is required',
            };
          }
          if (!dispute.relatedServiceId) {
            return {
              success: false,
              message: 'A related paid service is required for a refund',
            };
          }

          const ownerId = dispute.filedBy.toString();
          const [ride, booking] = await Promise.all([
            this.rideModel
              .findOne({ _id: dispute.relatedServiceId, passenger: ownerId })
              .select('paymentIntentId totalCost')
              .lean()
              .exec(),
            this.bookingModel
              .findOne({ _id: dispute.relatedServiceId, requester: ownerId })
              .select('paymentIntentId quotedPrice')
              .lean()
              .exec(),
          ]);
          const paymentIntentId =
            ride?.paymentIntentId || booking?.paymentIntentId;
          const paidAmount = ride?.totalCost || booking?.quotedPrice;
          if (!paymentIntentId || !paidAmount) {
            return {
              success: false,
              message:
                'No refundable Stripe payment was found for this dispute',
            };
          }
          if (refundAmount > paidAmount) {
            return {
              success: false,
              message: 'Refund cannot exceed the original payment amount',
            };
          }

          const refund = await this.paymentsService.refundCustomer(
            paymentIntentId,
            refundAmount,
            `dispute:${disputeId}:refund`,
          );
          dispute.stripeRefundId = refund.id;
          dispute.refundAmount = refundAmount;
          actionResults.push(
            `£${refundAmount.toFixed(2)} refunded through Stripe`,
          );
          break;
        }
        case 'suspend_user': {
          const targetId = dispute.complaintAbout?.toString();
          if (!targetId) {
            return { success: false, message: 'No user specified to suspend' };
          }
          const reason =
            input.suspendReason ||
            input.notes ||
            'Suspended following dispute resolution';
          const result = await this.adminService.suspendUser(
            targetId,
            reason,
            30,
            adminId,
            audit,
          );
          if (!result.success) return result;
          actionResults.push('User suspended for 30 days');
          break;
        }
        case 'close_no_action':
        case 'other':
          break;
        default:
          return {
            success: false,
            message: `Unknown resolution type: ${input.resolution}`,
          };
      }

      dispute.status = 'resolved';
      dispute.resolution = input.resolution;
      dispute.resolutionNotes = input.notes?.trim();
      if (input.adminNotes?.trim()) {
        dispute.adminNotes = input.adminNotes.trim();
      }
      dispute.resolvedBy = adminId;
      dispute.resolvedAt = new Date();
      await dispute.save();

      try {
        await this.notificationsService.sendNotification(
          dispute.filedBy.toString(),
          'Dispute Resolved',
          input.notes || 'Your dispute has been reviewed and resolved.',
          'system',
          { disputeId: dispute._id.toString(), resolution: input.resolution },
        );
      } catch (err) {
        this.logger.warn(`Failed to notify filer of resolution: ${err}`);
      }

      await this.auditService.log(audit, {
        action: 'resolve_dispute',
        targetType: 'dispute',
        targetId: disputeId,
        newValue: {
          resolution: input.resolution,
          actions: actionResults,
        },
        notes: input.notes,
      });

      return {
        success: true,
        data: { dispute, actions: actionResults },
        message: `Dispute resolved${actionResults.length ? `: ${actionResults.join('; ')}` : ''}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to resolve dispute: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
