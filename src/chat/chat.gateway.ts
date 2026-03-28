import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Map user IDs to their socket IDs so we can route messages
  // Key: userId, Value: socketId[] (a user might have multiple devices connected)
  private userSockets: Map<string, Set<string>> = new Map();

  constructor(private readonly chatService: ChatService) {}

  handleConnection(client: Socket) {
    // In a production app, we would extract the JWT from the handshake,
    // verify it here, and reject the connection if invalid.
    // For simplicity in this implementation, we rely on the client emitting an 'authenticate' event.
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    // Remove the socket from any user mapping
    this.userSockets.forEach((sockets, userId) => {
      if (sockets.has(client.id)) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
    });
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('authenticate')
  handleAuthenticate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string },
  ) {
    const { userId } = data;
    if (!userId) return;

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);
    console.log(`User ${userId} authenticated with socket ${client.id}`);
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      senderId: string;
      recipientId: string;
      bookingId?: string;
      content: string;
    },
  ) {
    try {
      // 1. Save message to DB
      const message = await this.chatService.saveMessage(data);

      // 2. Determine who to notify
      const recipientSockets = this.userSockets.get(data.recipientId);

      // 3. Emit message to the recipient if they are online
      if (recipientSockets && recipientSockets.size > 0) {
        recipientSockets.forEach((socketId) => {
          this.server.to(socketId).emit('receive_message', message);
        });
      }

      // 4. Echo the message back to the sender so their UI can confirm it was processed securely
      // Send to all of sender's connected devices
      const senderSockets = this.userSockets.get(data.senderId);
      if (senderSockets && senderSockets.size > 0) {
        senderSockets.forEach((socketId) => {
          this.server.to(socketId).emit('message_sent', message);
        });
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      client.emit('error', { message: 'Failed to send message' });
    }
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; senderId: string },
  ) {
    await this.chatService.markAsRead(data.userId, data.senderId);
    
    // Optionally notify the sender that their messages were read
    const senderSockets = this.userSockets.get(data.senderId);
    if (senderSockets && senderSockets.size > 0) {
      senderSockets.forEach((socketId) => {
        this.server.to(socketId).emit('messages_read', { readBy: data.userId });
      });
    }
  }
}
