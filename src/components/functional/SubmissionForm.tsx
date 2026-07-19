"use client";

import { useEffect, useState, useRef } from "react";
import {
    getSubmission_C,
    updateSubmission_C,
    lockSubmission_C,
    getSubmittable_C,
} from "@/api/submission/client";
import { Submission } from "@/api/submission/server";
import { readDoc_C } from "@/api/form/client";
import { SQLRow } from "@/api/utils/sql";
import { uploadFileToSubmission_C, getSubmissionFileInfo_C } from "@/api/upload/client";
import { decodeSQLURL_SC, decodeFilePath_SC } from "@/api/utils/string";
import { FileInfo } from "@/api/upload/server";
import { useUser_C } from "@/api/authentication/client";
import { Submittable } from "../../../payload-types";
import { payToSubmission_C } from "@/api/payment/client";
import { decodePaymentInfo_SC } from "@/api/utils/string";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { ExpectedError } from "@/api/errorHandler/class";
import Image from "next/image";
import { Card } from "../Card";
import TimCard from "@/modules/dashboard/cards/TimCard";

interface BaseFieldProps {
    name: string;
    value: any;
    onChange: (value: any) => void;
    disabled?: boolean;
    readOnly?: boolean;
    uiTitle?: string;
    uiDescription?: string;
    maxInputSizeKb?: number;
}

interface FileFieldProps extends BaseFieldProps {
    mimeTypes: string[];
    verifiableDocId: number;
    submittableSlug: string;
    level: number;
    fileInfoResetSignal: number;
}

function FieldWrapper({
    children,
    uiTitle,
    uiDescription,
    name,
}: {
    children: React.ReactNode;
    uiTitle?: string;
    uiDescription?: string;
    name: string;
}) {
    return (
        <div className="font-quicksand mb-4">
            <label className="text-md mb-1 block font-bold text-cyan-900">
                {uiTitle && uiTitle !== "" ? uiTitle : name}
            </label>
            {children}
            {/* {uiDescription && uiDescription !== "" && (
                <p className="mt-2 text-sm text-cyan-700">{uiDescription}</p>
            )} */}
        </div>
    );
}

function NumberField({
    name,
    value,
    onChange,
    disabled,
    readOnly,
    uiTitle,
    uiDescription,
}: BaseFieldProps) {
    return (
        <FieldWrapper uiTitle={uiTitle} uiDescription={uiDescription} name={name}>
            <input
                type="number"
                name={name}
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
                disabled={disabled}
                readOnly={readOnly}
                className={`w-full rounded-md border border-cyan-900 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                    disabled && !readOnly ? "cursor-not-allowed bg-gray-100" : ""
                } ${disabled ? "text-gray-400 opacity-100" : "text-black"}`}
            />
        </FieldWrapper>
    );
}

function TextField({
    name,
    value,
    onChange,
    disabled,
    readOnly,
    uiTitle,
    uiDescription,
    maxInputSizeKb,
}: BaseFieldProps) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        if (maxInputSizeKb !== undefined) {
            const sizeInBytes = new Blob([newValue]).size;
            if (sizeInBytes > maxInputSizeKb * 1024) {
                // Input exceeds size limit, prevent update
                // Optionally we could show a toast/alert, but for "should always <=" we block.
                return;
            }
        }
        onChange(newValue);
    };

    return (
        <FieldWrapper uiTitle={uiTitle} uiDescription={uiDescription} name={name}>
            <input
                type="text"
                name={name}
                value={value ?? ""}
                onChange={handleChange}
                disabled={disabled}
                readOnly={readOnly}
                className={`w-full rounded-md border border-cyan-900 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                    disabled && !readOnly ? "cursor-not-allowed bg-gray-100" : ""
                } ${disabled ? "text-gray-400 opacity-100" : "text-black"}`}
            />
        </FieldWrapper>
    );
}

function BooleanField({
    name,
    value,
    onChange,
    disabled,
    readOnly,
    uiTitle,
    uiDescription,
}: BaseFieldProps) {
    return (
        <FieldWrapper uiTitle={uiTitle} uiDescription={uiDescription} name={name}>
            <input
                type="checkbox"
                name={name}
                checked={value ?? false}
                onChange={(e) => onChange(e.target.checked)}
                disabled={disabled}
                className={`h-4 w-4 rounded border-cyan-900 text-blue-600 focus:ring-blue-500 ${
                    disabled && !readOnly ? "cursor-not-allowed opacity-50" : ""
                }`}
            />
        </FieldWrapper>
    );
}

interface PaymentFieldProps extends BaseFieldProps {
    verifiableDocId: number;
    submittableSlug: string;
    level: number;
}

function PaymentField({
    name,
    value,
    onChange,
    disabled,
    readOnly,
    uiTitle,
    uiDescription,
    verifiableDocId,
    submittableSlug,
    level,
}: PaymentFieldProps) {
    const [loading, setLoading] = useState(false);

    const handlePaymentAction = async (checkOnly: boolean) => {
        if (!verifiableDocId) return;
        setLoading(true);
        try {
            const encodedInfo = await payToSubmission_C(
                verifiableDocId,
                submittableSlug,
                name,
                level,
                checkOnly
            );
            onChange(encodedInfo);
        } catch (error: any) {
            console.error("Error processing payment action:", error);
            if (error instanceof ExpectedError) {
                toast.error(error.name, { description: error.message });
            } else {
                toast.error("Unexpected Error", {
                    description: error.message || "An unexpected error occurred.",
                });
            }
        } finally {
            setLoading(false);
        }
    };

    const renderContent = () => {
        if (!value) {
            return (
                <button
                    type="button"
                    onClick={() => handlePaymentAction(false)}
                    disabled={disabled || !verifiableDocId || loading}
                    className={`w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                        disabled || !verifiableDocId || loading
                            ? "cursor-not-allowed opacity-50"
                            : ""
                    }`}>
                    {loading ? "Processing..." : "Initiate Transaction"}
                </button>
            );
        }

        try {
            const decoded = decodePaymentInfo_SC(value);
            const isPaid = decoded.status === "paid";
            const isExpired = !isPaid && decoded.expiredDate < Date.now();

            return (
                <div className="space-y-4 rounded-md border border-gray-200 p-4">
                    <div className="grid gap-2 text-sm">
                        <div className="flex justify-between">
                            <span className="font-medium text-gray-500">Status:</span>
                            <span
                                className={`font-bold ${isPaid ? "text-green-600" : isExpired ? "text-red-600" : "text-yellow-600"}`}>
                                {isPaid ? "PAID" : isExpired ? "EXPIRED" : "PENDING"}
                            </span>
                        </div>
                        {isPaid && (
                            <>
                                <div className="flex justify-between">
                                    <span className="font-medium text-gray-500">Paid Date:</span>
                                    <span>{new Date(decoded.paidDate).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="font-medium text-gray-500">Order ID:</span>
                                    <span className="text-xs">{decoded.reference}</span>
                                </div>
                            </>
                        )}
                        {!isPaid && (
                            <div className="flex justify-between">
                                <span className="font-medium text-gray-500">Expires:</span>
                                <span>{new Date(decoded.expiredDate).toLocaleString()}</span>
                            </div>
                        )}
                    </div>

                    {!isPaid && (
                        <div className="flex flex-col gap-2">
                            <a
                                href={decoded.paymentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`block w-full rounded-md bg-green-600 px-4 py-2 text-center text-white hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:outline-none ${
                                    disabled ? "pointer-events-none opacity-50" : ""
                                }`}>
                                Pay
                            </a>
                            <button
                                type="button"
                                onClick={() => handlePaymentAction(true)}
                                disabled={disabled || loading}
                                className={`w-full rounded-md bg-yellow-500 px-4 py-2 text-white hover:bg-yellow-600 focus:ring-2 focus:ring-yellow-500 focus:outline-none ${
                                    disabled || loading ? "cursor-not-allowed opacity-50" : ""
                                }`}>
                                {loading ? "Checking..." : "Check Status"}
                            </button>
                            {isExpired && (
                                <button
                                    type="button"
                                    onClick={() => handlePaymentAction(false)}
                                    disabled={disabled || loading}
                                    className={`w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                                        disabled || loading ? "cursor-not-allowed opacity-50" : ""
                                    }`}>
                                    {loading ? "Processing..." : "Initiate New Transaction"}
                                </button>
                            )}
                        </div>
                    )}
                    {isPaid && (
                        <a
                            href={decoded.paymentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full rounded-md bg-gray-600 px-4 py-2 text-center text-white hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 focus:outline-none">
                            Payment Receipt
                        </a>
                    )}
                </div>
            );
        } catch (e) {
            return <div className="text-red-500">Invalid Payment Info</div>;
        }
    };

    return (
        <FieldWrapper uiTitle={uiTitle} uiDescription={uiDescription} name={name}>
            {renderContent()}
        </FieldWrapper>
    );
}

function FileField({
    name,
    value,
    onChange,
    disabled,
    readOnly,
    maxInputSizeKb,
    mimeTypes,
    verifiableDocId,
    submittableSlug,
    level,
    uiTitle,
    uiDescription,
    fileInfoResetSignal,
}: FileFieldProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
    const [fileMetadata, setFileMetadata] = useState<{
        userId: string;
        unixTime: string;
        fileName: string;
    } | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setFileInfo(null);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [fileInfoResetSignal]);

    const isFileObject = value instanceof File;
    const isUploadedFile = typeof value === "string" && value.length > 0;

    useEffect(() => {
        if (isUploadedFile) {
            try {
                const decoded = decodeSQLURL_SC(value);
                const metadata = decodeFilePath_SC(decoded.path);
                setFileMetadata(metadata);
            } catch (error) {
                console.error("Error decoding file path:", error);
            }
        }
    }, [value, isUploadedFile]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (maxInputSizeKb && file.size > maxInputSizeKb * 1024) {
            toast.error("File Error", {
                description: `File size exceeds maximum allowed size of ${maxInputSizeKb}KB`,
            });
            e.target.value = ""; // Reset input
            return;
        }

        if (!mimeTypes.includes(file.type)) {
            toast.error("File Error", {
                description: `File type not allowed. Allowed types: ${mimeTypes.join(", ")}`,
            });
            e.target.value = ""; // Reset input
            return;
        }

        setSelectedFile(file);
        onChange(file);

        if (file.type.startsWith("image/")) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        } else {
            setPreviewUrl(null);
        }
    };

    const handlePreviewFile = async () => {
        try {
            setPreviewLoading(true);
            const info = await getSubmissionFileInfo_C(
                verifiableDocId,
                submittableSlug,
                name,
                level
            );
            setFileInfo(info);
        } catch (error: any) {
            console.error("Error getting file info:", error);
            if (error instanceof ExpectedError) {
                toast.error(error.name, { description: error.message });
            } else {
                toast.error("Unexpected Error", {
                    description: error.message || "An unexpected error occurred.",
                });
            }
        } finally {
            setPreviewLoading(false);
        }
    };

    const isImageMimeType = (mime: string) => {
        return ["image/png", "image/jpg", "image/jpeg", "image/webp"].includes(mime);
    };

    return (
        <FieldWrapper uiTitle={uiTitle} uiDescription={uiDescription} name={name}>
            <div className="w-full space-y-2">
                <input
                    ref={fileInputRef}
                    type="file"
                    name={name}
                    onChange={handleFileSelect}
                    accept={mimeTypes.join(",")}
                    disabled={disabled}
                    className="hidden"
                />
                <div className="flex flex-col">
                    <div
                        onClick={() => !disabled && fileInputRef.current?.click()}
                        className={`flex w-full items-center rounded-md border-3 border-cyan-900 px-3 py-2 transition-colors ${
                            disabled
                                ? "cursor-not-allowed bg-gray-100"
                                : "cursor-pointer bg-white hover:border-cyan-700"
                        }`}>
                        <span
                            className={`mr-3 hidden rounded border px-2 py-1 text-xs font-semibold ${
                                disabled
                                    ? "border-gray-300 bg-gray-200 text-gray-500"
                                    : "border-gray-400 bg-gray-100 text-gray-700"
                            }`}>
                            Choose File
                        </span>
                        <span
                            className={`truncate text-sm ${disabled ? "text-gray-400" : "text-gray-400"}`}>
                            {selectedFile
                                ? selectedFile.name
                                : isUploadedFile && fileMetadata
                                  ? fileMetadata.fileName
                                  : "No File Chosen"}
                        </span>
                    </div>
                    <p className="ml-2 text-xs text-cyan-700">ketuk untuk mengunggah</p>
                </div>
                {selectedFile && !isUploadedFile && (
                    <div className="rounded-md border border-cyan-900 p-3">
                        <div className="text-sm font-medium">Selected File:</div>
                        <div className="text-sm text-cyan-900">{selectedFile.name}</div>
                        <div className="text-sm text-cyan-900">
                            Size: {(selectedFile.size / 1024).toFixed(2)} KB
                        </div>
                        {previewUrl && isImageMimeType(selectedFile.type) && (
                            <Image
                                src={previewUrl}
                                alt="Preview"
                                className="mt-2 max-h-48 rounded-md"
                            />
                        )}
                    </div>
                )}
                {isUploadedFile && fileMetadata && (
                    <div className="rounded-md border border-cyan-900 bg-yellow-50 p-3 text-cyan-900">
                        <div className="text-sm font-medium">Uploaded File:</div>
                        {/* <div className="text-sm wrap-break-word">Owner: {fileMetadata.userId}</div> */}
                        <div className="text-sm">
                            Uploaded: {new Date(parseInt(fileMetadata.unixTime)).toLocaleString()}
                        </div>
                        <div className="text-sm text-cyan-900">File: {fileMetadata.fileName}</div>
                        <button
                            type="button"
                            onClick={handlePreviewFile}
                            disabled={disabled || previewLoading}
                            className={`mt-2 rounded-md px-3 py-1 text-sm text-white ${
                                disabled || previewLoading
                                    ? "cursor-not-allowed bg-gray-400"
                                    : "bg-cyan-700 hover:bg-cyan-800"
                            }`}>
                            {previewLoading ? "Loading..." : "Preview File"}
                        </button>
                        {fileInfo && (
                            <div className="mt-2">
                                <a
                                    href={fileInfo.signedUrl}
                                    download
                                    className="text-sm text-cyan-700 hover:underline">
                                    Download File
                                </a>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </FieldWrapper>
    );
}

export function SubmissionForm({
    docId: initialDocId,
    submittableSlug,
}: {
    docId?: number;
    submittableSlug: string;
}) {
    const [selectedSubmission, setSelectedSubmission] = useState<string>("paper_submission");
    const [submittable, setSubmittable] = useState<Submittable | null>(null);
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [doc, setDoc] = useState<SQLRow | null>(null);
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [initialFormData, setInitialFormData] = useState<Record<string, any>>({});
    const [fileInfoResetSignal, setFileInfoResetSignal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [locking, setLocking] = useState(false);

    // We keep track of the resolved docId
    const [resolvedDocId, setResolvedDocId] = useState<number | null>(initialDocId ?? null);

    const { user, isLoading } = useUser_C();

    useEffect(() => {
        async function loadData() {
            try {
                setLoading(true);

                // 1. Fetch submittable (public)
                // We always fetch this to at least show the title/requirements if possible
                let s = submittable;
                if (!s) {
                    s = await getSubmittable_C(submittableSlug);
                    setSubmittable(s);
                }

                // 2. Check Authentication
                // If checking auth or not logged in, we cannot proceed to protected routes
                if (isLoading) return;

                if (!user || !user.email_verified) {
                    setLoading(false);
                    return;
                }

                let currentDocId = initialDocId;

                // Resolve docId if missing
                if (!currentDocId && s) {
                    const docs = await readDoc_C(s.verifiable, {});
                    if (docs && docs.length > 0) {
                        currentDocId = docs[0].id;
                        setResolvedDocId(currentDocId);
                        setDoc(docs[0]);
                    }
                } else if (currentDocId && s) {
                    // Ensure doc is loaded if we have docId
                    if (!doc) {
                        const verifiableDocs = await readDoc_C(s.verifiable, {
                            id: currentDocId,
                        });
                        setDoc(verifiableDocs[0] || null);
                    }
                }

                // if we have docId
                if (currentDocId) {
                    const subData = await getSubmission_C(currentDocId, submittableSlug);
                    setSubmission(subData);

                    // Initialize form data
                    if (subData) {
                        const currentLevelIdx = subData.level - 1;
                        if (
                            subData.levels &&
                            subData.levels[currentLevelIdx] &&
                            subData.levels[currentLevelIdx].constraints
                        ) {
                            setFormData(subData.levels[currentLevelIdx].constraints);
                            setInitialFormData(subData.levels[currentLevelIdx].constraints);
                        }
                    }
                }
            } catch (error: any) {
                console.error("Error loading submission data:", error);
                if (error instanceof ExpectedError) {
                    toast.error(error.name, { description: error.message });
                }
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [initialDocId, submittableSlug, user, isLoading]);

    const handleFieldChange = (name: string, value: any) => {
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    // Helper to use resolvedDocId in handlers
    const activeDocId = resolvedDocId;

    const hasChanges = () => {
        // Check for changes (excluding payment inputs if they are handled separately, but usually they are just strings)
        // User spec: "this includes file input, text input but not payment input. Payment input is handled separately"
        if (!submittable) return false;

        const currentLevelIdx = submission ? submission.level - 1 : 0;
        if (!submittable.levels[currentLevelIdx]) return false;
        const levelConstraints = submittable.levels[currentLevelIdx].constraints;

        for (const field of levelConstraints) {
            if (field.type === "payment") continue;

            const currentVal = formData[field.name];
            const initialVal = initialFormData[field.name];

            // Simple equality check
            if (currentVal !== initialVal) return true;
        }
        return false;
    };

    const handleSave = async () => {
        if (!doc || !submittable || !activeDocId) return;
        if (!hasChanges()) return;

        setSaving(true);
        try {
            const currentLevelIdx = submission ? submission.level - 1 : 0;
            const levelConstraints = submittable.levels[currentLevelIdx].constraints;

            // ... (rest of logic mostly same, with error handling updates)

            const insertObj: Record<string, any> = {};
            for (const field of levelConstraints) {
                if (field.type === "payment" || field.type === "file") continue;
                if (formData[field.name] !== undefined) {
                    insertObj[field.name] = formData[field.name];
                }
            }

            await updateSubmission_C(activeDocId, submittableSlug, insertObj);

            const fileFields: Array<{ name: string; file: File }> = [];
            for (const field of levelConstraints) {
                if (field.type === "file" && formData[field.name] instanceof File) {
                    fileFields.push({
                        name: field.name,
                        file: formData[field.name] as File,
                    });
                }
            }

            for (const { name, file } of fileFields) {
                try {
                    await uploadFileToSubmission_C(activeDocId, submittableSlug, name, file);
                } catch (error: any) {
                    console.error(`Error uploading file ${name}:`, error);
                    if (error instanceof ExpectedError) {
                        toast.error(error.name, {
                            description: `File upload failed for ${name}: ` + error.message,
                        });
                    }
                    throw error; // Re-throw to stop
                }
            }

            const newSub = await getSubmission_C(activeDocId, submittableSlug);
            setSubmission(newSub);

            // Update initial form data to new state
            if (
                newSub &&
                newSub.levels &&
                newSub.levels[currentLevelIdx] &&
                newSub.levels[currentLevelIdx].constraints
            ) {
                setInitialFormData(newSub.levels[currentLevelIdx].constraints);
                setFormData(newSub.levels[currentLevelIdx].constraints);
                setFileInfoResetSignal((prev) => prev + 1);
            }

            toast.success("Saved", { description: "Submission changes saved." });
        } catch (error: any) {
            console.error("Error saving submission:", error);
            if (error instanceof ExpectedError) {
                toast.error(error.name, { description: error.message });
            } else {
                toast.error("Unexpected Error", {
                    description: error.message || "An unexpected error occurred.",
                });
            }
        } finally {
            setSaving(false);
        }
    };

    const handleLock = async () => {
        const targetId = activeDocId;
        if (!doc || !submittable || !targetId) return;
        setLocking(true);
        try {
            await lockSubmission_C(targetId, submittableSlug);
            const newSub = await getSubmission_C(targetId, submittableSlug);
            setSubmission(newSub);
            confetti({
                particleCount: 100,
                spread: 200,
                origin: { y: 0.5 },
            });
            toast.success("Locked", { description: "Submission locked successfully." });
        } catch (error: any) {
            console.error("Error locking submission:", error);
            if (error instanceof ExpectedError) {
                toast.error(error.name, { description: error.message });
            } else {
                toast.error("Unexpected Error", {
                    description: error.message || "An unexpected error occurred.",
                });
            }
        } finally {
            setLocking(false);
        }
    };

    if (loading && !submittable) {
        return (
            <div className="mx-auto max-w-4xl animate-pulse space-y-6 p-6">
                <div className="border-white-900 rounded-md border-2 p-6 shadow-sm ring-1 ring-gray-900/5">
                    <div className="mb-4 h-8 w-1/2 rounded bg-slate-200" />

                    <div className="mb-6 flex space-x-4">
                        <div className="h-6 w-20 rounded-full bg-slate-200" />
                        <div className="h-6 w-24 rounded-full bg-slate-200" />
                        <div className="h-6 w-24 rounded-full bg-slate-200" />
                    </div>

                    <div className="mb-6 space-y-4 rounded-md border p-4">
                        <div className="flex justify-between">
                            <div className="h-6 w-1/4 rounded bg-slate-200" />
                            <div className="h-4 w-1/3 rounded bg-slate-200" />
                        </div>
                        <div className="h-4 w-1/2 rounded bg-slate-200" />

                        <div className="space-y-2">
                            <div className="h-5 w-1/5 rounded bg-slate-200" />
                            <div className="h-12 w-full rounded bg-slate-200" />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 border-t pt-4">
                        <div className="h-10 w-24 rounded bg-slate-200" />
                        <div className="h-10 w-24 rounded bg-slate-200" />
                    </div>
                </div>
            </div>
        );
    }

    if (!submittable) {
        return <div>Error: Could not load submission details.</div>;
    }

    const currentLevel = submission?.level ?? 1;
    const isLocked = submission?.locked ?? 0; // 0=unlocked, 1=locked, 2=reviewed

    // Auth check for form disabling
    const isUserAuthenticated = user && user.email_verified;

    // Check Date Range for current/latest level
    let isDateClosed = false;
    if (submittable) {
        const currentLevelIdx = currentLevel - 1;
        if (submittable.levels[currentLevelIdx]) {
            const now = Date.now();
            const start = submittable.levels[currentLevelIdx].start_date;
            const end = submittable.levels[currentLevelIdx].end_date;
            const startTime = start ? new Date(start).getTime() : null;
            const endTime = end ? new Date(end).getTime() : null;

            if ((startTime && now < startTime) || (endTime && now > endTime)) {
                isDateClosed = true;
            }
        }
    }

    const formDisabled =
        loading || saving || locking || doc?.verified !== 2 || !isUserAuthenticated || isDateClosed;

    // Determine current level constraints
    const renderLevel = (levelIndex: number) => {
        const levelConfig = submittable.levels[levelIndex];
        if (!levelConfig) return null;

        const isPastLevel = levelIndex < currentLevel - 1;
        const isCurrentLevel = levelIndex === currentLevel - 1;

        // Values for this level
        let levelValues: Record<string, any> = {};
        if (isPastLevel && submission?.levels?.[levelIndex]?.constraints) {
            levelValues = submission.levels[levelIndex].constraints;
        } else if (isCurrentLevel) {
            levelValues = formData;
        }

        const isReadOnly = isPastLevel || (isCurrentLevel && isLocked >= 1);
        const isDisabled = formDisabled; // Global disable if doc not verified or not auth

        return (
            <Card variant="greenInside" key={levelIndex} className="mb-5 flex w-full flex-col">
                <h4 className="flex items-center justify-between text-3xl font-bold text-cyan-900">
                    <span>
                        {levelConfig.ui_title && levelConfig.ui_title !== ""
                            ? levelConfig.ui_title
                            : `Level ${levelIndex + 1}`}
                    </span>
                </h4>
                {levelConfig.ui_description && levelConfig.ui_description !== "" && (
                    <p className="mb-4 text-sm font-medium text-cyan-900">
                        {levelConfig.ui_description}
                    </p>
                )}
                <div className="grid w-full gap-4">
                    {levelConfig.constraints.map((constraint) => {
                        const commonProps = {
                            name: constraint.name,
                            value: levelValues[constraint.name],
                            onChange: (val: any) =>
                                isCurrentLevel
                                    ? handleFieldChange(constraint.name, val)
                                    : undefined,
                            disabled:
                                isDisabled || (isCurrentLevel && isLocked >= 1) || !isCurrentLevel, // Disable if not current level
                            readOnly: isReadOnly || !isCurrentLevel, // ReadOnly if not current or past
                            uiTitle: constraint.ui_title || undefined,
                            uiDescription: constraint.ui_description || undefined,
                            maxInputSizeKb: constraint.max_input_size_kb,
                        };

                        if (constraint.type === "number") {
                            return <NumberField key={constraint.name} {...commonProps} />;
                        }
                        if (constraint.type === "boolean") {
                            return <BooleanField key={constraint.name} {...commonProps} />;
                        }
                        if (constraint.type === "payment") {
                            return (
                                <PaymentField
                                    key={constraint.name}
                                    {...commonProps}
                                    verifiableDocId={activeDocId!}
                                    submittableSlug={submittableSlug}
                                    level={levelIndex + 1}
                                />
                            );
                        }
                        if (constraint.type === "file") {
                            return (
                                <FileField
                                    key={constraint.name}
                                    {...commonProps}
                                    mimeTypes={constraint.mime_type!}
                                    verifiableDocId={activeDocId!}
                                    submittableSlug={submittableSlug}
                                    level={levelIndex + 1}
                                    fileInfoResetSignal={fileInfoResetSignal}
                                />
                            );
                        }
                        // Default to text
                        return <TextField key={constraint.name} {...commonProps} />;
                    })}
                </div>
                <hr className="my-2 border-cyan-900" />
                <div className="font-quicksand flex w-full flex-row justify-end gap-3 text-sm font-semibold text-cyan-900">
                    {/* <h4>
                        {levelConfig.start_date &&
                            `Start: ${new Date(levelConfig.start_date).toLocaleDateString()} `}{" "}
                    </h4> */}
                    <h4>
                        {levelConfig.end_date &&
                            `Tenggat: ${new Date(levelConfig.end_date).toLocaleDateString()}`}
                    </h4>
                </div>
            </Card>
        );
    };

    const canLockSubmission = (
        currentSubmission: Submission | null,
        currentFormData: Record<string, any>
    ) => {
        if (formDisabled) return false;
        if ((currentSubmission?.locked ?? 0) >= 1) return false;

        // Check if there are unsaved changes (only if checking current state)
        if (currentSubmission === submission && hasChanges()) return false;

        if (!submittable) return false;
        const currentLevelIdx = (currentSubmission?.level ?? 1) - 1;
        const currentConstraints = submittable.levels[currentLevelIdx]?.constraints;
        if (!currentConstraints) return false;

        for (const c of currentConstraints) {
            const val = currentFormData[c.name];
            if (val === undefined || val === null || val === "") return false;

            if (c.type === "payment") {
                try {
                    const decoded = decodePaymentInfo_SC(val);
                    if (decoded.status === "pending") return false;
                } catch (e) {
                    return false;
                }
            }
        }
        return true;
    };

    const isSaveDisabled = (() => {
        if (formDisabled) return true;
        if (isLocked >= 1) return true;

        // "The save button by default is disabled, but when changes are detected ... the save button will light up"
        return !hasChanges();
    })();

    const isLockDisabled = !canLockSubmission(submission, formData);

    return (
        <div className="flex flex-col gap-20">
            {/* Submission Info Header */}
            <TimCard submittableSlug={submittableSlug} doc={doc} />

            <div className="mb-10 flex flex-col gap-2">
                {/* Submission Status Header */}
                <div className="text-blue-900">
                    {/* <h2 className="text-xl font-bold">
                        {submittableSlug}{" "}
                        {doc ? `by ${submittable.verifiable} code ${doc.verifiableCode}` : ""}
                    </h2> */}
                    <div className="mt-2 flex items-center space-x-4">
                        {doc ? (
                            <span
                                className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                                    doc.verified === 2
                                        ? "bg-green-50 text-green-700 ring-green-600/20"
                                        : doc.verified === -1
                                          ? "bg-red-50 text-red-700 ring-red-600/20"
                                          : doc.verified === 1
                                            ? "bg-blue-50 text-blue-700 ring-blue-700/10"
                                            : "bg-gray-50 text-gray-600 ring-gray-500/10"
                                }`}>
                                {doc.verified === 2
                                    ? "Tim sudah terverifikasi "
                                    : doc.verified === -1
                                      ? "Verifikasi tim ditolak "
                                      : doc.verified === 1
                                        ? "Tim sedang dalam proses verifikasi "
                                        : "Tim belum diverifikasi"}
                            </span>
                        ) : (
                            isUserAuthenticated && (
                                <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                                    Doc Not Found
                                </span>
                            )
                        )}
                        {!isDateClosed && (
                            <span
                                className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                                    isLocked === 0
                                        ? "bg-green-50 text-green-700 ring-green-600/20"
                                        : isLocked === 1
                                          ? "bg-yellow-50 text-yellow-800 ring-yellow-600/20"
                                          : "bg-blue-50 text-blue-700 ring-blue-700/10"
                                }`}>
                                {isLocked === 0
                                    ? "Belum lock submission"
                                    : isLocked === 1
                                      ? "Submision terkunci, menunggu penilaian"
                                      : "Tahap Penilaian"}
                            </span>
                        )}
                        {/* <span className="rounded-md bg-gray-100 px-3 py-0.5 text-sm text-gray-900">
                            Level: {currentLevel}
                        </span> */}
                        {isDateClosed && (
                            <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                                Closed
                            </span>
                        )}
                    </div>

                    {isUserAuthenticated && (!doc || (doc && doc.verified < 2)) && (
                        <div className="mt-2 text-sm text-blue-900">
                            * {!doc ? "" : doc.nama_tim} should be accepted first
                        </div>
                    )}

                    {submission?.message_subject && submission.message_subject !== "" && (
                        <div className="mt-4 rounded-md border-l-4 border-blue-400 bg-blue-50 p-4">
                            <div className="font-semibold text-blue-800">
                                {submission.message_subject}
                            </div>
                            {submission.message_body && submission.message_body !== "" && (
                                <div className="mt-2 text-sm text-blue-700">
                                    {submission.message_body}
                                </div>
                            )}
                        </div>
                    )}
                    {(!submission?.message_subject || submission.message_subject === "") &&
                        submission?.message_body &&
                        submission.message_body !== "" && (
                            <div className="mt-4 rounded-md border-l-4 border-blue-400 bg-blue-50 p-4">
                                <div className="text-sm text-blue-700">
                                    {submission.message_body}
                                </div>
                            </div>
                        )}

                    {(!user || !user.email_verified) && (
                        <div className="mt-4 rounded-md bg-red-50 p-4 text-red-700">
                            Please log in to verify your email to access this form.
                        </div>
                    )}
                </div>

                {/* Render levels available */}
                <Card variant="green" className="flex w-full flex-col">
                    <h2 className="font-quicksand mt-2 mb-6 text-center text-2xl font-bold tracking-wide text-white xl:text-[28px]">
                        Submission
                    </h2>
                    {Array.from({ length: currentLevel }).map((_, idx) => renderLevel(idx))}
                </Card>
                {/* Action Buttons */}
                {currentLevel <= submittable.levels.length && (
                    <div className="flex justify-center space-x-4">
                        <button
                            onClick={handleSave}
                            disabled={isSaveDisabled || saving}
                            className={`rounded-md px-4 py-2 text-white ${
                                isSaveDisabled || saving
                                    ? "cursor-not-allowed bg-gray-400"
                                    : "bg-cyan-700 hover:bg-cyan-900"
                            }`}>
                            {saving ? "Saving..." : "Save"}
                        </button>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => {
                                    if (
                                        window.confirm(
                                            "Apakah Anda yakin ingin mengunci submission ini?\nTindakan ini tidak dapat dibatalkan (irreversible) dan Anda tidak akan bisa mengubah file lagi setelah dikunci."
                                        )
                                    ) {
                                        handleLock();
                                    }
                                }}
                                disabled={!canLockSubmission(submission, formData) || locking}
                                className={`rounded-md px-4 py-2 text-white ${
                                    !canLockSubmission(submission, formData) || locking
                                        ? "cursor-not-allowed bg-gray-400"
                                        : "bg-cyan-700 hover:bg-cyan-900"
                                }`}>
                                {locking ? "Locking..." : "Lock Submission"}
                            </button>
                            <div className="group relative z-20 flex flex-col items-center">
                                <div className="flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-300">
                                    i
                                </div>
                                <div className="absolute bottom-full left-1/2 mb-2 w-[200px] -translate-x-1/2 scale-0 rounded-md bg-gray-800 px-3 py-2 text-center text-xs font-medium text-white opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100">
                                    Setelah Lock Submission, file tidak dapat diubah lagi.
                                    <div className="absolute top-full left-1/2 -ml-1 border-4 border-transparent border-t-gray-800"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {currentLevel > submittable.levels.length && (
                    <div className="mt-4 text-center text-gray-500">All levels completed.</div>
                )}
            </div>
        </div>
    );
}

export default SubmissionForm;
