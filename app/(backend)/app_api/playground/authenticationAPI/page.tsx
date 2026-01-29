import { getUser_S } from "@/api/authentication/server";
import { LoginButton, LogoutButton, Profile } from "./components";
import VerifyEmailButton from "@/components/functional/VerifyEmailButton";

export default async function Home() {
    const user = await getUser_S();

    return (
        <div className="app-container">
            <div className="main-card-wrapper">
                <img
                    src="https://cdn.auth0.com/quantum-assets/dist/latest/logos/auth0/auth0-lockup-en-ondark.png"
                    alt="Auth0 Logo"
                    className="auth0-logo"
                />
                <h1 className="main-title">Next.js + Auth0</h1>

                <div className="action-card">
                    {user ? (
                        <div className="logged-in-section">
                            <p className="logged-in-message">✅ Successfully logged in!</p>
                            <Profile />
                            <LogoutButton />
                            <VerifyEmailButton />
                        </div>
                    ) : (
                        <>
                            <p className="action-text">
                                Welcome! Please log in to access your protected content.
                            </p>
                            <LoginButton />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
