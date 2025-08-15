# CaseConWeb Project Recipe: Implementation Guide

This document provides a comprehensive guide to the architecture and implementation details of the CaseConWeb application.

---

## 1. System Architecture

### Backend (Node.js + Express)
- **Core Dependencies**:
  - Express.js: Web framework
  - Prisma: ORM for database operations
  - PostgreSQL: Primary database
  - Redis: Session management and caching
  - JWT: Authentication
  - Express Validator: Request validation
  - CORS: Cross-origin resource sharing
  - Morgan: HTTP request logging

- **Project Structure**:
  ```
  backend/
  ├── prisma/
  │   ├── schema.prisma    # Database schema
  │   └── migrations/      # Database migrations
  ├── src/
  │   ├── config/         # Configuration files
  │   ├── controllers/    # Route controllers
  │   ├── middleware/     # Custom middleware
  │   ├── models/         # Data models
  │   ├── routes/         # API routes
  │   ├── services/       # Business logic
  │   ├── utils/          # Utility functions
  │   ├── app.js          # Express app setup
  │   └── server.js       # Server entry point
  ├── .env               # Environment variables
  └── package.json
  ```

### Frontend (React + Vite)
- **Core Dependencies**:
  - React 18: UI library
  - Vite: Build tool and dev server
  - Tailwind CSS: Styling
  - Zustand: State management
  - Axios: HTTP client
  - XLSX: Excel file handling
  - React Router: Navigation

- **Project Structure**:
  ```
  frontend/
  ├── public/            # Static assets
  └── src/
      ├── assets/        # Images, fonts, etc.
      ├── components/    # Reusable UI components
      ├── layouts/       # Layout components
      ├── pages/         # Page components
      ├── store/         # State management
      ├── styles/        # Global styles
      ├── utils/         # Utility functions
      ├── App.jsx        # Main app component
      └── main.jsx       # Entry point
  ```

## 2. Key Features Implementation

### Authentication System
- JWT-based authentication with refresh tokens
- Protected routes on both frontend and backend
- Session management using Redis
- Role-based access control (RBAC)

### Data Processing Pipeline
1. **Data Ingestion**:
   - Excel/CSV file upload
   - Client-side parsing using XLSX
   - Data validation and normalization

2. **Data Processing**:
   - UID generation for clients and caregivers
   - Multi-caregiver resolution
   - Case number extraction and validation

3. **Comparison Engine**:
   - Fuzzy matching for names and case numbers
   - Confidence scoring for matches
   - Support for temporary and permanent corrections
   - Time checking (TimeCK) module provides canonical deviation badges used by Recon

### State Management
- **Zustand Stores**:
  - `authStore`: Authentication state and methods
  - `caseStore`: Case data and operations
  - `compareStore`: Comparison results and actions
  - `uiStore`: UI state and preferences

### API Layer
- RESTful endpoints with consistent response format
- Request validation and error handling
- Rate limiting and security headers
- Comprehensive API documentation (Swagger/OpenAPI)

## 3. Development Workflow

### Local Development
1. **Prerequisites**:
   - Node.js 18+
   - Docker and Docker Compose
   - Git

2. **Setup**:
   ```bash
   # Clone the repository
   git clone https://github.com/yourusername/CaseConWeb.git
   cd CaseConWeb

   # Start Docker services
   docker-compose -f docker-compose.dev.yml up -d

   # Install backend dependencies
   cd backend
   npm install
   npx prisma migrate dev
   
   # Install frontend dependencies
   cd ../frontend
   npm install
   
   # Start development servers
   cd ../backend && npm run dev
   cd ../frontend && npm run dev
   ```

3. **Development Scripts**:
   - `npm run dev`: Start development server with hot-reload
   - `npm run build`: Create production build
   - `npm run test`: Run tests
   - `npm run lint`: Run linter
   - `npm run format`: Format code with Prettier

### Testing Strategy
- Unit tests with Jest
- Integration tests with Supertest
- End-to-end tests with Cypress
- Test coverage reporting

## 4. Deployment

### Production Environment
- Docker-based deployment
- Environment-specific configurations
- Health checks and monitoring
- Logging and error tracking

### CI/CD Pipeline
- Automated testing on pull requests
- Docker image building and pushing
- Deployment to staging/production
- Database migrations

## 5. Security Considerations

### Authentication & Authorization
- JWT with short-lived access tokens
- Secure HTTP-only cookies for refresh tokens
- Rate limiting and request validation
- CORS configuration

### Data Protection
- Environment variables for sensitive data
- Input validation and sanitization
- SQL injection prevention with Prisma
- CSRF protection

### API Security
- Request validation
- Rate limiting
- Security headers
- Request/response logging

---

### Admin Desk Snapshot UX
- Default snapshot name uses local time: `Recon-MM-DD-YYYY- HH:MM`.
- Save opens a tag modal (Atlanta/Charlotte/Raleigh) and appends `[Tag]` to the name.
- Cancel aborts the save. Mirror this behavior in any workshop/demo component.

### Module Naming
- Results panel is now called TimeCKPanel across code, tabs, and exports (filename: `CaseConTimeCK.xlsx`).

---

**This recipe ensures CaseConWeb can be rebuilt or extended at any time, with all critical logic and workflow steps documented.**
