import { Controller, Get, Param, Query, Req, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ChatService } from './chat.service';
import { AuthGuard } from 'src/guards/auth.guard';

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * GET /chat/my-chats
   * Get a list of users the current user is chatting with,
   * along with the latest message and unread count.
   */
  @Get('my-chats')
  async getMyChats(@Req() req: any) {
    const user = req.user;
    return this.chatService.getRecentChats(user._id || user.id);
  }

  /**
   * GET /chat/conversation/:otherUserId
   * Get list of messages with another user
   * optionally filter by bookingId
   */
  @Get('conversation/:otherUserId')
  async getConversation(
    @Req() req: any,
    @Param('otherUserId') otherUserId: string,
    @Query('bookingId') bookingId?: string
  ) {
    const user = req.user;
    return this.chatService.getConversation(user._id || user.id, otherUserId, bookingId);
  }
}
