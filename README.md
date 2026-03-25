# Ride and Park Backend

A backend API for the Ride and Park application built with [NestJS](https://nestjs.com/) - a progressive Node.js framework for building efficient and scalable server-side applications.

## Table of Contents

- [Description](#description)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Testing](#testing)
- [Technology Stack](#technology-stack)
- [Modules Documentation](#modules-documentation)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Description

This is the backend API for the Ride and Park application. It provides RESTful endpoints for managing users, authentication, and other core functionalities.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js) or **yarn**
- **Git** - [Download here](https://git-scm.com/)
- **MongoDB** (v6 or higher) - [Download here](https://www.mongodb.com/try/download/community) or use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (cloud)

To verify your installations, run:

```bash
node --version
npm --version
mongod --version  # If using local MongoDB
```

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Amatip-IT/ride_and_park_backend.git
cd ride_and_park_backend
```

### 2. Install Dependencies

```bash
npm install
```

This will install all the required dependencies listed in `package.json`.

### 3. Configure Environment Variables

Create a `.env` file in the root directory and add the following variables:

```env
# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/ride_and_park

# Or use MongoDB Atlas (cloud)
# MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/ride_and_park?retryWrites=true&w=majority

# Server Configuration
PORT=5000

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production

# Email (Gmail SMTP) - required for email OTP and welcome emails
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-16-char-app-password

# Twilio SMS (optional but required for phone OTP)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890

# Stripe Identity (ID Verification)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# DVLA + MOT (UK Vehicle Verification)
DVLA_API_KEY=dvla_api_key
MOT_API_KEY=mot_api_key
MOT_CLIENT_ID=mot_client_id
MOT_CLIENT_SECRET=mot_client_secret
MOT_SCOPE_URL=mot_scope_url
MOT_TENANT_ID=mot_tenant_id

# ☁ AWS S3 for File Storage
AWS_ACCESS_KEY_ID=aws_access_key_id
AWS_SECRET_ACCESS_KEY=aws_secret_acess_key
AWS_REGION=aws_region
AWS_S3_BUCKET=aws_s3_bucket_name
```

**Important Notes:**

- For **local MongoDB**: Ensure MongoDB is running on your machine (`mongod` service).
- For **MongoDB Atlas**:
  1. Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
  2. Get your connection string from the Atlas dashboard
  3. Replace `<username>` and `<password>` with your database credentials
  4. Whitelist your IP address in Atlas Network Access settings
- For **JWT_SECRET**: Use a strong, random string in production. Generate one with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- **Email verification/login OTP** requires valid Gmail app credentials (`GMAIL_USER`, `GMAIL_APP_PASSWORD`).
- **Phone verification OTP** requires Twilio credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`). Without them, SMS features will be disabled.
- **Identity verification** requires Stripe Identity credentials (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`). Without them, ID verification features will be disabled.
- **Taxi verification** requires DVLA/MOT credentials (`DVLA_API_KEY, MOT_API_KEY, MOT_CLIENT_ID, MOT_CLIENT_SECRET, MOT_SCOPE_URL, MOT_TENANT_ID`). Without them, driver onboarding features will be disabled.
- **File upload** requires AWS credentials (`AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET`). Without them, File upload features will be disabled.

## Environment Setup

### 4. Database Setup

The application uses MongoDB with Mongoose ODM. The database connection is configured in `src/database/database.module.ts`:

- **ConfigModule** loads environment variables from `.env`
- **MongooseModule.forRootAsync** establishes the database connection using the `MONGODB_URI`
- Connection is automatically established when the application starts

**Database Features:**

- Automatic connection management
- Schema validation using Mongoose schemas
- Type-safe database operations
- Connection pooling and retry logic
- Password hashing using bcrypt (automatic on save)

### 5. User Schema

The User schema includes the following fields:

```typescript
- firstName (required): User's first name
- lastName (required): User's last name
- username (required, unique): User's username
- email (required, unique): User's email with validation
- phoneNumber (required): International format (e.g., +1234567890)
- password (required, hashed): User's password (automatically hashed before saving)
- role (default: 'user'): Either 'user' or 'admin'
- createdAt: Automatically set on creation
- updatedAt: Automatically updated on modification
```

**Password Security:**

- Passwords are automatically hashed using bcrypt before saving to the database
- Password field is excluded from query results by default (use `.select('+password')` to retrieve)
- Passwords should never be transmitted in plain text over HTTP (always use HTTPS in production)

## Authentication & Security

The application uses JWT (JSON Web Tokens) for authentication and role-based access control (RBAC) for authorization.

**For detailed documentation on authentication and guards, see:**

- [Guard Documentation](src/guards/GUARD.README.md) - JWT authentication, admin, identity-verified, driver-verified, and active-driver guards

**For detailed documentation on user endpoints and operations, see:**

- [Users Module Documentation](src/users/USER.README.md) - User registration, login (password + optional email OTP), and admin-only listing

## Running the Application

### Development Mode (with hot-reload)

```bash
npm run start:dev
```

The server will start on `http://localhost:5000` and automatically restart when you make changes to the code.

### Production Mode

```bash
# Build the application
npm run build

# Run the production build
npm run start:prod
```

### Standard Mode

```bash
npm run start
```

### Debug Mode

```bash
npm run start:debug
```

This runs the application in debug mode, allowing you to attach a debugger (port 9229).

## Testing API Endpoints

This project includes `.rest` files for testing API endpoints directly from VS Code.

### Setup

1. **Install the REST Client Extension** (if not already installed)
   - Open VS Code
   - Go to Extensions (Ctrl+Shift+X or Cmd+Shift+X)
   - Search for "REST Client" by Huachao Mao
   - Click Install

2. **Open any .rest File corresponding to the routes you want to test. e.g users.rest for users endpoints**
   - Navigate to the root directory
   - Open `.rest` file

### API Testing

For complete endpoint documentation and testing examples, see:

- [Users Module Documentation](src/users/USER.README.md) - Registration, password login, and optional OTP login
- [Guard Documentation](src/guards/GUARD.README.md) - Testing guards with examples
- [Email Verification Documentation](src/verification/email/VERIFICATION.README.md) - Email verification + login OTP flows
- [Phone Verification Documentation](src/verification/phone/VERIFICATION.README.md) - SMS verification flows (Twilio)
- [Identity Verification Documentation](src/verification/identity/VERIFICATION.README.md) - Stripe Identity flows
- [Taxi Verification Documentation](src/verification/taxi/VERIFICATION.README.md) - Taxi/driver onboarding (DVLA + MOT) with file uploads
- REST examples: `.rests/*.rest`

**Note:** You can also use tools like [Postman](https://www.postman.com/) or [Insomnia](https://insomnia.rest/) to test these endpoints.

## Project Structure

```
ride_and_park_backend/
├── src/
│   ├── common/                    # Shared interfaces and utilities
│   │   └── interfaces/
│   │       └── response.interface.ts  # Standard API response format
│   ├── database/                  # Database configuration
│   │   ├── database.module.ts         # MongoDB connection setup
│   │   └── database.service.ts        # Database service
│   ├── email/                     # Email templates
│   │   └── templates/
│   │       ├── layouts/               # Email layout templates (Handlebars)
│   │       │   └── main.hbs
│   │       ├── partials/              # Reusable email components
│   │       │   ├── footer.hbs
│   │       │   └── header.hbs
│   │       ├── otp.hbs                # OTP email template
│   │       └── welcome.hbs            # Welcome email template
│   ├── guards/                    # Authentication & authorization guards
│   │   ├── auth.guard.ts              # JWT authentication guard (attaches user)
│   │   ├── admin.guard.ts             # Admin role check guard
│   │   ├── identity-verified.guard.ts # Identity verification check
│   │   ├── taxi-verified.guard.ts     # Driver verification check (approved taxi)
│   │   ├── active-taxi.guard.ts       # Active driver status check
│   │   └── GUARD.README.md            # Guards documentation
│   ├── schemas/                   # Mongoose schemas (MongoDB models)
│   │   ├── user.schema.ts             # User account schema
│   │   ├── user-settings-schema.ts    # User preferences and settings
│   │   ├── verified-status.schema.ts  # User verification status tracking
│   │   ├── otp.schema.ts              # OTP (One-Time Password) records
│   │   ├── identity-verification.schema.ts  # Identity verification data
│   │   ├── taxi.schema.ts                   # Taxi/driver verification data (includes MOT/DVLA checks)
│   │   ├── parking-verification.schema.ts   # Parking provider verification
│   │   └── SCHEMAS.README.md          # Schemas documentation
│   ├── users/                     # Users module
│   │   ├── users.controller.ts        # User endpoints (profile, settings)
│   │   ├── users.service.ts           # User business logic
│   │   ├── users.module.ts            # Users module configuration
│   │   └── USER.README.md             # Users documentation
│   ├── verification/              # Verification system (email, phone, identity, taxi)
│   │   ├── dto/                       # Data Transfer Objects for verification
│   │   │   ├── send-email-otp.dto.ts
│   │   │   ├── verify-email-otp.dto.ts
│   │   │   ├── send-phone-otp.dto.ts
│   │   │   ├── verify-phone-otp.dto.ts
│   │   │   ├── create-identity-session.dto.ts
│   │   │   └── apply-driver.dto.ts
│   │   ├── email/                     # Email verification module
│   │   │   ├── verification.controller.ts  # Email OTP endpoints
│   │   │   ├── verification.service.ts     # Email verification logic
│   │   │   └── VERIFICATION.README.md
│   │   ├── phone/                     # Phone verification module
│   │   │   ├── verification.controller.ts  # Phone OTP endpoints (Twilio)
│   │   │   ├── verification.service.ts     # Phone verification logic
│   │   │   └── VERIFICATION.README.md
│   │   ├── identity/                  # Identity verification module (Stripe Identity)
│   │   │   ├── verification.controller.ts  # Identity verification endpoints
│   │   │   ├── verification.service.ts     # Identity verification logic
│   │   │   └── VERIFICATION.README.md
│   │   ├── taxi/                      # Taxi verification module (DVLA + MOT checks)
│   │   │   ├── verification.controller.ts  # Taxi/driver application endpoints
│   │   │   ├── verification.service.ts     # Taxi verification logic
│   │   │   └── VERIFICATION.README.md
│   │   ├── services/                  # Third-party service integrations
│   │   │   ├── email/
│   │   │   │   └── email.service.ts       # Nodemailer service (send emails)
│   │   │   ├── phone/
│   │   │   │   └── twilio.service.ts      # Twilio SMS/phone verification
│   │   │   ├── identity/
│   │   │   │   └── stripe-identity.service.ts  # Stripe Identity API
│   │   │   ├── driver/
│   │   │   │   ├── dvla.service.ts        # UK DVLA vehicle checks (tax, registration)
│   │   │   │   └── mot.service.ts         # UK MOT history API (with OAuth2)
│   │   │   └── file/
│   │   │       └── file-upload.service.ts  # AWS S3 file uploads
│   │   └── verification.module.ts     # Root verification module
│   ├── app.controller.ts          # Main application controller
│   ├── app.module.ts              # Root module (imports all modules)
│   ├── app.service.ts             # Main application service
│   └── main.ts                    # Application entry point (port 3000)
├── utility/                       # Utility functions
│   ├── authUtilities.ts               # JWT token generation and validation
│   └── emailUtilities.ts              # Email helper functions
├── test/                          # E2E tests
│   ├── app.e2e-spec.ts
│   └── jest-e2e.json
├── .rests/                        # REST Client API testing files (VS Code extension)
│   ├── user.rest                      # User endpoints testing
│   ├── email-verification.rest        # Email verification endpoints
│   ├── phone-verification.rest        # Phone verification endpoints
│   ├── identity-verification.rest     # Identity verification endpoints
│   └── taxi-verification.rest         # Taxi verification endpoints
├── .env                           # Environment variables (create this - gitignored)
├── .prettierrc                    # Prettier code formatting config
├── eslint.config.mjs              # ESLint configuration
├── nest-cli.json                  # Nest CLI configuration
├── package.json                   # Project dependencies
├── tsconfig.json                  # TypeScript configuration
├── tsconfig.build.json            # TypeScript build configuration
└── README.md                      # Project documentation
```

## Available Scripts

| Script                | Description                               |
| --------------------- | ----------------------------------------- |
| `npm run start`       | Start the application                     |
| `npm run start:dev`   | Start in development mode with hot-reload |
| `npm run start:debug` | Start in debug mode                       |
| `npm run start:prod`  | Start in production mode                  |
| `npm run build`       | Build the application for production      |
| `npm run format`      | Format code using Prettier                |
| `npm run lint`        | Lint and fix code using ESLint            |
| `npm test`            | Run unit tests                            |
| `npm run test:watch`  | Run tests in watch mode                   |
| `npm run test:cov`    | Run tests with coverage report            |
| `npm run test:e2e`    | Run end-to-end tests                      |

## Testing

### Unit Tests

```bash
npm test
```

### Watch Mode (for development)

```bash
npm run test:watch
```

### Test Coverage

```bash
npm run test:cov
```

This generates a coverage report in the `coverage/` directory.

### End-to-End Tests

```bash
npm run test:e2e
```

## Technology Stack

- **Framework:** [NestJS](https://nestjs.com/) v11.0
- **Language:** [TypeScript](https://www.typescriptlang.org/) v5.7
- **Runtime:** [Node.js](https://nodejs.org/)
- **Database:** [MongoDB](https://www.mongodb.com/) v8.20 with [Mongoose](https://mongoosejs.com/) ODM
- **Authentication:** [JWT](https://jwt.io/) (JSON Web Tokens)
- **Password Hashing:** [bcrypt](https://www.npmjs.com/package/bcrypt)
- **Configuration:** [@nestjs/config](https://docs.nestjs.com/techniques/configuration) for environment variables
- **Testing:** [Jest](https://jestjs.io/) v30.0
- **Code Quality:** ESLint, Prettier
- **API Testing:** REST Client (VS Code extension)

## Modules Documentation

Each module has its own detailed documentation:

### Users Module

- **Location:** `src/users/`
- **Documentation:** [USER.README.md](src/users/USER.README.md)
- **Contents:** User endpoints, schema, service methods, examples, and best practices

### Guards

- **Location:** `src/guards/`
- **Documentation:** [GUARD.README.md](src/guards/GUARD.README.md)
- **Contents:** AuthGuard, AdminGuard, usage examples, and custom guard creation

### Database

- **Location:** `src/database/`
- **Description:** MongoDB connection setup with ConfigModule and Mongoose

### Schemas

- **Location:** `src/schemas/`
- **Description:** Mongoose schemas including User schema with bcrypt password hashing

### Verification

- **Location:** `src/verification/`
- **Documentation:**
  - [Email Verification](src/verification/email/VERIFICATION.README.md) — email verification + login OTP
  - [Phone Verification](src/verification/phone/VERIFICATION.README.md) — SMS OTP via Twilio
  - [Identity Verification](src/verification/identity/VERIFICATION.README.md) — Passport + Driver's License Verification
  - [Taxi Verification](src/verification/taxi/VERIFICATION.README.md) — DVLA + MOT check
- **REST Examples:** `.rests/*.rest`

## Troubleshooting

### Common Issues

**E11000 Duplicate Key Error**

- Occurs when trying to create a user with an email or username that already exists
- Solution: Use a unique email and username

**UnauthorizedException: Authorization header is missing**

- Occurs when accessing protected endpoints without authentication
- Solution: Include `Authorization: Bearer <token>` in request header

**ForbiddenException: Admin privileges required**

- Occurs when accessing admin-only endpoints with non-admin user
- Solution: Use an admin user's JWT token

**JWT_SECRET is not defined**

- Occurs when JWT_SECRET is missing from `.env`
- Solution: Add `JWT_SECRET=your_secret_key` to `.env` file

## Support

For issues or questions, please refer to the [NestJS Documentation](https://docs.nestjs.com/), [MongoDB Documentation](https://docs.mongodb.com/), or create an issue in the repository.

## License

This project is [UNLICENSED](LICENSE).
Last updated: 16/12/2025
By: [samamatip](https://github.com/samamatip)
