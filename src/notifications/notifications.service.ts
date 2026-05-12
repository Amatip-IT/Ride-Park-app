import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification, NotificationDocument } from 'src/schemas/notification.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { Response } from 'src/common/interfaces/response.interface';

// Type for ExpoPushMessage
type ExpoPushMessage = {
  to: string | string[];
  data?: object;
  title?: string;
  body?: string;
  sound?: 'default' | null;
  ttl?: number;
  expiration?: number;
  priority?: 'default' | 'normal' | 'high';
  badge?: number;
  channelId?: string;
  categoryId?: string;
  mutableContent?: boolean;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private expo: any;

  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    this.initExpo();
  }

  private async initExpo() {
    try {
      const { Expo } = await import('expo-server-sdk');
      this.expo = new Expo();
    } catch (e) {
      this.logger.error('Failed to import expo-server-sdk dynamically', e);
    }
  }

  /**
   * Internal method to create and send a notification
   */
  async sendNotification(
    userId: string,
    title: string,
    body: string,
    type: 'ride' | 'booking' | 'payment' | 'system' | 'promo',
    data?: Record<string, any>
  ): Promise<void> {
    try {
      // 1. Save to database
      const notification = new this.notificationModel({
        userId,
        title,
        body,
        type,
        data,
      });
      await notification.save();

      // 2. Fetch user to get pushToken
      const user = await this.userModel.findById(userId).exec();
      if (!user || !user.pushToken) {
        this.logger.warn(`User ${userId} does not have a push token`);
        return;
      }

      // Check if expo is initialized
      if (!this.expo) {
        this.logger.error('Expo SDK not initialized');
        return;
      }

      // 3. Send via Expo Push Notifications
      const messages: ExpoPushMessage[] = [{
        to: user.pushToken,
        sound: 'default',
        title,
        body,
        data: { ...data, notificationId: notification._id },
      }];

      const chunks = this.expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          await this.expo.sendPushNotificationsAsync(chunk);
        } catch (error) {
          this.logger.error('Error sending push notification chunk', error);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to send notification: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all notifications for a user
   */
  async getMyNotifications(userId: string): Promise<Response> {
    try {
      const notifications = await this.notificationModel
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(50)
        .exec();

      return {
        success: true,
        data: notifications,
        message: 'Notifications retrieved',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retrieve notifications',
      };
    }
  }

  /**
   * Mark a specific notification as read
   */
  async markAsRead(userId: string, notificationId: string): Promise<Response> {
    try {
      const notification = await this.notificationModel.findOneAndUpdate(
        { _id: notificationId, userId },
        { read: true },
        { new: true }
      );

      if (!notification) {
        return { success: false, message: 'Notification not found' };
      }

      return { success: true, data: notification, message: 'Marked as read' };
    } catch (error) {
      return { success: false, message: 'Failed to mark as read' };
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string): Promise<Response> {
    try {
      await this.notificationModel.updateMany(
        { userId, read: false },
        { read: true }
      );
      return { success: true, message: 'All notifications marked as read' };
    } catch (error) {
      return { success: false, message: 'Failed to mark all as read' };
    }
  }
}
