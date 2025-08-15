# CaseCon (Jovie Data Processor)

A professional-grade web application for reconciling case/shift data between BUCA and JOVIE sources with advanced comparison and reporting capabilities.

## 🚀 Tech Stack

### Frontend
- React 18 with functional components
- Vite for fast development and building
- Tailwind CSS for styling
- Zustand for state management
- Axios for API communication
- XLSX for Excel file handling

### Backend
- Node.js with Express
- Prisma ORM for database operations
- PostgreSQL for data persistence
- Redis for session management
- JWT for authentication
- Docker for containerization

## 🎯 Features

- **Multi-tabbed Interface**:
  - BUCA Panel: Process and map BUCA data
  - JOVIE Panel: Process and map JOVIE data
  - Compare Panel: Compare datasets and manage mismatches
  - BCAS Panel: Verify case numbers and generate reports
  - NameID Registry: Manage unique ID mappings
  - TimeCK Panel: Time checking/calculation (formerly Results) with deviation badges and export

- **Data Processing**:
  - Excel/CSV upload and parsing
  - UID mapping for clients and caregivers
  - Multi-caregiver resolution
  - Temporary and permanent corrections

- **Security & Performance**:
  - JWT authentication
  - Session management with Redis
  - Lazy-loaded components
  - Optimized state management

## 🛠️ Quick Start

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- Git

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/CaseConWeb.git
   cd CaseConWeb
   ```

2. **Start Docker Services**
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

3. **Setup Backend**
   ```bash
   cd backend
   npm install
   npx prisma migrate dev
   npm run dev
   ```

4. **Setup Frontend**
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

5. **Access the Application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000
   - Prisma Studio: http://localhost:5555
   - UID Registry: http://localhost:5000/uids

## 📘 UID Registry Persistence

The NameID Registry now persists via the main backend (no separate service needed).

- Endpoint: the main backend serves `GET /uids` and `POST /uids` on port 5000
  - Example: http://localhost:5000/uids
- Frontend configuration: set in `frontend/.env`
  - `REACT_APP_UID_API_URL=http://localhost:5000/uids`
- Storage: data is written to `uids.json` at the project root
- Note: the old `start-uid-api.bat` script is deprecated and no longer starts a server

## 🗂️ Admin Desk Snapshot Management

The Admin Desk panel provides snapshot save/load to capture the current reconciliation state.

- Default snapshot names now use local time: `Recon-MM-DD-YYYY- HH:MM` (e.g., `Recon-08-13-2025- 08:45`).
- Clicking Save opens a tag selection modal (Atlanta, Charlotte, Raleigh).
- Saved snapshots include the chosen tag in brackets, e.g., `Recon-08-13-2025- 08:45 [Atlanta]`.
- Canceling the modal aborts the save. The same UX is mirrored in the Component Workshop version.

### Start scripts (Windows)
- `start-app.bat` — launches Backend (5000) and Frontend (3000) in separate windows and opens the browser
- `start-backend.bat` — starts only the backend on port 5000 (respects `PORT` if set)
- `start-frontend.bat` — starts only the frontend on port 3000

## 🐳 Docker Development

For development with hot-reloading:
```bash
# Start all services
./start-app.bat  # Windows
# or
sh start-dev.sh  # Linux/Mac
```

## 📄 License
This project is proprietary software. All rights reserved.

## 🤝 Contributing
For contributing guidelines, please see CONTRIBUTING.md
