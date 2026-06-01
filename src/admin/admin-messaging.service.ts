import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdminMessage,
  AdminMessageDocument,
} from 'src/schemas/admin-message.schema';
import {
  AdminMessageTemplate,
  AdminMessageTemplateDocument,
} from 'src/schemas/admin-message-template.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { Response } from 'src/common/interfaces/response.interface';
import { NotificationsService } from 'src/notifications/notifications.service';
import { EmailService } from 'src/verification/services/email/email.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditContext } from './admin-audit.types';

const DEFAULT_TEMPLATES = [
  {
    name: 'Documents Expiring Soon',
    category: 'expiry',
    subject: 'Action Required: Document Renewal',
    body:
      'Your document is expiring soon. Please upload a renewed copy through the app to continue accepting rides without interruption.',
  },
  {
    name: 'Resubmit Rejected Document',
    category: 'rejection',
    subject: 'Please Resubmit Your Document',
    body:
      'One or more of your submitted documents were rejected. Please review the feedback in the app and upload corrected documents.',
  },
  {
    name: 'Account Suspended',
    category: 'suspension',
    subject: 'Account Suspension Notice',
    body:
      'Your account has been temporarily suspended. Please contact support if you believe this was done in error.',
  },
  {
    name: 'Earnings Ready to Withdraw',
    category: 'earnings',
    subject: 'Your Earnings Are Ready',
    body:
      'Great news! Your earnings are available in your wallet and ready to withdraw. Open the app to request a payout.',
  },
  {
    name: 'Verification Under Review',
    category: 'general',
    subject: 'Application Update',
    body:
      'Thank you for your submission. Our team is reviewing your application and will notify you once a decision is made.',
  },
];

@Injectable()
export class AdminMessagingService {
  private readonly logger = new Logger(AdminMessagingService.name);

  constructor(
    @InjectModel(AdminMessage.name)
    private messageModel: Model<AdminMessageDocument>,
    @InjectModel(AdminMessageTemplate.name)
    private templateModel: Model<AdminMessageTemplateDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
    private auditService: AdminAuditService,
  ) {}

  async ensureDefaultTemplates(): Promise<void> {
    const count = await this.templateModel.countDocuments().exec();
    if (count > 0) return;

    await this.templateModel.insertMany(DEFAULT_TEMPLATES);
  }

  async getTemplates(): Promise<Response> {
    try {
      await this.ensureDefaultTemplates();
      const templates = await this.templateModel
        .find({ isActive: true })
        .sort({ category: 1, name: 1 })
        .exec();

      return {
        success: true,
        data: templates,
        message: `Found ${templates.length} message templates`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch templates: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async createTemplate(
    input: {
      name: string;
      category: string;
      subject: string;
      body: string;
    },
    adminId?: string,
    audit?: AdminAuditContext,
  ): Promise<Response> {
    try {
      const template = await this.templateModel.create({
        ...input,
        createdBy: adminId,
      });

      await this.auditService.log(audit, {
        action: 'create_message_template',
        targetType: 'message_template',
        targetId: template._id.toString(),
        newValue: { name: input.name, category: input.category },
      });

      return {
        success: true,
        data: template,
        message: 'Message template created',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create template: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async sendMessage(
    input: {
      userId: string;
      message: string;
      subject?: string;
      type?: 'system' | 'email' | 'push' | 'all';
      templateId?: string;
    },
    adminId?: string,
    audit?: AdminAuditContext,
  ): Promise<Response> {
    try {
      const user = await this.userModel.findById(input.userId).exec();
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      const channel = input.type || 'system';
      const subject = input.subject || 'Message from Gleezip Admin';
      let templateName: string | undefined;

      if (input.templateId) {
        const template = await this.templateModel.findById(input.templateId).exec();
        if (template) {
          templateName = template.name;
        }
      }

      let pushSent = false;
      let emailSent = false;
      let failureReason: string | undefined;

      const shouldPush = channel === 'system' || channel === 'push' || channel === 'all';
      const shouldEmail = channel === 'email' || channel === 'all';

      if (shouldPush) {
        try {
          await this.notificationsService.sendNotification(
            input.userId,
            subject,
            input.message,
            'system',
            { source: 'admin_message' },
          );
          pushSent = true;
        } catch (err) {
          failureReason = `Push failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
          this.logger.warn(failureReason);
        }
      }

      if (shouldEmail) {
        try {
          await this.emailService.sendMail({
            to: user.email,
            subject,
            html: `<p>Hi ${user.firstName},</p><p>${input.message.replace(/\n/g, '<br/>')}</p><p>Best regards,<br/>Gleezip Admin Team</p>`,
          });
          emailSent = true;
        } catch (err) {
          const emailErr = `Email failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
          failureReason = failureReason ? `${failureReason}; ${emailErr}` : emailErr;
          this.logger.warn(emailErr);
        }
      }

      const deliveryStatus =
        (shouldPush && !pushSent && !shouldEmail) ||
        (shouldEmail && !emailSent && !shouldPush) ||
        ((shouldPush && !pushSent) && (shouldEmail && !emailSent))
          ? 'failed'
          : pushSent || emailSent || channel === 'system'
            ? 'sent'
            : 'failed';

      const record = await this.messageModel.create({
        admin: adminId,
        userId: input.userId,
        message: input.message,
        subject,
        channel,
        deliveryStatus,
        templateId: input.templateId,
        templateName,
        pushSent,
        emailSent,
        failureReason,
      });

      await this.auditService.log(audit, {
        action: 'send_admin_message',
        targetType: 'user',
        targetId: input.userId,
        newValue: { channel, deliveryStatus, templateName },
        notes: input.message.slice(0, 200),
      });

      return {
        success: deliveryStatus !== 'failed',
        data: record,
        message:
          deliveryStatus === 'failed'
            ? `Message saved but delivery failed: ${failureReason || 'Unknown error'}`
            : `Message sent to ${user.firstName} ${user.lastName}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async getMessageHistory(
    userId: string,
    filters?: { q?: string; page?: number; limit?: number },
  ): Promise<Response> {
    try {
      const page = Math.max(1, filters?.page || 1);
      const limit = Math.min(50, Math.max(1, filters?.limit || 20));
      const skip = (page - 1) * limit;

      const query: Record<string, unknown> = { userId };
      if (filters?.q?.trim()) {
        query.message = { $regex: filters.q.trim(), $options: 'i' };
      }

      const [messages, total] = await Promise.all([
        this.messageModel
          .find(query)
          .populate('admin', 'firstName lastName email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.messageModel.countDocuments(query).exec(),
      ]);

      return {
        success: true,
        data: messages,
        message: `Found ${total} message(s)`,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch message history: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
