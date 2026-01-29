# This serves as the backend for competition / events related NEXT.js based website

## Installation

```
npx next-competition-backend
```

## Guide on Integrating

1. Install and configure **`.env`**

2. Configure **HTML email template** on `src/api/utils/sendEmail.ts`

3. **Build FE** under `app/(app)` folder

---

### Template REPO

https://github.com/Troll321/next-competition-backend-template

### Feature

- Verifying and reviewing
- File upload and payment
- Email
- Admin panel (for user managing and reviewing)
- Submission with level (e.g. preliminary, semifinal, ...)
- Extensible (could be extended to include new integration as wished)
- Flexible (could meet all of your constraints need)
- Customizable (easily customized from admin panel)
- Prebuilt FE implementation as example (`src/components/functional`)

### Dependencies

- **3rd party integration**: Auth0, MongoDB, Supabase (PostgreSQL + Storage), Google Recaptcha, Google OAuth, Google SMTP, Payment
- **Extendable dependency**: Payment and Storage. By default this use IDRX and Supabase Storage
- **DO NOT CHANGE**: Auth0\*, MongoDB, and PostgreSQL (this is crucial for app)
- **On production**: Set rate limiting on domain hosting and set .env + 3rd party integration

\*Auth0 is crucial because by default the access control is based on Auth0 middleware. \
\*\*Key is based on email, thus Auth0 configured login method should always require email

#### Notes

- _Reserved path_: `/api/*`, `/app_api/*`, `/admin/*`, `/auth/*` should **NOT** be used.
- Set a few dummy data on the admin and see changes, by default the `/playground/integrated` assumes dummy data verifiable named: `profile` and `tim_paper` and submittable named: `paper_submission` (this is not mandatory)
- `profile` verifiable is created on login (see `src/api/authentication/loginHandler.ts`). \
  This could be disabled or changed
- Implement custom `StorageAdapter` or `PaymentAdapter` class and add to adapters array `src/api/payment/server.ts` or `src/api/upload/server.ts`
- See `/agents` for further inquiry

---

License: https://www.gnu.org/licenses/gpl-3.0.en.html
