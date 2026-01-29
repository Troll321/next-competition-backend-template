"use client";

import { Button } from "@payloadcms/ui";
import Link from "next/link";
import "@payloadcms/ui/scss";
import "./styles/MySideNavigation.scss";
import confetti from "canvas-confetti";

export default function MySideNavigation() {
    const handleAlolClick = () => {
        confetti({
            particleCount: 150,
            spread: 500,
            startVelocity: 50,
            ticks: 100,
            drift: Math.random() * 10 - 5,
            origin: { y: 0.5 },
            scalar: 1,
        });
    };

    return (
        <>
            <div className="container">
                <Link href={"/admin/verifiable_view"}>
                    <Button buttonStyle="subtle" margin={false}>
                        Verify Documents
                    </Button>
                </Link>
                <Link href={"/admin/submission_view"}>
                    <Button buttonStyle="subtle" margin={false}>
                        Review Submission
                    </Button>
                </Link>
                <Button buttonStyle="tab" className="alolgamerzz" onClick={handleAlolClick}>
                    alolgamerzz
                </Button>
            </div>
        </>
    );
}
