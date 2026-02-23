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

A **Submission** is the instance of a user filling out a Submittable (can't be deleted by user).

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

## 6. API Reference

Functions that only has **[_S]** or **[_C]** should not be called on the frontend. Use the function with **[_S, _C]** or **[_SC]**. Exception for `useUser()` this is safe to call in client.

### Authentication

- `sendEmailVerif(captchaToken)` **[_S, _C]** Send verification email
- `getLoginURL(redirect?)` **[_SC]** Generate login URL
- `getLogoutURL(redirect?)` **[_SC]** Generate logout URL
- `useUser()` **[_C]** Client hook for user auth (safe to use)
- `getUser()` **[_S]** Get current user from server session
- `getValidUser(_user?, _isFromServer?)` **[_S]** Validate and retrieve user
- `isAdmin()` **[_S]** Check if current user is admin

### Form

- `getVerifiable(slug)` **[_S, _C]** Get verifiable config by slug
- `readDoc(...)` **[_S, _C]** Read verifiable document logic
- `createDoc(...)` **[_S, _C]** Create new verifiable document
- `updateDoc(...)` **[_S, _C]** Update existing verifiable document
- `deleteDoc(...)` **[_S, _C]** Delete verifiable document
- `requestVerify(slug, id)` **[_S, _C]** Request verification for document
- `shareDoc(...)` **[_S, _C]** Share document with users
- `isAccessorVerified(slug, accessor)` **[_S, _C]** Check if accessor is verified
- `joinWithVerifiableCode(fullVerifiableCode)` **[_S, _C]** Join verifiable via code
- `verifyDoc(...)` **[_S, _C]** Admin verify document
- `sendMessageToVerifiable(...)` **[_S, _C]** Send message to verifiable creator (admin only)

### Payment

- `payToVerifiable(...)` **[_S, _C]** Process payment for verifiable
- `payToSubmission(...)` **[_S, _C]** Process payment for submission
- `requestPayment(...)` **[_S]** Request payment token

### Submission

- `getSubmittable(submittableSlug)` **[_S, _C]** Get submittable config
- `getSubmission(...)` **[_S, _C]** Get submission data
- `updateSubmission(...)` **[_S, _C]** Update submission data
- `lockSubmission(verifiableDocId, submittableSlug)` **[_S, _C]** Lock submission (submit)
- `reviewSubmission(...)` **[_S, _C]** Admin review submission
- `deleteSubmission(...)` **[_S, _C]** Delete submission (don't call this, only admin)
- `sendMessageToSubmission(...)` **[_S, _C]** Send message to submission owner (admin only)
- `allowedToModify(submittable, submission)` **[_S]** Check modification rights

### Upload

- `uploadFileToVerifiable(...)` **[_S, _C]** Upload file linked to verifiable
- `uploadFileToSubmission(...)` **[_S, _C]** Upload file linked to submission
- `getVerifiableFileInfo(...)` **[_S, _C]** Get info for verifiable file
- `getSubmissionFileInfo(...)` **[_S, _C]** Get info for submission file
- `deleteFile(sqlUrl, _isFromServer)` **[_S]** Delete file from storage

### Utils

- `isArrayOfString(arr)` **[_SC]** Validate array of strings
- `base64UrlEncode(str)` **[_SC]** Base64 URL encode
- `base64UrlDecode(str)` **[_SC]** Base64 URL decode
- `decodeSQLURL(sqlUrl)` **[_SC]** Parse SQL URL format
- `encodeSQLURL(adapter, path)` **[_SC]** Create SQL URL
- `encodeFilePath(userId, file)` **[_SC]** Encode file path for storage
- `decodeFilePath(filePath)` **[_SC]** Decode file path from storage
- `permuteNumber(x)` **[_SC]** Obfuscate ID (permute)
- `unpermuteNumber(x)` **[_SC]** De-obfuscate ID (unpermute)
- `toBase36(x)` **[_SC]** Convert to Base36 string
- `fromBase36(x)` **[_SC]** Convert from Base36 string
- `encodePaymentInfo(paymentInfo)` **[_SC]** Encode payment payload
- `decodePaymentInfo(encodedPaymentInfo)` **[_SC]** Decode payment payload
- `APIFetch<T>(...)` **[_C]** Wrapper for client fetch
- `getDrizzle()` **[_S]** Get Drizzle ORM instance
- `getPayloadClient()` **[_S]** Get PayloadCMS client
- `getMongoDB()` **[_S]** Get MongoDB connection
- `getCollection(submittableSlug, myDb)` **[_S]** Get MongoDB collection
- `sendEmail(dest, subject, message)` **[_S]** Send email via transport
- `r(val)` **[_S]** Raw SQL value wrapper
- `genAccesor(accessor)` **[_S]** Generate accessor SQL
- `genUW(obj, sep)` **[_S]** Generate update/where SQL
- `genSql(str, ...params)` **[_S]** Generate safe SQL

### ErrorHandler

- `errorHandler(err)` **[_S, _C]** This is only placeholder. \*\_S is for server components error
- `httpErrorHandler(_err)` **[_S]** Handle HTTP errors

## 7. Developer Notes

- A document (say `B`) created by a shared accessor (say `U`) (accessor who is not the creator) that `depends_on` a shared document (say `A`) could have **NO `DEPENDS_ON`** though it is already verified. This could happen if the creator of document `A` unshare to user `U` after document `B` has been verified. (This does not disrupt user flow)
