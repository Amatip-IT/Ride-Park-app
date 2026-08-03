import { UsersService } from './users.service';

describe('UsersService taxi registration', () => {
  it('persists taxiType on the user and generated Taxi record', async () => {
    let persistedUser: Record<string, unknown> = {};
    const profile = { _id: '507f1f77bcf86cd799439011', role: 'taxi_driver' };
    const findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    const findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(profile),
      }),
    });

    class MockUserModel {
      static findOne = findOne;
      static findById = findById;
      _id = '507f1f77bcf86cd799439011';

      constructor(data: Record<string, unknown>) {
        persistedUser = data;
      }

      save() {
        return Promise.resolve(undefined);
      }
    }

    let persistedTaxi: unknown;
    const taxiModel = {
      create: jest.fn((record: unknown) => {
        persistedTaxi = record;
        return Promise.resolve({});
      }),
    };
    const service = new UsersService(
      MockUserModel as never,
      taxiModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.createUser({
      firstName: 'Taxi',
      lastName: 'Driver',
      username: 'taxi_driver_1',
      email: 'taxi@example.com',
      phoneNumber: '+447123456789',
      password: 'StrongPass1!',
      termsAccepted: true,
      role: 'taxi_driver',
      idType: 'driver_license',
      taxiType: 'Mini Bus',
      vehicleMake: 'Ford',
      vehicleModel: 'Transit',
      vehicleColor: 'White',
      plateNumber: 'AB12CDE',
    });

    expect(result.success).toBe(true);
    expect(persistedUser).toMatchObject({
      role: 'taxi_driver',
      taxiType: 'Mini Bus',
      identityStatus: 'pending',
    });
    expect(taxiModel.create).toHaveBeenCalledTimes(1);
    expect(persistedTaxi).toMatchObject({
      user: '507f1f77bcf86cd799439011',
      vehicleInfo: {
        type: 'Mini Bus',
        make: 'Ford',
        model: 'Transit',
      },
    });
  });
});
