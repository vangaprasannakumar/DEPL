# 🏢 DEPL HRMS — HR & AI Attendance System

> **Zero-server, AI-powered factory attendance, payroll, and HR management system.**
> Built on Google Sheets + Google Apps Script + a PWA frontend for Dada Energies Pvt. Ltd.
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
15. [Latest Updates — v10 (June 2026)](#15-latest-updates--v10-june-2026)
16. [Known Limitations](#16-known-limitations)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. System Overview

**DEPL HRMS** is a **Progressive Web App (PWA)** that runs entirely on Google infrastructure with zero recurring server costs. Designed for high-speed factory environments at Dada Energies Pvt. Ltd., Muppireddypally, it replaces manual attendance registers and spreadsheet payroll with:

- **Instant AI facial recognition** with 2-of-3 frame confirmation and live canvas bounding-box tracking for fraud-proof punch IN / OUT at a shared kiosk.
- **True offline-first architecture** using IndexedDB and the Background Sync API so factory floor punches are never lost, even if the browser tab is closed.
- **Automated payroll engine** that dynamically calculates prorated salary, overtime, ESI, PF, VPF, PT, and comp-off (SOT) based on mathematical calendar models.
- **Native PDF payslips** printable directly from the app with crisp, selectable vector text.
- **Multi-tier role access** securely authenticated via short-lived session tokens with brute-force protection (Admin, HR, Standby kiosk, and Employee self-service).
- **Live dashboard** featuring visual enrolled-staff avatars and instant Excel matrix exports.
- **Employee correction requests** — a full workflow for employees to flag incorrect attendance for HR/Admin review.

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
| Frontend | HTML / CSS / Vanilla JS | Single-file PWA — no build step, responsive mobile-first layout. |
| AI | face-api.js (TinyFaceDetector) | Client-side facial recognition — processes instantly via WebGL. Zero cloud calls. |
| Backend | Google Apps Script (`doPost`) | REST-like API with script locking, session tokens, rate limiting, and chunked cache. |
| Database | Google Sheets (8 tabs) | Zero-cost persistent storage with lightning-fast ArrayFormulas. |
| Offline | Service Worker + IndexedDB | Stale-while-revalidate shell cache; pending punches background-sync with a 25s timeout guard. |
| Export | ExcelJS + native `window.print()` | Frozen-pane Excel attendance matrices and crisp PDF payslips. |
| Secrets | Google Script Properties | `APP_SECRET` stored server-side — hard-fails at login if missing, never exposed to the browser. |

---

## 3. File Structure

```text
depl-hrms/
├── index.html       # Entire frontend — UI, styles, AI models, canvas overlays, and JS logic
├── manifest.json    # PWA manifest — 7 icon sizes, shortcuts, 4 screenshots (narrow + wide)
├── sw.js            # Service Worker — auto-versioned cache, offline fallback, background sync
└── Code.gs          # Google Apps Script backend — all API actions and payroll mathematics
```

> All four files represent the complete system. There are no dependencies to install,
> no `node_modules`, and no build pipeline.

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

### 4.3 Face Enrollment
- Admin finds the employee card and taps **Enroll Face** (or **🔄 Re-enroll** if already enrolled).
- Live canvas tracks the face to confirm good framing and lighting.
- Camera captures **5 distinct 128-float descriptors** (higher `inputSize: 320` for maximum accuracy).
- Progress dots update in real time showing capture count (`1/5`, `2/5`, …).
- Descriptor array is JSON-serialised and saved to column Q of `List_of_Empl`.
- After enrollment, `FaceMatcher` is immediately rebuilt from the updated descriptor set.

### 4.4 True Offline Background Sync
- If the factory loses internet, punches are saved directly to the browser's **IndexedDB** — including `leaveType` (EL/LOP) and `shift` so all fields survive sync faithfully.
- The Service Worker registers a `sync-punches` tag with the OS.
- When the OS detects Wi-Fi, it silently POSTs all pending punches to `Code.gs` with a **25-second AbortController timeout** to prevent stalled sync events.
- Backend deduplicates via fingerprint (`emplId|date|time|action`) — zero duplicate rows.
- Punches are grouped by session token before sending so multi-user offline sessions authenticate independently.
- **iOS Safari fallback:** Background Sync API is unsupported on iOS. An `online` event listener flushes IDB directly when the app is foregrounded and reconnects.

### 4.5 Attendance History & Requests
- Filter by **month**, **exact date**, **date range**, or **employee name / ID**.
- **CSV Export:** Converts the exact on-screen filtered view directly to a downloadable CSV.
- **Employee Correction Requests:** Employees click **Req** on any history row to open a modal describing the discrepancy. The request is written to `Audit_Log` as a `PENDING CORRECTION` entry. HR/Admin resolve it with a single button that stamps `RESOLVED`.

### 4.6 Salary Engine & PDF Payslips
- Full payroll logic including ghost-Sunday-proof calendar mathematics (see Section 12).
- **Comp-Off (CO) tracking:** SOT employees who work ≥ 12 hours receive a 0.5-day leave credit, flagged as `SOT_BONUS_ADDED` in column O. Monthly Excel reports show the real per-employee CO total.
- Generates HTML payslips with OT earnings, statutory deductions, and number-to-words net pay conversion.
- **Attendance % uses working days** (not total month days) as the denominator — e.g. 22 present out of 22 working days = 100%, not 22/30 = 73%.
- **Native PDF Printing:** `window.open()` + `document.write()` injects the full `<!DOCTYPE html>` payslip document into a new window. `@media print` CSS strips the app chrome, leaving only the payslip.

### 4.7 Monthly Excel Salary Report
- Downloads a formatted `.xlsx` file with one row per employee.
- **Raw data columns (A–M):** Employee ID, Name, Gross, Basic, HRA, Conv, Spl Allow, Medical, P/Days, PH+Sundays, Leaves Availed, Absent Days, Total Days.
- **Formula columns (N–Z):** Prorated Basic, HRA, Conv, Spl, Medical, Gross, EPF, ESI, PT, Advance, Total Deductions, Net Pay, Signature column — all built as live Excel formulas by ExcelJS so HR can manually adjust values.
- Column styles are applied once at the column level; row values are written in bulk — avoids per-cell style objects that caused a ~15-minute browser hang in earlier versions.
- **Cutoff logic:** For the current month, only data up to today is counted. Future days show blank cells (not "Absent"). Past months always use the full month.
- Supports partial-employee export by selection.

### 4.8 Live Admin Dashboard
- Live total staff, present, currently in, out, on leave, and late arrival counts.
- **Enrolled Avatars:** Horizontally scrolling circular avatars (Apple-style initials) for every enrolled employee.
- **Monthly Attendance Matrix (Excel):** Frozen-pane matrix with `X` (present), `EL` (leave), `A` (absent), summary columns (P, H, PD, EL, CO, H/S, A, TPD, PST EL, AVAIL EL) per employee.

### 4.9 Admin Panel
- **Users Management:** Create, edit, and delete app login accounts. Assign roles and link Employee-role accounts to their `Empl_ID` (column E).
- **Employee Master:** Full CRUD for employee records including all salary components, shift assignment, category, leave balance, and PIN.
- **Bulk Employee Import:** Paste CSV to create multiple employees in one shot (duplicate ID check included).
- **Leave Management:** Assign single or multi-day EL or LOP leave ranges. Skips Sundays and public holidays automatically. Processed in a single optimised sheet pass — no per-day re-read.
- **Correction Requests Panel:** View, review, and resolve employee attendance correction requests.
- **Attendance History Edit:** Admin can update IN time, OUT time, Permission time, and Remarks on any historical record. All edits are logged to `Audit_Log` with the before and after values.

---

## 5. User Roles

| Role | Entry | History | Payslip | Correction Request | Admin Panel | Kiosk |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Admin** | ✅ | ✅ All | — | ✅ Resolve | ✅ Full | — |
| **HR** | ✅ | ✅ All | — | ✅ Resolve | ✅ No user mgmt | — |
| **Employee** | — | ✅ Own only | ✅ Own | ✅ Submit | — | — |
| **Standby** | — | — | — | — | — | ✅ Only |

> Role names are **case-sensitive**. Type them exactly as shown in the Users sheet.

---

## 6. Google Sheet Structure

### Tab: `Data` (Attendance Log)
*Columns A–O:* Date, Day, Empl ID, Name, Shift, Shift Start, IN Time, Shift End, OUT Time, Tot. Hrs (ArrayFormula), OT Hrs (ArrayFormula), Permission, Remarks, Logged By, Flags.

> Columns J and K use `ARRAYFORMULA` in Row 1. The backend uses `getInsertRow()` to find
> the first genuinely empty row in Column C — bypassing ghost rows created by the formulas.
> Column O (Flags) stores internal markers: `SOT_BONUS_ADDED` (CO tracking) and `LOP`.

### Tab: `List_of_Empl` (Employee Master)
*Columns A–Q:* ID, Name, Shift, Category, Leave Bal, Gross, Basic, HRA, Conv, Spl Allow, Med, ESI, PF, VPF, PT, PIN, **Face Data (JSON)**.

### Tab: `Users` (App Logins)
*Columns A–E:* Username, Role, Email, Password (SHA-256), **Empl_ID**.

> **Column E — Empl_ID:** For **Employee-role accounts**, enter the matching employee ID
> from `List_of_Empl` column A. Leave blank for Admin, HR, Security, and Standby accounts.
> This links an Employee login directly to their payslip and leave balance — no name-matching
> that would break when two employees share the same name.

### Tab: `Shifts`
*Columns A–D:* Shift Name, Shift Start, Shift End, OT Hours Threshold.

### Tab: `H/S` (Month Settings)
*Columns A–C:* Month Name, No. of Days, PH Count. Override the calendar day count for months with factory calendar adjustments.

### Tab: `OT_Empl` (OT Gross Overrides)
*Columns A–C:* Empl ID, Name, OT Gross. Overrides an employee's standard gross for OT rate calculations.

### Tab: `List of Holidays`
*Columns A–B:* Date, Reason. Used by payroll, leave marking, and the sandwich rule to identify public holidays.

### Tab: `Audit_Log` (Immutable History)
*Columns A–F:* Timestamp, Actor (Admin/User), Empl ID, Empl Name, Old Value / Action Type, New Value / Details. All admin edits, user deletions, employee deletions, and correction requests are appended here.

---

## 7. API Keys & Secrets — How to Configure

### 7.1 `GOOGLE_API_URL` (Apps Script Web App URL)
This HTTPS endpoint connects the PWA to your Google Sheet. Update it in **two places** after every new deployment:
- **`index.html`** — `const GOOGLE_API_URL = "..."` near the top of the `<script>` block.
- **`sw.js`** — `const GOOGLE_API_URL = "..."` at the very top of the file.

### 7.2 `APP_SECRET` (Session Token Signing Key)
This is a **true secret** — never place it in the frontend. The backend **hard-fails at login** if `APP_SECRET` is not set. There is no insecure fallback.

1. In the Apps Script editor → **⚙️ Project Settings** → **Script Properties** → **Add script property**
2. Property name: `APP_SECRET`
3. Value: *a long random string — minimum 32 characters*

> ⚠️ If login returns `"APP_SECRET script property is not configured"`, this step was skipped.

### 7.3 `app-version` Meta Tag (Cache Auto-Busting)
The Service Worker reads the cache version from `index.html` at install time — no manual constant to update in `sw.js`.

Update this line in `index.html` on every deploy:
```html
<meta name="app-version" content="20260628">
```
Format: `YYYYMMDD`. Changing it causes all users to receive the fresh build on their next visit.

---

## 8. Setup & Deployment

1. Create a new Google Sheet with the exact 8 tabs listed in Section 6.
2. In Google Sheets → **Extensions → Apps Script** → paste `Code.gs`.
3. Go to **⚙️ Project Settings → Script Properties** → add `APP_SECRET`.
4. Click **Deploy → New Deployment** (Type: Web App, Execute As: Me, Who has access: Anyone).
5. Copy the Web App URL → paste into `GOOGLE_API_URL` in both `index.html` and `sw.js`.
6. In the `Users` sheet, manually add your first Admin row. The password can be plaintext — it is SHA-256 hashed automatically on first login.
7. For Employee-role users: populate column E (`Empl_ID`) with their ID from `List_of_Empl` column A.
8. Host `index.html`, `manifest.json`, and `sw.js` on **GitHub Pages** or any static HTTPS host.
9. Update `<meta name="app-version" content="YYYYMMDD">` in `index.html` to today's date.
10. Replace the placeholder `src` URLs in `manifest.json` screenshots with real app screenshots (540×720 narrow + 1280×720 wide).

---

## 9. Deployment Checklist

- [ ] Updated `<meta name="app-version" content="YYYYMMDD">` in `index.html` to today's date.
- [ ] Re-deployed Google Apps Script as **New Deployment → Execute As: Me → Anyone**.
- [ ] Updated `GOOGLE_API_URL` in **both** `index.html` and `sw.js`.
- [ ] Confirmed `ARRAYFORMULA` exists in `Data` sheet cells **J1** and **K1**.
- [ ] Verified `APP_SECRET` is set in Script Properties.
- [ ] Populated **column E (Empl_ID)** in the `Users` sheet for all Employee-role accounts.
- [ ] Confirmed `manifest.json` icons point to the correct postimg URLs (all 7 sizes).
- [ ] Replaced placeholder screenshot URLs in `manifest.json` with real 540×720 (narrow) and 1280×720 (wide) screenshots.

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

### 2-of-3 Frame Confirmation
The kiosk maintains a `frameHits` counter per employee. Only when the same employee is matched in **2 or more consecutive frames** does the punch fire. All other counters reset to 0 on each frame. Protects against:
- Partial faces at the edge of frame
- Look-alikes walking past the camera
- Low-light single-frame mismatches

### Enrollment Flow
- 5 distinct 128-float descriptors captured per employee (progress dots shown in real time).
- JSON-serialised and written to column Q of `List_of_Empl`.
- `FaceMatcher` is rebuilt immediately from the updated descriptor set.

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

Net Pay      = Prorated Gross + OT Earnings − (ESI + PF + VPF + PT)

SOT Comp-Off = +0.5 leave day per shift where elapsed time ≥ 12 hours
               (flagged SOT_BONUS_ADDED in column O of Data sheet)
```

### Sandwich Rule
If an employee is absent on a day sandwiched between two non-working days (Sundays or public holidays) and **neither** neighbour worked at least 4 hours, the sandwiched day is not counted as a Payable Day. A 14-day safe search window walks in each direction to find the nearest working day. If no valid working day is found within 14 days in either direction, the check returns `false` — no penalty applied.

### Leave Marking
- **EL (Earned Leave):** Deducts 1.0 from the employee's leave balance. Written as `IN = LEAVE`, `OUT = LEAVE`.
- **LOP (Loss of Pay):** No leave balance deduction. `LOP` flag written to column O of the Data sheet.
- `markLeaveAdmin()` skips Sundays and public holidays, processes the entire date range in a single pre-read pass, and tracks `nextInsertRow` without re-scanning column C on each iteration.

### Current Month Cutoff
Both `exportMonthlyDashboard()` and `exportSalaryReport()` detect whether the requested month is the current month. If yes, data is processed only up to today's date — future days show blank (not "Absent"). Past months always use the full month.

---

## 13. Security Model

| Control | Detail |
|---|---|
| **Passwords** | SHA-256 hashed on the client before transit. Plaintext passwords in the Users sheet are silently upgraded on first login. |
| **Session Tokens** | 5.5-hour expiring tokens stored in GAS `CacheService`. Validated and refreshed on every authenticated request. |
| **APP_SECRET** | Required Script Property. Hard-fails with a clear error if missing — no insecure fallback. |
| **Login Rate Limiting** | After **5 failed attempts** within **15 minutes**, the username is temporarily locked. Counter in `CacheService`; clears on success or after 15 minutes. |
| **Self-Deletion Guard** | An Admin cannot delete their own account. Enforced by both `deleteUser()` backend and the Admin Panel UI (Delete button disabled when editing your own account). |
| **Concurrency** | `LockService.waitLock(15000)` prevents duplicate punch rows during heavy shift-change windows. |
| **Audit Trail** | All admin edits and correction requests are immutably appended to `Audit_Log` with timestamp, actor, before, and after values. |

---

## 14. Version History — v9 (May 2026)

A comprehensive audit covering **13 bug fixes, 6 performance upgrades, and 7 structural modifications** across all 4 source files.

### 🔴 Bugs Fixed

| ID | Fix |
|---|---|
| ERR-01 | `markLeaveAdmin()` — sheet re-read was inside every loop iteration. Now pre-reads once, builds an in-memory `rowLookup`, and tracks `nextInsertRow` manually. Eliminates GAS timeout risk for multi-day leave ranges. |
| ERR-02 | `logAttendance()` called `getEmployees()` on every punch-out for the SOT category check. Now accepts `emplCategory` as the 9th parameter. Frontend sends it from cached init data; `syncOfflineData` passes it from a pre-loaded cache. |
| ERR-03 | `getEmpDashData()` read the holiday sheet twice. `holData` hoisted to outer scope and reused in both loops — one sheet read instead of two. |
| ERR-04 | `deleteUser()` had no self-deletion guard. An Admin could lock the system by deleting their own account. Backend and UI now both enforce the guard. |
| ERR-05 | `exportMonthlyDashboard()` CO column was always 0. Now scans column O for `SOT_BONUS_ADDED`, accumulates 0.5 per occurrence into `coMap{}`, writes real per-employee totals. |
| ERR-06 | `generateSessionToken()` had a publicly-known static fallback secret. Replaced with a hard-fail + clear setup instructions if `APP_SECRET` is missing. |
| ERR-07 | `isSandwiched()` 14-day search loops had no post-loop validity check. Added `prevFound` / `nextFound` guards — returns `false` (safe default) when no valid neighbour is found. |
| ERR-08 | `leaveType` (EL/LOP) was missing from offline punch payloads. Synced LOP leaves were silently treated as EL, incorrectly deducting leave balance. Now included end-to-end: `savePendingPunch()` → `syncOfflineData()` → `logAttendance()`. |
| ERR-09 | `fetchAllData(true)` was called after every punch, reloading all employee records. Replaced with `fetchLiveStatus(emp.id)` to refresh only the affected employee's badge. |
| ERR-10 | `myEmplId` matched by username vs. employee name — fails when two employees share a name. Now uses `emplId` returned by `verifyLogin()` from Users column E. ID-only fallback for legacy accounts. |
| ERR-11 | Leave day preview excluded Sundays but not public holidays. Server skips both. Preview label now reads "Up to N working days... — public holidays also excluded". |
| ERR-12 | `CACHE_DATE` was hardcoded in `sw.js` — forgotten bumps left users on stale UI. SW now reads `<meta name="app-version">` from `index.html` at install time via `readAppVersionFromHTML()`. |
| ERR-13 | All 3 PWA manifest screenshots pointed to the company logo. Fixed with 4 proper screenshot entries (3 narrow + 1 wide). |

### 🔵 Performance Upgrades

| ID | Upgrade |
|---|---|
| UPG-01 | `syncOfflineData` pre-loads `emplNameCache` + `emplCategoryCache` in a single `getEmployees()` call, eliminating per-punch-out sheet reads during bulk sync. |
| UPG-02 | Login rate limiting via `CacheService` — 5 failures → 15-minute lockout. Zero-cost, no extra sheet. |
| UPG-03 | Kiosk `inputSize` reduced 320 → **160** (4× faster GPU pass). 2-of-3 frame confirmation compensates. |
| UPG-04 | 25-second `AbortController` timeout added to background sync POST. Stalls now time out cleanly with a scheduled retry. |
| UPG-05 | Network failure in the fetch handler returns a structured `503` JSON response instead of a bare network error. |
| UPG-06 | Resolved cache name persisted to `DEPLSWMeta` IDB database during `install` and read back during `activate` — both events use the same auto-detected name without re-fetching `index.html`. |

### 🟡 Structural Modifications

| ID | Modification |
|---|---|
| MOD-01 | `UC_EMPL_ID = 5` constant (column E of Users). `verifyLogin()` returns `emplId`. `saveUser()` and `getAdminUsersData()` handle column E. Admin user modal has an Employee ID field. |
| MOD-02 | `saveUser()` preserves the existing password hash when the field is left blank during edit. |
| MOD-03 | `PAGE_TITLES.admin` renamed `'Inventory'` → `'Admin Panel'` — the old label was misleading in an HR app. |
| MOD-04 | `markLeaveAdmin()` audit log entry now includes `[EL]` or `[LOP]` tag for clearer history. |
| MOD-05 | `app-version` meta tag added to `index.html` `<head>` — sole deploy-time version bump required going forward. |
| MOD-06 | Admin Panel Delete button disabled (greyed, with tooltip) when editing the currently logged-in account. |
| MOD-07 | `DEPLSWMeta` IDB database introduced in `sw.js` to persist the resolved cache name between SW lifecycle events. |

---

## 15. Latest Updates — v10 (June 2026)

This release completes the full rebranding from **Capco Master AI** to **DEPL HRMS**, updates all asset links, and resolves the mobile header layout issue.

### 🔴 Bug Fixed

**Mobile content hidden under header (header spacer)**
The `#mobile-header-spacer` was hardcoded to `128px` — shorter than the real rendered header height (~155px). The top section of every view was clipped underneath the fixed header on mobile.

**Two-layer fix:**
- CSS fallback height raised from `128px` → `168px` to cover the real header (top row + clock row + badge row + padding).
- New `adjustHeaderSpacer()` JavaScript function measures the header's actual `getBoundingClientRect().height` via `requestAnimationFrame` after login and sets the spacer to that exact pixel value. Also wired to `window.resize` so landscape/portrait orientation changes stay correct.

### 🎨 Rebranding — Capco → DEPL HRMS

All four source files updated end-to-end:

| File | Changes |
|---|---|
| `index.html` | All 5 logo `<img>` `src` attributes updated to new postimg URLs. `<link rel="icon">` replaced with 6 sized entries + `apple-touch-icon`. `adjustHeaderSpacer()` added. |
| `manifest.json` | `name` → `"DEPL HRMS"`, `short_name` → `"DEPL HRMS"`, `description` updated to Dada Energies. All 3 icon entries replaced with **7 entries** (48 / 72 / 96 / 144 / 192 / 512 + maskable 512). Shortcut icons updated. All `_comment_*` hack fields removed from screenshot entries. Desktop screenshot label updated. |
| `sw.js` | File header added. `CACHE_VERSION` → `'depl-hrms-v1'`. `DB_NAME` → `'DEPLOfflineDB'`. `META_DB_NAME` → `'DEPLSWMeta'`. `CACHE_DATE_FALLBACK` → `'20260628'`. Activate handler now also deletes stale `capco-hrms-*` caches (one-time rebranding cleanup). Offline page title → `"DEPL HRMS — Offline"`. Inline IDB reference → `'DEPLOfflineDB'`. |
| `Code.gs` | File header added. `INIT_CACHE_KEY` → `'depl_init_v1'`. `doGet()` → `"DEPL HRMS API is Online."`. |

### 🖼️ New Logo / Icon Set

All icon references updated to the new DEPL logo across all files:

| Size | URL |
|---|---|
| 48 × 48 | `https://i.postimg.cc/pVFqM3R8/DEPL-logo-launchericon-48x48.png` |
| 72 × 72 | `https://i.postimg.cc/qB3jHW4K/DEPL-logo-launchericon-72x72.png` |
| 96 × 96 | `https://i.postimg.cc/MZQdJgqV/DEPL-logo-launchericon-96x96.png` |
| 144 × 144 | `https://i.postimg.cc/Y2WbBTM6/DEPL-logo-launchericon-144x144.png` |
| 192 × 192 | `https://i.postimg.cc/fW9BQ1D7/DEPL-logo-launchericon-192x192.png` |
| 512 × 512 | `https://i.postimg.cc/BZKMfR4c/DEPL-logo-launchericon-512x512.png` |

### 🧹 Comment Cleanup (All Files)

All `FIX ERR-xx`, `MOD-0x`, `UPGRADE #x`, `UPG-0x`, `FIX PERF`, `FIX BUG`, `FIX UX`, `FIX LOGIC`, and `PERF FIX` tracking tags removed from all four files. Replaced with concise, purposeful comments that explain **why** — not change history. Zero tracking tags remain in any file.

---

## 16. Known Limitations

1. **Google Apps Script 6-minute execution limit:** Very large full-year CSV exports may time out. Filter by month. `markLeaveAdmin()` for extreme multi-month ranges is significantly faster after v9 ERR-01 fix but still subject to this limit.
2. **iOS Safari:** Background Sync API is unsupported. Requires the app to be open when the device reconnects to flush the offline punch queue. The `online` event listener handles this automatically when the app is in the foreground.
3. **Face API on low-end mobile:** WebGL/GPU rendering depends on the device chipset. Battery savers may force CPU fallback at lower frame rates. The `inputSize: 160` setting significantly mitigates this.
4. **PWA screenshots:** The 4 manifest screenshot entries still use placeholder URLs from earlier deployments. Chrome's install prompt shows placeholder images until replaced with real screenshots (see Section 9 checklist).
5. **Biometric data at rest:** Face descriptor arrays (128 floats × 5 samples per employee) are stored as plain JSON text in column Q of `List_of_Empl`. Consider encrypting this column using `APP_SECRET` as the key for compliance with India's DPDP Act 2023 *(planned for v11)*.
6. **`localStorage` session key:** The session key `capco_attendance_user` retains its original name for backward compatibility. Existing logged-in sessions are preserved across the v10 rebranding update without requiring re-login.

---

## 17. Troubleshooting

**`"APP_SECRET script property is not configured"`**
Add `APP_SECRET` to Apps Script → Project Settings → Script Properties before anyone can log in. See Section 7.2.

**`"Too many failed login attempts. Please try again in 15 minutes."`**
Five consecutive failed logins triggered the rate limiter. Wait 15 minutes — the counter clears automatically.

**`"Session Expired"` immediately after login / API Permission Error**
Re-deploy the Apps Script as a **New Deployment** and confirm *Who has access* is set to **Anyone**. Update `GOOGLE_API_URL` in both `index.html` and `sw.js`.

**Camera frozen on "Starting Camera..."**
The site must be served over **HTTPS**. Browsers block camera access on plain HTTP. Confirm your GitHub Pages URL uses `https://`.

**Leave day count mismatch between preview and actual days marked**
The preview counts working days excluding Sundays. The server additionally skips public holidays. The difference is by design — the preview label states "public holidays also excluded".

**Employee payslip shows another employee's data (Employee-role login)**
Column E (`Empl_ID`) in the Users sheet is blank or contains the wrong ID for this login. Update it with the correct ID from `List_of_Empl` column A. The user must log out and back in after the fix.

**Kiosk stays on "Hold still..." and never punches**
The 2-of-3 frame confirmation is working correctly — the same face must appear in 2 consecutive scan frames. Ensure the employee holds still and faces the camera squarely. If it persists, re-enroll via the Admin panel — descriptor quality may be low.

**Offline punches synced but LOP leaves showing as EL**
The offline punch was recorded before the v9 `leaveType` fix. Pre-v9 IDB records do not include a `leaveType` field. Clear the old IDB store via DevTools → Application → IndexedDB → `DEPLOfflineDB` → delete, then re-enter the leave manually while online.

**Monthly Excel CO column showing 0**
SOT bonus credits are only written to column O when the employee punches OUT and elapsed time is ≥ 12 hours. Manually entered punch-out times (via admin update) do not trigger the flag retroactively. Verify `SOT_BONUS_ADDED` exists in column O of the `Data` sheet for the relevant rows.

**PDF printing as a full webpage**
Intended behaviour. `@media print` CSS strips the app chrome, leaving only the payslip. On desktop, use Chrome's **"Save as PDF"** option in the print dialog for the cleanest result.

**Service Worker not updating after a new deploy**
Confirm `<meta name="app-version" content="YYYYMMDD">` in `index.html` was updated to the new deploy date. If the meta tag is not used, bump `CACHE_DATE_FALLBACK` in `sw.js` — any change to `sw.js` also triggers a reinstall.

**Content still hidden under the mobile header after a hard refresh**
This was resolved in v10 via dynamic `adjustHeaderSpacer()`. If you see it, the old `sw.js` is still serving a cached version of `index.html`. Clear the Service Worker in DevTools → Application → Service Workers → Unregister, then reload.

---

*DEPL HRMS — Dada Energies Pvt. Ltd., Muppireddypally, Telangana.*
*v10 — June 2026 | Previous: v9 — May 2026*
