"use client";

import { useState, useEffect, useRef } from "react";
import {
    getVerifiable_C,
    readDoc_C,
    updateDoc_C,
    createDoc_C,
    deleteDoc_C,
    requestVerify_C,
    isAccessorVerified_C,
    shareDoc_C,
    joinWithVerifiableCode_C,
} from "@/api/form/client";
import { uploadFileToVerifiable_C, getVerifiableFileInfo_C } from "@/api/upload/client";
import { decodeSQLURL_SC, decodeFilePath_SC, decodePaymentInfo_SC } from "@/api/utils/string";
import { useUser_C } from "@/api/authentication/client";
import { SQLRow } from "@/api/utils/sql";
import { Verifiable } from "../../../payload-types";
import { FileInfo } from "@/api/upload/server";
import { payToVerifiable_C } from "@/api/payment/client";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { ExpectedError } from "@/api/errorHandler/class";

interface VerifiableFormProps {
    slug: string;
    _constraints?: Verifiable | null;
    _doc?: SQLRow | null;
    _accessorVerifiedLevels?: Record<string, number | null>;
}

interface BaseFieldProps {
    name: string;
    value: any;
    onChange: (value: any) => void;
    disabled?: boolean;
    readOnly?: boolean;
}

interface FileFieldProps extends BaseFieldProps {
    maxInputSizeKb: number;
    mimeTypes: string[];
    slug: string;
    docId: number | null;
}

type ConstraintField =
    | Verifiable["constraints"][number]
    | (Verifiable["required_on_create"] extends (infer U)[] ? U : never);

interface FormFieldProps {
    type: string;
    name: string;
    value: any;
    onChange: (value: any) => void;
    disabled?: boolean;
    readOnly?: boolean;
    constraint?: ConstraintField;
    slug?: string;
    docId?: number | null;
}

function Title({ children }: { children: React.ReactNode }) {
    return <h3 className="mb-2 text-lg font-semibold">{children}</h3>;
}

function StatusBar({ verifiedLevel }: { verifiedLevel: number }) {
    const statusConfig = {
        "-1": { text: "Rejected", color: "bg-red-500" },
        "0": { text: "Not Yet Requested", color: "bg-gray-400" },
        "1": { text: "Requested", color: "bg-yellow-500" },
        "2": { text: "Accepted", color: "bg-green-500" },
    };

    const status =
        statusConfig[verifiedLevel.toString() as keyof typeof statusConfig] || statusConfig["0"];

    return (
        <div className={`mb-4 rounded-md px-4 py-2 text-white ${status.color}`}>
            <div className="font-semibold">Status: {status.text}</div>
        </div>
    );
}

function NumberField({
    name,
    value,
    onChange,
    disabled,
    readOnly,
}: BaseFieldProps & { readOnly?: boolean }) {
    return (
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
    );
}

function BooleanField({ name, value, onChange, disabled, readOnly }: BaseFieldProps) {
    return (
        <input
            type="checkbox"
            name={name}
            checked={value}
            onChange={(e) => !readOnly && onChange(e.target.checked)}
            disabled={disabled}
            className={`h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                disabled ? "cursor-not-allowed opacity-50" : ""
            } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
        />
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
    slug,
    docId,
}: FileFieldProps & { readOnly?: boolean }) {
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

    // Check if value is a File object (newly selected) or a string (already uploaded)
    const isFileObject = value instanceof File;
    const isUploadedFile = typeof value === "string" && value.length > 0;

    useEffect(() => {
        if (!docId) {
            setPreviewUrl(null);
            setSelectedFile(null);
            name = "";
            return;
        }
        if (isUploadedFile && docId) {
            // Decode the file path to get metadata
            try {
                const decoded = decodeSQLURL_SC(value);
                const metadata = decodeFilePath_SC(decoded.path);
                setFileMetadata(metadata);
            } catch (error) {
                console.error("Error decoding file path:", error);
            }
        }
    }, [value, docId, isUploadedFile]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file size
        if (file.size > maxInputSizeKb * 1024) {
            toast.error("File Error", {
                description: `File size exceeds maximum allowed size of ${maxInputSizeKb}KB`,
            });
            e.target.value = ""; // Reset input
            return;
        }

        // Validate MIME type
        if (!mimeTypes.includes(file.type)) {
            toast.error("File Error", {
                description: `File type not allowed. Allowed types: ${mimeTypes.join(", ")}`,
            });
            e.target.value = ""; // Reset input
            return;
        }

        setSelectedFile(file);
        onChange(file);

        // Create preview for images
        if (file.type.startsWith("image/")) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        } else {
            setPreviewUrl(null);
        }
    };

    const handlePreviewFile = async () => {
        if (!docId) return;
        setPreviewLoading(true);
        try {
            const info = await getVerifiableFileInfo_C(slug, docId, name);
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
                        <img src={previewUrl} alt="Preview" className="mt-2 max-h-48 rounded-md" />
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
    );
}

interface PaymentFieldProps extends BaseFieldProps {
    slug: string;
    docId: number | null;
}

function PaymentField({
    name,
    value,
    onChange,
    disabled,
    readOnly,
    slug,
    docId,
}: PaymentFieldProps) {
    const [loading, setLoading] = useState(false);

    const handlePaymentAction = async (checkOnly: boolean) => {
        if (!docId) return;
        setLoading(true);
        try {
            const encodedInfo = await payToVerifiable_C(slug, docId, name, checkOnly);
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

    const renderButtons = () => {
        // If no value, show only "Initiate Transaction"
        if (!value) {
            return (
                <button
                    type="button"
                    onClick={() => handlePaymentAction(false)}
                    disabled={disabled || !docId || loading}
                    className={`w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                        disabled || !docId || loading ? "cursor-not-allowed opacity-50" : ""
                    }`}>
                    {loading ? "Processing..." : "Initiate Transaction"}
                </button>
            );
        }

        try {
            // Decode payment info
            // Note: decodePaymentInfo_SC returns PaymentInfo. We need to cast or inspect it.
            // PaymentInfo type: { status: "pending", expiredDate: ... } | { status: "paid", ... }
            const decoded = decodePaymentInfo_SC(value) as any; // Casting to access properties easily if standard interface matches
            const isPaid = decoded.status === "paid";
            const isExpired = !isPaid && decoded.expiredDate < Date.now();

            return (
                <div className="space-y-4 rounded-md border border-gray-200 p-4">
                    <div className="grid gap-2 text-sm">
                        <div className="flex justify-between">
                            <span className="font-medium text-gray-500">Status:</span>
                            <span
                                className={`font-bold ${isPaid ? "text-green-600" : isExpired ? "text-red-600" : "text-yellow-600"}`}>
                                {decoded.status.toUpperCase()} {isExpired && "(EXPIRED)"}
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
                                    {loading ? "Processing..." : "Initiate Transaction"}
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

    return renderButtons();
}

function TextField({
    name,
    value,
    onChange,
    disabled,
    readOnly,
    maxInputSizeKb,
}: BaseFieldProps & { maxInputSizeKb?: number }) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (maxInputSizeKb) {
            const sizeKb = new Blob([val]).size / 1024;
            if (sizeKb > maxInputSizeKb) {
                // Optional: You could show a specialized error here, but for now we just prevent input
                // or we could allow it and show error. User said "should always <=".
                // Blocking input is safer to ensure it "always" complies.
                return;
            }
        }
        onChange(val);
    };

    return (
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
    );
}

function FormField({
    type,
    name,
    value,
    onChange,
    disabled,
    readOnly,
    constraint,
    slug,
    docId,
}: FormFieldProps) {
    if (type === "number") {
        return (
            <NumberField
                name={name}
                value={value}
                onChange={onChange}
                disabled={disabled}
                readOnly={readOnly}
            />
        );
    }
    if (type === "boolean") {
        return (
            <BooleanField
                name={name}
                value={value}
                onChange={onChange}
                disabled={disabled}
                readOnly={readOnly}
            />
        );
    }
    if (type === "image" || type === "file") {
        if (!constraint) return null;
        return (
            <FileField
                name={name}
                value={value}
                onChange={onChange}
                disabled={disabled}
                readOnly={readOnly}
                maxInputSizeKb={constraint.max_input_size_kb}
                mimeTypes={constraint.mime_type}
                slug={slug || ""}
                docId={docId || null}
            />
        );
    }
    if (type === "payment") {
        return (
            <PaymentField
                name={name}
                value={value}
                onChange={onChange}
                disabled={disabled}
                readOnly={readOnly}
                slug={slug || ""}
                docId={docId || null}
            />
        );
    }
    return (
        <TextField
            name={name}
            value={value}
            onChange={onChange}
            disabled={disabled}
            readOnly={readOnly}
            maxInputSizeKb={constraint?.max_input_size_kb}
        />
    );
}

export default function VerifiableForm({
    slug,
    _constraints,
    _doc,
    _accessorVerifiedLevels,
}: VerifiableFormProps) {
    const { user, isLoading } = useUser_C();
    const [constraints, setConstraints] = useState<Verifiable | null>(_constraints ?? null);
    const [formData, setFormData] = useState<Record<string, any>>(_doc ?? {});
    const [originalFormData, setOriginalFormData] = useState<Record<string, any>>(_doc ?? {});
    const [doc, setDoc] = useState<SQLRow | null>(_doc ?? null);
    const [loading, setLoading] = useState(!_constraints);
    const [saving, setSaving] = useState(false);
    const [creating, setCreating] = useState(false);
    const [requestingVerify, setRequestingVerify] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [joining, setJoining] = useState(false);
    const [kickingMember, setKickingMember] = useState<string | null>(null);

    const [joinCode, setJoinCode] = useState("");
    const [accessorVerifiedLevels, setAccessorVerifiedLevels] = useState<
        Record<string, number | null>
    >(_accessorVerifiedLevels ?? {});

    const fetchOnlyAccessorLevels = async (currentDoc: SQLRow, dependencySlug: string) => {
        const accessorArr = [currentDoc.creator, ...(currentDoc.shared || [])];
        const levels: Record<string, number | null> = {};
        for (const accessor of accessorArr) {
            try {
                const level = await isAccessorVerified_C(dependencySlug, accessor);
                levels[accessor] = level;
            } catch (error) {
                console.error(`Error checking accessor ${accessor}:`, error);
                levels[accessor] = null;
            }
        }
        return levels;
    };

    useEffect(() => {
        async function loadData() {
            try {
                setLoading(true);
                let constraintsData = constraints;
                if (!constraintsData && !_constraints) {
                    constraintsData = await getVerifiable_C(slug);
                    setConstraints(constraintsData);
                }

                if (!user || (user && !user.email_verified)) {
                    setDoc(null);
                    setFormData({});
                    setOriginalFormData({});
                    setLoading(false);
                    return;
                }

                let currentDoc = doc;
                if (_doc === undefined) {
                    const docDataResult = await readDoc_C(slug, {});
                    currentDoc = docDataResult[0] || null;
                    setDoc(currentDoc);
                    if (currentDoc) {
                        setFormData(currentDoc);
                        setOriginalFormData(currentDoc);
                    } else {
                        setFormData({});
                        setOriginalFormData({});
                    }
                }

                // Load accessor verified levels if doc exists and has depends_on
                if (currentDoc && constraintsData?.depends_on) {
                    if (_accessorVerifiedLevels === undefined) {
                        const levels = await fetchOnlyAccessorLevels(
                            currentDoc,
                            constraintsData.depends_on
                        );
                        setAccessorVerifiedLevels(levels);
                    }
                }
            } catch (error) {
                console.error("Error loading form data:", error);
            } finally {
                setLoading(false);
            }
        }

        if (!isLoading) {
            loadData();
        }
    }, [slug, user, isLoading]);

    const handleFieldChange = (fieldName: string, value: any) => {
        setFormData((prev) => ({
            ...prev,
            [fieldName]: value,
        }));
    };

    const hasChanges = () => {
        if (!doc) return false;
        const allArr = [
            ...(constraints?.required_on_create || []),
            ...(constraints?.constraints || []),
        ];
        for (const field of allArr) {
            if (field.type === "file" || field.type === "payment") continue;
            if (formData[field.name] !== originalFormData[field.name]) {
                return true;
            }
        }
        // Check for new file selections
        for (const field of allArr) {
            if (field.type === "file" && formData[field.name] instanceof File) {
                return true;
            }
        }
        return false;
    };

    const handleSave = async () => {
        if (!doc) return;

        setSaving(true);
        try {
            // Build InsertObj excluding payment and file types
            const allArr = [
                ...(constraints?.required_on_create || []),
                ...(constraints?.constraints || []),
            ];
            const insertObj: Record<string, any> = {};

            for (const field of allArr) {
                if (field.type === "payment" || field.type === "file") continue;
                if (formData[field.name] !== undefined) {
                    insertObj[field.name] = formData[field.name];
                }
            }

            // Update document
            await updateDoc_C(slug, insertObj, { id: doc.id });

            // Handle file uploads
            const fileFields: Array<{ name: string; file: File }> = [];
            for (const field of allArr) {
                if (field.type === "file" && formData[field.name] instanceof File) {
                    fileFields.push({ name: field.name, file: formData[field.name] as File });
                }
            }

            // Upload files sequentially
            for (const { name, file } of fileFields) {
                try {
                    const uploadedUrl = await uploadFileToVerifiable_C(slug, doc.id, name, file);
                    setFormData((prev) => ({
                        ...prev,
                        [name]: uploadedUrl,
                    }));
                } catch (error) {
                    console.error(`Error uploading file ${name}:`, error);
                }
            }

            // Reload document to get updated values
            const docDataResult = await readDoc_C(slug, {});
            const updatedDoc = docDataResult[0];
            if (updatedDoc) {
                setDoc(updatedDoc);
                setFormData(updatedDoc);
                setOriginalFormData(updatedDoc);
            }
        } catch (error: any) {
            console.error("Error saving form:", error);
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

    const handleCreate = async () => {
        setCreating(true);
        try {
            await createDoc_C(slug, {});
            const docDataResult = await readDoc_C(slug, {});
            const newDoc = docDataResult[0];
            if (newDoc) {
                setDoc(newDoc);
                setFormData(newDoc);
                setOriginalFormData(newDoc);
                if (constraints?.depends_on) {
                    const levels = await fetchOnlyAccessorLevels(newDoc, constraints.depends_on);
                    setAccessorVerifiedLevels(levels);
                }
            }
        } catch (error: any) {
            console.error("Error creating document:", error);
            if (error instanceof ExpectedError) {
                toast.error(error.name, { description: error.message });
            } else {
                toast.error("Unexpected Error", {
                    description: error.message || "An unexpected error occurred.",
                });
            }
        } finally {
            setCreating(false);
        }
    };

    const handleRequestVerify = async () => {
        if (!doc) return;

        setRequestingVerify(true);
        try {
            await requestVerify_C(slug, doc.id);
            // Update doc.verified to 1 to disable form
            setDoc((prev) => {
                if (!prev) return null;
                return { ...prev, verified: 1 } as SQLRow;
            });
            confetti({
                particleCount: 100,
                spread: 200,
                origin: { y: 0.5 },
            });
            toast.success("Ready for Review", {
                description: "Verification requested successfully.",
            });
        } catch (error: any) {
            console.error("Error requesting verification:", error);
            if (error instanceof ExpectedError) {
                toast.error(error.name, { description: error.message });
            } else {
                toast.error("Unexpected Error", {
                    description: error.message || "An unexpected error occurred.",
                });
            }
        } finally {
            setRequestingVerify(false);
        }
    };

    const handleDelete = async () => {
        if (!doc) return;

        if (!confirm(`Are you sure you want to delete ${slug}?`)) return;

        setDeleting(true);
        try {
            await deleteDoc_C(slug, { id: doc.id });
            setDoc(null);
            setFormData({});
            setOriginalFormData({});
            setJoinCode("");
        } catch (error: any) {
            console.error("Error deleting document:", error);
            if (error instanceof ExpectedError) {
                toast.error(error.name, { description: error.message });
            } else {
                toast.error("Unexpected Error", {
                    description: error.message || "An unexpected error occurred.",
                });
            }
        } finally {
            setDeleting(false);
        }
    };

    const handleLeave = async () => {
        if (!doc || !user || !user.email) return;
        if (!confirm(`Are you sure you want to leave ${slug}?`)) return;

        setLeaving(true);
        try {
            await shareDoc_C(slug, doc.id, [], [user.email]);
            setDoc(null);
            setFormData({});
            setOriginalFormData({});
            setJoinCode("");
        } catch (error: any) {
            console.error("Error leaving document:", error);
            if (error instanceof ExpectedError) {
                toast.error(error.name, { description: error.message });
            } else {
                toast.error("Unexpected Error", {
                    description: error.message || "An unexpected error occurred.",
                });
            }
        } finally {
            setLeaving(false);
        }
    };

    const handleKick = async (accessorEmail: string) => {
        if (!doc) return;
        if (!confirm(`Are you sure you want to kick ${accessorEmail}?`)) return;

        setKickingMember(accessorEmail);
        try {
            await shareDoc_C(slug, doc.id, [], [accessorEmail]);
            // Reload doc to reflect changes
            const docDataResult = await readDoc_C(slug, {});
            const currentDoc = docDataResult[0];
            setDoc(currentDoc || null);
            if (currentDoc && constraints?.depends_on) {
                // Refetch accessor levels just in case
                const levels = await fetchOnlyAccessorLevels(currentDoc, constraints.depends_on);
                setAccessorVerifiedLevels(levels);
            }
        } catch (error: any) {
            console.error("Error kicking member:", error);
            if (error instanceof ExpectedError) {
                toast.error(error.name, { description: error.message });
            } else {
                toast.error("Unexpected Error", {
                    description: error.message || "An unexpected error occurred.",
                });
            }
        } finally {
            setKickingMember(null);
        }
    };

    const handleJoinCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        // Allow alphanumeric and dot
        if (/^[A-Z0-9.]*$/.test(val)) {
            setJoinCode(val);
        }
    };

    const handleJoin = async () => {
        if (!joinCode) return;
        setJoining(true);
        try {
            await joinWithVerifiableCode_C(joinCode);
            // Reload doc
            const docDataResult = await readDoc_C(slug, {});
            const currentDoc = docDataResult[0] || null;
            setDoc(currentDoc);
            if (currentDoc) {
                setFormData(currentDoc);
                setOriginalFormData(currentDoc);
                if (constraints?.depends_on) {
                    const levels = await fetchOnlyAccessorLevels(
                        currentDoc,
                        constraints.depends_on
                    );
                    setAccessorVerifiedLevels(levels);
                }
            }
            setJoinCode("");
        } catch (e) {
            console.error("Error joining:", e);
            alert("Error joining with code.");
        } finally {
            setJoining(false);
        }
    };

    const isFormDisabled = () => {
        if (!user || !user.email_verified) return true;
        if (!doc) return true;
        if (doc.verified >= 1) return true;
        return false;
    };

    const isFormReadOnly = () => {
        if (!doc) return false;
        return doc.verified === 2;
    };

    const canRequestVerify = () => {
        if (!doc) return false;
        if (doc.verified >= 1) return false;

        // Form must be saved (no unsaved changes)
        if (hasChanges()) return false;

        // Check all constraints are not null
        const allArr = [
            ...(constraints?.required_on_create || []),
            ...(constraints?.constraints || []),
        ];
        for (const field of allArr) {
            if (formData[field.name] === null || formData[field.name] === undefined) {
                return false;
            }
        }

        // Check dependencies if exists
        if (constraints?.depends_on) {
            const accessorArr = [doc.creator, ...(doc.shared || [])];
            for (const accessor of accessorArr) {
                const level = accessorVerifiedLevels[accessor];
                if (level === null || level < 1) {
                    return false;
                }
            }
        }

        return true;
    };

    if (loading || isLoading) {
        return <div>Loading...</div>;
    }

    if (!constraints) {
        return <div>No constraints found for this slug.</div>;
    }

    const allArr = [...(constraints.required_on_create || []), ...(constraints.constraints || [])];
    const formDisabled = isFormDisabled();
    const formReadOnly = isFormReadOnly();

    return (
        <div className="space-y-6">
            {doc && <StatusBar verifiedLevel={doc.verified ?? 0} />}

            {doc && doc.verifiableCode && (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <span className="font-semibold text-gray-700">Verifiable Code: </span>
                    <span className="font-mono text-gray-400">{doc.verifiableCode}</span>
                </div>
            )}

            {doc && (
                <>
                    {doc.message_subject && doc.message_subject !== "" && (
                        <div className="rounded-md border-l-4 border-yellow-400 bg-yellow-50 p-4">
                            <div className="font-semibold text-yellow-800">
                                {doc.message_subject}
                            </div>
                            {doc.message_body && doc.message_body !== "" && (
                                <div className="mt-2 text-sm text-yellow-700">
                                    {doc.message_body}
                                </div>
                            )}
                        </div>
                    )}
                    {(!doc.message_subject || doc.message_subject === "") &&
                        doc.message_body &&
                        doc.message_body !== "" && (
                            <div className="rounded-md border-l-4 border-yellow-400 bg-yellow-50 p-4">
                                <div className="text-sm text-yellow-700">{doc.message_body}</div>
                            </div>
                        )}
                </>
            )}

            {(!user || !user.email_verified) && (
                <div className="rounded-md bg-red-50 p-4 text-red-700">
                    Please log in to verify your email to access this form.
                </div>
            )}

            {constraints.depends_on && doc && (
                <div className="rounded-md border border-gray-300 p-4">
                    <div className="mb-2 font-semibold">Dependency Status:</div>
                    <span className="text-xs text-wrap text-gray-400">
                        All <strong>{constraints.depends_on}</strong> verifiable should have
                        verified level above or equal to requested
                    </span>
                    {[doc.creator, ...(doc.shared || [])].map((accessor) => {
                        const level = accessorVerifiedLevels[accessor];
                        const statusConfig = {
                            "-1": { text: "Rejected", color: "bg-red-500" },
                            "0": { text: "Not Yet Requested", color: "bg-gray-400" },
                            "1": { text: "Requested", color: "bg-yellow-500" },
                            "2": { text: "Accepted", color: "bg-green-500" },
                        };
                        const status =
                            typeof level === "number"
                                ? statusConfig[level.toString() as keyof typeof statusConfig] ||
                                  statusConfig["0"]
                                : { text: "Unknown", color: "bg-gray-300" };
                        const isCreator = accessor === doc.creator;
                        const isYou = user?.email === accessor;

                        return (
                            <div
                                key={accessor}
                                className="flex items-center justify-between border-b border-gray-100 py-2 last:border-0">
                                <div>
                                    <span className="font-medium">{accessor}</span>
                                    <span className="ml-2 text-xs text-gray-500">
                                        {isCreator ? "(Creator)" : isYou ? "(You)" : ""}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`rounded-full px-2 py-1 text-xs text-white ${status.color}`}>
                                        {status.text}
                                    </span>
                                    {/* Kick Member Button: Only if current user is creator and target is not creator */}
                                    {user?.email === doc.creator && !isCreator && (
                                        <button
                                            type="button"
                                            onClick={() => handleKick(accessor)}
                                            className="ml-2 font-bold text-red-500 hover:text-red-700 disabled:cursor-wait disabled:opacity-50"
                                            title="Kick Member"
                                            disabled={kickingMember === accessor}>
                                            {kickingMember === accessor ? "..." : "X"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <form className="space-y-6">
                {allArr.map((field, index) => (
                    <div key={index} className="space-y-2">
                        <Title>{(field as any).ui_title || field.name}</Title>
                        {(field as any).ui_description && (
                            <div className="text-sm text-gray-500">
                                {(field as any).ui_description}
                            </div>
                        )}
                        <FormField
                            type={field.type}
                            name={field.name}
                            value={formData[field.name]}
                            onChange={(value) => handleFieldChange(field.name, value)}
                            disabled={formDisabled}
                            readOnly={formReadOnly}
                            constraint={field}
                            slug={slug}
                            docId={doc?.id || null}
                        />
                    </div>
                ))}

                <div className="flex flex-wrap items-center gap-4">
                    {!doc ? (
                        <>
                            <button
                                type="button"
                                onClick={handleCreate}
                                disabled={!user || !user.email_verified || creating}
                                className="rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50">
                                {creating ? "Creating..." : `Create new ${slug}`}
                            </button>
                            <div className="flex items-center gap-2 border-l border-gray-300 pl-4">
                                <input
                                    type="text"
                                    value={joinCode}
                                    onChange={handleJoinCodeChange}
                                    placeholder="TT.XXXX"
                                    className="w-32 rounded-md border border-gray-300 px-3 py-2 uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={handleJoin}
                                    disabled={
                                        !joinCode ||
                                        !user ||
                                        !user.email_verified ||
                                        !/^[A-Z0-9]+\.[A-Z0-9]+$/.test(joinCode) ||
                                        joining
                                    }
                                    className="rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50">
                                    {joining ? "Joining..." : `Join ${slug}`}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={!hasChanges() || saving || formDisabled}
                                className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50">
                                {saving ? "Saving..." : "Save"}
                            </button>
                            <button
                                type="button"
                                onClick={handleRequestVerify}
                                disabled={!canRequestVerify() || requestingVerify}
                                className="rounded-md bg-yellow-600 px-4 py-2 text-white hover:bg-yellow-700 focus:ring-2 focus:ring-yellow-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50">
                                {requestingVerify ? "Requesting..." : "Request Verify"}
                            </button>
                            {user?.email === doc.creator ? (
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={
                                        doc.verified >= 1 ||
                                        deleting ||
                                        requestingVerify ||
                                        formDisabled ||
                                        saving
                                    }
                                    className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50">
                                    {deleting ? "Deleting..." : `Delete ${slug}`}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleLeave}
                                    disabled={leaving}
                                    className="rounded-md bg-orange-600 px-4 py-2 text-white hover:bg-orange-700 focus:ring-2 focus:ring-orange-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50">
                                    {leaving ? "Leaving..." : `Leave ${slug}`}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </form>
        </div>
    );
}
