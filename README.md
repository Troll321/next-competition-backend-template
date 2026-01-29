# This could serve as the backend for competition / events related NEXT.js based website
## Usage
```
npx @alolgamerzz/setup-competition-BE
```

### Feature
- Extensible (could be extended to include new integration)
- Flexible (could meet all of your constraints need)
- Customizable (easily be customized from admin panel)
- Admin panel (for user managing)

### Dependencies
- **3rd party integration**: Auth0, MongoDB, Supabase (PostgreSQL + Storage), Google Recaptcha, Google OAuth, Google SMTP, Payment
- **Extendable dependency**: Payment and Storage. By default this use IDRX and Supabase Storage
- **On production**: Set rate limiting on domain hosting and set .env + 3rd party integration

### Guide on Integrating
- Implement the `StorageAdapter` or `PaymentAdapter` class and add it to the adapters array on `src/api/payment/server.ts` or `src/api/upload/server.ts`
- `profile` verifiable is created by default on login (see `src/api/authentication/loginHandler.ts`). This could be disabled or changed if wanted
- Set a few dummy data on the admin and see changes, by default the /playground/integrated assumes dummy data verifiable named: `profile` and `tim_paper` and submittable named: `paper_submission`