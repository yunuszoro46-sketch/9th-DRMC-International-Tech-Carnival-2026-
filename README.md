# 🎟️ [Project Name] — Smart Club Operations Platform

> A complete event and registration platform for student organizations. No Google Forms needed.

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

Built for the **9th DRMC International Tech Carnival 2026 — AI Web Development Contest** (Theme: *Smart Club Operations*).

---

## 1. Project Description

Student clubs often run registrations through Google Forms, which gives participants a disjointed, unprofessional experience and gives organizers no real management tools.

**[Project Name]** replaces that with a single branded platform built around this hierarchy:

```
Organization → Fest → Event → Registration
```

Participants can browse fests, explore the events inside each fest, and register for individual events. Organizers can create and manage fests and events, and monitor and manage registrations from a dashboard.

Example data shipped with the deployment:

```
DRMC IT Club
├── Tech Carnival 2026
│   ├── AI Web Development Contest
│   ├── Programming Contest
│   ├── Robotics Challenge
│   └── Gaming Tournament
├── Winter Tech Fest 2026
│   ├── Hackathon
│   ├── Workshop
│   └── Tech Quiz
└── Freshers Tech Fest 2027
    ├── Coding Challenge
    └── AI Workshop
```

---

## 2. Features

### 🔎 Fest & Event Directory
- Browse available and upcoming fests
- Event cards showing title, category, date/time, venue, seats left, and deadline
- Search events by name/keyword
- Filter by category (Programming, Robotics, Gaming, Workshop, Quiz, etc.)
- Fest details page listing all events in that fest
- Event details page: description, date & time, venue, deadline, capacity, registration form

### 📝 Registration System
- Register for an event with a built-in form (no external tools)
- Form validation (required fields, email/phone format, duplicate prevention)
- Registration confirmation screen with a unique registration ID
- Capacity limits and deadline enforcement (registration closes automatically when full or past deadline)
- "My Registrations" page to view, update, or cancel registrations

### 🛠️ Organizer / Admin Dashboard
- Secure organizer login
- Create, edit, and delete fests and events
- View all registered participants per event
- Search and filter participants (by name, email, status)
- Manage registration status (Pending / Approved / Rejected / Cancelled)
- Statistics: total registrations, seats filled, per-event and per-fest breakdowns
- CSV export of participant lists

### ⭐ Bonus Features
> Replace with your own creative additions. Ideas: QR-code tickets and check-in, email confirmations, waitlist, AI event description generator, announcements, certificate generation, team registration, analytics charts.
- [Bonus feature 1]
- [Bonus feature 2]

### 📱 Responsive Design
Fully responsive and functional on mobile, tablet, and desktop.

---

## 3. Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | [e.g., Next.js / React, Tailwind CSS] |
| Backend | [e.g., Node.js + Express / Next.js API routes / Supabase / Firebase] |
| Database | [e.g., PostgreSQL / MongoDB / Firestore] |
| Authentication | [e.g., JWT / NextAuth / Supabase Auth] |
| Hosting | [e.g., Vercel, Render, Neon] |

---

## 4. Setup Instructions

### Prerequisites
- Node.js >= 18
- npm or yarn
- [Database requirement]

### Installation

```bash
# 1. Clone
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# fill in values below

# 4. Seed sample data (fests, events, participants)
npm run seed

# 5. Run
npm run dev
```

App runs at `http://localhost:3000`.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Database connection string |
| `JWT_SECRET` | Secret for signing auth tokens |
| `[OTHER_KEY]` | [Description] |

---

## 5. Deployment URL

🔗 **Live App:** https://your-app.example.com

🔗 **API (if separate):** https://your-api.example.com

The deployment is pre-loaded with sample data, so judges can evaluate every feature without creating anything first.

---

## 6. Demo Credentials

| Role | Email / Username | Password |
|------|------------------|----------|
| Organizer / Admin | admin@example.com | `Admin@123` |
| Participant | user@example.com | `User@123` |

> Participants can also register as new users. Replace these with your real working demo accounts.

---

## 7. Sample Data

The deployed app is seeded with:
- 1 organization (DRMC IT Club)
- 3 fests (Tech Carnival 2026, Winter Tech Fest 2026, Freshers Tech Fest 2027)
- [N] events across multiple categories
- [N] mock participants and registrations in varied statuses
- Events in different states (open, almost full, full, deadline passed) to demonstrate limits

Seed script: `npm run seed`. All data is AI-generated/mock; no real personal data is used.

---

## 8. Third-Party Services / APIs

| Service | Purpose |
|---------|---------|
| [e.g., Supabase / Firebase] | Database & auth |
| [e.g., Resend / Nodemailer] | Confirmation emails |
| [e.g., Cloudinary / Unsplash] | Images |
| [e.g., Google Fonts] | Typography |

All third-party assets are used in compliance with their licenses.

---

## 9. AI Tools & Features Used

| Tool | How it was used |
|------|-----------------|
| Claude | [e.g., README, architecture planning, debugging] |
| [Cursor / Copilot / ChatGPT] | [e.g., code generation, mock data] |

**AI features in the app (if any):** [e.g., AI-generated event descriptions]

---

## 10. Screenshots

| Fest Directory | Event Details |
|---|---|
| ![Directory](./screenshots/directory.png) | ![Event](./screenshots/event.png) |

| Registration Form | Confirmation |
|---|---|
| ![Form](./screenshots/form.png) | ![Confirmation](./screenshots/confirmation.png) |

| Organizer Dashboard | Participant Management |
|---|---|
| ![Dashboard](./screenshots/dashboard.png) | ![Participants](./screenshots/participants.png) |

| Mobile View |
|---|
| ![Mobile](./screenshots/mobile.png) |

---

## 11. Known Limitations

- [e.g., Email confirmations are in test mode]
- [e.g., No payment integration; registration is free]
- [e.g., Free-tier hosting may cause a slow first load]
- [e.g., Limited automated test coverage]

---

## 12. License

Licensed under the **MIT License**. See [LICENSE](./LICENSE).

---

## 13. Contributors

- [Your Name](https://github.com/your-username)

---

*The organizing authority reserves the right to make the final decision regarding rule interpretation, eligibility, judging, scoring, and any matters not explicitly covered in the guidelines. All decisions made by the judging panel and organizing authority are final.*
