"use client";
import { Button, toast } from "@payloadcms/ui";
import React, { useState, useEffect } from "react";
import {
    deleteSubmission_C,
    reviewSubmission_C,
    getSubmission_C,
    sendMessageToSubmission_C,
} from "@/api/submission/client";
import { getVerifiable_C, readDoc_C } from "@/api/form/client";
import { decodeFilePath_SC, decodeSQLURL_SC, decodePaymentInfo_SC } from "@/api/utils/string";
import { Submission } from "@/api/submission/server";
import { Submittable, Verifiable } from "@root/payload-types";
import { ViewOnlyDocReview } from "./ViewOnlyDocReview";
import { AdminSQLRow } from "@/api/utils/sql";
import { getSubmissionFileInfo_C } from "@/api/upload/client";

import "./styles/SubmissionReview.scss";
import { ExpectedError } from "../api/errorHandler/class";

interface SubmissionReviewProps {
    submission: Submission;
    submittable: Submittable;
    submittableSlug: string;
    onUpdate: (newSubmission: Submission) => void;
    onDelete: (verifiableId: number) => void;
    showAllImages?: boolean;
    shouldExpandOnLoad?: boolean;
    selectedSubmissions: Map<number, { verifiableId: number; locked: number; level: number }>;
    onToggleSelection: (verifiableId: number, locked: number, level: number) => void;
}

export const SubmissionReview: React.FC<SubmissionReviewProps> = ({
    submission,
    submittable,
    submittableSlug,
    onUpdate,
    onDelete,
    showAllImages,
    shouldExpandOnLoad,
    selectedSubmissions,
    onToggleSelection,
}) => {
    const [isExpanding, setIsExpanding] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);

    const [expandedVerifiableDoc, setExpandedVerifiableDoc] = useState<AdminSQLRow | null>(null);
    const [verifiableConfig, setVerifiableConfig] = useState<Verifiable | null>(null);
    const [shouldExpand, setShouldExpand] = useState(false);

    useEffect(() => {
        if (shouldExpandOnLoad && !shouldExpand && !isExpanding && !expandedVerifiableDoc) {
            handleExpand();
        }
    }, []);

    const [messageSubject, setMessageSubject] = useState("");
    const [messageBody, setMessageBody] = useState("");

    const handleError = (e: any) => {
        console.error(e);
        if (e instanceof ExpectedError) {
            toast.error(`${e.name}: ${e.message}`);
        } else {
            toast.error(`Unexpected Error: ${e.message || "Unknown error"}`);
        }
    };

    const refreshSubmission = async () => {
        try {
            // Fetch updated submission data
            const res = await getSubmission_C(submission.verifiableId, submittableSlug);
            let updated: Submission | null = null;

            if (Array.isArray(res)) {
                if (res.length > 0) updated = res[0];
            } else if (res && "data" in res && Array.isArray(res.data)) {
                // Paginated response
                if (res.data.length > 0) updated = res.data[0];
            } else if (res) {
                // Single object response
                updated = res as Submission;
            }

            if (updated) {
                onUpdate(updated);
            }
        } catch (e) {
            console.error("Failed to refresh submission", e);
        }
    };

    const handleExpand = async () => {
        if (!submission.verifiableId || !submittable.verifiable) {
            toast.error("No linked verifiable document to expand");
            return;
        }

        setIsExpanding(true);
        try {
            const verifiableSlug = submittable.verifiable as string;

            if (!verifiableConfig) {
                const config = await getVerifiable_C(verifiableSlug);
                setVerifiableConfig(config);
            }

            const result = await readDoc_C(
                verifiableSlug,
                { id: submission.verifiableId },
                { page: 1, shouldPopulate: true }
            );

            if (result && result.length > 0) {
                setExpandedVerifiableDoc(result[0] as AdminSQLRow);
                setShouldExpand(true);
            } else {
                toast.error("Linked verifiable document not found");
            }
        } catch (e: any) {
            handleError(e);
        } finally {
            setIsExpanding(false);
        }
    };

    const handleReview = async (verdict: boolean) => {
        const action = verdict ? "accept" : "reject";
        if (
            !confirm(`Are you sure you want to ${action} this submission?`) ||
            !confirm(`This action CANNOT BE UNDONE. Proceed?`)
        ) {
            return;
        }

        setIsVerifying(true);
        try {
            await reviewSubmission_C(
                submission.verifiableId,
                submittableSlug,
                verdict,
                messageSubject,
                messageBody
            );

            toast.success(`Submission ${action}ed successfully`);
            await refreshSubmission();
        } catch (e: any) {
            handleError(e);
        } finally {
            setIsVerifying(false);
        }
    };

    const handleSendMessage = async (sendEmail: boolean) => {
        const action = sendEmail ? "Send Message" : "Send Message (No Email)";
        if (
            !confirm(`Are you sure you want to ${action} to this submission?`) ||
            !confirm(`Confirm ${action}?`)
        ) {
            return;
        }

        setIsVerifying(true);
        try {
            await sendMessageToSubmission_C(
                submission.verifiableId,
                submittableSlug,
                messageSubject || "Message",
                messageBody,
                sendEmail
            );
            toast.success("Message sent");
            await refreshSubmission();
        } catch (e: any) {
            handleError(e);
        } finally {
            setIsVerifying(false);
        }
    };

    const handleDelete = async () => {
        if (
            !confirm("Are you sure you want to DELETE this submission?") ||
            !confirm("This action can't be undone. Proceed?")
        )
            return;

        setIsVerifying(true);
        try {
            await deleteSubmission_C(submission.verifiableId, submittableSlug, {
                forceDelete: true,
            });
            toast.success("Submission deleted");
            onDelete(submission.verifiableId);
        } catch (e: any) {
            handleError(e);
            setIsVerifying(false);
        }
    };

    // Visualization helpers
    const getLevelColor = (level: number) => {
        const colors = [
            "#FF9A80", // lighter red-orange
            "#8CFF9F", // lighter green
            "#8FA8FF", // lighter blue
            "#F59AFF", // lighter purple
            "#FF8FCB", // lighter pink
            "#8CFFF7", // lighter cyan
            "#F4FF8C", // lighter yellow
            "#FFB380", // lighter orange
            "#B38CFF", // lighter violet
            "#8CFFB3", // lighter mint green
        ];
        return colors[level % colors.length];
    };

    // Button Logic
    const levelsLength = submittable.levels ? submittable.levels.length : 0;
    const submissionLevel = submission.level || 0;
    const isLevelPastMax = submissionLevel > levelsLength;

    const isLocked2 = submission.locked === 2;

    const containerStyle =
        submission.locked === 2 ? { opacity: 0.6 } : submission.locked === 0 ? {} : {};

    const isSelected = selectedSubmissions.has(submission.verifiableId);

    const rootKeys = Object.keys(submission).filter((k) => k !== "levels");

    return (
        <div className="doc-review-card submission-card" style={containerStyle}>
            <div className="doc-id-converter">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() =>
                        onToggleSelection(
                            submission.verifiableId,
                            submission.locked,
                            submissionLevel
                        )
                    }
                    style={{ width: "1.25rem", height: "1.25rem" }}
                />
                <h3 className="doc-id" style={{ margin: 0 }}>
                    Submission (Verifiable ID: {submission.verifiableId})
                </h3>
            </div>

            {/* Root Properties */}
            <div className="fields-grid">
                {rootKeys.map((key) => {
                    const val = (submission as any)[key];
                    if (key === "level") {
                        return (
                            <div key={key} className="field-row">
                                <strong>{key}: </strong>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "0.5rem",
                                    }}>
                                    <span
                                        style={{
                                            fontWeight: "bold",
                                            fontSize: "1.1em",
                                            backgroundColor: getLevelColor(Number(val) || 0),
                                            padding: "0 0.3em",
                                            borderRadius: "4px",
                                        }}>
                                        {val}
                                    </span>
                                </div>
                            </div>
                        );
                    }
                    return (
                        <div
                            key={key}
                            className={`field-row ${key === "locked" ? `locked-${submission.locked}` : ""}`}>
                            <strong>{key}: </strong>
                            <span>
                                {typeof val === "object" ? JSON.stringify(val) : String(val)}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Levels Section */}
            <div
                className="levels-section"
                style={{ marginTop: "1rem", borderTop: "1px solid #ccc", paddingTop: "1rem" }}>
                <div className="level-header">
                    <h4>Levels:</h4>
                </div>
                {submittable.levels?.map((submittableLevel: any, index: number) => {
                    const submissionLevelData = submission.levels?.[index];

                    return (
                        <div
                            key={index}
                            className="level-block"
                            style={{
                                marginBottom: "1rem",
                                padding: "0.5rem",
                                background: "#f9f9f9",
                            }}>
                            <div>
                                <h4>
                                    Level {index + 1}
                                    {submittableLevel.ui_title && ": " + submittableLevel.ui_title}
                                </h4>
                            </div>
                            <div>
                                <h4>Constraints:</h4>
                            </div>
                            <div className="constraints-super-container">
                                <RenderLevel
                                    input={submissionLevelData?.constraints}
                                    constraintsArr={submittableLevel.constraints || []}
                                    submittableSlug={submittableSlug}
                                    submission={submission}
                                    showAllImages={showAllImages}
                                    levelIndex={index}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Expand / View Linked Verifiable */}
            {!shouldExpand && (
                <Button className="expand-btn" onClick={handleExpand} disabled={isExpanding}>
                    {isExpanding ? "Expanding Linked Verifiable..." : "View Linked Verifiable"}
                </Button>
            )}

            {shouldExpand && expandedVerifiableDoc && verifiableConfig && (
                <div className="dependency-section">
                    <h4>Linked Verifiable Document</h4>
                    <ViewOnlyDocReview
                        adminDoc={expandedVerifiableDoc}
                        verifiable={verifiableConfig}
                        verifiableSlug={submittable.verifiable as string}
                        showAllImages={showAllImages}
                    />
                </div>
            )}

            {/* Actions */}
            <div className="actions-section">
                <div className="input-wrapper">
                    <label>Message Subject</label>
                    <input
                        type="text"
                        value={messageSubject}
                        onChange={(e) => setMessageSubject(e.target.value)}
                    />
                </div>
                <div className="input-wrapper">
                    <label>Message Body</label>
                    <textarea
                        rows={3}
                        value={messageBody}
                        onChange={(e) => setMessageBody(e.target.value)}
                    />
                </div>
                <div
                    className="buttons-row"
                    style={{
                        marginTop: "0.5rem",
                        marginBottom: "1rem",
                        borderBottom: "1px solid #eee",
                        paddingBottom: "1rem",
                    }}>
                    <Button
                        buttonStyle="secondary"
                        onClick={() => handleSendMessage(true)}
                        disabled={isVerifying}>
                        Send Message
                    </Button>
                    <Button
                        buttonStyle="secondary"
                        onClick={() => handleSendMessage(false)}
                        disabled={isVerifying}>
                        Send Message (No Email)
                    </Button>
                </div>
                <div className="buttons-row">
                    <Button
                        onClick={() => handleReview(true)}
                        disabled={isVerifying || isLevelPastMax}>
                        {isVerifying ? "Processing..." : "Accept"}
                    </Button>
                    <Button
                        buttonStyle="secondary"
                        onClick={() => handleReview(false)}
                        disabled={isVerifying || isLevelPastMax || isLocked2}>
                        {isVerifying ? "Processing..." : "Reject"}
                    </Button>
                    <Button
                        buttonStyle="secondary"
                        onClick={handleDelete}
                        disabled={isVerifying}
                        className="delete-btn">
                        Delete Submission
                    </Button>
                </div>
            </div>
        </div>
    );
};

const RenderLevel = ({
    input,
    constraintsArr,
    submittableSlug,
    submission,
    showAllImages,
    levelIndex,
}: {
    input: any | undefined;
    constraintsArr: any[];
    submittableSlug: string;
    submission: Submission;
    showAllImages?: boolean;
    levelIndex: number;
}) => {
    if (input === undefined) {
        return <p className="none-text">None</p>;
    }

    return (
        <div className="level-constraints-grid">
            {constraintsArr.map((constraint: any) => {
                const key = constraint.name;
                const value = input ? input[key] : undefined;

                return (
                    <div key={key} className="field-row">
                        <strong>{constraint.label || key}: </strong>
                        <span>
                            <FieldValueRenderer
                                type={constraint.type}
                                value={value}
                                submittableSlug={submittableSlug}
                                submission={submission}
                                fieldKey={key}
                                showAllImages={showAllImages}
                                levelIndex={levelIndex}
                            />
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

const FieldValueRenderer = ({
    type,
    value,
    submittableSlug,
    submission,
    fieldKey,
    showAllImages,
    levelIndex,
}: any) => {
    if (value === undefined || value === null) return "N/A";

    if (type === "file") {
        try {
            return (
                <SubmissionFileFieldView
                    fieldKey={fieldKey}
                    value={value}
                    submittableSlug={submittableSlug}
                    submission={submission}
                    showAllImages={showAllImages}
                    levelIndex={levelIndex}
                />
            );
        } catch (e) {
            return String(value);
        }
    }

    if (type === "payment") {
        try {
            const paymentInfo = decodePaymentInfo_SC(value as string);
            const isExpired =
                paymentInfo.status === "pending" && paymentInfo.expiredDate < Date.now();
            const statusText = isExpired ? "EXPIRED" : paymentInfo.status;
            const statusClass = isExpired ? "expired" : paymentInfo.status;

            return (
                <div className="payment-info-box">
                    <div className="payment-header">
                        <strong>Payment Status:</strong>
                        <span className={`payment-status-pill status-${statusClass}`}>
                            {statusText}
                        </span>
                    </div>
                    <div className="payment-details">
                        <div className="detail-row">
                            <strong>Merchant Order ID:</strong>
                            <span>{paymentInfo.reference}</span>
                        </div>
                        <div className="detail-row">
                            <strong>
                                {paymentInfo.status === "pending" ? "Expires At" : "Paid At"}:
                            </strong>
                            <span>
                                {new Date(
                                    paymentInfo.status === "pending"
                                        ? paymentInfo.expiredDate
                                        : paymentInfo.paidDate
                                ).toLocaleString()}
                            </span>
                        </div>
                        <a
                            href={paymentInfo.paymentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="payment-link">
                            {paymentInfo.status === "pending" ? "Payment URL" : "Receipt URL"}
                        </a>
                    </div>
                </div>
            );
        } catch (e) {
            return String(value);
        }
    }

    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "object") return JSON.stringify(value);

    return String(value);
};

const SubmissionFileFieldView = ({
    fieldKey,
    value,
    submittableSlug,
    submission,
    showAllImages,
    levelIndex,
}: any) => {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    let info: any = { fileName: "Unknown" };
    try {
        const { path } = decodeSQLURL_SC(value);
        info = decodeFilePath_SC(path);
    } catch (e) {
        // fallback
    }

    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(info.fileName);

    const loadPreview = async () => {
        setLoading(true);
        try {
            const fileInfo = await getSubmissionFileInfo_C(
                submission.verifiableId,
                submittableSlug,
                fieldKey,
                levelIndex + 1,
                {
                    allowRead: true,
                }
            );
            if (fileInfo.signedUrl && isImage) {
                setPreviewUrl(fileInfo.signedUrl);
            } else {
                window.open(fileInfo.signedUrl, "_blank");
            }
        } catch (e) {
            toast.error("Failed to load file info");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (showAllImages && isImage && !previewUrl && !loading) {
            loadPreview();
        }
    }, [showAllImages]);

    return (
        <div className="file-info-box">
            <div className="info-text">
                <strong>File Info:</strong>
                <br />
                User: {info.userId || "?"}
                <br />
                Time: {info.unixTime ? new Date(parseInt(info.unixTime)).toLocaleString() : "?"}
                <br />
                Name: {info.fileName}
            </div>
            <Button buttonStyle="secondary" onClick={loadPreview} disabled={loading}>
                {loading ? "Loading..." : "Preview / Download"}
            </Button>
            {previewUrl && (
                <>
                    <img src={previewUrl} alt="Preview" className="preview-image" />
                    <Button
                        buttonStyle="primary"
                        onClick={() => window.open(previewUrl, "_blank")}
                        className="download-btn">
                        Download Image
                    </Button>
                </>
            )}
        </div>
    );
};
