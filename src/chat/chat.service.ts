import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from 'src/schemas/message.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { Response } from 'src/common/interfaces/response.interface';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /**
   * Save a new message from the WebSocket gateway
   */
  async saveMessage(data: {
    senderId: string;
    recipientId: string;
    bookingId?: string;
    content: string;
  }): Promise<any> {
    const msg = new this.messageModel({
      sender: data.senderId,
      recipient: data.recipientId,
      bookingId: data.bookingId,
      content: data.content,
      isRead: false,
    });
    
    await msg.save();
    return this.messageModel.findById(msg._id)
      .populate('sender', 'firstName lastName')
      .populate('recipient', 'firstName lastName')
      .exec();
  }

  /**
   * Get Recent Chats for a user (grouped by the other participant)
   */
  async getRecentChats(userId: string): Promise<Response> {
    try {
      const uId = new Types.ObjectId(userId);
      
      // Get all messages where user is sender or recipient
      const messages = await this.messageModel.aggregate([
        {
          $match: {
            $or: [{ sender: uId }, { recipient: uId }],
          },
        },
        // Sort by newest first
        { $sort: { createdAt: -1 } },
        // Group by the *other* user
        {
          $group: {
            _id: {
              $cond: [
                { $eq: ['$sender', uId] },
                '$recipient',
                '$sender',
              ],
            },
            latestMessage: { $first: '$$ROOT' },
            unreadCount: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$recipient', uId] }, { $eq: ['$isRead', false] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);
      
      // Populate the other user's info
      const populatedChats = await this.userModel.populate(messages, {
        path: '_id',
        select: 'firstName lastName email role',
      });
      
      const formattedChats = populatedChats.map((chat: any) => ({
        user: chat._id,
        latestMessage: chat.latestMessage,
        unreadCount: chat.unreadCount,
      })).sort((a: any, b: any) => b.latestMessage.createdAt - a.latestMessage.createdAt);

      return {
        success: true,
        data: formattedChats,
        message: 'Recent chats retrieved successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to retrieve chats: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get conversation history between current user and another user
   */
  async getConversation(userId: string, otherUserId: string, bookingId?: string): Promise<Response> {
    try {
      const matchCriteria: any = {
        $or: [
          { sender: userId, recipient: otherUserId },
          { sender: otherUserId, recipient: userId },
        ],
      };
      
      if (bookingId) {
        matchCriteria.bookingId = bookingId;
      }

      const messages = await this.messageModel
        .find(matchCriteria)
        .sort({ createdAt: 1 }) // Chronological order
        .populate('sender', 'firstName lastName')
        .populate('recipient', 'firstName lastName')
        .exec();

      // Mark unread messages as read
      await this.messageModel.updateMany(
        { recipient: userId, sender: otherUserId, isRead: false },
        { $set: { isRead: true } }
      );

      return {
        success: true,
        data: messages,
        message: 'Conversation retrieved',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to retrieve conversation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Mark messages from a specific user as read
   */
  async markAsRead(userId: string, senderId: string): Promise<Response> {
    try {
      await this.messageModel.updateMany(
        { recipient: userId, sender: senderId, isRead: false },
        { $set: { isRead: true } }
      );
      
      return {
        success: true,
        message: 'Messages marked as read',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to mark messages as read',
      };
    }
  }
}
