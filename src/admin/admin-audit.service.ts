import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdminAuditLog,
  AdminAuditLogDocument,
} from 'src/schemas/admin-audit-log.schema';
import { Response } from 'src/common/interfaces/response.interface';
import {
  AdminAuditContext,
  CreateAuditLogInput,
} from './admin-audit.types';

@Injectable()
export class AdminAuditService {
  constructor(
    @InjectModel(AdminAuditLog.name)
    private auditLogModel: Model<AdminAuditLogDocument>,
  ) {}

  async log(
    context: AdminAuditContext | undefined,
    input: CreateAuditLogInput,
  ): Promise<void> {
    if (!context?.adminId) return;

    try {
      await this.auditLogModel.create({
        admin: context.adminId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        oldValue: input.oldValue ?? undefined,
        newValue: input.newValue ?? undefined,
        reason: input.reason,
        notes: input.notes,
        ipAddress: context.ipAddress,
      });
    } catch (error) {
      console.error('Failed to write admin audit log:', error);
    }
  }

  async getAuditLogs(filters: {
    action?: string;
    adminId?: string;
    targetId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }): Promise<Response> {
    try {
      const page = Math.max(1, filters.page || 1);
      const limit = Math.min(100, Math.max(1, filters.limit || 25));
      const skip = (page - 1) * limit;

      const query: Record<string, unknown> = {};
      if (filters.action) query.action = filters.action;
      if (filters.adminId) query.admin = filters.adminId;
      if (filters.targetId) query.targetId = filters.targetId;

      if (filters.from || filters.to) {
        query.createdAt = {};
        if (filters.from) {
          (query.createdAt as Record<string, Date>).$gte = new Date(filters.from);
        }
        if (filters.to) {
          (query.createdAt as Record<string, Date>).$lte = new Date(filters.to);
        }
      }

      const [logs, total] = await Promise.all([
        this.auditLogModel
          .find(query)
          .populate('admin', 'firstName lastName email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.auditLogModel.countDocuments(query).exec(),
      ]);

      return {
        success: true,
        data: logs,
        message: `Found ${total} audit log entries`,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch audit logs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async exportAuditLogsCsv(filters: {
    action?: string;
    adminId?: string;
    targetId?: string;
    from?: string;
    to?: string;
  }): Promise<Response> {
    const result = await this.getAuditLogs({ ...filters, page: 1, limit: 1000 });
    if (!result.success || !result.data) {
      return result;
    }

    const logs = result.data as AdminAuditLogDocument[];
    const header = 'timestamp,action,admin_email,target_type,target_id,reason,notes,ip_address';
    const rows = logs.map((log: any) => {
      const admin = log.admin || {};
      const adminEmail = admin.email || log.admin || '';
      const escape = (val: unknown) => {
        const str = val == null ? '' : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      };
      return [
        log.createdAt ? new Date(log.createdAt).toISOString() : '',
        escape(log.action),
        escape(adminEmail),
        escape(log.targetType),
        escape(log.targetId),
        escape(log.reason),
        escape(log.notes),
        escape(log.ipAddress),
      ].join(',');
    });

    return {
      success: true,
      data: { csv: [header, ...rows].join('\n'), count: logs.length },
      message: `Exported ${logs.length} audit log entries`,
    };
  }
}
