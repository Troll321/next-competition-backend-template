"use client";
import { Button, toast } from "@payloadcms/ui";
import React, { useState, useEffect } from "react";
import {
    getVerifiable_C,
    readDoc_C,
    verifyDoc_C,
    deleteDoc_C,
    sendMessageToVerifiable_C,
} from "@/api/form/client";
import { getVerifiableFileInfo_C } from "@/api/upload/client";
import { decodeFilePath_SC, decodeSQLURL_SC, decodePaymentInfo_SC } from "@/api/utils/string";
import { AdminSQLRow, ReccurSQLRow } from "@/api/utils/sql";
import { Verifiable } from "@root/payload-types";

import "./styles/DocReview.scss";
import { ExpectedError } from "../api/errorHandler/class";

interface DocReviewProps {
    adminDoc: AdminSQLRow;
    verifiable: Verifiable;
    verifiableSlug: string;
    onUpdate: (newDoc: AdminSQLRow) => void;
    shouldPopulateParent: boolean;
    selectedDocs: Map<
        string,
        { id: number; slug: string; verified: number; creator: string; depth: number }
    >;
    onToggleSelection: (
        id: number,
        slug: string,
        verified: number,
        creator: string,
        depth: number
    ) => void;
    showAllImages?: boolean;
    depth?: number;
}

export const DocReview: React.FC<DocReviewProps> = ({
    adminDoc,
    verifiable,
    verifiableSlug,
    onUpdate,
    shouldPopulateParent,
    selectedDocs,
    onToggleSelection,
    showAllImages,
    depth = 1,
}) => {
    const [shouldExpand, setShouldExpand] = useState(shouldPopulateParent);
    const [messageSubject, setMessageSubject] = useState("");
    const [messageBody, setMessageBody] = useState("");
    const [dependencyVerifiable, setDependencyVerifiable] = useState<Verifiable | null>(null);
    const [dependedByConfigs, setDependedByConfigs] = useState<Record<string, Verifiable>>({});

    const [isExpanding, setIsExpanding] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);

    const handleError = (e: any) => {
        console.error(e);
        if (e instanceof ExpectedError) {
            toast.error(`${e.name}: ${e.message}`);
        } else {
            toast.error(`Unexpected Error: ${e.message || "Unknown error"}`);
        }
    };

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

    // Fetch dependency config when expanded if needed
    useEffect(() => {
        const loadDependencyConfig = async () => {
            if (shouldExpand) {
                if (verifiable.depends_on && !dependencyVerifiable) {
                    try {
                        const config = await getVerifiable_C(verifiable.depends_on);
                        setDependencyVerifiable(config);
                    } catch (e) {
                        // We don't use strict error handling for background fetch typically unless critical
                        // But requirements say "Every API function call... should ALWAYS catch this"
                        // So I will use handleError here too.
                        handleError(e);
                    }
                }

                if (verifiable.depended_by) {
                    const newConfigs = { ...dependedByConfigs };
                    let changed = false;

                    const promises = verifiable.depended_by.map(async (dep) => {
                        if (!newConfigs[dep.slug]) {
                            try {
                                const conf = await getVerifiable_C(dep.slug);
                                return { slug: dep.slug, conf };
                            } catch (e) {
                                handleError(e);
                            }
                        }
                        return null;
                    });

                    const results = await Promise.all(promises);
                    results.forEach((r) => {
                        if (r) {
                            newConfigs[r.slug] = r.conf;
                            changed = true;
                        }
                    });

                    if (changed) setDependedByConfigs(newConfigs);
                }
            }
        };
        loadDependencyConfig();
    }, [
        shouldExpand,
        verifiable.depends_on,
        verifiable.depended_by,
        dependencyVerifiable,
        dependedByConfigs,
    ]);

    const handleExpand = async () => {
        setIsExpanding(true);
        try {
            const result = await readDoc_C(
                verifiableSlug,
                { id: adminDoc.id },
                { page: 1, shouldPopulate: true }
            );
            if (result && result.length > 0) {
                onUpdate(result[0] as AdminSQLRow);
                setShouldExpand(true);
            }
        } catch (e: any) {
            handleError(e);
        } finally {
            setIsExpanding(false);
        }
    };

    const handleVerify = async (verdict: boolean) => {
        const action = verdict ? "accept" : "reject";
        if (
            !confirm(`Are you sure you want to ${action} this document?`) ||
            !confirm(`This action CANNOT BE UNDONE. Proceed?`) ||
            (!verdict &&
                !confirm(
                    "WARNING: ALL DEPENDED_BY DOCUMENTS WILL BE REJECTED ALSO AND CAN'T BE UNDO"
                )) ||
            !confirm(`Final confirmation: ${action.toUpperCase()} document?`)
        ) {
            return;
        }

        if (verdict && shouldExpand) {
            if (adminDoc.dependsOnArr) {
                const allVerified = adminDoc.dependsOnArr.every((dep) => dep.verified === 2);
                if (!allVerified) {
                    toast.error("Cannot accept: All dependencies must be verified (level 2).");
                    return;
                }
            }
        }

        setIsVerifying(true);
        try {
            await verifyDoc_C(verifiableSlug, adminDoc.id, verdict, messageSubject, messageBody);
            toast.success(`Document ${action}ed successfully`);

            // Update local state: 2 for Accept (per server logic), -1 for Reject
            onUpdate({ ...adminDoc, verified: verdict ? 2 : -1 });
        } catch (e: any) {
            handleError(e);
        } finally {
            setIsVerifying(false);
        }
    };

    const handleSendMessage = async (sendEmail: boolean) => {
        const action = sendEmail ? "Send Message" : "Send Message (No Email)";
        if (
            !confirm(`Are you sure you want to ${action} to this document?`) ||
            !confirm(`Confirm ${action}?`)
        ) {
            return;
        }

        setIsVerifying(true);
        try {
            await sendMessageToVerifiable_C(
                verifiableSlug,
                adminDoc.id,
                messageSubject || "Message",
                messageBody,
                sendEmail
            );
            toast.success("Message sent");
            // Message doesn't necessarily change verifying state, but maybe updates history if we had it.
        } catch (e: any) {
            handleError(e);
        } finally {
            setIsVerifying(false);
        }
    };

    const handleDelete = async () => {
        if (
            !confirm("Are you sure you want to DELETE this document?") ||
            !confirm("This will CASCADE all the depended_by documents also. Proceed?") ||
            !confirm("This action CANNOT BE UNDONE. Proceed?") ||
            !confirm("Final confirmation: DELETE document forever?")
        ) {
            return;
        }

        setIsVerifying(true);
        try {
            await deleteDoc_C(verifiableSlug, { id: adminDoc.id }, { cascadeDelete: true });
            toast.success("Document deleted successfully");
        } catch (e: any) {
            handleError(e);
        } finally {
            setIsVerifying(false);
        }
    };

    const renderFieldValue = (key: string, value: any) => {
        if (value === undefined || value === null) return "N/A";

        if (fieldMapping[key] === "file") {
            try {
                const { path } = decodeSQLURL_SC(value as string);

                return (
                    <FileFieldReview
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
            return <span className="status-badge status-verified">Verified (2)</span>;
        }
        if (value === 1) {
            return <span className="status-badge status-requested">Requested (1)</span>;
        }
        if (value === -1) {
            return <span className="status-badge status-rejected">Rejected (-1)</span>;
        }
        return <span className="status-badge">Unrequested (0)</span>;
    };

    const keysToDisplay = Object.keys(adminDoc).filter(
        (k) => !["dependsOnArr", "dependedByArr"].includes(k)
    );

    const isGrayed = adminDoc.verified !== 1;
    const containerStyle = isGrayed ? { opacity: 0.6 } : {};

    const isSelected = selectedDocs.has(`${verifiableSlug}:${adminDoc.id}`);

    return (
        <div className="doc-review-card" style={containerStyle}>
            <div className="doc-id-converter">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() =>
                        onToggleSelection(
                            adminDoc.id,
                            verifiableSlug,
                            adminDoc.verified,
                            adminDoc.creator,
                            depth
                        )
                    }
                    style={{ width: "1.25rem", height: "1.25rem" }}
                />
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

            {!shouldExpand && !shouldPopulateParent && (
                <Button className="expand-btn" onClick={handleExpand} disabled={isExpanding}>
                    {isExpanding ? "Expanding..." : "Expand"}
                </Button>
            )}

            {shouldExpand && (
                <div className="dependency-section">
                    <h4>Dependencies (Depends On)</h4>
                    <div className="dependency-list">
                        {adminDoc.dependsOnArr?.map((dep: any, idx: number) => (
                            <div key={dep.id || idx} className="dependency-item">
                                {dependencyVerifiable ? (
                                    <DocReview
                                        adminDoc={dep}
                                        verifiable={dependencyVerifiable}
                                        verifiableSlug={verifiable.depends_on!}
                                        onUpdate={(updatedDep) => {
                                            const newDependsOnArr = [
                                                ...(adminDoc.dependsOnArr || []),
                                            ];
                                            newDependsOnArr[idx] =
                                                updatedDep as any as ReccurSQLRow;
                                            onUpdate({
                                                ...adminDoc,
                                                dependsOnArr: newDependsOnArr,
                                            });
                                        }}
                                        shouldPopulateParent={false}
                                        selectedDocs={selectedDocs}
                                        onToggleSelection={onToggleSelection}
                                        depth={depth + 1}
                                    />
                                ) : (
                                    <div className="loading-placeholder">
                                        Loading dependency schema...
                                    </div>
                                )}
                            </div>
                        ))}
                        {(!adminDoc.dependsOnArr || adminDoc.dependsOnArr.length === 0) && (
                            <p className="none-text">None</p>
                        )}
                    </div>

                    <h4 style={{ marginTop: "0.5rem" }}>Dependents (Depended By)</h4>
                    <div className="dependency-list">
                        {adminDoc.dependedByArr?.map((dep: any, idx: number) => {
                            const depSlug = dep.slug;
                            const depConfig = depSlug ? dependedByConfigs[depSlug] : null;

                            return (
                                <div key={dep.id || idx} className="dependency-item">
                                    {depConfig ? (
                                        <DocReview
                                            adminDoc={dep}
                                            verifiable={depConfig}
                                            verifiableSlug={depSlug}
                                            onUpdate={(updatedDep) => {
                                                const newDependedByArr = [
                                                    ...(adminDoc.dependedByArr || []),
                                                ];
                                                newDependedByArr[idx] =
                                                    updatedDep as any as ReccurSQLRow;
                                                onUpdate({
                                                    ...adminDoc,
                                                    dependedByArr: newDependedByArr,
                                                });
                                            }}
                                            shouldPopulateParent={false}
                                            selectedDocs={selectedDocs}
                                            onToggleSelection={onToggleSelection}
                                            depth={depth + 1}
                                        />
                                    ) : (
                                        <div className="loading-placeholder">
                                            <p>ID: {dep.id}</p>
                                            {depSlug ? "Loading schema..." : "Unknown source slug"}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {(!adminDoc.dependedByArr || adminDoc.dependedByArr.length === 0) && (
                            <p className="none-text">None</p>
                        )}
                    </div>
                </div>
            )}

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
                        onClick={() => handleVerify(true)}
                        disabled={isVerifying || adminDoc.verified !== 1}>
                        {isVerifying ? "Processing..." : "Accept"}
                    </Button>
                    <Button
                        buttonStyle="secondary"
                        onClick={() => handleVerify(false)}
                        disabled={isVerifying || adminDoc.verified < 1}>
                        {isVerifying ? "Processing..." : "Reject"}
                    </Button>
                    <Button
                        buttonStyle="secondary"
                        onClick={handleDelete}
                        disabled={isVerifying}
                        className="delete-btn">
                        {isVerifying ? "Processing..." : "Cascade Delete"}
                    </Button>
                </div>
            </div>
        </div>
    );
};

const FileFieldReview = ({
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

    const handleError = (e: any) => {
        console.error(e);
        if (e instanceof ExpectedError) {
            toast.error(`${e.name}: ${e.message}`);
        } else {
            toast.error(`Unexpected Error: ${e.message || "Unknown error"}`);
        }
    };

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
            handleError(e);
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
