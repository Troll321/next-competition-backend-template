# Backend Agents Documentation & Specification

## 1. Overview

This document serves as the comprehensive specification for the backend architecture, flow, and user agents of the application. It consolidates original specifications and recent enhancements.

## 2. Core Concepts

### 2.1. Verifiable

A **Verifiable** is a central entity that requires verification.

- **Status (`verified`)**:
    - `-1`: **Rejected** (Document failed verification).
    - `0`: **Pending** (Default state, draft/created).
    - `1`: **Requested** (Submitted for verification).
    - `2`: **Accepted** (Verified by admin).
- **Accessors**:
    - **Creator**: The user who created the doc.
    - **Shared**: List of other users (emails) who have access.
    - **Singleton Rule**: Each user can only access ONE document per slug.
    - **Max Shared**: Limit on how many users can be added.
- **Dependencies**:
    - `depends_on`: Slug of a parent Verifiable.
    - `depended_by`: Array of slugs of child Verifiables.
    - **Verification Logic**: A doc can only be requested (`1`) if all its `depends_on` docs (for all accessors) are already verified (`2`).
    - **Cascade Logic**: If a doc is rejected, its `depended_by` docs are also rejected.

### 2.2. Submittable & Submission

A **Submittable** defines a multi-stage submission process linked to a Verifiable.

- **Structure**: array of levels (objects).
- **Properties**:
    - `verifiable`: The slug of the Verifiable that can make this submission.
    - `ui_title`, `ui_description`: UI Text for levels.
    - `start_date`, `end_date`: Validity period for levels.

A **Submission** is the instance of a user filling out a Submittable.

- **Locked Status (`locked`)**:
    - `0`: **Unlocked** (Editable).
    - `1`: **Locked** (Submitted/Frozen).
    - `2`: **Reviewed** (Admin has processed it).
- **Level**: Tracks current progress (1 -> N).
- **Constraint**: A Submittable can only be submitted if the user's Verifiable is verified (`2`).
- **Singleton Rule**: One submission per VerifiableId per Submittable.

## 3. Architecture & Flows

### 3.1. Authentication & Authorization

- **`useUser_C`**: Client-side hook for auth.
- **Permissions**:
    - **Creator**: Full CRUD, Share, Request Verify, Delete.
    - **Accessor**: Read, Edit (if not verified), Leave.
    - **Server Override**: `_isFromServer` flag bypasses checks.
- **Join Flow**: Users can join a verifiable via a specific code (`TT.XXXX`) which adds them to the shared list (subject to `max_shared`).

### 3.2. Verification Flow

1.  **Draft**: User creates/edits doc.
2.  **Request Verify**:
    - Pre-conditions: All constraints filled, dependencies valid, not already verified.
    - Action: Sets status to `1`. Form becomes read-only.
3.  **Admin Review**:
    - Admin reviews doc and dependencies.
    - **Accept**: Sets status to `2`.
    - **Reject**: Sets status to `-1` (Cascades to dependents).

### 3.3. Submission Flow

1.  **Entry**: User with Verified Doc (`2`) starts submission.
2.  **Levels**: User completes constraints level by level.
3.  **Save**: Updates data (partial allowed).
4.  **Lock**:
    - Pre-conditions: All level constraints filled, Payment not pending/invalid.
    - Action: Sets `locked` to `1`.
5.  **Admin Review**: Admin reviews submission, can set `locked` to `2`.

### 3.4. Payment Flow

Attached to a constraint.

- **States**: `null` (None), `pending` (URL generated), `paid` (Success), `expired` (Time limit exceeded).
- **Logic**:
    - `pending` -> Check `expiredDate`. if expired -> `expired`.
    - `paid` -> Transaction Hash stored.
- **Actions**: Pay (Link), Check Status (API), Initiate Transaction (API).

### 3.5. Upload Flow

- **Constraints**: MIME type whitelist, Max size (KB).
- **Validation**: Strict server-side and client-side checks.
- **Privacy**: Signed URLs for download/preview. `decodeFilePath` reveals uploader metadata.

## 4. Admin Panel Specification

### 4.1. Verifiable View & Submission View

- **Filtering**: By Slug, Order, Custom JSON (`where`).
- **Pagination**: Jump to page, Total count.
- **Expansion (`shouldPopulate`)**: Recursively fetch dependencies.
- **Actions**:
    - **Bulk Verify**: Accept/Reject multiple. _Priority_: Deepest dependency first.
    - **Bulk Delete**: Delete multiple. _Safety_: Disable if dependent is also selected.
    - **Message**: Send email/notification to users.

### 4.2. Review Components (`DocReview` / `SubmissionReview`)

- **Status Visualization**: Badges (Green/Red/Blue/Gray).
- **File Preview**: Auto-preview images, manual preview for others.
- **Payment Detail**: Show status and transaction links.
- **Submission Hierarchy**: Display levels and constraints clearly.

## 5. Naming & Coding Standards

- **Suffixes**:
    - `_S`: Server-only function.
    - `_C`: Client-only function.
    - `_SC`: Shared (Universal) function.
- **Error Handling**:
    - All API calls must handle errors.
    - `ExpectedError`: User-friendly known errors.
    - `UnexpectedError`: System faults.
    - UI: Toast notifications for feedback.
