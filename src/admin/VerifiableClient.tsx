"use client";
import { Button, toast } from "@payloadcms/ui";
import { useState } from "react";
import { DocReview } from "./DocReview";
import {
    getVerifiable_C,
    readDoc_C,
    deleteDoc_C,
    sendMessageToVerifiable_C,
} from "@/api/form/client";
import { AdminSQLRow } from "@/api/utils/sql";
import { Verifiable } from "@root/payload-types";

import "./styles/VerifiableClient.scss";
import { ExpectedError } from "../api/errorHandler/class";

export const VerifiableClient = () => {
    // State
    const [nowPage, setNowPage] = useState(1);
    const [nowPageInput, setNowPageInput] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [adminDocs, setAdminDocs] = useState<AdminSQLRow[]>([]);
    const [verifiable, setVerifiable] = useState<Verifiable | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Selection State: Map<compositeKey, {id, slug, verified, creator, depth}>
    // Composite Key: `${slug}:${id}`
    const [selectedDocs, setSelectedDocs] = useState<
        Map<string, { id: number; slug: string; verified: number; creator: string; depth: number }>
    >(new Map());
    const [isBulkVerifying, setIsBulkVerifying] = useState(false);
    const [bulkMessageSubject, setBulkMessageSubject] = useState("");
    const [bulkMessageBody, setBulkMessageBody] = useState("");

    const toggleSelection = (
        id: number,
        slug: string,
        verified: number,
        creator: string,
        depth: number
    ) => {
        const key = `${slug}:${id}`;
        setSelectedDocs((prev) => {
            const newMap = new Map(prev);
            if (newMap.has(key)) {
                newMap.delete(key);
            } else {
                newMap.set(key, { id, slug, verified, creator, depth });
            }
            return newMap;
        });
    };

    const selectAll = () => {
        const newMap = new Map();
        adminDocs.forEach((doc) => {
            newMap.set(`${verifiableSlug}:${doc.id}`, {
                id: doc.id,
                slug: verifiableSlug,
                verified: doc.verified,
                creator: doc.creator,
                depth: 1,
            });
        });
        setSelectedDocs(newMap);
    };

    const deselectAll = () => {
        setSelectedDocs(new Map());
    };

    // Inputs
    const [verifiableSlug, setVerifiableSlug] = useState("");
    const [orderByField, setOrderByField] = useState("");
    const [orderByIsAsc, setOrderByIsAsc] = useState<number | undefined>(undefined);
    const [shouldPopulate, setShouldPopulate] = useState(false);
    const [showAllImages, setShowAllImages] = useState(false);
    const [where, setWhere] = useState("");

    const validateSlug = (slug: string) => {
        if (!slug || !slug.trim()) return false;
        // lowercase alphanumeric and underscore
        return /^[a-z0-9_]+$/.test(slug);
    };

    const handleError = (e: any) => {
        // Stop propagation is implied by not re-throwing
        if (process.env.NODE_ENV !== "production") {
            console.error(e);
        }
        if (e instanceof ExpectedError) {
            toast.error(`${e.name}: ${e.message}`);
        } else {
            toast.error(`Unexpected Error: ${e.message || "Unknown error"}`);
        }
    };

    // Bulk verify handler
    const handleBulkVerify = async (verdict: boolean) => {
        const action = verdict ? "accept" : "reject";
        if (
            !confirm(`You are about to ${action} ${selectedDocs.size} documents. Continue?`) ||
            !confirm(`This action CANNOT BE UNDONE. Proceed?`) ||
            (!verdict &&
                !confirm(
                    "WARNING: ALL DEPENDED_BY DOCUMENTS WILL BE REJECTED ALSO AND CAN'T BE UNDO"
                )) ||
            !confirm(`Final confirmation: ${action.toUpperCase()} documents?`)
        ) {
            return;
        }

        setIsBulkVerifying(true);
        const failed: string[] = [];
        let successCount = 0;

        let tasks = Array.from(selectedDocs.values());

        // Sort tasks based on depth (biggest depth first)
        // This ensures nested dependencies (which appear deeper in the view) are processed first
        tasks.sort((a, b) => b.depth - a.depth);

        // For bulk, we accumulate errors as per new requirement "exception is when a specific error handling is specified (for example with bulk action...)"

        for (const task of tasks) {
            try {
                // Using top level import now
                const { verifyDoc_C } = await import("@/api/form/client");
                await verifyDoc_C(task.slug, task.id, verdict, bulkMessageSubject, bulkMessageBody);
                successCount++;
            } catch (e: any) {
                if (process.env.NODE_ENV !== "production") {
                    console.error(`Failed to verify ${task.slug}:${task.id}`, e);
                }
                failed.push(`${task.slug}:${task.id} (${e.message})`);
            }
        }

        setIsBulkVerifying(false);

        let msg = `Bulk action complete. Success: ${successCount}.`;
        if (failed.length > 0) {
            msg += ` Failed: ${failed.length}. Details: ${failed.join(", ")}`;
        } else {
            msg += ` (0 error)`;
        }

        alert(msg);
        toast.success(msg);

        if (successCount > 0) {
            fetchData(nowPage);
            setSelectedDocs(new Map());
        }
    };

    const handleBulkSendMessage = async (sendEmail: boolean) => {
        const action = sendEmail ? "Send Message (Email)" : "Send Message (No Email)";
        if (
            !confirm(`You are about to ${action} to ${selectedDocs.size} documents. Continue?`) ||
            !confirm(`Confirm ${action}?`)
        ) {
            return;
        }

        setIsBulkVerifying(true);
        const failed: string[] = [];
        let successCount = 0;
        const tasks = Array.from(selectedDocs.values());

        for (const task of tasks) {
            try {
                await sendMessageToVerifiable_C(
                    task.slug,
                    task.id,
                    bulkMessageSubject || `BulkAction`,
                    bulkMessageBody || "Processed via bulk action",
                    sendEmail
                );
                successCount++;
            } catch (e: any) {
                if (process.env.NODE_ENV !== "production") {
                    console.error(`Failed to send message ${task.slug}:${task.id}`, e);
                }
                failed.push(`${task.slug}:${task.id} (${e.message})`);
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
            !confirm(`Are you sure you want to DELETE ${selectedDocs.size} documents?`) ||
            !confirm("This will CASCADE all the depended_by documents also. Proceed?") ||
            !confirm(`This action CANNOT BE UNDONE. Proceed?`) ||
            !confirm(`Final confirmation: DELETE documents forever?`)
        ) {
            return;
        }

        setIsBulkVerifying(true);
        const failed: string[] = [];
        let successCount = 0;

        const tasks = Array.from(selectedDocs.values());

        for (const task of tasks) {
            try {
                await deleteDoc_C(task.slug, { id: task.id }, { cascadeDelete: true });
                successCount++;
            } catch (e: any) {
                if (process.env.NODE_ENV !== "production") {
                    console.error(`Failed to delete ${task.slug}:${task.id}`, e);
                }
                failed.push(`${task.slug}:${task.id} (${e.message})`);
            }
        }

        setIsBulkVerifying(false);

        let msg = `Bulk delete complete. Success: ${successCount}.`;
        if (failed.length > 0) {
            msg += ` Failed: ${failed.length}. IDs: ${failed.join(", ")}`;
        } else {
            msg += ` (0 error)`;
        }

        alert(msg);
        toast.success(msg);

        if (successCount > 0) {
            fetchData(nowPage);
            setSelectedDocs(new Map());
        }
    };

    // Conflict detection for Bulk Delete
    const hasDependencyConflict = () => {
        if (selectedDocs.size < 2) return false;

        // Group selections by slug for easier lookup
        const selectedBySlug = new Map<string, Map<string, { id: number; creator: string }>>();
        selectedDocs.forEach((doc) => {
            if (!selectedBySlug.has(doc.slug)) {
                selectedBySlug.set(doc.slug, new Map());
            }
            selectedBySlug.get(doc.slug)!.set(doc.creator, { id: doc.id, creator: doc.creator });
        });

        // 1. Check using current view's schema (if available)
        if (verifiable && verifiable.slug === verifiableSlug) {
            const currentSlugSelectedMap = selectedBySlug.get(verifiableSlug);

            if (currentSlugSelectedMap) {
                // Check if any PARENT is selected (A depends on B, delete B kills A)
                if (verifiable.depends_on) {
                    const parentSlug = verifiable.depends_on;
                    const parentSelectedMap = selectedBySlug.get(parentSlug);
                    if (parentSelectedMap) {
                        // Check for creator match (Assuming ownership linkage)
                        for (const [creator, _] of currentSlugSelectedMap) {
                            if (parentSelectedMap.has(creator)) return true;
                        }
                    }
                }

                // Check if any CHILD is selected (B depends on A, delete A kills B)
                if (verifiable.depended_by && verifiable.depended_by.length > 0) {
                    for (const childConfig of verifiable.depended_by) {
                        const childSlug = childConfig.slug;
                        const childSelectedMap = selectedBySlug.get(childSlug);
                        if (childSelectedMap) {
                            // Check for creator match
                            for (const [creator, _] of currentSlugSelectedMap) {
                                if (childSelectedMap.has(creator)) return true;
                            }
                        }
                    }
                }
            }
        }

        // 2. Fallback to existing logic for populated arrays (if available)
        const selectedIds = new Set<number>();
        selectedDocs.forEach((d) => {
            if (d.slug === verifiableSlug) selectedIds.add(d.id);
        });

        for (const doc of adminDocs) {
            if (selectedIds.has(doc.id)) {
                // Check its dependents
                if (doc.dependedByArr) {
                    for (const dep of doc.dependedByArr) {
                        // Check if any dependent is selected
                        // Note: selectedDocs key is `${slug}:${id}`
                        const key = `${dep.slug}:${dep.id}`;
                        if (selectedDocs.has(key)) return true;
                    }
                }
                if (doc.dependsOnArr) {
                    for (const dep of doc.dependsOnArr) {
                        const key = `${(dep as any).slug}:${dep.id}`;
                        if (selectedDocs.has(key)) return true;
                    }
                }
            }
        }
        return false;
    };

    const isConflict = hasDependencyConflict();

    const PAGING_LIMIT = parseInt(process.env.NEXT_PUBLIC_ADMIN_PAGING_LIMIT || "10");

    const maxPage = Math.max(Math.ceil(totalCount / PAGING_LIMIT), 1);

    const fetchData = async (page: number) => {
        if (!verifiableSlug) {
            toast.error("Verifiable Slug is required");
            return;
        }

        setIsLoading(true);
        try {
            // Fetch Verifiable Config (if not already fetched or slug changed)
            let currentVerifiable = verifiable;
            if (!currentVerifiable || currentVerifiable.slug !== verifiableSlug) {
                currentVerifiable = await getVerifiable_C(verifiableSlug);
                setVerifiable(currentVerifiable);
            }
            if (!currentVerifiable) throw new Error("Could not load verifiable config");

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

            const docs = await readDoc_C(verifiableSlug, parsedWhere, {
                page: page,
                shouldPopulate: shouldPopulate,
                orderBy: orderByObject,
            });

            if (docs && docs.length > 0) {
                setTotalCount(docs[0].total_count || 0);
                setAdminDocs(docs);
            } else {
                setTotalCount(0);
                setAdminDocs([]);
            }
            setNowPage(page);
        } catch (e: any) {
            handleError(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleApply = () => {
        if (!validateSlug(verifiableSlug)) {
            toast.error(
                "Verifiable Slug invalid. Must be non-empty and lowercase alphanumeric + underscore."
            );
            return;
        }
        setNowPageInput(nowPage);
        // Calling fetchData which has try-catch
        fetchData(1);
    };

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= maxPage) {
            setNowPage(newPage);
            setNowPageInput(newPage);
            fetchData(newPage);
        }
    };

    const handleDocUpdate = (updatedDoc: AdminSQLRow) => {
        setAdminDocs((prev) => prev.map((doc) => (doc.id === updatedDoc.id ? updatedDoc : doc)));
    };

    return (
        <div className="verifiable-view-container">
            <h1>Verifiable View</h1>

            {/* Pagination */}
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
                            if (!isNaN(val)) {
                                setNowPageInput(val);
                            } else {
                                setNowPageInput(1);
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                if (!isNaN(nowPageInput)) {
                                    handlePageChange(nowPageInput);
                                }
                            }
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

            {/* Filters */}
            <div className="filters-container">
                <div className="input-group">
                    <label>
                        Verifiable Slug <span className="required-indicator">*</span>
                    </label>
                    <input
                        className="custom-input"
                        value={verifiableSlug}
                        required={true}
                        onChange={(e) => setVerifiableSlug(e.target.value)}
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
                            checked={shouldPopulate}
                            onChange={(e) => setShouldPopulate(e.target.checked)}
                            id="shouldPopulate"
                        />
                        <label htmlFor="shouldPopulate">Should Expand on Load</label>
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
                        placeholder='e.g. { "verified": 0 }'
                        rows={3}
                    />
                </div>

                <Button onClick={handleApply} disabled={isLoading}>
                    {isLoading ? "Loading..." : "Apply"}
                </Button>

                <code>
                    <span className="required-indicator">*</span> Accept could only be done if all
                    depends_on is accepted <br /> <span className="required-indicator">*</span>{" "}
                    Reject will reject all of the depended_by to (recursively) <br />
                    <span className="required-indicator">*</span> Cascade will delete all of the
                    depended_by (recursively)
                </code>
            </div>

            {/* Bulk Actions */}
            <div className="bulk-actions-section">
                <h3>Bulk Actions ({selectedDocs.size} Selected)</h3>
                <div className="bulk-select-buttons">
                    <Button
                        buttonStyle="secondary"
                        onClick={selectAll}
                        disabled={adminDocs.length === 0}>
                        Select All
                    </Button>
                    <Button
                        buttonStyle="secondary"
                        onClick={deselectAll}
                        disabled={selectedDocs.size === 0}>
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
                            placeholder="Subject for all selected docs..."
                        />
                    </div>
                    <div className="input-wrapper">
                        <label>Bulk Message Body</label>
                        <textarea
                            className="custom-textarea"
                            value={bulkMessageBody}
                            onChange={(e) => setBulkMessageBody(e.target.value)}
                            placeholder="Body for all selected docs..."
                            rows={2}
                        />
                    </div>
                    <div className="buttons-row" style={{ marginTop: "0.5rem" }}>
                        <Button
                            buttonStyle="secondary"
                            onClick={() => handleBulkSendMessage(true)}
                            disabled={isBulkVerifying || selectedDocs.size === 0}>
                            Send Message (Email)
                        </Button>
                        <Button
                            buttonStyle="secondary"
                            onClick={() => handleBulkSendMessage(false)}
                            disabled={isBulkVerifying || selectedDocs.size === 0}>
                            Send Message (No Email)
                        </Button>
                    </div>
                </div>

                <div className="buttons-row" style={{ marginTop: "1rem" }}>
                    <Button
                        onClick={() => handleBulkVerify(true)}
                        disabled={
                            isBulkVerifying ||
                            selectedDocs.size === 0 ||
                            Array.from(selectedDocs.values()).some(
                                (d) => d.verified === 2 || d.verified === -1
                            )
                        }>
                        {isBulkVerifying ? "Processing..." : "Bulk Accept"}
                    </Button>
                    <Button
                        buttonStyle="primary"
                        onClick={() => handleBulkVerify(false)}
                        disabled={
                            isBulkVerifying ||
                            selectedDocs.size === 0 ||
                            Array.from(selectedDocs.values()).some((d) => d.verified < 1)
                        }>
                        {isBulkVerifying ? "Processing..." : "Bulk Reject"}
                    </Button>

                    <Button
                        onClick={handleBulkDelete}
                        disabled={isBulkVerifying || selectedDocs.size === 0 || isConflict}
                        className={`delete-btn ${isConflict ? "conflict" : ""}`}
                        buttonStyle="secondary">
                        {isBulkVerifying
                            ? "Processing..."
                            : isConflict
                              ? "Conflict (Unselect Doc)"
                              : "Bulk Cascade Delete"}
                    </Button>
                </div>
            </div>

            {/* Documents List */}
            <div className="docs-list">
                {verifiable &&
                    adminDocs.map((doc, index) => (
                        <DocReview
                            key={`${doc.id}-${index}`}
                            adminDoc={doc}
                            verifiable={verifiable}
                            verifiableSlug={verifiableSlug}
                            onUpdate={handleDocUpdate}
                            shouldPopulateParent={shouldPopulate}
                            selectedDocs={selectedDocs}
                            onToggleSelection={toggleSelection}
                            showAllImages={showAllImages}
                        />
                    ))}
                {adminDocs.length === 0 && !isLoading && (
                    <p>No documents found (or click Apply to fetch).</p>
                )}
                {isLoading && adminDocs.length === 0 && <p>Loading documents...</p>}
            </div>
            <br></br>
            <br></br>
            <br></br>
            <br></br>
            <br></br>
        </div>
    );
};
