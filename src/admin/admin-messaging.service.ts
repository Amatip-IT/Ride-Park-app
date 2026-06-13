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

/** System templates admins send for common user journeys (upserted by name on each fetch). */
const DEFAULT_TEMPLATES: Array<{
  name: string;
  category: string;
  subject: string;
  body: string;
}> = [
  {
    name: 'Documents Submitted — Under Review',
    category: 'verification',
    subject: 'Your documents are under review',
    body:
      'Thank you for submitting your documents to Gleezip. Our team has received them and your application is now under review. You will receive another message once we have made a decision. No further action is needed right now.',
  },
  {
    name: 'Driver / Taxi Documents Under Review',
    category: 'verification',
    subject: 'Driver verification under review',
    body:
      'We have received your driver documents and they are now under admin review. You cannot accept rides until your verification is approved. We will notify you as soon as your account is cleared to go online.',
  },
  {
    name: 'Parking Application Under Review',
    category: 'verification',
    subject: 'Parking listing under review',
    body:
      'Thank you for submitting your parking space details. Your application is now under review by our team. Your listing will not appear to customers until it has been approved. We will contact you when the review is complete.',
  },
  {
    name: 'Identity Documents Under Review',
    category: 'verification',
    subject: 'Identity verification under review',
    body:
      'Your identity documents have been submitted successfully and are now under review. You will be notified once verification is complete. Please keep the app installed so you do not miss updates.',
  },
  {
    name: 'Verification Approved — Driver / Taxi',
    category: 'approval',
    subject: 'You are approved to accept rides',
    body:
      'Good news! Your driver verification has been approved. You can now go online in the app and accept ride requests. Thank you for completing the process with Gleezip.',
  },
  {
    name: 'Parking Space Approved',
    category: 'approval',
    subject: 'Your parking space is now live',
    body:
      'Congratulations! Your parking space has been approved and is now visible to customers on Gleezip. You can manage your listing and bookings from your provider dashboard.',
  },
  {
    name: 'Identity Verification Approved',
    category: 'approval',
    subject: 'Identity verification complete',
    body:
      'Your identity has been verified successfully. You now have full access to the provider features linked to your account. Thank you for helping us keep Gleezip safe.',
  },
  {
    name: 'Documents Rejected — Please Resubmit',
    category: 'rejection',
    subject: 'Action required: resubmit your documents',
    body:
      'Unfortunately, one or more of your submitted documents could not be approved. Please open the app, review the feedback, and upload corrected documents so we can continue your verification.',
  },
  {
    name: 'Parking Application Rejected',
    category: 'rejection',
    subject: 'Parking application not approved',
    body:
      'Your parking space application was not approved at this time. Please check the app for details, update your information or photos if needed, and resubmit when you are ready.',
  },
  {
    name: 'Documents Expiring Soon',
    category: 'expiry',
    subject: 'Action required: renew your documents',
    body:
      'One or more of your documents are expiring soon. Please upload renewed copies in the app as soon as possible so you can continue using Gleezip without interruption.',
  },
  {
    name: 'New Parking Booking Request',
    category: 'booking',
    subject: 'New booking request for your space',
    body:
      'A customer has sent a booking request for your parking space. Please open the app and accept or decline the request promptly so they know whether their spot is confirmed.',
  },
  {
    name: 'Booking Accepted — Customer',
    category: 'booking',
    subject: 'Your parking booking was accepted',
    body:
      'Your parking booking request has been accepted by the space owner. Open the app to view the details and plan your arrival.',
  },
  {
    name: 'Booking Declined — Customer',
    category: 'booking',
    subject: 'Your parking booking was not accepted',
    body:
      'Unfortunately, your parking booking request was not accepted. You can search for another available space in the app.',
  },
  {
    name: 'Earnings Ready to Withdraw',
    category: 'earnings',
    subject: 'Your earnings are ready',
    body:
      'You have earnings available in your Gleezip wallet. Open the app, go to Earnings, and request a withdrawal when you are ready.',
  },
  {
    name: 'Withdrawal Approved',
    category: 'earnings',
    subject: 'Your withdrawal has been processed',
    body:
      'Your withdrawal request has been approved and funds are being sent to your linked bank account. Processing times may vary depending on your bank.',
  },
  {
    name: 'Account Suspended',
    category: 'suspension',
    subject: 'Your account has been suspended',
    body:
      'Your Gleezip account has been temporarily suspended. If you believe this was a mistake, please contact support through the app.',
  },
  {
    name: 'Account Ban Notice',
    category: 'suspension',
    subject: 'Your account access has been restricted',
    body:
      'Your Gleezip account has been restricted due to a policy violation. Please contact support if you have questions about this decision.',
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

  /** Upsert system templates so new copy appears even when DB already has older templates. */
  async syncDefaultTemplates(): Promise<void> {
    for (const template of DEFAULT_TEMPLATES) {
      await this.templateModel.updateOne(
        { name: template.name },
        {
          $set: {
            category: template.category,
            subject: template.subject,
            body: template.body,
            isActive: true,
          },
        },
        { upsert: true },
      );
    }
  }

  async getTemplates(): Promise<Response> {
    try {
      await this.syncDefaultTemplates();
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
