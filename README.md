# 🏢 Capco HRMS & AI Attendance System

> **Zero-server, AI-powered factory attendance, payroll, and HR management system.**
> Built on Google Sheets + Google Apps Script + a PWA frontend. No recurring hosting costs.

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
14. [Latest Upgrades & Fixes — v9 (May 2026)](#14-latest-upgrades--fixes--v9-may-2026)
15. [Known Limitations](#15-known-limitations)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. System Overview

Capco Master AI is a **Progressive Web App (PWA)** that runs entirely on Google infrastructure with zero recurring server costs. Designed for high-speed factory environments, it replaces manual attendance registers and spreadsheet payroll with:

- **Instant AI facial recognition** with 2-of-3 frame confirmation and live canvas bounding-box tracking for fraud-proof punch IN / OUT at a shared kiosk.
- **True Offline-first architecture** utilizing IndexedDB and the Background Sync API so factory floor punches are never lost, even if the browser tab is closed.
- **Automated payroll engine** that dynamically calculates prorated salary, overtime, ESI, PF, VPF, PT, and comp-off (SOT) based on mathematical calendar models.
- **Native PDF payslips** printable directly from the app with crisp vector text.
- **Multi-tier role access** securely authenticated via short-lived Session Tokens with brute-force protection (Admin, HR, Standby kiosk, and Employee self-service).
- **Live dashboard** featuring visual Enrolled Staff Avatars and instant Excel matrix exports.
- **Employee correction requests** — a complete workflow for employees to flag incorrect attendance for HR/Admin review.

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
│  REST-like API · LockService · SHA-256 Auth │
│  Rate Limiter · Script Properties (SECRET)  │
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
| Frontend | HTML / CSS / Vanilla JS | Single-file PWA — no build step required, responsive CSS transforms. |
| AI | face-api.js (TinyFaceDetector) | Client-side facial recognition — processes instantly via WebGL. |
| Backend | Google Apps Script (doPost) | REST-like API with script locking, session tokens, rate limiting, and cache chunking. |
| Database | Google Sheets (8 tabs) | Zero-cost persistent storage utilizing lightning-fast ArrayFormulas. |
| Offline | Service Worker + IndexedDB | Stale-while-revalidate shell; pending punches background auto-sync with 25s timeout guard. |
| Export | ExcelJS & Native `window.print` | High-quality Excel matrices and native crisp PDF generation. |
| Secrets | Google Script Properties | `APP_SECRET` stored server-side — hard-fails if missing, never exposed to the browser. |

---

## 3. File Structure

```text
capco-hrms/
├── index.html       # Entire frontend — UI, styles, AI, canvas overlays, and JS logic
├── manifest.json    # PWA manifest — icons, shortcuts, 4 screenshots (narrow + wide)
├── sw.js            # Service Worker — auto-versioned cache, offline fallback, bg sync
└── Code.gs          # Google Apps Script backend — API actions and payroll math
```

> All four files represent the complete system. There are no dependencies to install, no `node_modules`, and no build pipeline.

---

## 4. Feature Reference

### 4.1 Manual Attendance Entry
- HR / Admin searches for an employee using a debounced, lag-free live-filter dropdown.
- Selects **Punch IN**, **Punch OUT**, **Mark Permission**, or **Mark Leave**.
- Leave type selection: **EL** (Earned Leave — deducts balance) or **LOP** (Loss of Pay — no deduction). The selected type is preserved in offline punch payloads and survives sync.
- Leave confirmation dialog shows the **employee's exact current leave balance** before deducting.
- Optional free-text remarks field for context.
- Live status badge queries the database instantly to prevent duplicate punches.
- After a successful punch, only the affected employee's status badge refreshes — no full data reload.

### 4.2 AI Face Recognition Kiosk (2-of-3 Frame Confirmation)
- **Standby role** devices show only the kiosk UI.
- Admin selects IN or OUT; camera activates (with mobile autoplay and `webkit-playsinline` bypasses).
- **2-of-3 Frame Confirmation:** The kiosk requires the same employee to be recognized in at least 2 consecutive frames before logging the punch. This eliminates false positives from look-alikes or partial faces walking past the camera.
- **Live Canvas Tracking:** A blue bounding box draws directly over the recognized face with the employee's name.
- **"Hold still..."** feedback shown while frame count accumulates, so the user knows to stay in frame.
- Text-to-speech announces: *"[Employee Name]"* to confirm.
- **Countdown timer:** 120-second visible timer displayed live so the kiosk operator knows when it auto-closes.
- The employee's `category` is passed to the server at punch time — the backend does not need to re-query the employee list for the SOT bonus check.

### 4.3 Face Enrollment
- Admin finds the employee card, taps **Enroll Face** (or **🔄 Re-enroll Face** if already enrolled).
- Live canvas box tracks the face to ensure good lighting.
- Camera captures 5 distinct 128-float descriptors.
- Descriptor is JSON-serialised and saved to column Q of `List_of_Empl`.

### 4.4 True Offline Background Sync
- If the factory loses internet, punches are saved directly to the browser's **IndexedDB** — including the `leaveType` field (EL or LOP) so it is faithfully reproduced when the punch syncs to the server.
- The Service Worker registers a `sync` event.
- When the OS detects Wi-Fi, it silently POSTs the punches to Google using a **25-second AbortController timeout** to prevent stalled sync events.
- Backend deduplicates via fingerprint (`emplId|date|time|action`) to guarantee zero duplicate rows.
- Punches are grouped by session token before sending — multi-user offline sessions sync correctly under their own authentication context.

### 4.5 Attendance History & Requests
- Search by **month**, **exact date**, or **employee name / ID**.
- **Export Filtered View:** Convert the exact on-screen filtered results directly to a CSV.
- **Employee Correction Requests:** Employees can click **"Req Edit"** on their history. This opens a modal to describe the issue. The request is pushed to the `Audit_Log` tab for HR to review and resolve.

### 4.6 Salary Engine & PDF Payslips
- Computes perfect payroll logic including Ghost-Sunday-proof calendar mathematics.
- **Comp-Off (CO) tracking:** SOT shift employees who work ≥ 12 hours receive a 0.5-day leave credit. Monthly Excel reports now show the real CO count per employee (previously hardcoded to 0).
- Generates precise HTML payslips with OT, deductions, and word-converted net pay.
- **Native PDF Printing:** Uses the browser's native `window.print()` engine to ensure PDFs are downloaded as crisp, selectable text documents.

### 4.7 Live Admin Dashboard
- Live total staff, present, currently in, out, leave, and late arrival stats.
- **Enrolled Avatars:** A horizontally scrolling UI showing circular, Apple-style initial avatars for every employee who has successfully registered their face.
- **Monthly Excel Matrix:** Uses `exceljs` to generate a frozen-pane attendance matrix with live Leave (EL), Present (P), Absent (A), and **Comp-Off (CO)** markers.

---

## 5. User Roles

| Role | Entry | History | Payslip | Correction Request | Admin Panel | Kiosk |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Admin** | ✅ | ✅ (all) | — | ✅ Resolve | ✅ Full | — |
| **HR** | ✅ | ✅ (all) | — | ✅ Resolve | ✅ No user mgmt | — |
| **Employee** | — | ✅ Own only | ✅ Own | ✅ Submit | — | — |
| **Standby** | — | — | — | — | — | ✅ Only |

> Role names are **case-sensitive**. Type them exactly as shown when creating users.

---

## 6. Google Sheet Structure

### Tab: `Data` (Attendance Log)
*(Columns A through O)*: Date, Day, Empl ID, Name, Shift, Shift Start, IN Time, Shift End, OUT Time, Tot. Hrs, OT Hrs, Perm., Remarks, Logged By, Flags.

> Columns J and K use `ARRAYFORMULA` in Row 1. The backend targets the first truly empty row in Column C to bypass ghost rows created by the formulas.
> Column O (Flags) stores internal markers such as `SOT_BONUS_ADDED` (used by the CO tracking in monthly reports) and `LOP`.

### Tab: `List_of_Empl` (Employee Master)
*(Columns A through Q)*: ID, Name, Shift, Category, Leave Bal, Gross, Basic, HRA, Conv, Spl, Med, ESI, PF, VPF, PT, PIN, Face Data.

### Tab: `Users` (App Logins)
*(Columns A through E)*: Username, Role, Email, Password (SHA-256 hashed), **Empl_ID**.

> **Column E — Empl_ID** is new in v9. For **Employee-role accounts**, enter the matching employee ID from `List_of_Empl` column A. Leave blank for Admin, HR, Security, and Standby accounts. This allows the app to reliably link an Employee login to their payslip and leave balance **without name-matching**, which fails when two employees share the same name.

### Tab: `Shifts`
*(Columns A through D)*: Shift name, Shift Start, Shift End, OT Hours threshold.

### Tab: `H/S` (Holidays & Sundays per Month)
*(Columns A through C)*: Month name, No. of Days, PH count.

### Tab: `OT_Empl`
*(Columns A through C)*: Empl ID, Name, OT Gross (override gross for OT rate calculations).

### Tab: `List of Holidays`
*(Columns A through B)*: Date, Reason. Used to mark public holidays in attendance and payroll.

### Tab: `Audit_Log`
*(Columns A through F)*: Date/Time, Admin Name, Empl ID, Empl Name, Old Record, New Record. All admin edits and correction requests are appended here immutably.

---

## 7. API Keys & Secrets — How to Configure

### 7.1 The Google Apps Script Web App URL (`GOOGLE_API_URL`)
This public-facing HTTPS endpoint routes the PWA to your Sheet.
Paste this URL in **two files**:
- **`index.html`** (near the top of the `<script>` tag)
- **`sw.js`** (first line of the file — `const GOOGLE_API_URL = "...";`)

### 7.2 The `APP_SECRET` (Session Token Signing Key)
This **is a true secret**. It must **never** be placed in the frontend. As of v9, the backend **hard-fails at login** if `APP_SECRET` is not set — there is no insecure fallback.

1. In Apps Script editor → click **⚙️ Project Settings**
2. Scroll to **Script Properties** → **Add script property**
3. Property name: `APP_SECRET`
4. Value: *[a long random string — minimum 32 characters]*

> ⚠️ If you see `"APP_SECRET script property is not configured"` on login, you skipped this step.

### 7.3 The `app-version` Meta Tag (Cache Auto-Busting)
As of v9, the Service Worker reads the cache version directly from `index.html` at install time. **No more manual `CACHE_DATE` bump in `sw.js`.**

In `index.html`, update the content of this tag on every deploy:
```html
<meta name="app-version" content="20260513">
```
Format: `YYYYMMDD`. Changing this value causes all users to receive the fresh version on their next visit.

---

## 8. Setup & Deployment

1. Create a new Google Sheet with the exact 8 tabs listed in Section 6.
2. In Google Sheets, go to **Extensions → Apps Script**.
3. Paste `Code.gs`, then go to **⚙️ Project Settings → Script Properties** and add `APP_SECRET`.
4. Click **Deploy → New Deployment** (Type: Web App, Execute As: Me, Who has access: Anyone).
5. Copy the Web App URL and paste it into `GOOGLE_API_URL` in both `index.html` and `sw.js`.
6. In the `Users` sheet, add your first Admin row manually. Password can be plaintext — it will be SHA-256 hashed automatically on first login.
7. For Employee-role users: add their `Empl_ID` (column E) matching their ID in `List_of_Empl`.
8. Host `index.html`, `manifest.json`, and `sw.js` on GitHub Pages or any static HTTPS host.
9. Update `<meta name="app-version" content="YYYYMMDD">` in `index.html` to today's date.
10. Replace the placeholder `src` URLs in `manifest.json` screenshots with real app screenshots.

---

## 9. Deployment Checklist

- [ ] **Updated `app-version` meta tag** in `index.html` to today's date (`YYYYMMDD`). *(Replaces the old manual `CACHE_DATE` bump in `sw.js`.)*
- [ ] Re-deployed Google Apps Script as **New Deployment → Execute As: Me → Anyone**.
- [ ] Updated `GOOGLE_API_URL` in **both** `index.html` and `sw.js`.
- [ ] Confirmed `ARRAYFORMULA` exists in `Data` sheet cells **J1** and **K1**.
- [ ] Verified `APP_SECRET` is configured in Script Properties.
- [ ] Added **column E (Empl_ID)** to the `Users` sheet and populated it for all Employee-role accounts.
- [ ] Replaced placeholder screenshot `src` URLs in `manifest.json` with real 540×720 (narrow) and 1280×720 (wide) screenshots.

---

## 10. Offline & Sync Behaviour

1. Device goes offline; `submitAttendance()` writes the punch to **IndexedDB** — including `leaveType` (EL/LOP) and `shift`, so all fields are preserved exactly.
2. A `sync-punches` tag is registered with the OS via `SyncManager`.
3. When the OS regains Wi-Fi, `sw.js` silently POSTs the punches to `Code.gs` with a **25-second timeout**. If the request stalls, the browser schedules a retry automatically.
4. Punches are **grouped by session token** before sending. This ensures punches recorded under different login sessions (e.g., morning employee + afternoon admin) are authenticated independently.
5. `Code.gs` deduplicates via fingerprint (`emplId|date|time|action`).
6. Processed IDB records are deleted individually after confirmation. If a server error occurs (e.g., session expired), records are **kept** in IDB for the next retry.

> **iOS Safari:** Background Sync API is unsupported. Fallback `online` event listeners push data instantly when the app is opened or the device reconnects.

---

## 11. AI Face Recognition

### Model Details
Uses `face-api.js v0.22.2`. Runs entirely in-browser via WebGL. Zero cloud calls.
All weight URLs are pinned to `@0.22.2` in both `sw.js` and `index.html` to prevent silent model-version drift.

| Mode | inputSize | scoreThreshold | Notes |
|---|---|---|---|
| **Kiosk (scan)** | `160` | `0.3` | Optimized for speed — 4× faster GPU pass. 2-of-3 frame confirmation compensates for lower resolution. |
| **Enrollment** | `320` | `0.3` | Higher resolution for maximum descriptor accuracy during the 5-sample capture. |

- **Matching threshold:** `FaceMatcher` strictness is set to **0.6**.
- **Tracking:** A `<canvas>` layer draws a real-time bounding box around the recognized face for user feedback.

### 2-of-3 Frame Confirmation
The kiosk maintains a per-employee `frameHits` counter. Only when the same employee is matched in **2 or more consecutive frames** does the punch fire. All other employees' counters reset to 0 on each frame. This prevents false positives from:
- Partial faces at the edge of frame
- Look-alikes walking past the camera
- Low-light single-frame mismatches

### Enrollment
- 5 distinct 128-float descriptors are captured per employee.
- Descriptors are JSON-serialised and written to column Q of `List_of_Empl`.
- After enrollment, the `FaceMatcher` is rebuilt from the updated descriptor set.

---

## 12. Payroll Engine Logic

```text
Payable Days = Present Days + Public Holidays + Sundays in month − Sandwich Days
Proration Factor = Payable Days / Total Days in Month

OT Per Hour  = Round(OT Gross / Total Days / 8, 2)
OT Earnings  = Total OT Hours × OT Per Hour

ESI = Prorated Gross × 0.0075   (only if Gross ≤ ₹21,000)
PF  = Prorated Basic × 0.12
PT  = ₹200 (Gross ≥ ₹20,000) | ₹150 (Gross ≥ ₹15,000) | ₹0

Net Pay = Prorated Gross + OT Earnings − (ESI + PF + VPF + PT)

SOT Comp-Off = +0.5 leave day per shift where employee works ≥ 12 hours
              (flagged as SOT_BONUS_ADDED in column O of Data sheet)
```

### Sandwich Rule
If an employee is absent on a day sandwiched between two non-working days (Sundays or holidays) and neither neighbour worked at least 4 hours, the sandwich day is not counted as a Payable Day. The rule has a **14-day safe search window** — if no valid working day is found within 14 days in either direction, the sandwich check defaults to `false` (no penalty).

### Leave Marking
- **EL (Earned Leave):** Deducts 1.0 from the employee's leave balance. Marked in the Data sheet as `IN = LEAVE`, `OUT = LEAVE`.
- **LOP (Loss of Pay):** No leave balance deduction. The `LOP` flag is written to column O. `markLeaveAdmin()` skips Sundays and public holidays and processes the date range in a single optimized pass.

---

## 13. Security Model

| Control | Detail |
|---|---|
| **Passwords** | SHA-256 hashed on the client before transit. Plaintext passwords in the Users sheet are silently upgraded to hash on first login. |
| **Session Tokens** | 5.5-hour expiring tokens stored in GAS `CacheService`. Validated and refreshed on every authenticated request. |
| **APP_SECRET** | Required Script Property. Hard-fails with a clear error if missing — no insecure fallback. |
| **Login Rate Limiting** | After **5 failed attempts** within **15 minutes**, the username is temporarily locked. Counter stored in `CacheService`; clears automatically after 15 minutes or immediately on successful login. |
| **Self-Deletion Guard** | An Admin cannot delete their own account — both the backend (`deleteUser()`) and the Admin Panel UI (disabled Delete button) enforce this. |
| **Concurrency** | `LockService.waitLock(15000)` prevents duplicate punches during heavy shift-change windows. |
| **Audit Trail** | All admin edits and correction requests are immutably appended to `Audit_Log`. |

---

## 14. Latest Upgrades & Fixes — v9 (May 2026)

This release is a comprehensive audit and hardening pass covering **13 bug fixes, 6 performance upgrades, and 7 structural modifications** across all 4 source files.

### 🔴 Bugs Fixed

| ID | File | Fix |
|---|---|---|
| ERR-01 | Code.gs | `markLeaveAdmin()` — sheet re-read was inside every loop iteration (up to 30 full reads for a monthly leave). Now pre-reads once, builds an in-memory `rowLookup` map, and tracks `nextInsertRow` manually. Eliminates GAS timeout risk for multi-day leave ranges. |
| ERR-02 | Code.gs / index.html | `logAttendance()` called `getEmployees()` on every punch-out just to read the SOT category. Now accepts an optional `emplCategory` 9th parameter. Frontend sends `category` from its cached init data; `syncOfflineData` passes it from a pre-loaded category cache. |
| ERR-03 | Code.gs | `getEmpDashData()` read the holiday sheet twice. The `holData` array is now hoisted to the outer scope and reused in both loops — one sheet read instead of two. |
| ERR-04 | Code.gs | `deleteUser()` had no self-deletion guard. An Admin could delete their own account, locking the system. Now returns a clear error if `delUser === callerUser`. Admin Panel UI also disables the Delete button when editing your own account. |
| ERR-05 | Code.gs | `exportMonthlyDashboard()` had `const coCount = 0` — Comp-Off column always showed 0. Now scans column O (Flags) for `SOT_BONUS_ADDED` while building `attMap`, accumulates 0.5 per occurrence in `coMap{}`, and writes the real per-employee CO total. |
| ERR-06 | Code.gs | `generateSessionToken()` had `\|\| 'capco-internal-2025'` fallback. A missing `APP_SECRET` silently degraded to a publicly-known static secret, allowing session forgery. Now throws an explicit error with setup instructions. |
| ERR-07 | Code.gs | `isSandwiched()` 14-day search loops had no post-loop validity check. If 14 consecutive days were all holidays/Sundays, the loop exited with a non-working day pointer, producing a wrong sandwich verdict. Added `prevFound` / `nextFound` boolean guards — returns `false` (safe default) when no valid working day is found. |
| ERR-08 | index.html / Code.gs | `leaveType` (EL/LOP) was missing from the offline punch payload. Synced LOP leaves were silently treated as EL, incorrectly deducting leave balance. Now included in `savePendingPunch()` and passed through `syncOfflineData()` → `logAttendance()`. |
| ERR-09 | index.html | `fetchAllData(true)` was called after every single successful punch — reloading all 35+ employee records and shifts. Replaced with `fetchLiveStatus(emp.id)` which refreshes only the affected employee's status badge. |
| ERR-10 | index.html | `myEmplId` was matched by comparing login username to employee names — fails when two employees share a name. Now uses `emplId` returned by `verifyLogin()` (stored in column E of Users sheet). Name-based fallback retained for legacy accounts, but ID-only (not name). |
| ERR-11 | index.html | Leave day preview count excluded Sundays but not public holidays. The server skips both. Preview label now reads "Up to N working days... — public holidays also excluded" to avoid confusion. |
| ERR-12 | sw.js | `CACHE_DATE = '20260430'` was hardcoded. A forgotten bump on deploy meant users kept serving stale UI. SW now reads `<meta name="app-version" content="YYYYMMDD">` from `index.html` at install time via `readAppVersionFromHTML()`. Falls back to `CACHE_DATE_FALLBACK` if the tag is absent. |
| ERR-13 | manifest.json | All 3 PWA screenshots pointed to the company logo. Chrome's "Install App" dialog showed the logo 3 times. Fixed structure with 4 entries (3 narrow + 1 wide for desktop install), each with detailed `_comment` instructions on how to take and upload the real screenshot. |

### 🔵 Performance Upgrades

| ID | Upgrade |
|---|---|
| UPG-01 | `syncOfflineData` now pre-loads both `emplNameCache` and `emplCategoryCache` in a single `getEmployees()` call, then passes category to each `logAttendance()` invocation — eliminating per-punch-out sheet reads during bulk sync. |
| UPG-02 | Login rate limiting: 5 failed attempts → 15-minute lockout, enforced via `CacheService`. Zero-cost, no extra sheet. Counter clears on success. |
| UPG-03 | Kiosk `inputSize` reduced from 320 → **160** (4× faster GPU pass per frame). 2-of-3 frame confirmation compensates for lower resolution by requiring consensus across multiple frames. |
| UPG-04 | 25-second `AbortController` timeout added to background sync POST. A stalled GAS response previously held the sync event open until the browser's watchdog killed it with an unhelpful error. Now times out cleanly and reschedules retry. |
| UPG-05 | POST network failure in the fetch handler now returns a structured `503` JSON response instead of a bare network error, so the offline punch handler receives a parseable object. |
| UPG-06 | Resolved cache name computed during `install` is persisted to a tiny `CapcoSWMeta` IDB database and read back during `activate`. Both lifecycle events now use the identical, auto-detected cache name without re-fetching `index.html`. |

### 🟡 Structural Modifications

| ID | Modification |
|---|---|
| MOD-01 | `UC_EMPL_ID = 5` constant added (column E of Users sheet). `verifyLogin()` returns `emplId`. `saveUser()` and `getAdminUsersData()` handle column E. Admin Panel user modal has a new "Employee ID" field with helper text. Employee cards display the linked Empl ID. |
| MOD-02 | `saveUser()` preserves the existing password hash when the password field is left blank during an edit — previously any save without a new password would overwrite with a blank hash. |
| MOD-03 | `PAGE_TITLES.admin` renamed from `'Inventory'` → `'Admin Panel'`. The "Inventory" label was misleading in an HR application. |
| MOD-04 | `markLeaveAdmin()` audit log now includes the leave type (`[EL]` or `[LOP]`) in the Audit_Log entry for clearer history. |
| MOD-05 | `app-version` meta tag added to `index.html` `<head>`. This is the sole deploy-time version bump required going forward — `sw.js` reads it automatically. |
| MOD-06 | Admin Panel Delete button is disabled (greyed out with tooltip) when the modal is opened for the currently logged-in account. Backend enforces the same guard independently. |
| MOD-07 | `CapcoSWMeta` IDB database introduced in `sw.js` to persist the auto-resolved cache name between the `install` and `activate` lifecycle events. |

---

## 15. Known Limitations

1. **Google Apps Script 6-minute execution limit:** Massive full-year CSV exports may time out. Filter by month. `markLeaveAdmin()` for very long date ranges (e.g. 3 months) is now significantly faster due to ERR-01 fix, but still subject to this limit for extreme ranges.
2. **iOS Safari:** Background Sync API is unsupported; requires the app to be open to flush the offline punch queue. The `online` event listener handles this automatically when the app is in the foreground.
3. **Face API Mobile Fallbacks:** WebGL/GPU rendering relies on the mobile device's chipset. If blocked by battery savers, the CPU fallback may experience lower frame rates. The kiosk `inputSize: 160` setting significantly mitigates this.
4. **Screenshots in manifest.json:** The 4 PWA screenshot entries still use placeholder URLs. Chrome's install prompt will show placeholder images until replaced with real screenshots. See Section 9 checklist.
5. **Biometric data at rest:** Face descriptor arrays (128 floats × 5 samples per employee) are stored as plain JSON text in column Q of `List_of_Empl`. Consider encrypting this column using `APP_SECRET` as the key for compliance with India's DPDP Act 2023 (planned for v10).

---

## 16. Troubleshooting

**"APP_SECRET script property is not configured"**
You must add `APP_SECRET` to Script Properties before the app can log anyone in. See Section 7.2.

**"Too many failed login attempts. Please try again in 15 minutes."**
Five consecutive failed logins for that username triggered the rate limiter. Wait 15 minutes. The counter clears automatically. If you are locked out as the only Admin, go to Apps Script → `CacheService` does not have a UI — wait 15 minutes or deploy a temporary no-rate-limit version, log in, then re-deploy.

**"API Permission Error" / "Session Expired" immediately after login**
Re-deploy the Google Script as a **New Deployment** and verify `Who has access` is set to **Anyone**. Update the URL in `index.html` and `sw.js`.

**Camera frozen on "Starting Camera..."**
Ensure the site is hosted on a secure `HTTPS` context. Mobile browsers block camera access on plain HTTP.

**Leave day count mismatch between preview and actual days marked**
The preview counts working days excluding Sundays. The server additionally skips public holidays. The difference is by design — the preview label now states "public holidays also excluded" to communicate this.

**Employee payslip showing another employee's data (Employee-role login)**
Column E (Empl_ID) in the `Users` sheet is either blank or contains the wrong employee ID for this login. Update it with the correct ID from `List_of_Empl` column A. The user must log out and back in after the fix.

**Kiosk not firing after face detection (just shows "Hold still...")**
This is the 2-of-3 frame confirmation working correctly. The same face must appear in 2 consecutive scan frames. Ensure the employee is holding still and facing the camera squarely. If this persists, the enrolled descriptor quality may be low — re-enroll using the Admin panel.

**Offline punches syncing but LOP leaves showing as EL in history**
The offline punch was recorded before the v9 `leaveType` fix. Those pre-v9 IDB records do not contain a `leaveType` field. Clear the IDB store manually via DevTools → Application → IndexedDB → `CapcoOfflineDB` → delete, then re-enter the leave using the manual entry screen while online.

**Monthly Excel report CO column showing 0**
SOT bonus credits are only recorded in column O (Flags) of the `Data` sheet when the employee punches OUT and the elapsed time is ≥ 12 hours. If punch-out times were entered manually (admin update), the `SOT_BONUS_ADDED` flag is not written retroactively. Re-confirm via the Data sheet that the flag exists in column O for the relevant rows.

**PDF generating as a full webpage print**
This is the intended native behavior for mobile OS. The CSS `@media print` query strips away the UI to leave only the payslip document. On desktop, use Chrome's "Print to PDF" option for the cleanest result.

**Service Worker not updating after a new deploy**
Confirm you updated `<meta name="app-version" content="YYYYMMDD">` in `index.html` to the new deploy date. If you are not using the meta tag, bump `CACHE_DATE_FALLBACK` in `sw.js` AND update `sw.js` itself (any change triggers a SW reinstall).

---

*Built for Capco Capacitor, Muppireddypally, Telangana.*
*v9 — May 2026. Previous version: v8, April 2026.*
