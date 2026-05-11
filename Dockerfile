# ---------- Stage 1: Build ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build the NestJS app
RUN npm run build


# ---------- Stage 2: Production ----------
FROM node:20-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy only necessary files
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# ✅ COPY EMAIL TEMPLATES (THIS IS WHAT YOU MISSED)
#COPY --from=builder /app/src/email/templates ./src/email/templates
# ✅ Copy required runtime source folders (your fix)
#COPY --from=builder /app/src/email ./src/email
#COPY --from=builder /app/src/verification ./src/verification
#COPY --from=builder /app/src/common ./src/common
COPY --from=builder /app/src ./src


# Set permissions
RUN chown -R appuser:appgroup /app

USER appuser

# Expose port
EXPOSE 5005

# Security: disable root signals abuse
ENV NODE_ENV=production

CMD ["node", "dist/src/main.js"]
