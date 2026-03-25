# Guards Documentation

Authentication and authorization guards used across the Ride and Park backend.

## Guard Catalog

- **AuthGuard** (`auth.guard.ts`): Verifies `Authorization: Bearer <jwt>` using `JWT_SECRET`, loads the user from MongoDB, and attaches it to `request.user`.
- **AdminGuard** (`admin.guard.ts`): Requires `request.user.role === 'admin'`. Must run after `AuthGuard`.
- **IdentityVerifiedGuard** (`identity-verified.guard.ts`): Requires `request.user.isVerified.identity === true` (passport or UK driving license).
- **DriverVerifiedGuard** (`taxi-verified.guard.ts`): Ensures the user has an approved taxi/driver record (`status: approved`, `isVerified: true`).
- **ActiveDriverGuard** (`active-taxi.guard.ts`): Ensures the user is an approved **and active** driver (`isActive: true`). If verified but inactive, it prompts activation.

## Usage Patterns

```typescript
@UseGuards(AuthGuard)
@Get('profile')
getProfile(@Req() req) {
  // req.user is available here
}

@UseGuards(AuthGuard, AdminGuard)
@Get('users')
findAllUsers() {/* admin-only list */}

@UseGuards(AuthGuard, IdentityVerifiedGuard, DriverVerifiedGuard)
@Post('rides/create')
createRide() {/* only verified drivers */}

@UseGuards(AuthGuard, ActiveDriverGuard)
@Post('rides/accept')
acceptRide() {/* driver must be active */}
```

Execution order follows the order in `@UseGuards(AuthGuard, ...)`.

## Module Registration (example)

```typescript
@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MongooseModule.forFeature([{ name: Taxi.name, schema: TaxiSchema }]),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    AuthGuard,
    AdminGuard,
    IdentityVerifiedGuard,
    DriverVerifiedGuard,
    ActiveDriverGuard,
  ],
})
export class UsersModule {}
```

## Common Pitfalls

- Missing `JWT_SECRET` in `.env` → `UnauthorizedException` from `AuthGuard`.
- Guard order incorrect → role/driver guards fail because `AuthGuard` did not attach `request.user`.
- Model injection missing in module → `Nest can't resolve dependencies` for guards that query Mongo (AuthGuard, DriverVerifiedGuard, ActiveDriverGuard).

## Quick REST Checks

```
### Missing token → 401
GET http://localhost:5000/users

### Admin-only → 403 for non-admin
GET http://localhost:5000/users
Authorization: Bearer <non_admin_token>

### Driver-only → 403 when no approved taxi record
POST http://localhost:5000/verification/taxi/status
Authorization: Bearer <user_token>
```

Last updated: 16/12/2025 (feature/login)
