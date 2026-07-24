import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Transaction,
  TransactionDocument,
} from 'src/schemas/transaction.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { Chauffeur, ChauffeurDocument } from 'src/schemas/chauffeur.schema';
import { Taxi, TaxiDocument } from 'src/schemas/taxi.schema';
import {
  ParkingVerification,
  ParkingVerificationDocument,
} from 'src/schemas/parking-verification.schema';
import { Response } from 'src/common/interfaces/response.interface';
import {
  WebhookEvent,
  WebhookEventDocument,
} from 'src/schemas/webhook-event.schema';

type Period = 'week' | 'month' | 'year' | 'all';

@Injectable()
export class AdminAnalyticsService {
  constructor(
    @InjectModel(Transaction.name)
    private transactionModel: Model<TransactionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Chauffeur.name)
    private chauffeurModel: Model<ChauffeurDocument>,
    @InjectModel(Taxi.name) private taxiModel: Model<TaxiDocument>,
    @InjectModel(ParkingVerification.name)
    private parkingVerifModel: Model<ParkingVerificationDocument>,
    @InjectModel(WebhookEvent.name)
    private webhookEventModel: Model<WebhookEventDocument>,
  ) {}

  private getPeriodStart(period: Period): Date | null {
    const now = new Date();
    if (period === 'all') return null;
    if (period === 'week')
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (period === 'month')
      return new Date(now.getFullYear(), now.getMonth(), 1);
    return new Date(now.getFullYear(), 0, 1);
  }

  private formatDateKey(date: Date, period: Period): string {
    if (period === 'week' || period === 'month') {
      return date.toISOString().slice(0, 10);
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  async getRevenueAnalytics(period: Period = 'month'): Promise<Response> {
    try {
      const periodStart = this.getPeriodStart(period);
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const baseQuery = { type: 'earning', status: 'completed' };

      const [allTimeAgg, ytdAgg, mtdAgg, periodTxns, topProviders] =
        await Promise.all([
          this.transactionModel.aggregate([
            { $match: baseQuery },
            {
              $group: {
                _id: null,
                totalFees: { $sum: '$platformFee' },
                count: { $sum: 1 },
                gross: { $sum: '$amount' },
              },
            },
          ]),
          this.transactionModel.aggregate([
            { $match: { ...baseQuery, createdAt: { $gte: yearStart } } },
            {
              $group: {
                _id: null,
                totalFees: { $sum: '$platformFee' },
                count: { $sum: 1 },
              },
            },
          ]),
          this.transactionModel.aggregate([
            { $match: { ...baseQuery, createdAt: { $gte: monthStart } } },
            {
              $group: {
                _id: null,
                totalFees: { $sum: '$platformFee' },
                count: { $sum: 1 },
              },
            },
          ]),
          this.transactionModel
            .find(
              periodStart
                ? { ...baseQuery, createdAt: { $gte: periodStart } }
                : baseQuery,
            )
            .sort({ createdAt: 1 })
            .exec(),
          this.transactionModel.aggregate([
            {
              $match: periodStart
                ? { ...baseQuery, createdAt: { $gte: periodStart } }
                : baseQuery,
            },
            {
              $group: {
                _id: '$providerId',
                totalFees: { $sum: '$platformFee' },
                grossEarnings: { $sum: '$amount' },
                transactionCount: { $sum: 1 },
              },
            },
            { $sort: { totalFees: -1 } },
            { $limit: 5 },
            {
              $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'provider',
              },
            },
            {
              $unwind: { path: '$provider', preserveNullAndEmptyArrays: true },
            },
          ]),
        ]);

      const trendMap = new Map<string, number>();
      for (const txn of periodTxns) {
        const key = this.formatDateKey(
          new Date((txn as any).createdAt),
          period,
        );
        trendMap.set(key, (trendMap.get(key) || 0) + (txn.platformFee || 0));
      }

      const trend = Array.from(trendMap.entries()).map(([label, value]) => ({
        label,
        value,
      }));

      const allTime = allTimeAgg[0] || { totalFees: 0, count: 0, gross: 0 };
      const ytd = ytdAgg[0] || { totalFees: 0, count: 0 };
      const mtd = mtdAgg[0] || { totalFees: 0, count: 0 };

      return {
        success: true,
        data: {
          period,
          allTimeFees: allTime.totalFees,
          ytdFees: ytd.totalFees,
          mtdFees: mtd.totalFees,
          periodFees: periodTxns.reduce(
            (sum, t) => sum + (t.platformFee || 0),
            0,
          ),
          transactionCount: periodTxns.length,
          averageFeePerTransaction:
            periodTxns.length > 0
              ? periodTxns.reduce((sum, t) => sum + (t.platformFee || 0), 0) /
                periodTxns.length
              : 0,
          trend,
          topProviders: topProviders.map((p: any) => ({
            providerId: p._id,
            name: p.provider
              ? `${p.provider.firstName || ''} ${p.provider.lastName || ''}`.trim()
              : 'Unknown',
            email: p.provider?.email,
            totalFees: p.totalFees,
            grossEarnings: p.grossEarnings,
            transactionCount: p.transactionCount,
          })),
        },
        message: 'Revenue analytics retrieved',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch revenue analytics: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async getVerificationAnalytics(period: Period = 'week'): Promise<Response> {
    try {
      const periodStart = this.getPeriodStart(period);

      const driverFilter = periodStart
        ? { updatedAt: { $gte: periodStart } }
        : {};
      const [chauffeurs, taxis] = await Promise.all([
        this.chauffeurModel.find(driverFilter).exec(),
        this.taxiModel.find(driverFilter).exec(),
      ]);

      const allRecords = [...chauffeurs, ...taxis];
      const approved = allRecords.filter((r) => r.status === 'approved');
      const rejected = allRecords.filter((r) => r.status === 'rejected');
      const pending = allRecords.filter(
        (r) => r.status === 'pending_admin_review',
      );
      const decided = approved.length + rejected.length;

      const approvalTimes = approved
        .map((r) => {
          const created = (r as any).createdAt
            ? new Date((r as any).createdAt).getTime()
            : 0;
          const updated = (r as any).updatedAt
            ? new Date((r as any).updatedAt).getTime()
            : 0;
          return updated > created
            ? (updated - created) / (1000 * 60 * 60 * 24)
            : null;
        })
        .filter((d): d is number => d !== null);

      const avgApprovalDays =
        approvalTimes.length > 0
          ? approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length
          : 0;

      const rejectionReasons: Record<string, number> = {};
      for (const record of rejected) {
        const reason = (record as any).rejectionReason || 'No reason provided';
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
      }

      const topRejectionReasons = Object.entries(rejectionReasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }));

      const resubmittedApproved = await this.chauffeurModel
        .countDocuments({
          status: 'approved',
          rejectionReason: { $exists: true, $ne: null },
        })
        .exec();
      const resubmittedApprovedTaxi = await this.taxiModel
        .countDocuments({
          status: 'approved',
          rejectionReason: { $exists: true, $ne: null },
        })
        .exec();
      const totalRejectedEver =
        rejected.length +
        (await this.chauffeurModel.countDocuments({
          status: { $ne: 'approved' },
          rejectionReason: { $exists: true },
        })) +
        (await this.taxiModel.countDocuments({
          status: { $ne: 'approved' },
          rejectionReason: { $exists: true },
        }));

      const resubmissionSuccessRate =
        totalRejectedEver > 0
          ? ((resubmittedApproved + resubmittedApprovedTaxi) /
              totalRejectedEver) *
            100
          : 0;

      return {
        success: true,
        data: {
          period,
          totalReviewed: allRecords.length,
          approved: approved.length,
          rejected: rejected.length,
          pending: pending.length,
          approvalRate: decided > 0 ? (approved.length / decided) * 100 : 0,
          averageApprovalDays: Math.round(avgApprovalDays * 10) / 10,
          topRejectionReasons,
          resubmissionSuccessRate:
            Math.round(resubmissionSuccessRate * 10) / 10,
        },
        message: 'Verification analytics retrieved',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch verification analytics: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async getUserAnalytics(period: Period = 'month'): Promise<Response> {
    try {
      const periodStart = this.getPeriodStart(period);
      const now = new Date();
      const thirtyDaysFromNow = new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000,
      );

      const [
        totalUsers,
        newSignups,
        suspended,
        banned,
        chauffeursActive,
        chauffeursInactive,
        taxisActive,
        taxisInactive,
        chauffeurs,
        taxis,
      ] = await Promise.all([
        this.userModel.countDocuments().exec(),
        periodStart
          ? this.userModel
              .countDocuments({ createdAt: { $gte: periodStart } })
              .exec()
          : this.userModel.countDocuments().exec(),
        this.userModel.countDocuments({ accountStatus: 'suspended' }).exec(),
        this.userModel.countDocuments({ accountStatus: 'banned' }).exec(),
        this.chauffeurModel
          .countDocuments({ isActive: true, status: 'approved' })
          .exec(),
        this.chauffeurModel
          .countDocuments({ isActive: false, status: 'approved' })
          .exec(),
        this.taxiModel
          .countDocuments({ isActive: true, status: 'approved' })
          .exec(),
        this.taxiModel
          .countDocuments({ isActive: false, status: 'approved' })
          .exec(),
        this.chauffeurModel
          .find({ status: 'approved' })
          .select('documentExpiries canAcceptRides')
          .exec(),
        this.taxiModel
          .find({ status: 'approved' })
          .select('documentExpiries canAcceptRides')
          .exec(),
      ]);

      let expiringIn30Days = 0;
      const countExpiring = (records: any[]) => {
        for (const record of records) {
          const expiries = record.documentExpiries || {};
          for (const doc of Object.values(expiries) as Array<{
            expiryDate?: Date | string;
          }>) {
            if (doc?.expiryDate) {
              const expiry = new Date(doc.expiryDate);
              if (expiry <= thirtyDaysFromNow && expiry >= now) {
                expiringIn30Days += 1;
                break;
              }
            }
          }
        }
      };
      countExpiring(chauffeurs);
      countExpiring(taxis);

      const totalDrivers =
        chauffeursActive + chauffeursInactive + taxisActive + taxisInactive;
      const inactiveDrivers = chauffeursInactive + taxisInactive;
      const churnRate =
        totalDrivers > 0 ? (inactiveDrivers / totalDrivers) * 100 : 0;

      return {
        success: true,
        data: {
          period,
          totalUsers,
          newSignups,
          suspended,
          banned,
          drivers: {
            active: chauffeursActive + taxisActive,
            inactive: inactiveDrivers,
            total: totalDrivers,
          },
          churnRate: Math.round(churnRate * 10) / 10,
          documentExpiryForecast: expiringIn30Days,
        },
        message: 'User analytics retrieved',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch user analytics: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async getQueueHealth(): Promise<Response> {
    try {
      const now = Date.now();
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

      const staleBefore = new Date(now - 5 * 60 * 1000);
      const [
        pendingChauffeurs,
        pendingTaxis,
        pendingParking,
        pendingIdentity,
        recentApprovals,
        recoveringWithdrawals,
        failedWebhooks,
        stuckWebhooks,
        disputedEarnings,
      ] = await Promise.all([
        this.chauffeurModel
          .find({ status: 'pending_admin_review' })
          .select('updatedAt')
          .lean()
          .exec(),
        this.taxiModel
          .find({ status: 'pending_admin_review' })
          .select('updatedAt')
          .lean()
          .exec(),
        this.parkingVerifModel.countDocuments({
          status: 'pending_admin_review',
        }),
        this.userModel.countDocuments({ identityStatus: 'pending' }),
        Promise.all([
          this.chauffeurModel.countDocuments({
            status: 'approved',
            updatedAt: { $gte: sevenDaysAgo },
          }),
          this.taxiModel.countDocuments({
            status: 'approved',
            updatedAt: { $gte: sevenDaysAgo },
          }),
        ]),
        this.transactionModel.countDocuments({
          type: 'withdrawal',
          status: {
            $in: [
              'transferring',
              'transfer_failed',
              'transferred',
              'payout_pending',
            ],
          },
        }),
        this.webhookEventModel.countDocuments({ status: 'failed' }),
        this.webhookEventModel.countDocuments({
          status: 'processing',
          processingStartedAt: { $lt: staleBefore },
        }),
        this.transactionModel.countDocuments({
          type: 'earning',
          status: { $in: ['disputed', 'refunded'] },
        }),
      ]);

      const pendingDriverRecords = [...pendingChauffeurs, ...pendingTaxis];
      const totalBacklog =
        pendingDriverRecords.length + pendingParking + pendingIdentity;

      const waitDays = pendingDriverRecords.map((r) => {
        const updated = (r as any).updatedAt
          ? new Date((r as any).updatedAt).getTime()
          : now;
        return (now - updated) / (1000 * 60 * 60 * 24);
      });

      const averageWaitDays =
        waitDays.length > 0
          ? waitDays.reduce((a, b) => a + b, 0) / waitDays.length
          : 0;
      const oldestPendingDays = waitDays.length > 0 ? Math.max(...waitDays) : 0;

      const approvalsPerDay = (recentApprovals[0] + recentApprovals[1]) / 7;
      const daysToClear =
        approvalsPerDay > 0
          ? Math.ceil(pendingDriverRecords.length / approvalsPerDay)
          : null;

      return {
        success: true,
        data: {
          backlog: {
            drivers: pendingDriverRecords.length,
            parking: pendingParking,
            identity: pendingIdentity,
            total: totalBacklog,
          },
          paymentOperations: {
            recoveringWithdrawals,
            failedWebhooks,
            stuckWebhooks,
            disputedEarnings,
            alerting:
              failedWebhooks > 0 || stuckWebhooks > 0 || disputedEarnings > 0,
          },
          averageWaitDays: Math.round(averageWaitDays * 10) / 10,
          oldestPendingDays: Math.round(oldestPendingDays * 10) / 10,
          approvalsPerDay: Math.round(approvalsPerDay * 10) / 10,
          estimatedDaysToClearQueue: daysToClear,
        },
        message: 'Queue health retrieved',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch queue health: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async getDashboardSummary(period: Period = 'month'): Promise<Response> {
    const [revenue, verifications, users, queue] = await Promise.all([
      this.getRevenueAnalytics(period),
      this.getVerificationAnalytics(period === 'month' ? 'week' : period),
      this.getUserAnalytics(period),
      this.getQueueHealth(),
    ]);

    return {
      success: true,
      data: {
        revenue: revenue.data,
        verifications: verifications.data,
        users: users.data,
        queue: queue.data,
      },
      message: 'Analytics dashboard summary retrieved',
    };
  }
}
