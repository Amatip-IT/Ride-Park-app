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
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Taxi, TaxiDocument } from 'src/schemas/taxi.schema';
import { Chauffeur, ChauffeurDocument } from 'src/schemas/chauffeur.schema';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/taxi',
})
export class TaxiBookingsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Key: userId, Value: socketId[]
  private userSockets: Map<string, Set<string>> = new Map();

  constructor(
    @InjectModel(Taxi.name) private taxiModel: Model<TaxiDocument>,
    @InjectModel(Chauffeur.name) private chauffeurModel: Model<ChauffeurDocument>,
  ) {}

  handleConnection(client: Socket) {
    console.log(`Taxi client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.userSockets.forEach((sockets, userId) => {
      if (sockets.has(client.id)) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
    });
    console.log(`Taxi client disconnected: ${client.id}`);
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
    console.log(`Taxi user ${userId} authenticated with socket ${client.id}`);
  }

  @SubscribeMessage('join_ride')
  handleJoinRide(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { requestId: string },
  ) {
    const { requestId } = data;
    if (!requestId) return;

    client.join(`ride_${requestId}`);
    console.log(`Socket ${client.id} joined room: ride_${requestId}`);
  }

  @SubscribeMessage('leave_ride')
  handleLeaveRide(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { requestId: string },
  ) {
    const { requestId } = data;
    if (!requestId) return;

    client.leave(`ride_${requestId}`);
    console.log(`Socket ${client.id} left room: ride_${requestId}`);
  }

  @SubscribeMessage('update_location')
  async handleUpdateLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      requestId: string;
      driverId: string;
      lat: number;
      lng: number;
      rotation?: number;
    },
  ) {
    const { requestId, driverId, lat, lng, rotation } = data;
    if (!driverId || !lat || !lng) return;

    try {
      // 1. Update the driver's location in the database
      const updateData = {
        'location.coordinates': { lat, lng },
        'location.what3words': undefined, // Clear stale w3w
      };

      const [taxiRecord, chauffeurRecord] = await Promise.all([
        this.taxiModel.findOneAndUpdate({ user: driverId }, { $set: updateData }, { new: true }),
        this.chauffeurModel.findOneAndUpdate({ user: driverId }, { $set: updateData }, { new: true }),
      ]);

      console.log(`Updated coordinates for driver ${driverId} in DB to: (${lat}, ${lng})`);

      // 2. Broadcast coordinates to everyone in the ride room
      if (requestId) {
        this.server.to(`ride_${requestId}`).emit('driver_location_updated', {
          driverId,
          lat,
          lng,
          rotation: rotation || 0,
        });
      }
    } catch (error) {
      console.error('Failed to update live coordinates:', error);
    }
  }

  /**
   * Push a new ride request alert to a specific driver's connected sockets.
   */
  pushNewRequestToDriver(driverUserId: string, payload: any) {
    if (!this.server) return;

    const sockets = this.userSockets.get(driverUserId);
    if (sockets) {
      sockets.forEach((socketId) => {
        this.server.to(socketId).emit('new_ride_request', payload);
      });
    }
  }

  /**
   * Helper method to push status updates from the HTTP service directly to WebSocket clients
   */
  pushRequestUpdate(requestId: string, payload: any) {
    if (!this.server) {
      console.warn('WebSocket server not initialized yet.');
      return;
    }
    this.server.to(`ride_${requestId}`).emit('request_updated', payload);
    console.log(`Pushed real-time update to room ride_${requestId}: status = ${payload.status}`);
  }
}
