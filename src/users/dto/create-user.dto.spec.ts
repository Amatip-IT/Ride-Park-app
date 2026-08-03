import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateUserDto } from './create-user.dto';

describe('CreateUserDto taxi registration contract', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const metadata = {
    type: 'body' as const,
    metatype: CreateUserDto,
    data: '',
  };
  const validTaxiRegistration = {
    firstName: 'Taxi',
    lastName: 'Driver',
    username: 'taxi_driver_1',
    email: 'taxi@example.com',
    phoneNumber: '+447123456789',
    password: 'StrongPass1!',
    termsAccepted: true,
    role: 'taxi_driver',
    idType: 'driver_license',
    taxiType: 'Normal car',
    vehicleMake: 'Toyota',
    vehicleModel: 'Prius',
    vehicleColor: 'Black',
    plateNumber: 'AB12CDE',
  };

  it('accepts a supported taxiType', async () => {
    const result: unknown = await pipe.transform(
      validTaxiRegistration,
      metadata,
    );
    expect(result).toMatchObject({
      role: 'taxi_driver',
      taxiType: 'Normal car',
    });
  });

  it('continues to reject client-controlled identityStatus', async () => {
    await expect(
      pipe.transform(
        { ...validTaxiRegistration, identityStatus: 'verified' },
        metadata,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
