"use client";
import { Button, toast } from "@payloadcms/ui";
import React, { useState, useEffect } from "react";
import { getVerifiableFileInfo_C } from "@/api/upload/client";
import { decodeFilePath_SC, decodeSQLURL_SC, decodePaymentInfo_SC } from "@/api/utils/string";
import { AdminSQLRow } from "@/api/utils/sql";
import { Verifiable } from "@root/payload-types";

import "./styles/DocReview.scss";

interface ViewOnlyDocReviewProps {
    adminDoc: AdminSQLRow;
    verifiable: Verifiable;
    verifiableSlug: string;
    showAllImages?: boolean;
}

export const ViewOnlyDocReview: React.FC<ViewOnlyDocReviewProps> = ({
    adminDoc,
    verifiable,
    verifiableSlug,
    showAllImages,
}) => {
    // Identify file fields (Constraints & Required On Create)
    const fieldMapping: Record<string, string> = {};
    verifiable.constraints.forEach((c) => {
        fieldMapping[c.name] = c.type;
    });
    if (verifiable.required_on_create) {
        verifiable.required_on_create.forEach((c) => {
            fieldMapping[c.name] = c.type;
        });
    }

    const renderFieldValue = (key: string, value: any) => {
        if (value === undefined || value === null) return "N/A";

        if (fieldMapping[key] === "file") {
            try {
                const { path } = decodeSQLURL_SC(value as string);
                const info = decodeFilePath_SC(path);

                return (
                    <FileFieldView
                        key={key}
                        fieldKey={key}
                        value={value as string}
                        verifiableSlug={verifiableSlug}
                        adminDocId={adminDoc.id}
                        showAllImages={showAllImages}
                    />
                );
            } catch (e) {
                return String(value);
            }
        }

        if (typeof value === "boolean") {
            return value ? "true" : "false";
        }
        if (typeof value === "object") {
            return JSON.stringify(value);
        }

        if (fieldMapping[key] === "payment") {
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
                                <span>{paymentInfo.merchantOrderId}</span>
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

        return String(value);
    };

    const renderStatusValue = (value: number) => {
        if (value === 2) {
            return <span className="status-badge status-verified">Verified (1)</span>;
        }
        if (value === -1) {
            return <span className="status-badge status-rejected">Rejected (-1)</span>;
        }
        return <span>{value}</span>;
    };

    const keysToDisplay = Object.keys(adminDoc).filter(
        (k) => !["dependsOnArr", "dependedByArr"].includes(k)
    );

    return (
        <div className="doc-review-card view-only">
            <div className="doc-id-converter">
                <h3 className="doc-id" style={{ margin: 0 }}>
                    Doc ID: {adminDoc.id}
                </h3>
            </div>

            <div className="fields-grid">
                {keysToDisplay
                    .filter((key) => key !== "_msyssec" && key !== "_msysrevsec" && key !== "id")
                    .sort((a, b) => {
                        if (a === "message_subject" || a === "message_body") return 1;
                        if (b === "message_subject" || b === "message_body") return -1;
                        return 0;
                    })
                    .map((key) => (
                        <div key={key} className="field-row">
                            <strong>{key}: </strong>
                            {key === "verified" ? (
                                renderStatusValue((adminDoc as any)[key])
                            ) : (
                                <span>{renderFieldValue(key, (adminDoc as any)[key])}</span>
                            )}
                        </div>
                    ))}
            </div>
        </div>
    );
};

const FileFieldView = ({
    fieldKey,
    value,
    verifiableSlug,
    adminDocId,
    showAllImages,
}: {
    fieldKey: string;
    value: string;
    verifiableSlug: string;
    adminDocId: number;
    showAllImages?: boolean;
}) => {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const { path } = decodeSQLURL_SC(value);
    const info = decodeFilePath_SC(path);
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(info.fileName);

    const loadPreview = async () => {
        setLoading(true);
        try {
            const fileInfo = await getVerifiableFileInfo_C(verifiableSlug, adminDocId, fieldKey, {
                allowRead: true,
            });
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

    // Auto-load if showAllImages is true and it's an image
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
                User: {info.userId}
                <br />
                Time: {new Date(parseInt(info.unixTime)).toLocaleString()}
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
