# 🎪 [Project Name]

> One-line tagline describing what your project does (e.g., "A unified platform to manage college fests, events, and participants.")

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

---

## 1. Project Description

[Project Name] is a web application that [what it does] for [who it is for]. It solves [problem] by [approach].

Write 3–5 sentences covering:
- The problem (e.g., fest organizers juggle spreadsheets, forms, and chats)
- Your solution
- Who the users are (admins/organizers, participants, volunteers, judges)

---

## 2. Features

**Core**
- [ ] Create and manage fests (name, dates, venue, banner)
- [ ] Create and manage events under a fest (schedule, capacity, rules, prizes)
- [ ] Participant registration and management
- [ ] Role-based access (Admin / Organizer / Participant)
- [ ] Dashboard with live stats (registrations, attendance, etc.)

**Extras**
- [ ] Search, filter, and sort events
- [ ] Notifications / announcements
- [ ] Leaderboard or results
- [ ] Export data (CSV)
- [ ] Dark mode

**Fully responsive** across mobile, tablet, and desktop.

> ✏️ Replace the items above with what you actually built. Delete anything unfinished.

---

## 3. Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | e.g., React / Next.js, Tailwind CSS |
| Backend | e.g., Node.js + Express / Next.js API routes / Firebase / Supabase |
| Database | e.g., PostgreSQL / MongoDB / Firestore |
| Auth | e.g., JWT / NextAuth / Supabase Auth |
| Hosting | e.g., Vercel (frontend), Render (backend), Neon (DB) |

---

## 4. Setup Instructions

### Prerequisites
- Node.js >= 18
- npm or yarn
- [Database/service requirements]

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# then fill in the values (see below)

# 4. Seed the database with sample data
npm run seed

# 5. Start the development server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Database connection string |
| `JWT_SECRET` | Secret for signing tokens |
| `NEXT_PUBLIC_API_URL` | Base URL of the API |

> Never commit your real `.env` file. Provide `.env.example` only.

---

## 5. Deployment URL

🔗 **Live App:** https://your-deployed-app.example.com

🔗 **Backend/API (if separate):** https://your-api.example.com

> The deployed app comes pre-loaded with sample data (fests, events, and participants), so no manual setup is needed to evaluate it.

---

## 6. Demo Credentials

| Role | Email / Username | Password |
|------|------------------|----------|
| Admin | admin@example.com | `Admin@123` |
| Organizer | organizer@example.com | `Organizer@123` |
| Participant | participant@example.com | `Participant@123` |

---

## 7. Sample Data

The deployment is seeded with mock data, including:
- X fests
- Y events across categories (technical, cultural, sports, etc.)
- Z participants and registrations

Seed script: `npm run seed` (see `/scripts/seed.js`). Data is AI-generated/mock and contains no real personal information.

---

## 8. Third-Party Services / APIs

| Service | Purpose |
|---------|---------|
| e.g., Supabase / Firebase | Database & authentication |
| e.g., Cloudinary | Image hosting |
| e.g., Resend / Nodemailer | Email notifications |
| e.g., Unsplash | Sample images (per Unsplash License) |
| e.g., Google Fonts | Typography (Open Font License) |

All third-party assets are used in accordance with their respective licenses.

---

## 9. AI Tools & Features Used

**Development tools**
| Tool | How it was used |
|------|-----------------|
| Claude | e.g., README drafting, architecture planning, debugging |
| Cursor / GitHub Copilot | e.g., code generation and refactoring |
| ChatGPT | e.g., mock data generation |

**AI features inside the app** (if any)
- e.g., AI-generated event descriptions

> Be transparent: list every AI tool you used and what you used it for.

---

## 10. Screenshots

| Home / Dashboard | Event Listing |
|---|---|
| ![Dashboard](./screenshots/dashboard.png) | ![Events](./screenshots/events.png) |

| Registration | Mobile View |
|---|---|
| ![Registration](./screenshots/registration.png) | ![Mobile](./screenshots/mobile.png) |

> Put images in a `/screenshots` folder. Include at least one mobile screenshot.

---

## 11. Known Limitations

- e.g., Email notifications run in test mode only
- e.g., No payment gateway integration (registration is free/mock)
- e.g., Free-tier hosting may cause a cold start delay (~30s) on first load
- e.g., Limited test coverage

---

## 12. License

This project is licensed under the **MIT License**. See the [LICENSE](./LICENSE) file for details.

---

## 13. Contributors

- [Your Name](https://github.com/your-username)

---

*The organizing authority reserves the right to make the final decision regarding rule interpretation, eligibility, judging, scoring, and any matters not explicitly covered in the guidelines. All decisions made by the judging panel and organizing authority are final.*
