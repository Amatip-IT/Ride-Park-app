# Users Module Documentation

This directory contains the Users module for the Ride and Park backend, including controllers, services, DTOs, entities, and database operations.

# Module Overview

Users module covers registration, password-based login (with optional email OTP step), and admin-only listing/filtering of users. Update and delete endpoints are currently stubs.

## Structure

```
users/
├── users.controller.ts          # Endpoints (register, login, list)
├── users.service.ts             # Business logic + OTP-aware login
├── users.module.ts              # Module wiring
└── users.controller.spec.ts     # Unit tests
```

## Endpoints

### Register

- **POST** `/users/register`
- **Auth:** Public
- **Body:** `firstName`, `lastName`, `username`, `email` (unique, lowercase), `phoneNumber` (E.164), `password`
- **Behavior:** Creates a `role: user` account, hashes password via pre-save hook, returns user without password.
- **Errors:** Duplicate email/username → `400` with `User with the given email or username already exists`.

### Login

- **POST** `/users/login`
- **Auth:** Public (credentials)
- **Body:** `email`, `password`
- **Behavior:**
  - Validates password.
  - Updates `lastLoggedInAt`.
  - If user_settings.require_OTP_for_login is true **and** last login < 5 minutes ago → triggers email OTP (`verification.send-email-otp-login`) and responds `{ success: true, requiresOTP: true, data: { _id }, message: 'OTP verification required for login' }`.
  - Otherwise returns `{ success: true, requiresOTP: false, token, data, message: 'Login successful' }`.
- **Errors:** Invalid credentials → `{ success: false, message: 'Invalid email or password' }`.

### List Users

- **GET** `/users`
- **Auth:** `AuthGuard` + `AdminGuard`
- **Query filters (optional):** `role`, `username`, `firstName`, `lastName`
- **Response:** `{ success: true, data: User[], message }` (password omitted). Returns `success: false` when no users match filter.

### Unimplemented placeholders

`GET /users/:id`, `PATCH /users/:id`, `DELETE /users/:id` currently return placeholder strings in `UsersService`. Treat them as TODOs before exposing.

## Integration Notes

- Auth middleware: add `AuthGuard` (and `AdminGuard` for list) to controllers using this module.
- Tokens are created via `utility/authUtilities.generateToken` with `_id` and `role` claims.
- Password hashing happens in `UserSchema.pre('save')`; never return `password` in responses.

## Sample REST (VS Code REST Client)

```
### Register
POST http://localhost:5000/users/register
Content-Type: application/json

{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "username": "adal",
  "email": "ada@example.com",
  "phoneNumber": "+1234567890",
  "password": "StrongPass123!"
}

### Login (password)
POST http://localhost:5000/users/login
Content-Type: application/json

{
  "email": "ada@example.com",
  "password": "StrongPass123!"
}

### List users (admin only)
GET http://localhost:5000/users?role=user
Authorization: Bearer <admin_jwt_token>
```

Last updated: 16/12/2025 (feature/login)

---

## User Schema

The User schema is defined in `src/schemas/user.schema.ts`:

```typescript
@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true, unique: true })
  username: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  })
  email: string;

  @Prop({
    required: true,
    trim: true,
    match: /^\+?[1-9]\d{1,14}$/,
  })
  phoneNumber: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ default: 'user', required: true, enum: ['user', 'admin'] })
  role: string;
}
```

**Field Details:**

- `firstName`, `lastName`: Required text fields
- `username`, `email`: Unique fields (cannot duplicate)
- `email`: Must match valid email format, stored lowercase
- `phoneNumber`: International format validation
- `password`: Hashed automatically, excluded from queries by default
- `role`: Enum field, either 'user' or 'admin'
- `createdAt`, `updatedAt`: Automatically managed timestamps

---

## Common Issues

### "E11000 Duplicate Key Error"

**Cause:** Trying to create a user with email or username that already exists.

**Solution:**

- Use a unique email and username
- Check database for existing users: `GET /users`

---

### "User not found"

**Cause:** Accessing endpoint with invalid user ID.

**Solution:**

- Verify the user ID is correct
- Use `GET /users` to list all users and get valid IDs

---

### "Admin privileges required"

**Cause:** Accessing admin-only endpoint with non-admin user.

**Solution:**

- Use JWT token from an admin user
- Or request admin to perform the operation

---

## Best Practices

1. **Always include proper error handling** when calling user endpoints
2. **Store JWT tokens securely** on the client side (use httpOnly cookies if possible)
3. **Never log or expose passwords** - they are hashed for security
4. **Validate input data** before sending to API
5. **Use HTTPS in production** for all requests
6. **Rotate JWT_SECRET regularly** and update all tokens
7. **Implement rate limiting** to prevent brute force attacks

---

## References

- [Mongoose Documentation](https://mongoosejs.com/)
- [NestJS Controller Documentation](https://docs.nestjs.com/controllers)
- [NestJS Service Documentation](https://docs.nestjs.com/providers/services)

##

Last updated: 07/12/2025 By: Github.com/SamAmatip
