import "server-only";
import nodemailer from "nodemailer";

/**
 * Sends an email using the configured SMTP server.
 * Rotates through configured SMTP accounts if multiple are provided.
 * If subject === "" || dest.length === 0, the function will return without doing anything.
 * @param {string[]} dest - Array of destination email addresses.
 * @param {string} subject - Email subject.
 * @param {string} message - Email body (HTML supported, wrapped in <h1>).
 * @returns {Promise<void>}
 */
export async function sendEmail_S(dest: string[], subject: string, message: string) {
    if (subject === "" || dest.length === 0) {
        return;
    }

    const userArr = process.env.SMTP_USER!.split(";");
    const passArr = process.env.SMTP_PASS!.split(";");
    const idx = Math.floor(Math.random() * userArr.length);
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT!),
        secure: parseInt(process.env.SMTP_PORT!) === 465, // true for 465, false for others
        auth: {
            user: userArr[idx],
            pass: passArr[idx],
        },
    });

    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: dest.join(", "),
        subject,
        html: `<h1>Message from Nesco UGM2026: ${message}</h1>`,
    });
}
