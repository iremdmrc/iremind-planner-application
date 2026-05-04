# Iremind Planner Application

Iremind is a full-stack study planner and productivity web application. It helps users manage study tasks, calendar events, notes, journals, mind maps, Pomodoro sessions, and study timers in a personalized account.

## Features

- User registration and login with JWT authentication
- Personal user data for each account
- Profile photo upload from the user interface
- Dashboard with live tasks, upcoming calendar events, and learning-time charts
- Kanban-style to-do board with drag-and-drop task status updates
- Calendar with public/private events, colors, search, and delete confirmation
- Modern notes app with draggable stickers saved per note
- Journal page with saved reflections
- Manual mind map canvas with multiple screens, draggable nodes, colors, themes, and clear-screen support
- Full-screen Pomodoro and study timer pages
- Study session tracking for daily, weekly, and monthly learning statistics
- Settings page for profile, theme, and password changes
- Light, pastel, and dark theme support
- Login/register language menu with five language options

## Tech Stack

### Frontend

- Vite
- HTML, CSS, JavaScript
- Font Awesome icons

### Backend

- Node.js
- Express
- Prisma ORM
- PostgreSQL
- JWT authentication
- bcrypt password hashing

## Project Structure

```text
smart-study/
  client/      Frontend pages, styles, scripts, and assets
  server/      Express API, Prisma schema, and backend logic
```

## Getting Started

### 1. Install dependencies

```bash
cd client
npm install

cd ../server
npm install
```

### 2. Configure environment variables

Create a `.env` file inside `server/`.

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/smartstudy"
JWT_SECRET="your_access_token_secret"
JWT_REFRESH_SECRET="your_refresh_token_secret"
PORT=5000
```

If needed, create a `.env` file inside `client/`.

```env
VITE_API_URL=http://localhost:5000
```

### 3. Set up Prisma

```bash
cd server
npx prisma generate
npx prisma migrate dev
```

### 4. Run the backend

```bash
cd server
npm run dev
```

The API runs on `http://localhost:5000`.

### 5. Run the frontend

```bash
cd client
npm run dev
```

The app runs on the local Vite URL, usually `http://localhost:5173`.

## Important Notes

- `.env` files are intentionally ignored and should not be committed.
- `node_modules` and build output are ignored.
- The application stores each user's tasks, notes, events, journals, mind maps, profile data, and study sessions separately.

## Author

Iremind Planner Application
