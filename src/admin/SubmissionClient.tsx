"use client";
import { Button, toast } from "@payloadcms/ui";
import { useState } from "react";
import { SubmissionReview } from "./SubmissionReview";
import {
    getSubmittable_C,
    getSubmission_C,
    deleteSubmission_C,
    reviewSubmission_C,
    sendMessageToSubmission_C,
} from "@/api/submission/client";
import { Submission } from "@/api/submission/server";
import { Submittable } from "@root/payload-types";

import "./styles/VerifiableClient.scss";
import { ExpectedError } from "../api/errorHandler/class";

export const SubmissionClient = () => {
    // State
    const [nowPage, setNowPage] = useState(1);
    const [nowPageInput, setNowPageInput] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [submittable, setSubmittable] = useState<Submittable | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Inputs
    const [submittableSlug, setSubmittableSlug] = useState("");
    const [orderByField, setOrderByField] = useState("");
    const [orderByIsAsc, setOrderByIsAsc] = useState<number | undefined>(undefined);
    const [showAllImages, setShowAllImages] = useState(false);
    const [shouldExpandOnLoad, setShouldExpandOnLoad] = useState(false);
    const [where, setWhere] = useState("");

    // Bulk Actions State
    const [selectedSubmissions, setSelectedSubmissions] = useState<
        Map<number, { verifiableId: number; locked: number; level: number }>
    >(new Map());
    const [isBulkVerifying, setIsBulkVerifying] = useState(false);
    const [bulkMessageSubject, setBulkMessageSubject] = useState("");
    const [bulkMessageBody, setBulkMessageBody] = useState("");

    const handleError = (e: any) => {
        console.error(e);
        if (e instanceof ExpectedError) {
            toast.error(`${e.name}: ${e.message}`);
        } else {
            toast.error(`Unexpected Error: ${e.message || "Unknown error"}`);
        }
    };

    const validateSlug = (slug: string) => {
        if (!slug || !slug.trim()) return false;
        return /^[a-z0-9_]+$/.test(slug);
    };

    const toggleSelection = (verifiableId: number, locked: number, level: number) => {
        setSelectedSubmissions((prev) => {
            const newMap = new Map(prev);
            if (newMap.has(verifiableId)) {
                newMap.delete(verifiableId);
            } else {
                newMap.set(verifiableId, { verifiableId, locked, level });
            }
            return newMap;
        });
    };

    const selectAll = () => {
        const newMap = new Map();
        submissions.forEach((sub) => {
            newMap.set(sub.verifiableId, {
                verifiableId: sub.verifiableId,
                locked: sub.locked,
                level: sub.level,
            });
        });
        setSelectedSubmissions(newMap);
    };

    const deselectAll = () => {
        setSelectedSubmissions(new Map());
    };

    const PAGING_LIMIT = parseInt(process.env.NEXT_PUBLIC_ADMIN_PAGING_LIMIT || "10");
    const maxPage = Math.max(Math.ceil(totalCount / PAGING_LIMIT), 1);

    const fetchData = async (page: number) => {
        if (!submittableSlug) {
            toast.error("Submittable Slug is required");
            return;
        }

        setIsLoading(true);
        try {
            let currentSubmittable = submittable;
            if (!currentSubmittable || currentSubmittable.slug !== submittableSlug) {
                currentSubmittable = await getSubmittable_C(submittableSlug);
                setSubmittable(currentSubmittable);
            }
            if (!currentSubmittable) throw new Error("Could not load submittable config");

            let parsedWhere = {};
            if (where.trim()) {
                try {
                    parsedWhere = JSON.parse(where);
                } catch (e) {
                    toast.error("Invalid JSON in 'Where' field");
                    return;
                }
            }

            const orderByObject =
                orderByField && orderByIsAsc !== undefined
                    ? { field: orderByField, isAsc: !!orderByIsAsc }
                    : undefined;

            // Using -1 for 'list all' admin view logic
            const result = await getSubmission_C(-1, submittableSlug, {
                page: page,
                where: parsedWhere,
                orderBy: orderByObject,
            });

            if (result && "data" in result) {
                setTotalCount(result.count[0]?.count || 0);
                setSubmissions(result.data);
            } else {
                setTotalCount(0);
                setSubmissions([]);
            }
            setNowPage(page);
        } catch (e: any) {
            handleError(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleApply = () => {
        if (!validateSlug(submittableSlug)) {
            toast.error(
                "Submittable Slug invalid. Must be non-empty and lowercase alphanumeric + underscore."
            );
            return;
        }
        setNowPageInput(nowPage);
        fetchData(1);
    };

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= maxPage) {
            setNowPage(newPage);
            setNowPageInput(newPage);
            fetchData(newPage);
        }
    };

    const handleSubmissionUpdate = (updatedSub: Submission) => {
        setSubmissions((prev) =>
            prev.map((s) => (s.verifiableId === updatedSub.verifiableId ? updatedSub : s))
        );
    };

    const handleSubmissionDelete = (verifiableId: number) => {
        setSubmissions((prev) => prev.filter((s) => s.verifiableId !== verifiableId));
        // Also remove from selection if present
        if (selectedSubmissions.has(verifiableId)) {
            toggleSelection(verifiableId, 0, 0); // values don't matter for delete
        }
    };

    // Bulk Handlers
    const handleBulkVerify = async (verdict: boolean) => {
        const action = verdict ? "accept" : "reject";
        if (
            !confirm(
                `You are about to ${action} ${selectedSubmissions.size} submissions. Continue?`
            ) ||
            !confirm(`This action CANNOT BE UNDONE. Proceed?`) ||
            !confirm(`Final confirmation: ${action.toUpperCase()} document?`)
        ) {
            return;
        }

        setIsBulkVerifying(true);
        const failed: string[] = [];
        let successCount = 0;

        const tasks = Array.from(selectedSubmissions.values());

        for (const task of tasks) {
            try {
                await reviewSubmission_C(
                    task.verifiableId,
                    submittableSlug,
                    verdict,
                    bulkMessageSubject,
                    bulkMessageBody
                );
                successCount++;
            } catch (e: any) {
                console.error(`Failed to verify ${task.verifiableId}`, e);
                failed.push(`${task.verifiableId} (${e.message})`);
            }
        }

        setIsBulkVerifying(false);
        let msg = `Bulk action complete. Success: ${successCount}.`;
        if (failed.length > 0) msg += ` Failed: ${failed.length}. Details: ${failed.join(", ")}`;

        alert(msg);
        toast.success(msg);

        if (successCount > 0) {
            fetchData(nowPage);
            setSelectedSubmissions(new Map());
        }
    };

    const handleBulkSendMessage = async (sendEmail: boolean) => {
        const action = sendEmail ? "Send Message (Email)" : "Send Message (No Email)";
        if (
            !confirm(
                `You are about to ${action} to ${selectedSubmissions.size} submissions. Continue?`
            ) ||
            !confirm(`Confirm ${action}?`)
        ) {
            return;
        }

        setIsBulkVerifying(true);
        const failed: string[] = [];
        let successCount = 0;
        const tasks = Array.from(selectedSubmissions.values());

        for (const task of tasks) {
            try {
                await sendMessageToSubmission_C(
                    task.verifiableId,
                    submittableSlug,
                    bulkMessageSubject || `BulkAction`,
                    bulkMessageBody || "Processed via bulk action",
                    sendEmail
                );
                successCount++;
            } catch (e: any) {
                console.error(`Failed to send message ${task.verifiableId}`, e);
                failed.push(`${task.verifiableId} (${e.message})`);
            }
        }

        setIsBulkVerifying(false);

        let msg = `Bulk message complete. Success: ${successCount}.`;
        if (failed.length > 0) {
            msg += ` Failed: ${failed.length}. Details: ${failed.join(", ")}`;
        } else {
            msg += ` (0 error)`;
        }

        alert(msg);
        toast.success(msg);
    };

    const handleBulkDelete = async () => {
        if (
            !confirm(`Are you sure you want to DELETE ${selectedSubmissions.size} submissions?`) ||
            !confirm(`Final confirmation: DELETE submissions forever?`)
        )
            return;

        setIsBulkVerifying(true);
        const failed: string[] = [];
        let successCount = 0;

        const tasks = Array.from(selectedSubmissions.values());

        for (const task of tasks) {
            try {
                await deleteSubmission_C(task.verifiableId, submittableSlug, { forceDelete: true });
                successCount++;
            } catch (e: any) {
                console.error(`Failed to delete ${task.verifiableId}`, e);
                failed.push(`${task.verifiableId} (${e.message})`);
            }
        }

        setIsBulkVerifying(false);
        let msg = `Bulk delete complete. Success: ${successCount}.`;
        if (failed.length > 0) msg += ` Failed: ${failed.length}. IDs: ${failed.join(", ")}`;

        alert(msg);
        toast.success(msg);

        if (successCount > 0) {
            fetchData(nowPage);
            setSelectedSubmissions(new Map());
        }
    };

    return (
        <div className="verifiable-view-container">
            <h1>Submission View</h1>

            <div className="pagination">
                <Button
                    disabled={nowPage <= 1 || isLoading}
                    onClick={() => handlePageChange(nowPage - 1)}
                    buttonStyle="secondary">
                    Previous
                </Button>
                <div
                    className="page-control"
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>Page</span>
                    <input
                        type="number"
                        min={1}
                        max={maxPage}
                        value={nowPageInput}
                        onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val)) setNowPageInput(val);
                            else setNowPageInput(1);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !isNaN(nowPageInput))
                                handlePageChange(nowPageInput);
                        }}
                        className="custom-input"
                        style={{ width: "4rem", textAlign: "center" }}
                    />
                    <span>
                        of {maxPage} (Total: {totalCount})
                    </span>
                </div>
                <Button
                    disabled={nowPage >= maxPage || isLoading}
                    onClick={() => handlePageChange(nowPage + 1)}
                    buttonStyle="secondary">
                    Next
                </Button>
            </div>

            <div className="filters-container">
                <div className="input-group">
                    <label>
                        Submittable Slug <span className="required-indicator">*</span>
                    </label>
                    <input
                        className="custom-input"
                        value={submittableSlug}
                        required={true}
                        onChange={(e) => setSubmittableSlug(e.target.value)}
                    />
                </div>

                <div className="filters-row">
                    <div className="input-group flex-1">
                        <label>Order By Field</label>
                        <input
                            className="custom-input"
                            value={orderByField}
                            onChange={(e) => setOrderByField(e.target.value)}
                        />
                    </div>
                    <div className="input-group w-48">
                        <label>Order Direction</label>
                        <select
                            className="custom-select"
                            value={orderByIsAsc !== undefined ? orderByIsAsc.toString() : ""}
                            onChange={(e) =>
                                setOrderByIsAsc(
                                    e.target.value ? parseInt(e.target.value) : undefined
                                )
                            }>
                            <option value="">Select...</option>
                            <option value="1">Ascending</option>
                            <option value="0">Descending</option>
                        </select>
                    </div>
                </div>

                <div className="checkbox-row-container">
                    <div>
                        <p>Checking one of this may result in longer request time</p>
                    </div>
                    <div className="checkbox-row">
                        <input
                            type="checkbox"
                            checked={shouldExpandOnLoad}
                            onChange={(e) => setShouldExpandOnLoad(e.target.checked)}
                            id="shouldExpandOnLoad"
                        />
                        <label htmlFor="shouldExpandOnLoad">Should Expand on Load</label>
                    </div>
                    <div className="checkbox-row">
                        <input
                            type="checkbox"
                            checked={showAllImages}
                            onChange={(e) => setShowAllImages(e.target.checked)}
                            id="showAllImages"
                        />
                        <label htmlFor="showAllImages">Show All Images on Load</label>
                    </div>
                </div>

                <div className="input-group">
                    <label>Where (JSON)</label>
                    <textarea
                        className="custom-textarea"
                        value={where}
                        onChange={(e) => setWhere(e.target.value)}
                        placeholder='e.g. { "levels.0.constraints.key": 0 }'
                        rows={3}
                    />
                </div>

                <Button onClick={handleApply} disabled={isLoading}>
                    {isLoading ? "Loading..." : "Apply"}
                </Button>
            </div>

            <div className="bulk-actions-section">
                <h3>Bulk Actions ({selectedSubmissions.size} Selected)</h3>
                <div className="bulk-select-buttons">
                    <Button
                        buttonStyle="secondary"
                        onClick={selectAll}
                        disabled={submissions.length === 0}>
                        Select All
                    </Button>
                    <Button
                        buttonStyle="secondary"
                        onClick={deselectAll}
                        disabled={selectedSubmissions.size === 0}>
                        Deselect All
                    </Button>
                </div>
                <div className="bulk-message-inputs">
                    <div className="input-wrapper">
                        <label>Bulk Message Subject</label>
                        <input
                            className="custom-input"
                            value={bulkMessageSubject}
                            onChange={(e) => setBulkMessageSubject(e.target.value)}
                            placeholder="Subject for all selected..."
                        />
                    </div>
                    <div className="input-wrapper">
                        <label>Bulk Message Body</label>
                        <textarea
                            className="custom-textarea"
                            value={bulkMessageBody}
                            onChange={(e) => setBulkMessageBody(e.target.value)}
                            placeholder="Body for all selected..."
                            rows={2}
                        />
                    </div>
                    <div className="buttons-row">
                        <Button
                            buttonStyle="secondary"
                            onClick={() => handleBulkSendMessage(true)}
                            disabled={isBulkVerifying || selectedSubmissions.size === 0}>
                            Send Message (Email)
                        </Button>
                        <Button
                            buttonStyle="secondary"
                            onClick={() => handleBulkSendMessage(false)}
                            disabled={isBulkVerifying || selectedSubmissions.size === 0}>
                            Send Message (No Email)
                        </Button>
                    </div>
                </div>
                <div className="buttons-row">
                    <Button
                        onClick={() => handleBulkVerify(true)}
                        disabled={
                            isBulkVerifying ||
                            selectedSubmissions.size === 0 ||
                            Array.from(selectedSubmissions.values()).some((s) => {
                                const levelsLength = submittable?.levels?.length || 0;
                                return s.level > levelsLength;
                            })
                        }>
                        {isBulkVerifying ? "Processing..." : "Bulk Accept"}
                    </Button>
                    <Button
                        buttonStyle="primary"
                        onClick={() => handleBulkVerify(false)}
                        disabled={
                            isBulkVerifying ||
                            selectedSubmissions.size === 0 ||
                            Array.from(selectedSubmissions.values()).some((s) => {
                                const levelsLength = submittable?.levels?.length || 0;
                                return s.level > levelsLength || s.locked === 2;
                            })
                        }>
                        {isBulkVerifying ? "Processing..." : "Bulk Reject"}
                    </Button>
                    <Button
                        onClick={handleBulkDelete}
                        disabled={isBulkVerifying || selectedSubmissions.size === 0}
                        className="delete-btn"
                        buttonStyle="secondary">
                        {isBulkVerifying ? "Processing..." : "Bulk Delete"}
                    </Button>
                </div>
            </div>

            <div className="docs-list">
                {submittable &&
                    submissions.map((sub, index) => (
                        <SubmissionReview
                            key={`${sub.verifiableId}-${index}`}
                            submission={sub}
                            submittable={submittable}
                            submittableSlug={submittableSlug}
                            onUpdate={handleSubmissionUpdate}
                            onDelete={handleSubmissionDelete}
                            showAllImages={showAllImages}
                            shouldExpandOnLoad={shouldExpandOnLoad}
                            selectedSubmissions={selectedSubmissions}
                            onToggleSelection={toggleSelection}
                        />
                    ))}
                {submissions.length === 0 && !isLoading && (
                    <p>No submissions found (or click Apply to fetch).</p>
                )}
                {isLoading && submissions.length === 0 && <p>Loading submissions...</p>}
            </div>
            <br></br>
            <br></br>
            <br></br>
        </div>
    );
};
