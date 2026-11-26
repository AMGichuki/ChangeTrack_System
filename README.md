# ChangeTrack

ChangeTrack is a grade change request system for USIU-Africa. A lecturer submits a proposed correction with supporting evidence, the department chair and dean review it, and the registrar records when the grade has been entered in the university’s grading system. Students can follow their own requests while staff retain a dated record of each decision.

## How a grade change moves through the system

| Role | What they do |
| --- | --- |
| Lecturer | Look up a student, select the course and term, explain the grade change, and attach supporting documents. Track the request or edit it if a reviewer returns it. |
| Department chair | Review requests for the selected department. Approve a request to send it to the dean, return it for correction, or reject it. |
| Dean | Review requests approved by the chair in the same department. Approve a request to send it to the registrar, return it, or reject it. |
| Registrar | Verify and enter the grade in the university’s grading system, then select **Mark as posted** in ChangeTrack. The registrar can also return or reject a request. |
| Student | See the course, term, current stage, and dates for their own requests. Grades, evidence, and reviewer comments stay in the staff view. |
| Administrator | Manage staff, students, departments, and job titles. Assign acting approvers, configure overdue reminders, and export request reports and decision logs as CSV. |

A reviewer must explain a return or rejection. A **returned** request goes back to the lecturer and starts again with the chair when resubmitted. A **rejected** request is closed. Registrars and administrators can download the grade change form as a PDF.

## Run locally

You’ll need **Node.js 24.x**, npm, and a fresh Supabase project for development. The React client calls the Express API. Express connects to PostgreSQL for request records and uses Supabase Auth and Storage for sign-in and evidence files.

### 1. Install the client and server

```sh
git clone https://github.com/AMGichuki/ChangeTrack_System.git
cd ChangeTrack_System
npm ci --prefix client
npm ci --prefix server
cp server/.env.example server/.env
```

Run the remaining shell commands from the repository root.

### 2. Prepare Supabase

1. In the SQL Editor of your **fresh development project**, run [database/schema.sql](database/schema.sql). **This script drops and recreates the application tables.** For an existing installation, review the [numbered migrations](database/migrations/) for the changes it needs.
2. Run [database/seed.sql](database/seed.sql) once. It adds departments, job titles, reminder settings, and sample staff, students, and requests.
3. In Storage, create a **private** bucket named `evidence`. The name must match the server configuration.

### 3. Configure the API and create demo logins

Edit `server/.env` using [server/.env.example](server/.env.example) as the starting point.

| Variable | Value for local development |
| --- | --- |
| `DATABASE_URL` | PostgreSQL session-pooler connection URI for the Supabase project, including its database password. |
| `SUPABASE_URL` | URL of the same Supabase project. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key for that project. Keep it in the server environment only. |
| `PORT` / `CLIENT_URL` | Use `5000` and `http://localhost:5173`. The Vite development server proxies `/api` to port 5000. |
| `TEST_PASSWORD` | Add this variable and choose a password for the seeded demo accounts before running the login script. |
| `SMTP_USER` / `SMTP_APP_PASSWORD` | Optional for local use. Leave the example values in place to preview outgoing mail in the API terminal. For delivery, configure a Gmail address and app password. |
| `REMINDERS_ENABLED` | Set to `false` to disable scheduled reminder checks during development. |

The seed creates application records. Run these commands against the demo project to link those accounts to Supabase Auth and create the sample PDFs referenced by the seed.

```sh
npm --prefix server run test-logins
npm --prefix server run sample-evidence
```

The login script prints the demo email addresses and their shared password. Rerunning it resets those demo passwords.

### 4. Start the app

Start the API in one terminal.

```sh
npm --prefix server run dev
```

Start the web client in a second terminal.

```sh
npm --prefix client run dev
```

Open [ChangeTrack on localhost](http://localhost:5173) and sign in with a demo account. To check the API separately, open the [health endpoint](http://localhost:5000/api/health). A working database connection returns `"status": "ok"` along with counts of departments, users, students, and requests.

## Try the seeded approval workflow

The sample data includes a returned arithmetic correction for **IST 2040**, section **A**. Use the email addresses printed by `test-logins` and sign out between roles.

1. Sign in as **Jane Otieno** (lecturer). Open the returned request in **My requests**, choose **Edit & resubmit**, attach a sample grade schedule, and select **Resubmit to Chair**. Use a PDF, JPEG, or PNG. Each request needs at least one supporting file and allows up to five, with a 4 MB combined limit per upload.
2. Sign in as **Peter Kamau** (chair) and approve the request from the review queue. Then sign in as **Grace Achieng** (dean) and approve the same request to send it to the registrar.
3. Sign in as **Mary Njeri** (registrar). To simulate posting in this demo, tick the verification box and select **Mark as posted**.
4. Sign in as **Alex Mwangi** (student). The IST 2040 tracker should now show **Posted** and the dates of all four stages.

## Development checks

| Command from the repository root | What it checks |
| --- | --- |
| `npm --prefix server test` | Unit tests for workflow rules, permissions, evidence validation, and student progress. Runs with test values and needs no Supabase project. |
| `npm --prefix client run lint` | Lints the React client with Oxlint. |
| `npm --prefix client run build` | Produces the production client in `client/dist/`. |
| `npm --prefix server run test:integration` | Exercises the API against PostgreSQL, Supabase Auth, and Storage. Use a dedicated, seeded test project because the suite creates and deletes test data. It skips when `server/.env` is absent. |

## Deployment

**Node server.** Set the server environment variables in the host, including `CLIENT_URL` for the public origin and Gmail credentials for email delivery. From the repository root, run `npm run build`, then `npm start`. Express serves the built client and the API on the same port. With reminders enabled, the server checks for overdue requests hourly.

**Vercel.** Deploy from the repository root using [vercel.json](vercel.json). Vercel serves `client/dist/` and routes API traffic through [api/index.js](api/index.js). Set the server variables in the deployment environment and add `CRON_SECRET` for the reminder endpoint. The configured cron runs daily at 06:00 UTC.
