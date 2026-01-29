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
        <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
                {uiTitle && uiTitle !== "" ? uiTitle : name}
            </label>
            {uiDescription && uiDescription !== "" && (
                <p className="mb-2 text-sm text-gray-500">{uiDescription}</p>
            )}
            {children}
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
                className={`w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                    disabled && !readOnly ? "cursor-not-allowed bg-gray-100" : ""
                } ${disabled ? "text-gray-400 opacity-100" : ""}`}
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
                className={`w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                    disabled && !readOnly ? "cursor-not-allowed bg-gray-100" : ""
                } ${disabled ? "text-gray-400 opacity-100" : ""}`}
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
                className={`h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
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
                                    <span className="font-mono text-xs">{decoded.reference}</span>
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
                                disabled={loading}
                                className={`w-full rounded-md bg-yellow-500 px-4 py-2 text-white hover:bg-yellow-600 focus:ring-2 focus:ring-yellow-500 focus:outline-none ${
                                    loading ? "cursor-not-allowed opacity-50" : ""
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
            <div className="space-y-2">
                <input
                    ref={fileInputRef}
                    type="file"
                    name={name}
                    onChange={handleFileSelect}
                    accept={mimeTypes.join(",")}
                    disabled={disabled}
                    className={`w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                        disabled && !readOnly ? "cursor-not-allowed bg-gray-100" : ""
                    } ${disabled ? "text-gray-400 opacity-100" : ""}`}
                />
                {selectedFile && !isUploadedFile && (
                    <div className="rounded-md border border-gray-300 p-3">
                        <div className="text-sm font-medium">Selected File:</div>
                        <div className="text-sm text-gray-600">{selectedFile.name}</div>
                        <div className="text-sm text-gray-600">
                            Size: {(selectedFile.size / 1024).toFixed(2)} KB
                        </div>
                        {previewUrl && isImageMimeType(selectedFile.type) && (
                            <img
                                src={previewUrl}
                                alt="Preview"
                                className="mt-2 max-h-48 rounded-md"
                            />
                        )}
                    </div>
                )}
                {isUploadedFile && fileMetadata && (
                    <div className="rounded-md border border-gray-300 p-3">
                        <div className="text-sm font-medium">Uploaded File:</div>
                        <div className="text-sm text-gray-600">Owner: {fileMetadata.userId}</div>
                        <div className="text-sm text-gray-600">
                            Uploaded: {new Date(parseInt(fileMetadata.unixTime)).toLocaleString()}
                        </div>
                        <div className="text-sm text-gray-600">File: {fileMetadata.fileName}</div>
                        <button
                            type="button"
                            onClick={handlePreviewFile}
                            disabled={previewLoading}
                            className={`mt-2 rounded-md px-3 py-1 text-sm text-white ${
                                previewLoading
                                    ? "cursor-not-allowed bg-gray-400"
                                    : "bg-blue-600 hover:bg-blue-700"
                            }`}>
                            {previewLoading ? "Loading..." : "Preview File"}
                        </button>
                        {fileInfo && (
                            <div className="mt-2">
                                <a
                                    href={fileInfo.signedUrl}
                                    download
                                    className="text-sm text-blue-600 hover:underline">
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
    const [submittable, setSubmittable] = useState<Submittable | null>(null);
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [doc, setDoc] = useState<SQLRow | null>(null);
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [initialFormData, setInitialFormData] = useState<Record<string, any>>({});
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
        if (!submittable || !submission) return false;

        const currentLevelIdx = submission.level - 1;
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
        if (!doc || !submittable || !activeDocId) return;
        setLocking(true);
        try {
            await lockSubmission_C(activeDocId, submittableSlug);
            const newSub = await getSubmission_C(activeDocId, submittableSlug);
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
        return <div>Loading...</div>;
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

    const formDisabled = doc?.verified !== 2 || !isUserAuthenticated || isDateClosed;

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
            <div key={levelIndex} className="mb-6 rounded-md border p-4">
                <h4 className="mb-2 flex items-center justify-between text-lg font-semibold">
                    <span>
                        {levelConfig.ui_title && levelConfig.ui_title !== ""
                            ? levelConfig.ui_title
                            : `Level ${levelIndex + 1}`}
                    </span>
                    <span className="text-xs font-normal text-gray-100">
                        <span className="mr-2">
                            {levelConfig.start_date &&
                                `Start: ${new Date(levelConfig.start_date).toLocaleDateString()} `}{" "}
                        </span>
                        <span>
                            {levelConfig.end_date &&
                                `End: ${new Date(levelConfig.end_date).toLocaleDateString()}`}
                        </span>
                    </span>
                </h4>
                {levelConfig.ui_description && levelConfig.ui_description !== "" && (
                    <p className="mb-4 text-sm text-gray-500">{levelConfig.ui_description}</p>
                )}
                <div className="grid gap-4">
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
                                />
                            );
                        }
                        // Default to text
                        return <TextField key={constraint.name} {...commonProps} />;
                    })}
                </div>
            </div>
        );
    };

    const isSaveDisabled = (() => {
        if (formDisabled) return true;
        if (isLocked >= 1) return true;

        // "The save button by default is disabled, but when changes are detected ... the save button will light up"
        return !hasChanges();
    })();

    const isLockDisabled = (() => {
        if (formDisabled) return true;
        if (isLocked >= 1) return true;

        // "It should also be disabled if changes are detected"
        if (hasChanges()) return true;

        // Check if all current level constraints have values
        const currentConstraints = submittable.levels[currentLevel - 1].constraints;
        for (const c of currentConstraints) {
            const val = formData[c.name];
            // "all of the input is not null"
            if (val === undefined || val === null || val === "") return true;

            // "payment field value doesn't start with pending and is not null"
            if (c.type === "payment") {
                if (typeof val === "string") {
                    // Try decode to check status? User says "value doesn't start with pending"
                    // Realistically, the value is the sql url string. We need to decode it to check status.
                    // Or maybe the value literally starts with 'pending'?
                    // No, the value is a SQL URL.
                    // Let's check the decoded status.
                    try {
                        const decoded = decodePaymentInfo_SC(val);
                        if (decoded.status === "pending") return true;
                    } catch (e) {
                        return true; // invalid payment info
                    }
                } else {
                    return true;
                }
            }
        }
        return false;
    })();

    return (
        <div className={`mx-auto max-w-4xl space-y-6 p-6 ${formDisabled ? "text-gray-300" : ""}`}>
            <div className="border-white-900 rounded-md border-2 p-6 shadow-sm ring-1 ring-gray-900/5">
                <h2 className="text-xl font-bold">
                    {submittableSlug} submission{" "}
                    {doc ? `by ${submittable.verifiable} code ${doc.verifiableCode}` : ""}
                </h2>
                <div className="mt-2 flex items-center space-x-4">
                    {!isDateClosed && (
                        <span
                            className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                                isLocked === 0
                                    ? "bg-green-50 text-green-700 ring-green-600/20"
                                    : isLocked === 1
                                      ? "bg-yellow-50 text-yellow-800 ring-yellow-600/20"
                                      : "bg-blue-50 text-blue-700 ring-blue-700/10"
                            }`}>
                            {isLocked === 0 ? "Unlocked" : isLocked === 1 ? "Locked" : "Reviewed"}
                        </span>
                    )}
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
                                ? "Doc Accepted"
                                : doc.verified === -1
                                  ? "Doc Rejected"
                                  : doc.verified === 1
                                    ? "Doc Requested"
                                    : "Doc Not Requested"}
                        </span>
                    ) : (
                        isUserAuthenticated && (
                            <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                                Doc Not Found
                            </span>
                        )
                    )}
                    <span className="rounded-md bg-gray-100 px-3 py-0.5 text-sm text-gray-900">
                        Level: {currentLevel}
                    </span>
                    {isDateClosed && (
                        <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                            Closed
                        </span>
                    )}
                </div>

                {isUserAuthenticated && (!doc || (doc && doc.verified < 2)) && (
                    <div className="mt-2 text-sm text-yellow-600">
                        {submittable.verifiable} should be accepted first
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
                            <div className="text-sm text-blue-700">{submission.message_body}</div>
                        </div>
                    )}

                {(!user || !user.email_verified) && (
                    <div className="mt-4 rounded-md bg-red-50 p-4 text-red-700">
                        Please log in to verify your email to access this form.
                    </div>
                )}
            </div>

            {/* Render levels available */}
            <div>{Array.from({ length: currentLevel }).map((_, idx) => renderLevel(idx))}</div>

            {/* Action Buttons */}
            {currentLevel <= submittable.levels.length && (
                <div className="flex space-x-4">
                    <button
                        onClick={handleSave}
                        disabled={isSaveDisabled || saving}
                        className={`rounded-md px-4 py-2 text-white ${
                            isSaveDisabled || saving
                                ? "cursor-not-allowed bg-gray-400"
                                : "bg-blue-600 hover:bg-blue-700"
                        }`}>
                        {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                        onClick={handleLock}
                        disabled={isLockDisabled || locking}
                        className={`rounded-md px-4 py-2 text-white ${
                            isLockDisabled || locking
                                ? "cursor-not-allowed bg-gray-400"
                                : "bg-green-600 hover:bg-green-700"
                        }`}>
                        {locking ? "Locking..." : "Lock Submission"}
                    </button>
                </div>
            )}
            {currentLevel > submittable.levels.length && (
                <div className="mt-4 text-center text-gray-500">All levels completed.</div>
            )}
        </div>
    );
}

export default SubmissionForm;
