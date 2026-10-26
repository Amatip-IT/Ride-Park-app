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
import {
  TaxiRideRequest,
  TaxiRideRequestDocument,
} from 'src/schemas/taxi-ride-request.schema';
import {
  Transaction,
  TransactionDocument,
} from 'src/schemas/transaction.schema';
import { RideWalletService } from 'src/wallet/ride-wallet.service';
import { toObjectIdString } from 'src/common/request.util';
import { Response } from 'src/common/interfaces/response.interface';
import { AdminService } from 'src/admin/admin.service';
import { AdminAuditService } from 'src/admin/admin-audit.service';
import { AdminAuditContext } from 'src/admin/admin-audit.types';
import { NotificationsService } from 'src/notifications/notifications.service';
import {
  clip,
  disputeCategoryLabel,
  notificationLines,
  resolutionLabel,
} from 'src/notifications/notification-copy';
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
    @InjectModel(TaxiRideRequest.name)
    private taxiRequestModel: Model<TaxiRideRequestDocument>,
    @InjectModel(Transaction.name)
    private transactionModel: Model<TransactionDocument>,
    private rideWallet: RideWalletService,
  ) {}

  private rideReference(requestId: string): string {
    return `GZ-${requestId.slice(-6).toUpperCase()}`;
  }

  /**
   * Resolve a ride (by ride id or ride-request id) the user took part in, and work
   * out whether they are the customer or the driver.
   */
  private async resolveRideLink(
    userId: string,
    serviceId: string,
  ): Promise<
    | {
        rideId?: string;
        rideRequestId?: string;
        customerId: string;
        driverId?: string;
        role: 'customer' | 'driver';
      }
    | { error: string }
  > {
    const ride = await this.rideModel.findById(serviceId).select('passenger driver booking').lean().exec();
    const request = ride
      ? ride.booking
        ? await this.taxiRequestModel.findById(ride.booking).select('passenger acceptedDriver ride').lean().exec()
        : null
      : await this.taxiRequestModel.findById(serviceId).select('passenger acceptedDriver ride').lean().exec();

    if (!ride && !request) return { error: 'We could not find that ride.' };

    const customerId = toObjectIdString(ride?.passenger || request?.passenger);
    const driverId = toObjectIdString(ride?.driver || request?.acceptedDriver) || undefined;
    const caller = toObjectIdString(userId);
    const role = caller === customerId ? 'customer' : caller === driverId ? 'driver' : null;
    if (!role) return { error: 'You can only report issues for rides you were part of.' };

    return {
      rideId: ride ? String(ride._id) : request?.ride ? String(request.ride) : undefined,
      rideRequestId: request ? String((request as any)._id) : undefined,
      customerId,
      driverId,
      role,
    };
  }

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

      let rideFields: Record<string, unknown> = {};
      if (
        input.relatedServiceId &&
        (input.relatedServiceType === 'ride' || input.relatedServiceType === 'taxi')
      ) {
        const link = await this.resolveRideLink(userId, input.relatedServiceId);
        if ('error' in link) return { success: false, message: link.error };
        rideFields = {
          rideId: link.rideId,
          rideRequestId: link.rideRequestId,
          rideReference: link.rideRequestId ? this.rideReference(link.rideRequestId) : undefined,
          filedByRole: link.role,
          customerId: link.customerId,
          driverId: link.driverId,
          // The other party on the ride is who the report is about
          complaintAbout:
            input.complaintAbout || (link.role === 'customer' ? link.driverId : link.customerId),
        };
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
        ...rideFields,
        status: 'open',
        statusHistory: [{ status: 'open', changedBy: userId, note: 'Dispute submitted', at: new Date() }],
      });
      this.logger.log(
        JSON.stringify({
          event: 'dispute_filed',
          disputeId: dispute._id.toString(),
          rideId: rideFields.rideId,
          role: rideFields.filedByRole,
        }),
      );

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

      const filedById = toObjectIdString((dispute.filedBy as any)?._id || dispute.filedBy);
      if (!isAdmin && filedById !== userId) {
        return {
          success: false,
          message: 'You are not authorized to view this dispute',
        };
      }

      if (!isAdmin) {
        // Internal notes stay inside the admin team
        const plain: any = dispute.toObject();
        delete plain.internalNotes;
        delete plain.adminNotes;
        return { success: true, data: plain, message: 'Dispute retrieved' };
      }

      return {
        success: true,
        data: { ...dispute.toObject(), rideContext: await this.buildRideContext(dispute) },
        message: 'Dispute retrieved',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch dispute: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /** Everything an admin needs to judge a ride dispute, in one payload. */
  private async buildRideContext(dispute: DisputeDocument) {
    const rideId = dispute.rideId ? String((dispute.rideId as any)?._id || dispute.rideId) : undefined;
    const requestId = dispute.rideRequestId
      ? String((dispute.rideRequestId as any)?._id || dispute.rideRequestId)
      : undefined;
    if (!rideId && !requestId) return null;

    const [ride, request] = await Promise.all([
      rideId
        ? this.rideModel
            .findById(rideId)
            .populate('passenger', 'firstName lastName email phoneNumber')
            .populate('driver', 'firstName lastName email phoneNumber')
            .lean()
            .exec()
        : null,
      requestId ? this.taxiRequestModel.findById(requestId).lean().exec() : null,
    ]);

    const walletTransactions = rideId ? await this.rideWallet.getRideTransactions(rideId) : [];
    const earnings = rideId
      ? await this.transactionModel.find({ type: 'earning', referenceId: rideId }).lean().exec()
      : [];

    return {
      rideReference: requestId ? this.rideReference(requestId) : undefined,
      ride: ride
        ? {
            _id: ride._id,
            status: ride.status,
            paymentStatus: ride.paymentStatus,
            paymentMethod: ride.paymentMethod,
            serviceType: ride.serviceType,
            vehicleCategory: ride.vehicleCategory,
            passenger: ride.passenger,
            driver: ride.driver,
            pickup: ride.pickup,
            dropoff: ride.dropoff,
            startedAt: ride.startedAt,
            completedAt: ride.completedAt,
            tripSeconds: ride.tripSeconds,
            approachMeters: ride.approachMeters,
            estimatedTripMeters: ride.estimatedTripMeters,
            recordedTripMeters: ride.recordedTripMeters,
            billedTripMeters: ride.billedTripMeters,
            fareBreakdown: ride.fareBreakdown,
            totalCostPence: ride.totalCostPence,
            totalCost: ride.totalCost,
            hold: ride.hold,
            stops: ride.stops,
            pricingSnapshot: ride.pricingSnapshot,
          }
        : null,
      request: request
        ? {
            _id: request._id,
            status: request.status,
            pickupAddress: request.pickupAddress,
            destinationAddress: request.destinationAddress,
            approachMeters: request.approachMeters,
            approachSource: request.approachSource,
            driverStartLocation: request.driverStartLocation,
            estimatedTripMeters: request.estimatedTripMeters,
            estimatedCostPence: request.estimatedCostPence,
            quoteBreakdown: request.quoteBreakdown,
            createdAt: request.createdAt,
            acceptedAt: request.acceptedAt,
            cancelledAt: request.cancelledAt,
            cancelledBy: request.cancelledBy,
          }
        : null,
      walletTransactions,
      driverEarnings: earnings,
    };
  }

  private pushStatus(dispute: DisputeDocument, status: string, changedBy: string, note?: string) {
    dispute.statusHistory = [
      ...(dispute.statusHistory || []),
      { status, changedBy, note, at: new Date() },
    ];
  }

  async assignDispute(
    disputeId: string,
    assigneeId: string,
    audit: AdminAuditContext,
  ): Promise<Response> {
    const dispute = await this.disputeModel.findById(disputeId).exec();
    if (!dispute) return { success: false, message: 'Dispute not found' };
    const assignee = await this.userModel.findById(assigneeId).select('role').lean().exec();
    if (!assignee || (assignee as any).role !== 'admin') {
      return { success: false, message: 'Disputes can only be assigned to an admin' };
    }
    const previous = dispute.assignedTo ? String(dispute.assignedTo) : null;
    dispute.assignedTo = assigneeId;
    if (dispute.status === 'open') {
      dispute.status = 'investigating';
      this.pushStatus(dispute, 'investigating', audit.adminId, 'Assigned for review');
    }
    await dispute.save();
    await this.auditService.log(audit, {
      action: 'assign_dispute',
      targetType: 'dispute',
      targetId: disputeId,
      oldValue: { assignedTo: previous },
      newValue: { assignedTo: assigneeId },
    });
    return { success: true, data: dispute, message: 'Dispute assigned' };
  }

  async addInternalNote(
    disputeId: string,
    note: string,
    audit: AdminAuditContext,
  ): Promise<Response> {
    const text = note?.trim();
    if (!text) return { success: false, message: 'Note cannot be empty' };
    const dispute = await this.disputeModel.findByIdAndUpdate(
      disputeId,
      { $push: { internalNotes: { adminId: audit.adminId, note: text.slice(0, 2000), at: new Date() } } },
      { new: true },
    );
    if (!dispute) return { success: false, message: 'Dispute not found' };
    await this.auditService.log(audit, {
      action: 'dispute_note',
      targetType: 'dispute',
      targetId: disputeId,
      notes: text.slice(0, 500),
    });
    return { success: true, data: dispute, message: 'Note added' };
  }

  async rejectDispute(
    disputeId: string,
    reason: string,
    audit: AdminAuditContext,
  ): Promise<Response> {
    const text = reason?.trim();
    if (!text) return { success: false, message: 'Please give a reason for rejecting this dispute' };
    const dispute = await this.disputeModel.findById(disputeId).exec();
    if (!dispute) return { success: false, message: 'Dispute not found' };
    if (['resolved', 'rejected', 'closed'].includes(dispute.status)) {
      return { success: false, message: `This dispute is already ${dispute.status}` };
    }
    dispute.status = 'rejected';
    dispute.resolution = 'close_no_action';
    dispute.resolutionNotes = text;
    dispute.resolvedBy = audit.adminId;
    dispute.resolvedAt = new Date();
    this.pushStatus(dispute, 'rejected', audit.adminId, text);
    await dispute.save();

    await this.auditService.log(audit, {
      action: 'reject_dispute',
      targetType: 'dispute',
      targetId: disputeId,
      newValue: { status: 'rejected' },
      reason: text,
    });
    try {
      await this.notificationsService.sendNotification(
        dispute.filedBy.toString(),
        'Dispute Reviewed',
        notificationLines(
          `Your ${disputeCategoryLabel(dispute.category).toLowerCase()} dispute${dispute.rideReference ? ` for ride ${dispute.rideReference}` : ''} was not upheld.`,
          `Reason: ${text}`,
        ),
        'system',
        { disputeId },
      );
    } catch (err) {
      this.logger.warn(`Failed to notify filer of rejection: ${err}`);
    }
    return { success: true, data: dispute, message: 'Dispute rejected' };
  }

  async getAdminDisputes(filters: {
    status?: string;
    category?: string;
    page?: number;
    limit?: number;
    from?: string;
    to?: string;
    rideReference?: string;
    customerId?: string;
    driverId?: string;
    filedByRole?: string;
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
      if (filters.filedByRole && filters.filedByRole !== 'all')
        query.filedByRole = filters.filedByRole;
      if (filters.customerId && /^[a-f\d]{24}$/i.test(filters.customerId))
        query.customerId = filters.customerId;
      if (filters.driverId && /^[a-f\d]{24}$/i.test(filters.driverId))
        query.driverId = filters.driverId;
      if (filters.rideReference?.trim()) {
        const ref = filters.rideReference.trim();
        query.$or = /^[a-f\d]{24}$/i.test(ref)
          ? [{ rideId: ref }, { rideRequestId: ref }]
          : [{ rideReference: ref.toUpperCase().startsWith('GZ-') ? ref.toUpperCase() : `GZ-${ref.toUpperCase()}` }];
      }
      const from = filters.from ? new Date(filters.from) : null;
      const to = filters.to ? new Date(filters.to) : null;
      if ((from && !isNaN(from.getTime())) || (to && !isNaN(to.getTime()))) {
        query.createdAt = {
          ...(from && !isNaN(from.getTime()) ? { $gte: from } : {}),
          ...(to && !isNaN(to.getTime()) ? { $lte: to } : {}),
        };
      }

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

      if (['resolved', 'closed', 'rejected'].includes(dispute.status)) {
        return { success: false, message: 'This dispute is already closed' };
      }

      dispute.status = 'investigating';
      dispute.assignedTo = adminId;
      if (adminNotes?.trim()) dispute.adminNotes = adminNotes.trim();
      this.pushStatus(dispute, 'investigating', adminId, adminNotes?.trim());
      await dispute.save();

      const filer = await this.userModel.findById(dispute.filedBy).exec();
      if (filer) {
        try {
          await this.notificationsService.sendNotification(
            dispute.filedBy.toString(),
            'Dispute Under Review',
            notificationLines(
              `We are reviewing your ${disputeCategoryLabel(dispute.category).toLowerCase()} dispute.`,
              clip(dispute.description)
                ? `You wrote: "${clip(dispute.description)}"`
                : undefined,
              adminNotes?.trim()
                ? `Admin note: ${adminNotes.trim()}`
                : undefined,
              'We will send another notification when there is a decision.',
            ),
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

      if (['resolved', 'closed', 'rejected'].includes(dispute.status)) {
        return { success: false, message: `This dispute is already ${dispute.status}` };
      }

      const actionResults: string[] = [];

      // Wallet-paid rides are refunded to the customer's wallet (no Stripe charge exists for them)
      if (input.resolution === 'issue_refund' && dispute.rideId) {
        const ride = await this.rideModel
          .findById(dispute.rideId)
          .select('passenger paymentMethod hold totalCostPence totalCost paymentStatus')
          .lean()
          .exec();
        if (ride?.paymentMethod === 'wallet') {
          const refundPence = Math.round((input.refundAmount || 0) * 100);
          const paidPence = ride.hold?.capturedAmountPence ?? ride.totalCostPence ?? 0;
          if (ride.paymentStatus !== 'charged' || paidPence <= 0) {
            return { success: false, message: 'This ride has not been paid, so there is nothing to refund' };
          }
          if (refundPence <= 0 || refundPence > paidPence) {
            return {
              success: false,
              message: `Refund must be between £0.01 and £${(paidPence / 100).toFixed(2)} (the amount paid)`,
            };
          }
          const refund = await this.rideWallet.refundToWallet({
            userId: toObjectIdString(ride.passenger),
            amountPence: refundPence,
            referenceId: `dispute:${disputeId}:refund`,
            description: `Refund for disputed ride ${dispute.rideReference || ''}`.trim(),
            metadata: { disputeId, rideId: String(dispute.rideId) },
          });
          if (!refund.ok) return { success: false, message: 'Refund could not be issued' };
          dispute.refundAmount = refundPence / 100;
          actionResults.push(
            refund.alreadyDone
              ? 'Refund was already issued to the customer wallet'
              : `£${(refundPence / 100).toFixed(2)} refunded to the customer's wallet`,
          );
          await this.auditService.log(audit, {
            action: 'dispute_refund_wallet',
            targetType: 'dispute',
            targetId: disputeId,
            newValue: { refundPence, rideId: String(dispute.rideId) },
          });
          input = { ...input, resolution: 'issue_refund_wallet_done' };
        }
      }

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
        case 'issue_refund_wallet_done':
          break;
        default:
          return {
            success: false,
            message: `Unknown resolution type: ${input.resolution}`,
          };
      }

      const resolution =
        input.resolution === 'issue_refund_wallet_done' ? 'issue_refund' : input.resolution;
      input = { ...input, resolution };
      dispute.status = 'resolved';
      dispute.resolution = resolution;
      dispute.resolutionNotes = input.notes?.trim();
      this.pushStatus(
        dispute,
        'resolved',
        adminId,
        [resolutionLabel(resolution), ...actionResults].join(' · '),
      );
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
          notificationLines(
            `Your ${disputeCategoryLabel(dispute.category).toLowerCase()} dispute is resolved.`,
            `Outcome: ${resolutionLabel(input.resolution)}`,
            input.notes?.trim()
              ? `Details: ${input.notes.trim()}`
              : 'Your dispute has been reviewed.',
            clip(dispute.description)
              ? `Original report: "${clip(dispute.description)}"`
              : undefined,
          ),
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
