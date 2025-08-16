# CaseConWeb Backend

> Note: This document is superseded by MASTER_BLUEPRINT.md. For the authoritative, consolidated source, see [MASTER_BLUEPRINT.md](../MASTER_BLUEPRINT.md).

This is the backend service for the CaseConWeb application, providing a RESTful API for the frontend to interact with the database and handle business logic.

## Features

- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **Session Management**: Secure session handling with Redis for fast access
- **Case Management**: CRUD operations for cases with audit logging
- **Modular Architecture**: Clean separation of concerns with middleware and routes
- **Error Handling**: Comprehensive error handling and validation
- **Logging**: Request logging and audit trails

## Prerequisites

- Node.js (v16+)
- PostgreSQL
- Redis
- npm or yarn

## Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd CaseConWeb/backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn
   ```

3. **Set up environment variables**
   - Copy `.env.example` to `.env`
   - Update the values in `.env` with your configuration

4. **Set up the database**
   - Make sure PostgreSQL is running
   - Create a new database (default: `casecon`)
   - Run migrations:
     ```bash
     npx prisma migrate dev --name init
     ```

5. **Start Redis**
   - Make sure Redis is running on the configured port (default: 6379)

## Running the Application

### Development
```bash
npm run dev
# or
yarn dev
```

### Production
```bash
npm run build
npm start
```

## API Documentation

Once the server is running, you can access the API documentation at:
- Swagger UI: `http://localhost:5000/api-docs`
- OpenAPI Spec: `http://localhost:5000/api-docs.json`

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Port to run the server on | 5000 |
| NODE_ENV | Environment (development/production) | development |
| DATABASE_URL | PostgreSQL connection URL | - |
| REDIS_URL | Redis connection URL | redis://localhost:6379 |
| JWT_SECRET | Secret for JWT signing | - |
| SESSION_TTL | Session TTL in seconds | 3600 |

## Project Structure

```
backend/
├── src/
│   ├── config/         # Configuration files
│   ├── middleware/     # Express middleware
│   ├── routes/         # API route definitions
│   ├── utils/          # Utility functions
│   ├── index.js        # Application entry point
│   └── package.json    # Dependencies and scripts
└── prisma/
    └── schema.prisma  # Database schema
```

## Testing

To run tests:

```bash
npm test
# or
yarn test
```

## Deployment

For production deployment, make sure to:

1. Set `NODE_ENV=production`
2. Update all environment variables with production values
3. Use a process manager like PM2 or systemd
4. Set up HTTPS with a reverse proxy (Nginx, Apache)
5. Configure proper logging and monitoring

## License

[Your License Here]

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
