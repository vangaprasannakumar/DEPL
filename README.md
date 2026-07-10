# 🏢 Capco Workforce — HR & AI Attendance System

> **Zero-server, AI-powered factory attendance, payroll, and HR management system.**
> Built on Google Sheets + Google Apps Script + a PWA frontend for Capco Capacitors.
> No recurring hosting costs. No build pipeline. No dependencies to install.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [File Structure](#3-file-structure)
4. [Feature Reference](#4-feature-reference)
5. [User Roles](#5-user-roles)
6. [Google Sheet Structure](#6-google-sheet-structure)
7. [API Keys & Secrets — How to Configure](#7-api-keys--secrets--how-to-configure)
8. [Setup & Deployment](#8-setup--deployment)
9. [Deployment Checklist](#9-deployment-checklist)
10. [Offline & Sync Behaviour](#10-offline--sync-behaviour)
11. [AI Face Recognition](#11-ai-face-recognition)
12. [Payroll Engine Logic](#12-payroll-engine-logic)
13. [Security Model](#13-security-model)
14. [Version History — v9 (May 2026)](#14-version-history--v9-may-2026)
15. [Version History — v10 (June 2026)](#15-version-history--v10-june-2026)
16. [Version History — v11 (July 2026)](#16-version-history--v11-july-2026)
17. [Latest Updates — v12 (July 2026)](#17-latest-updates--v12-july-2026)
18. [Known Limitations](#18-known-limitations)
19. [Troubleshooting](#19-troubleshooting)

---

## 1. System Overview

**Capco Workforce** is a **Progressive Web App (PWA)** that runs entirely on Google infrastructure with zero recurring server costs. Designed for high-speed factory environments at Capco Capacitors, Muppireddypally, it replaces manual attendance registers and spreadsheet payroll with:

- **Instant AI facial recognition** with 2-of-3 frame confirmation and live canvas bounding-box tracking for fraud-proof punch IN / OUT at a shared kiosk.
- **True offline-first architecture** using IndexedDB and the Background Sync API so factory floor punches are never lost, even if the browser tab is closed.
- **Automated payroll engine** that dynamically calculates prorated salary, overtime, ESI, PF, VPF, PT, comp-off (SOT), and a Year-to-Date summary — with the sandwich rule and VPF properly reflected in both the individual payslip and the Excel salary report.
- **Native PDF payslips** with an editable, additive Advance (ADV.) field and optional Year-to-Date section, printable directly from the app with crisp, selectable vector text.
- **Encrypted biometric data** — face descriptors are encrypted at rest, not stored as plain text.
- **Automated nightly backups** of the entire database to Google Drive, independent of any manual process.
- **Multi-tier role access** — Admin, HR, Security (numbered shifts), Standby kiosk, and Employee self-service — with self-service password reset and brute-force login protection.
- **Live dashboard** featuring category-wise attendance breakdown, visual enrolled-staff avatars, and instant Excel matrix exports.
- **History in table format**, filterable by employee and date, with server-side filtering so narrowing to one person is as fast as viewing everyone.
- **Employee correction requests** — a full workflow for employees to flag incorrect attendance for HR/Admin review.
- **In-app Help Guide** on every screen — no separate training manual required.

```text
┌─────────────────────────────────────────────┐
│              FACTORY FLOOR                  │
│  Shared Tablet (Standby / Kiosk role)       │
│  2-of-3 Frame Face Recognition + Box Track  │
│  Auto-Punch IN / OUT (No blink required)    │
└────────────────┬────────────────────────────┘
                 │  HTTPS POST (JSON)
                 ▼
┌─────────────────────────────────────────────┐
│         Google Apps Script (Code.gs)        │
│  REST API · LockService · SHA-256 Auth      │
│  Rate Limiter · Script Properties (SECRET)  │
│  Face Data Encryption · Nightly Backups     │
└────────────────┬────────────────────────────┘
                 │  SpreadsheetApp read/write
                 ▼
┌─────────────────────────────────────────────┐
│            Google Sheets (8 tabs)           │
│  Data · Users · List_of_Empl · Shifts       │
│  Audit_Log · H/S · OT_Empl · Holidays       │
└─────────────────────────────────────────────┘
```

---

## 2. Architecture

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | HTML / CSS / Vanilla JS | Single-file PWA — no build step, responsive mobile-first layout with full light/dark theme support. |
| AI | face-api.js (TinyFaceDetector) | Client-side facial recognition — processes instantly via WebGL. Zero cloud calls. |
| Backend | Google Apps Script (`doPost`) | REST-like API with script locking, session tokens, rate limiting, chunked cache, and biometric encryption. |
| Database | Google Sheets (8 tabs) | Zero-cost persistent storage with lightning-fast ArrayFormulas. |
| Offline | Service Worker + IndexedDB | Stale-while-revalidate shell cache; pending punches background-sync with a 25s timeout guard. |
| Export | ExcelJS + native `window.print()` | Frozen-pane Excel attendance matrices and salary reports, plus crisp PDF payslips with an editable Advance field and Year-to-Date summaries. |
| Secrets | Google Script Properties | `APP_SECRET` stored server-side — signs session tokens **and** derives the biometric encryption keystream. Hard-fails at login if missing, never exposed to the browser. |
| Backup | Google Drive | `backupAllSheets()` copies core sheets into a dated spreadsheet every night via a time-driven trigger; 30-day auto-pruned retention. |

---

## 3. File Structure

```text
capco-workforce/
├── index.html       # Entire frontend — UI, styles, AI models, canvas overlays, and JS logic
├── manifest.json    # PWA manifest — icons, shortcuts, screenshots, free device orientation
├── sw.js            # Service Worker — auto-versioned cache, offline fallback, background sync
└── Code.gs          # Google Apps Script backend — API actions, payroll math, encryption, backups
```

> All four files represent the complete system. There are no dependencies to install,
> no `node_modules`, and no build pipeline.
>
> The app is hosted at `github.com/vangaprasannakumar/DEPL` — the repository/folder name is
> historical and does not reflect the current in-app branding. `manifest.json`'s `id`,
> `start_url`, `scope`, and shortcut URLs correctly still point to `/DEPL/` since that is the
> real, unchanged hosting path.

---

## 4. Feature Reference

### 4.1 Manual Attendance Entry
- HR / Admin searches for an employee using a debounced, lag-free live-filter dropdown.
- Selects **Punch IN**, **Punch OUT**, **Mark Permission**, or **Mark Leave**.
- Leave type dialog: **EL** (Earned Leave — deducts balance) or **LOP** (Loss of Pay — no deduction). Selected type is preserved in offline punch payloads and survives background sync.
- Leave confirmation shows the employee's exact current leave balance before committing.
- Optional free-text remarks field for context.
- Live status badge queries the server instantly to prevent duplicate punches.
- When an employee already has a punch-in today, the shift selector is pre-populated with their active shift — HR does not need to guess.
- After a successful punch, only the affected employee's status badge refreshes — no full data reload.
- Action buttons are disabled during the API call to prevent accidental double-submit.

### 4.2 AI Face Recognition Kiosk (2-of-3 Frame Confirmation)
- **Standby role** devices display only the kiosk UI — no access to admin functions.
- Admin selects IN or OUT; camera activates (with mobile autoplay and `webkit-playsinline` bypasses).
- **2-of-3 Frame Confirmation:** Requires the same employee to be matched in at least 2 consecutive frames before logging the punch. Eliminates false positives from look-alikes or partial faces passing the camera.
- **inputSize 160** (not 320) — 4× faster GPU inference on mobile. Frame confirmation compensates for the lower resolution by requiring consensus.
- **Live Canvas Tracking:** A bounding box draws in real time over the detected face with the employee's name.
- Text-to-speech announces the employee's name to confirm.
- **120-second countdown timer** visible live so the kiosk operator knows when it auto-closes.
- The employee's `category` is passed to the server at punch time — the backend skips a redundant `getEmployees()` call for the SOT bonus check.
- Face descriptors are fetched via the dedicated `getKioskFaceData` action (decrypted server-side, cached 15 minutes) rather than the general employee list — see [4.10](#410-data-protection--encrypted-biometrics--automated-backups).

### 4.3 Face Enrollment
- Admin finds the employee card and taps **Enroll Face** (or **🔄 Re-enroll** if already enrolled).
- Live canvas tracks the face to confirm good framing and lighting.
- Camera captures **5 distinct 128-float descriptors** (higher `inputSize: 320` for maximum accuracy).
- Progress dots update in real time showing capture count (`1/5`, `2/5`, …).
- Descriptor array is JSON-serialised, **encrypted**, and saved to column Q of `List_of_Empl`.
- After enrollment, `FaceMatcher` is immediately rebuilt using the plaintext just captured — no round trip needed to re-fetch and decrypt what the browser already has.

### 4.4 True Offline Background Sync
- If the factory loses internet, punches are saved directly to the browser's **IndexedDB** — including `leaveType` (EL/LOP) and `shift` so all fields survive sync faithfully.
- The Service Worker registers a `sync-punches` tag with the OS.
- When the OS detects Wi-Fi, it silently POSTs all pending punches to `Code.gs` with a **25-second AbortController timeout** to prevent stalled sync events.
- Backend deduplicates via fingerprint (`emplId|date|time|action`) — zero duplicate rows.
- Punches are grouped by session token before sending so multi-user offline sessions authenticate independently.
- **iOS Safari fallback:** Background Sync API is unsupported on iOS. An `online` event listener flushes IDB directly when the app is foregrounded and reconnects.

### 4.5 Attendance History (Table Format)
- Filter by **month**, **exact date**, **date range**, and/or a **multi-select employee filter**.
- Results always render as a **table** — Date, Shift, In, Out, Permission, OT, and an Edit/Req action column. When more than one employee is in the result set, an Employee column appears too; single-employee results show the name once in the header instead.
- **Server-side filtering:** selecting specific employees is filtered on the backend before the response is built, instead of pulling the entire attendance history and narrowing it down in the browser — narrowing to one person is as fast as viewing everyone.
- **CSV Export:** Converts the exact on-screen filtered view — including the employee filter — directly to a downloadable CSV.
- **Employee Correction Requests:** Employees click **Req** on any history row to open a modal describing the discrepancy. The request is written to `Audit_Log` as a `PENDING CORRECTION` entry. HR/Admin resolve it with a single button that stamps `RESOLVED`.

### 4.6 Salary Engine & PDF Payslips
- Full payroll logic including ghost-Sunday-proof calendar mathematics and the sandwich rule (see Section 12).
- **Comp-Off (CO) tracking:** SOT employees who work ≥ 12 hours receive a 0.5-day leave credit, flagged as `SOT_BONUS_ADDED` in column O. Monthly Excel reports show the real per-employee CO total.
- **Editable Advance (ADV.):** The payslip shows Net Payout, then an editable ADV. field, then a Final Payable amount (Net + ADV.) — ADV. is additive, not a deduction. The value carries from the in-app view into the printable PDF automatically.
- **Print inclusion toggles:** Two checkboxes — "Include ADV. section" and "Include Year-to-Date Summary" — control what actually appears in the printed/saved PDF. Unchecking both strips them from the print output entirely, not just visually.
- **Year-to-Date Summary:** Cumulative gross, deductions, net pay, OT hours, present days, and leaves availed from the start of the financial year (April 1). Computed by summing each elapsed month's own `getEmpDashData()` result, so the YTD total always matches what each individual month's payslip already showed. Cached 15 minutes per employee/month.
- **Attendance % uses working days** (not total month days) as the denominator — e.g. 22 present out of 22 working days = 100%, not 22/30 = 73%.
- **Native PDF Printing:** A visible **Print / Save as PDF** button inside the payslip (not an auto-print timer) lets the person review the carried-over ADV. value and the included sections first. `@media print` CSS strips the app chrome, leaving only the payslip.

### 4.7 Monthly Excel Salary Report
- Downloads a formatted `.xlsx` file with one row per selected employee.
- **Raw data columns:** Employee ID, Name, Gross, Basic, HRA, Conv, Spl Allow, Medical, **VPF**, P/Days, Ph/Days, Leaves Availed, **Sandwich Ded.**, Absent Days, Total Days.
- **Formula columns:** Prorated Basic/HRA/Conv/Spl/Medical/Gross, EPF, ESI, PT, VPF, Total Deductions, Net, **ADV. (manual, additive)**, **Final Payable (Net + ADV.)**, Signature.
- **Sandwich rule and VPF are now correctly reflected here** — previously this report was missing both, meaning it could show a higher payable-day count and net pay than the individual payslip for the same employee/month. Payable Days used in every prorated formula now subtracts the Sandwich Ded. column, matching the payslip exactly.
- **ADV. is no longer a deduction** — it's a separate column after Net, additive, matching the payslip's model.
- Column styles are applied once at the column level; row values are written in bulk — avoids per-cell style objects that caused a browser hang in an earlier version.
- **Cutoff logic:** For the current month, only data up to today is counted. Future days show blank cells (not "Absent"). Past months always use the full month.
- Supports partial-employee export by selection.

### 4.8 Live Admin Dashboard
- Live total staff, present, currently in, out, on leave, and late arrival counts.
- **Present by Category:** A live progress bar per staff category (Staff Without OT / With OT / With SOT) showing "X / Y present" — surfaces which workforce segment is short-staffed at a glance.
- **Enrolled Avatars:** Horizontally scrolling circular avatars (Apple-style initials) for every enrolled employee.
- **Monthly Attendance Matrix (Excel):** Frozen-pane matrix with `X` (present), `EL` (leave), `A` (absent), summary columns (P, H, PD, EL, CO, H/S, A, TPD, PST EL, AVAIL EL) per employee.
- The refresh button shows a loading spinner and an error toast on failure, consistent with every other data-fetch action in the app.

### 4.9 Admin Panel
- **Users Management:** Create, edit, and delete app login accounts. Assign roles — Admin, HR, Standby, **Security-1**, **Security-2**, or Employee — and link Employee-role accounts to their `Empl_ID` (column E).
- **Employee Master:** Full CRUD for employee records including all salary components, shift assignment, category, leave balance, and PIN.
- **Bulk Employee Import:** Paste CSV to create multiple employees in one shot (duplicate ID check included).
- **Leave Management:** Assign single or multi-day EL or LOP leave ranges. Skips Sundays and public holidays automatically. A **visual calendar grid** (up to 3 months) renders below the date pickers, highlighting exactly which days will be marked before submitting — Sundays within the range shown muted. Processed in a single optimised sheet pass — no per-day re-read.
- **Correction Requests Panel:** View, review, and resolve employee attendance correction requests.
- **Attendance History Edit:** Admin can update IN time, OUT time, Permission time, and Remarks on any historical record. All edits are logged to `Audit_Log` with the before and after values.

### 4.10 Data Protection — Encrypted Biometrics & Automated Backups
- **Face data encryption:** Face descriptors are encrypted at rest in column Q of `List_of_Empl` using a stream cipher — HMAC-SHA256(`APP_SECRET`, hex IV + counter) generates a keystream XORed against the plaintext, stored as `ENC1:<hex IV>:<base64 ciphertext>`. A random IV per save means re-saving identical data produces a different ciphertext each time. The HMAC input is a **string** (hex IV + counter), not a raw byte array — Apps Script's JS→Java bridge does not reliably recognize a plain array as a native `byte[]`.
- Legacy unencrypted values pass through unchanged for backward compatibility; run `migrateEncryptAllFaceData()` once to encrypt everything already on the sheet immediately instead of waiting for a natural re-save.
- This is a lightweight, dependency-free cipher — Apps Script has no native AES. It protects data from casual spreadsheet access; a stronger cryptographic guarantee would require routing through an external KMS.
- **Automated nightly backups:** `backupAllSheets()` copies `Data`, `Users`, and `List_of_Empl` into a dated spreadsheet inside a "Capco Workforce Backups" Drive folder every night at 2 AM IST. Backups older than 30 days are automatically deleted. Install the schedule once with `setupNightlyBackupTrigger()`.

### 4.11 Self-Service Password Reset
- A "Forgot password?" link on the login screen opens a two-step flow: enter a username to receive a 6-digit code by email, then submit the code with a new password.
- Codes expire after 15 minutes and are single-use. Requests are capped at 3 per hour per username to prevent inbox flooding.
- The server returns an identical, generic response whether or not the username exists — the flow cannot be used to enumerate valid logins.
- A successful reset clears any active login lockout on that account and appends a `Password Reset` entry to `Audit_Log`.
- Uses `MailApp.sendEmail()` — no additional API key required, but subject to the deploying Google account's daily email quota (see [Known Limitations](#18-known-limitations)).

### 4.12 In-App Help Guide
- A slide-down panel (not a full-screen modal) — opens beneath the header on tap, dismissible by tapping outside or the trigger icon again, matching the notification bell's interaction pattern.
- Content is scoped per screen and per admin/report sub-tab, including a dedicated entry for the Dashboard tab.
- No separate training manual needed for new HR, Security, or Standby-kiosk staff.

---

## 5. User Roles

| Role | Entry | History | Payslip | Correction Request | Admin Panel | Kiosk |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Admin** | ✅ | ✅ All | — | ✅ Resolve | ✅ Full | — |
| **HR** | ✅ | ✅ All | — | ✅ Resolve | ✅ No user mgmt | — |
| **Security-1 / Security-2** | ✅ | ✅ All | — | — | — | — |
| **Employee** | — | ✅ Own only | ✅ Own | ✅ Submit | — | — |
| **Standby** | — | — | — | — | — | ✅ Only |

> Role names are **case-sensitive**. Type them exactly as shown in the Users sheet — Security
> roles specifically must be `Security-1` or `Security-2`, matching the two numbered variants
> the app recognizes (intended for separate guard shifts/checkpoints, not a single shared role).
> All five roles are selectable directly from the Admin Panel's Create/Edit User dropdown.

---

## 6. Google Sheet Structure

### Tab: `Data` (Attendance Log)
*Columns A–O:* Date, Day, Empl ID, Name, Shift, Shift Start, IN Time, Shift End, OUT Time, Tot. Hrs (ArrayFormula), OT Hrs (ArrayFormula), Permission, Remarks, Logged By, Flags.

> Columns J and K use `ARRAYFORMULA` in Row 1. The backend uses `getInsertRow()` to find
> the first genuinely empty row in Column C — bypassing ghost rows created by the formulas.
> Column O (Flags) stores internal markers: `SOT_BONUS_ADDED` (CO tracking) and `LOP`.

### Tab: `List_of_Empl` (Employee Master)
*Columns A–Q:* ID, Name, Shift, Category, Leave Bal, Gross, Basic, HRA, Conv, Spl Allow, Med, ESI, PF, VPF, PT, PIN, **Face Data (encrypted)**.

> **Column Q — Face Data:** Stored as `ENC1:<hex IV>:<base64 ciphertext>` (see [4.10](#410-data-protection--encrypted-biometrics--automated-backups)). Legacy plaintext JSON values are still read correctly but should be migrated with `migrateEncryptAllFaceData()`. Never edit this column by hand.

### Tab: `Users` (App Logins)
*Columns A–E:* Username, Role, Email, Password (SHA-256), **Empl_ID**.

> **Column B — Role:** One of `Admin`, `HR`, `Standby`, `Security-1`, `Security-2`, or `Employee`.
>
> **Column E — Empl_ID:** For **Employee-role accounts**, enter the matching employee ID
> from `List_of_Empl` column A. Leave blank for Admin, HR, Security, and Standby accounts.
> This links an Employee login directly to their payslip and leave balance — no name-matching
> that would break when two employees share the same name.
>
> **Column C — Email:** Required for that account's self-service password reset to work (Section 4.11). If blank, reset requests for that username silently do nothing — by design, so the response can't be used to confirm the account exists.

### Tab: `Shifts`
*Columns A–D:* Shift Name, Shift Start, Shift End, OT Hours Threshold.

### Tab: `H/S` (Month Settings)
*Columns A–C:* Month Name, No. of Days, PH Count. Override the calendar day count for months with factory calendar adjustments.

### Tab: `OT_Empl` (OT Gross Overrides)
*Columns A–C:* Empl ID, Name, OT Gross. Overrides an employee's standard gross for OT rate calculations.

### Tab: `List of Holidays`
*Columns A–B:* Date, Reason. Used by payroll, leave marking, and the sandwich rule to identify public holidays.

### Tab: `Audit_Log` (Immutable History)
*Columns A–F:* Timestamp, Actor (Admin/User), Empl ID, Empl Name, Old Value / Action Type, New Value / Details. All admin edits, user deletions, employee deletions, password resets, and correction requests are appended here.

### Drive: "Capco Workforce Backups" Folder
Not a sheet tab — a separate Google Drive folder, created automatically on first backup run. Contains one dated spreadsheet per night (`Backup_YYYY-MM-DD`), each with copies of `Data`, `Users`, and `List_of_Empl`. Entries older than 30 days are auto-deleted. A prior "DEPL HRMS Backups" folder from before the rebrand is not migrated automatically — see [Known Limitations](#18-known-limitations).

---

## 7. API Keys & Secrets — How to Configure

### 7.1 `GOOGLE_API_URL` (Apps Script Web App URL)
This HTTPS endpoint connects the PWA to your Google Sheet. Update it in **two places** after every new deployment:
- **`index.html`** — `const GOOGLE_API_URL = "..."` near the top of the `<script>` block.
- **`sw.js`** — `const GOOGLE_API_URL = "..."` at the very top of the file.

### 7.2 `APP_SECRET` (Session Signing Key **and** Biometric Encryption Key)
This is a **true secret** — never place it in the frontend. It serves two purposes:
1. Signs session tokens.
2. Derives the keystream used to encrypt and decrypt face descriptor data (Section 4.10).

The backend **hard-fails** on login and on any face-data operation if `APP_SECRET` is not set. There is no insecure fallback.

1. In the Apps Script editor → **⚙️ Project Settings** → **Script Properties** → **Add script property**
2. Property name: `APP_SECRET`
3. Value: *a long random string — minimum 32 characters*

> ⚠️ If login returns `"APP_SECRET script property is not configured"`, this step was skipped.
> ⚠️ **Never rotate `APP_SECRET` on a live sheet without a plan** — changing it invalidates the ability to decrypt any face data encrypted under the old value. Re-enroll affected employees, or decrypt-then-re-encrypt under the new secret first.

### 7.3 `app-version` Meta Tag (Cache Auto-Busting)
The Service Worker reads the cache version from `index.html` at install time — no manual constant to update in `sw.js`.

Update this line in `index.html` on every deploy:
```html
<meta name="app-version" content="20260709">
```
Format: `YYYYMMDD`, optionally with a same-day revision letter suffix (e.g. `20260701b`) for a second deploy on the same date — the value is used as an opaque cache-key string, not parsed as a date. Changing it causes all users to receive the fresh build on their next visit.

### 7.4 Email Sending (Password Reset)
No separate API key is required — self-service password reset (Section 4.11) uses `MailApp.sendEmail()`, which runs under the deploying Google account's own daily email quota (roughly 100/day on a personal Gmail account, higher on Google Workspace). No configuration step needed beyond ensuring each Users-sheet account has a valid email in column C.

---

## 8. Setup & Deployment

1. Create a new Google Sheet with the exact 8 tabs listed in Section 6.
2. In Google Sheets → **Extensions → Apps Script** → paste `Code.gs`.
3. Go to **⚙️ Project Settings → Script Properties** → add `APP_SECRET`.
4. Click **Deploy → New Deployment** (Type: Web App, Execute As: Me, Who has access: Anyone).
5. Copy the Web App URL → paste into `GOOGLE_API_URL` in both `index.html` and `sw.js`.
6. In the `Users` sheet, manually add your first Admin row. The password can be plaintext — it is SHA-256 hashed automatically on first login. Populate the Email column (C) so self-service password reset works.
7. For Employee-role users: populate column E (`Empl_ID`) with their ID from `List_of_Empl` column A.
8. Host `index.html`, `manifest.json`, and `sw.js` on **GitHub Pages** or any static HTTPS host.
9. Update `<meta name="app-version" content="YYYYMMDD">` in `index.html` to today's date.
10. Replace the placeholder `src` URLs in `manifest.json` screenshots with real app screenshots (540×720 narrow + 1280×720 wide) — still outstanding, see [Known Limitations](#18-known-limitations).
11. **One-time:** Run `migrateEncryptAllFaceData()` from the Apps Script editor (▶ Run) to encrypt any face data already on the sheet. Safe to re-run — already-encrypted rows are skipped.
12. **One-time:** Run `setupNightlyBackupTrigger()` from the Apps Script editor (▶ Run) to install the 2 AM IST nightly backup schedule. Safe to re-run — existing triggers for this function are replaced, not duplicated.

---

## 9. Deployment Checklist

- [ ] Updated `<meta name="app-version" content="YYYYMMDD">` in `index.html` to today's date.
- [ ] Re-deployed Google Apps Script as **New Deployment → Execute As: Me → Anyone**.
- [ ] Updated `GOOGLE_API_URL` in **both** `index.html` and `sw.js`.
- [ ] Confirmed `ARRAYFORMULA` exists in `Data` sheet cells **J1** and **K1**.
- [ ] Verified `APP_SECRET` is set in Script Properties.
- [ ] Populated **column E (Empl_ID)** in the `Users` sheet for all Employee-role accounts.
- [ ] Populated **column C (Email)** in the `Users` sheet for accounts that need self-service password reset.
- [ ] Confirmed `manifest.json` icons point to the correct Capco icon URLs.
- [ ] Replaced placeholder screenshot URLs in `manifest.json` with real 540×720 (narrow) and 1280×720 (wide) screenshots.
- [ ] Ran `migrateEncryptAllFaceData()` at least once (new deployments only need this if face data was imported from an unencrypted source).
- [ ] Confirmed `setupNightlyBackupTrigger()` has been run — check Apps Script → Triggers for a `backupAllSheets` entry.

---

## 10. Offline & Sync Behaviour

1. Device goes offline → `submitAttendance()` writes the punch to **IndexedDB** including `leaveType`, `shift`, `loggedByUser`, and session token so all fields are preserved exactly.
2. A `sync-punches` tag is registered with the OS via `SyncManager`.
3. When the OS regains Wi-Fi, `sw.js` silently POSTs punches to `Code.gs` with a **25-second AbortController timeout**. Stalled requests time out cleanly and the browser reschedules a retry.
4. Punches are **grouped by session token** before sending — morning employee + afternoon admin punches authenticate independently.
5. `Code.gs` deduplicates via fingerprint (`emplId|date|time|action`) — zero duplicate rows possible.
6. IDB records are deleted after the server confirms sync. Records that fail (e.g. session expired) are kept for the next retry.

> **iOS Safari:** Background Sync API is unsupported. An `online` event listener calls
> `flushPendingPunchesManually()` directly when the app is in the foreground and the
> device reconnects.

---

## 11. AI Face Recognition

### Model Details
Uses **face-api.js v0.22.2** — runs entirely in-browser via WebGL. Zero cloud API calls.
All weight file URLs are pinned to `@0.22.2` in both `sw.js` and `index.html` to prevent silent model-version drift.

| Mode | inputSize | scoreThreshold | Notes |
|---|---|---|---|
| **Kiosk scan** | `160` | `0.3` | 4× faster GPU pass. 2-of-3 confirmation compensates for lower resolution. |
| **Enrollment** | `320` | `0.3` | Higher resolution for maximum descriptor accuracy. |

- **Matching threshold:** `FaceMatcher` distance threshold set to `0.6`.
- **Live tracking:** A `<canvas>` overlay draws a real-time bounding box with the employee's name over the detected face.
- **Data at rest:** Descriptors are encrypted before being written to `List_of_Empl` column Q (Section 4.10). The kiosk fetches decrypted descriptors via the dedicated `getKioskFaceData` action, cached server-side for 15 minutes and invalidated immediately on any new enrollment.

### 2-of-3 Frame Confirmation
The kiosk maintains a `frameHits` counter per employee. Only when the same employee is matched in **2 or more consecutive frames** does the punch fire. All other counters reset to 0 on each frame. Protects against:
- Partial faces at the edge of frame
- Look-alikes walking past the camera
- Low-light single-frame mismatches

### Enrollment Flow
- 5 distinct 128-float descriptors captured per employee (progress dots shown in real time).
- JSON-serialised, encrypted, and written to column Q of `List_of_Empl`.
- `FaceMatcher` is rebuilt immediately using the plaintext just captured in-browser — no round trip to re-fetch and decrypt.

---

## 12. Payroll Engine Logic

```text
Payable Days = Present Days + Public Holidays + Sundays − Sandwich Days
Proration Factor = Payable Days / Total Days in Month

OT Per Hour  = Round(OT Gross / Total Days / 8, 2)
OT Earnings  = Total OT Hours × OT Per Hour

ESI          = Prorated Gross × 0.0075   (only if Gross ≤ ₹21,000)
PF           = Prorated Basic × 0.12
PT           = ₹200 (Gross ≥ ₹20,000) | ₹150 (Gross ≥ ₹15,000) | ₹0

Net Pay          = Prorated Gross + OT Earnings − (ESI + PF + VPF + PT)
Final Payable    = Net Pay + ADV.   (ADV. is additive, entered manually, not a deduction)

SOT Comp-Off = +0.5 leave day per shift where elapsed time ≥ 12 hours
               (flagged SOT_BONUS_ADDED in column O of Data sheet)

YTD Summary  = Σ getEmpDashData() for every month from April 1 through
               the requested month (Indian financial year, April–March)
```

### Sandwich Rule
If an employee is absent on a day sandwiched between two non-working days (Sundays or public holidays) and **neither** neighbour worked at least 4 hours, the sandwiched day is not counted as a Payable Day. A 14-day safe search window walks in each direction to find the nearest working day. If no valid working day is found within 14 days in either direction, the check returns `false` — no penalty applied. This rule is applied consistently in the individual payslip (`getEmpDashData`), the Monthly Dashboard (`exportMonthlyDashboard`), **and the Monthly Salary Report (`exportSalaryReport`)** — all three now agree on the same Payable Days figure for a given employee/month.

### Leave Marking
- **EL (Earned Leave):** Deducts 1.0 from the employee's leave balance. Written as `IN = LEAVE`, `OUT = LEAVE`.
- **LOP (Loss of Pay):** No leave balance deduction. `LOP` flag written to column O of the Data sheet.
- `markLeaveAdmin()` skips Sundays and public holidays, processes the entire date range in a single pre-read pass, and tracks `nextInsertRow` without re-scanning column C on each iteration.
- The frontend renders a visual calendar preview of the selected range before submission (Section 4.9).

### Current Month Cutoff
`exportMonthlyDashboard()`, `exportSalaryReport()`, and payslip generation all detect whether the requested month is the current month. If yes, data is processed only up to today's date — future days show blank (not "Absent"). Past months always use the full month.

### Year-to-Date Summary
`getYTDSummary(emplId, asOfMonthStr)` determines the Indian financial year start (April of the current year, or the previous year if the requested month is Jan–Mar), then sums `getEmpDashData()` across every elapsed month. This guarantees the YTD figures always agree with what each individual month's payslip already displayed — there is no separate, independently-derived calculation path to drift out of sync. Cached 15 minutes per employee/month combination.

---

## 13. Security Model

| Control | Detail |
|---|---|
| **Passwords** | SHA-256 hashed on the client before transit. Plaintext passwords in the Users sheet are silently upgraded on first login. |
| **Session Tokens** | 5.5-hour expiring tokens stored in GAS `CacheService`. Validated and refreshed on every authenticated request. |
| **APP_SECRET** | Required Script Property. Signs session tokens and derives the biometric encryption keystream. Hard-fails with a clear error if missing — no insecure fallback. |
| **Login Rate Limiting** | After **5 failed attempts** within **15 minutes**, the username is temporarily locked. Counter in `CacheService`; clears on success or after 15 minutes. |
| **Password Reset Rate Limiting** | Reset code requests capped at **3 per hour** per username. Codes expire after 15 minutes and are single-use. Response is identical whether or not the username exists — no enumeration. |
| **Face Data Encryption** | Descriptors encrypted at rest (HMAC-SHA256 stream cipher keyed on `APP_SECRET`, random IV per save, string-based HMAC input for Apps Script compatibility). See Section 4.10. |
| **Role Scoping** | Five distinct roles (Admin, HR, Security-1/2, Standby, Employee), each restricted to exactly the screens they need. Security roles get Attendance Entry + History only — no Dashboard, Reports, or Admin access. |
| **Self-Deletion Guard** | An Admin cannot delete their own account. Enforced by both `deleteUser()` backend and the Admin Panel UI (Delete button disabled when editing your own account). |
| **Concurrency** | `LockService.waitLock(15000)` prevents duplicate punch rows during heavy shift-change windows. |
| **Audit Trail** | All admin edits, password resets, and correction requests are immutably appended to `Audit_Log` with timestamp, actor, before, and after values. |
| **Backups** | Full-sheet nightly backup to a separate Drive spreadsheet, 30-day retention, independent of any manual process. See Section 4.10. |

---

## 14. Version History — v9 (May 2026)

A comprehensive audit covering **13 bug fixes, 6 performance upgrades, and 7 structural modifications** across all 4 source files.

### 🔴 Bugs Fixed

| ID | Fix |
|---|---|
| ERR-01 | `markLeaveAdmin()` — sheet re-read was inside every loop iteration. Now pre-reads once, builds an in-memory `rowLookup`, and tracks `nextInsertRow` manually. Eliminates GAS timeout risk for multi-day leave ranges. |
| ERR-02 | `logAttendance()` called `getEmployees()` on every punch-out for the SOT category check. Now accepts `emplCategory` as the 9th parameter. |
| ERR-03 | `getEmpDashData()` read the holiday sheet twice. Hoisted to outer scope and reused — one sheet read instead of two. |
| ERR-04 | `deleteUser()` had no self-deletion guard. Backend and UI now both enforce it. |
| ERR-05 | `exportMonthlyDashboard()` CO column was always 0. Now scans column O for `SOT_BONUS_ADDED` and writes real per-employee totals. |
| ERR-06 | `generateSessionToken()` had a publicly-known static fallback secret. Replaced with a hard-fail if `APP_SECRET` is missing. |
| ERR-07 | `isSandwiched()` 14-day search loops had no post-loop validity check. Returns `false` (safe default) when no valid neighbour is found. |
| ERR-08 | `leaveType` (EL/LOP) was missing from offline punch payloads. Now included end-to-end. |
| ERR-09 | `fetchAllData(true)` was called after every punch, reloading all employee records. Replaced with a single-employee status refresh. |
| ERR-10 | `myEmplId` matched by username vs. employee name — fails when two employees share a name. Now uses `emplId` from Users column E. |
| ERR-11 | Leave day preview excluded Sundays but not public holidays. Preview label now notes public holidays are also excluded. |
| ERR-12 | `CACHE_DATE` was hardcoded in `sw.js`. Now auto-detected from `index.html`'s `app-version` meta tag. |
| ERR-13 | All 3 PWA manifest screenshots pointed to the company logo. Fixed with proper screenshot entries. |

### 🔵 Performance Upgrades
Pre-loaded name/category caches for offline sync, `CacheService`-based login rate limiting, kiosk `inputSize` reduced to 160, 25-second sync timeout, structured `503` responses on network failure, and persisted resolved cache names across SW lifecycle events.

### 🟡 Structural Modifications
`Empl_ID` column added to Users sheet, password preservation on blank-field edits, admin panel relabeling, `[EL]`/`[LOP]` audit tags, `app-version` meta tag introduced, self-account delete-button guard, and SW meta persistence database.

---

## 15. Version History — v10 (June 2026)

Completed the full rebranding from **Capco Master AI** to **DEPL HRMS** at the time (later reverted — see Section 17), updated all asset links, and resolved the mobile header layout issue.

### 🔴 Bug Fixed
**Mobile content hidden under header.** `#mobile-header-spacer` was hardcoded shorter than the real header height. Fixed with a raised CSS fallback plus a new `adjustHeaderSpacer()` function that measures the real rendered height via `getBoundingClientRect()` and keeps it in sync on resize.

### 🧹 Comment Cleanup (Round 1, All Files)
Removed all `FIX ERR-xx`, `MOD-0x`, `UPGRADE #x`, and similar tracking tags from every file, replaced with concise comments explaining *why* rather than change history.

---

## 16. Version History — v11 (July 2026)

A large feature release plus a full round of bugs surfaced during live testing on the factory floor.

### 🆕 New Capabilities
- **Face Data Encryption** — descriptors encrypted at rest (Section 4.10), with a one-time `migrateEncryptAllFaceData()` migration helper.
- **Automated Nightly Backups** — `backupAllSheets()` + `setupNightlyBackupTrigger()`, 30-day retention.
- **Self-Service Password Reset** — two-step emailed-code flow, rate-limited, no username enumeration.
- **Category-Wise Dashboard Breakdown** — live progress bars per staff category.
- **Visual Leave Calendar Preview** — up to 3 months rendered as an actual calendar grid before confirming.
- **Year-to-Date Payslip Summary** — cumulative figures since April 1, on both the in-app view and the PDF.
- **In-App Help Guide Rebuild** — converted from a full-screen modal to a slide-down panel, content substantially expanded.

### 🔴 Bugs Fixed (Post-Deployment Testing)

| Issue | Fix |
|---|---|
| **Face re-enrollment failed with a `computeHmacSha256Signature` error** | The encryption keystream passed a raw JS byte array to `Utilities.computeHmacSha256Signature()`. Apps Script's JS→Java bridge doesn't reliably recognize a plain array as a native `byte[]`. Fixed by hashing a hex-encoded **string** instead. |
| **Help Guide showed the wrong content after switching tabs** | Unscoped `document.querySelector('.sub-tab.active')` could match a leftover active sub-tab from a different section sharing the same class. Scoped to each section explicitly. |
| **Login card, loading-screen text, mobile header, header clock badge, and Excel-style filter dropdowns were unreadable in light mode** | Several components had hardcoded dark backgrounds/colors with no `body.light-mode` override. Added matching overrides for each. |
| **History filter and Search/Export buttons had no gap between them** | Added spacing between the Employee Filter dropdown and the action buttons. |
| **Dashboard refresh button appeared to do nothing** | `loadDashboard()` never showed a loader or error toast, unlike every other data-fetch action. Brought in line with the rest of the app. |
| **App would not rotate to landscape on mobile** | `manifest.json` had `"orientation": "portrait-primary"`. Changed to `"any"`. |
| **Dead zone between mobile and tablet layouts (701px–767px)** | CSS breakpoints jumped from `max-width:700px` straight to `min-width:768px` with a gap between — any viewport in that range got no header, sidebar, or nav at all. Extended the mobile breakpoint to `max-width:767px`. |
| **Inconsistent font rendering after a page refresh** | The custom font was hardcoded individually on ~9 separate CSS selectors instead of being inherited from `body` once. Consolidated to `font-family: inherit`, added font preconnect hints, and later switched the base font itself to Roboto with `display:optional` for more consistent load behavior. |

### 🧹 Comment Cleanup (Round 2, `index.html`)
A further 11 comments that had reverted to change-history narration during the bug-fix round above were rewritten as forward-looking documentation.

---

## 17. Latest Updates — v12 (July 2026)

This release fixes a real salary-calculation discrepancy between the individual payslip and the Excel salary report, adds print-inclusion controls to the payslip, redesigns History into a unified table format, exposes the long-implemented Security roles in the Admin Panel, and reverts the brand identity from DEPL HRMS back to **Capco Workforce / Capco Capacitors** across all four files.

### 🔴 Salary Calculation Fix

The Monthly Salary Report (Excel) and the individual Employee Payslip could disagree for the same employee/month:

| Problem | Fix |
|---|---|
| **Sandwich Rule was never applied in the Excel report** | `exportSalaryReport()` never called `isSandwiched()` at all — only the payslip did. The Excel report now builds the same minutes-aware attendance map and applies the identical rule, so Payable Days (and everything prorated from it) matches the payslip exactly. |
| **VPF was missing from the Excel report entirely** | Added as both a raw data column and a deduction formula column, sourced the same way the payslip already does. |
| **ADV. was being treated as a deduction** | It was subtracted from Gross to reach Net in the old Excel layout. ADV. is now a separate, additive column positioned *after* Net — Final Payable = Net + ADV. — matching how it should have worked from the start. Applied consistently in both the Excel report and the individual payslip. |

### 🆕 Payslip: Editable ADV. + Print Inclusion Toggles
- The payslip now shows Net Payout → an editable ADV. field → Final Payable (Net + ADV.), both in the in-app view and the printable PDF.
- **Fixed:** the ADV. value entered in the in-app view previously reset to 0 in the print window, forcing a second entry there. It now carries over automatically.
- **Fixed the underlying cause:** the print window used to auto-trigger the print dialog on a 350ms timer, which fired before there was any real chance to review or adjust ADV. That timer is gone — a visible **Print / Save as PDF** button now lets the person review everything first.
- Two new checkboxes — **Include ADV. section** and **Include Year-to-Date Summary** — control what's actually written into the print output. Unchecking both means neither appears in the printed page or saved PDF at all, not just visually hidden.

### 🔴 History: Table Redesign + Hang Fix

| Issue | Fix |
|---|---|
| **Filtering History to a single employee hung at "Searching..." forever** | `renderHistory()`'s single-employee table view referenced a `totalOTMins` variable that was never declared, throwing silently mid-render before the placeholder text could ever be replaced. Declared it properly. |
| **CSV export silently ignored the employee filter** | A stale comment claimed filtering happened client-side; no such filtering existed anywhere in the function. It now applies the same server-side filter as the on-screen search. |
| **History results were split between a card list (multi-employee) and a table (single-employee)** | Unified into one table format for both cases — an Employee column appears automatically when the result set spans more than one person. |

Both `searchHistory()` and `exportCSV()` in `Code.gs` now accept the selected employee ID(s) and filter server-side before building the response, instead of pulling the entire attendance history across all time and filtering it in the browser — which was the root cause of the hang whenever no month/date was also selected.

### 🆕 Security Roles Exposed in the UI
`Security-1` and `Security-2` were already fully implemented in the app's permission logic (Attendance Entry + History access, matching the in-app Role Guide text) but were never actually selectable when creating a user — the only way to assign one was editing the Users sheet directly. Both are now options in the Admin Panel's Create/Edit User dropdown.

### 🎨 Rebranding — DEPL HRMS → Capco Workforce

The June 2026 DEPL rebrand (Section 15) has been reverted across all four files:

| File | Changes |
|---|---|
| `index.html` | Title, favicon set, apple-touch-icon, splash screen text, sidebar label, PDF payslip logo/header/footer, CSV export filename, and Excel report title all reverted to Capco branding. Favicon set reduced to the two sizes with real Capco assets (192×192, 512×512) rather than guessing at sizes without a real source file. New visual redesign layered on top: shifted accent color, a second heading font (Work Sans, alongside Roboto for body text), new micro-interactions (button/card hover states, staggered dashboard fade-ins, a themed toggle animation), and the app now **defaults to light mode** on first load. |
| `manifest.json` | `name` → `"Capco Workforce"`, `short_name` → `"Capco HR"`, `description` and icons reverted to the original Capco assets. `theme_color`/`background_color` updated to `#ffffff` to match the new light-first design. `id`/`start_url`/`scope`/shortcut URLs **deliberately left as `/DEPL/`** — that's the real GitHub Pages folder name and hosting path, unrelated to in-app branding. |
| `sw.js` | `CACHE_VERSION` → `capco-workforce-v1`, `DB_NAME` → `CapcoOfflineDB`, `META_DB_NAME` → `CapcoSWMeta`, offline page branding reverted. The activate handler's cache-cleanup logic now recognizes all three cache-name generations this app has used (original Capco, DEPL, and current Capco Workforce) so any user upgrades cleanly regardless of which version they're on. |
| `Code.gs` | File header, `doGet()` health-check text, three cache-key constants, and the password-reset email's subject/signature (the only backend text actually sent to employees) all reverted. The nightly backup Drive folder name changed to "Capco Workforce Backups" — see [Known Limitations](#18-known-limitations) regarding the older folder. |

---

## 18. Known Limitations

1. **Google Apps Script 6-minute execution limit:** Very large full-year CSV exports may time out. Filter by month.
2. **iOS Safari:** Background Sync API is unsupported. Requires the app to be open when the device reconnects to flush the offline punch queue.
3. **Face API on low-end mobile:** WebGL/GPU rendering depends on the device chipset. The `inputSize: 160` setting significantly mitigates this.
4. **PWA screenshots:** The manifest screenshot entries still use placeholder-era URLs. Chrome's install prompt shows these until replaced with real screenshots (see Section 9 checklist).
5. **Face data encryption is a lightweight stream cipher, not AES:** Apps Script has no native AES implementation. The current HMAC-SHA256 keystream cipher protects against casual spreadsheet access but is not a substitute for a hardware-backed KMS if a stronger guarantee is ever required.
6. **Password reset email quota:** `MailApp.sendEmail()` runs under the deploying Google account's daily email quota (~100/day on personal Gmail, higher on Workspace).
7. **Landscape mode falls back to the desktop layout:** Functional, but any viewport wider than 767px uses the same collapsed-sidebar layout built for tablets/desktops rather than a purpose-built landscape phone layout.
8. **Old backup folder not migrated:** The nightly backup folder was renamed from "DEPL HRMS Backups" to "Capco Workforce Backups" as part of the v12 rebrand. Apps Script can only create/find a folder by name, not rename an existing Drive folder — so backups from before this change remain in the old folder, untouched but no longer actively written to or pruned. Move them manually in Drive if you want everything consolidated.
9. **Hosting path doesn't match current branding:** The app is served from `/DEPL/` on GitHub Pages (`github.com/vangaprasannakumar/DEPL`) — this is intentional and unchanged; renaming it would require updating `manifest.json`'s `start_url`/`scope` and could break the installed PWA's routing, so it was left as-is.
10. **`localStorage` session key:** The session key `capco_attendance_user` retains its original name for backward compatibility across all rebranding rounds. Existing logged-in sessions are preserved without requiring re-login.

---

## 19. Troubleshooting

**`"APP_SECRET script property is not configured"`**
Add `APP_SECRET` to Apps Script → Project Settings → Script Properties before anyone can log in — this also blocks any face-data save/read, since the same secret drives biometric encryption. See Section 7.2.

**`"Too many failed login attempts. Please try again in 15 minutes."`**
Five consecutive failed logins triggered the rate limiter. Wait 15 minutes — the counter clears automatically.

**`"Session Expired"` immediately after login / API Permission Error**
Re-deploy the Apps Script as a **New Deployment** and confirm *Who has access* is set to **Anyone**. Update `GOOGLE_API_URL` in both `index.html` and `sw.js`.

**Camera frozen on "Starting Camera..."**
The site must be served over **HTTPS**. Confirm your GitHub Pages URL uses `https://`.

**Face enrollment / re-enrollment fails with an HMAC or "Save Failed" error**
Resolved in v11 — confirm `Code.gs` has been redeployed as a **New Deployment** after updating, and that `GOOGLE_API_URL` in `index.html`/`sw.js` points to the new deployment URL.

**Leave day count mismatch between preview and actual days marked**
The preview counts working days excluding Sundays. The server additionally skips public holidays — the preview label states this.

**Employee payslip shows another employee's data (Employee-role login)**
Column E (`Empl_ID`) in the Users sheet is blank or wrong for this login. The user must log out and back in after fixing it.

**Kiosk stays on "Hold still..." and never punches**
The 2-of-3 frame confirmation is working correctly — the same face must appear in 2 consecutive scan frames. Re-enroll via the Admin panel if it persists.

**Offline punches synced but LOP leaves showing as EL**
The offline punch was recorded before the v9 `leaveType` fix. Clear the old IDB store via DevTools → Application → IndexedDB → `CapcoOfflineDB` → delete, then re-enter the leave manually while online.

**Monthly Excel CO column showing 0**
SOT bonus credits are only written when the employee punches OUT and elapsed time is ≥ 12 hours. Manually entered punch-out times don't trigger the flag retroactively.

**Salary Report and Payslip showing different Net Pay for the same employee/month**
Resolved in v12 — confirm `Code.gs` has been redeployed. Both now apply the sandwich rule and VPF identically.

**ADV. value resets to 0 in the printed payslip**
Resolved in v12 — the value now carries over automatically from the in-app view. If still seeing this, confirm `index.html` is the latest build (hard-refresh or clear the Service Worker).

**PDF printing as a full webpage / print dialog opens before I can edit ADV.**
Resolved in v12 — printing is no longer automatic. Use the **Print / Save as PDF** button inside the payslip when ready.

**Service Worker not updating after a new deploy**
Confirm `<meta name="app-version" content="YYYYMMDD">` in `index.html` was updated (a same-day revision suffix like `20260709b` is fine). If not using the meta tag, bump `CACHE_DATE_FALLBACK` in `sw.js`.

**App won't rotate to landscape / rotating shows no navigation at all**
If rotation itself doesn't work, the app must be **reinstalled** (not just refreshed) after a manifest change — an installed PWA doesn't re-read `manifest.json` on a normal reload.

**Password reset email never arrives**
Check column C (Email) is populated for that username. Also check the deploying Google account's daily `MailApp` quota.

**Nightly backups seem to have "disappeared"**
They haven't — as of v12 they're written to a new "Capco Workforce Backups" Drive folder instead of the old "DEPL HRMS Backups" one. See [Known Limitations](#18-known-limitations).

---

*Capco Workforce — Capco Capacitors, Muppireddypally, Telangana.*
*v12 — July 2026 | Previous: v11 — July 2026, v10 — June 2026, v9 — May 2026*
