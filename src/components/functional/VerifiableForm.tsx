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
import confetti from "canvas-confetti";
import WarningModal from "@/components/Layout/Modal";
import { ExpectedError } from "@/api/errorHandler/class";
import InputField from "@/components/Element/InputField";
import { Button } from "@/components/Button";
import { toast } from "sonner";

interface VerifiableFormProps {
    slug: string;
    _constraints?: Verifiable | null;
    _doc?: SQLRow | null;
    _accessorVerifiedLevels?: Record<string, number | null>;
    onDocLoad?: (doc: SQLRow | null) => void;
    readOnlyProp?: boolean;
    filterField?: (fieldName: string) => boolean;
    hideSave?: boolean;
    hideRequestVerify?: boolean;
    hideDeleteLeave?: boolean;
    hideStatusBar?: boolean;
    hideVerifiableCode?: boolean;
    hideCreateJoin?: boolean;
    hideDependencyStatus?: boolean;
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
    fileInfoResetSignal: number;
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
    fileInfoResetSignal: number;
}

function Title({ children }: { children: React.ReactNode }) {
    return <h3 className="text-md mb-2 font-semibold">{children}</h3>;
}

function StatusBar({ verifiedLevel }: { verifiedLevel: number }) {
    const statusConfig = {
        "-1": { text: "Rejected", color: "bg-red-500" },
        "0": { text: "Belum Diajukan", color: "bg-gray-400" },
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
        <InputField
            type="number"
            name={name}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
            disabled={disabled}
            readOnly={readOnly}
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
    fileInfoResetSignal,
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
    const [fileModalTitle, setFileModalTitle] = useState<string[]>([]);
    const [fileModalOpen, setFileModalOpen] = useState(false);
    const showFileModal = (message: string) => {
        setFileModalTitle([message]);
        setFileModalOpen(true);
    };

    useEffect(() => {
        setFileInfo(null);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [fileInfoResetSignal]);

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
                if (process.env.NODE_ENV !== "production") {
                    console.error("Error decoding file path:", error);
                }
            }
        }
    }, [value, docId, isUploadedFile]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file size
        if (file.size > maxInputSizeKb * 1024) {
            showFileModal(
                `Ukuran file melebihi batas maksimum yang diizinkan (${maxInputSizeKb}KB).`
            );
            e.target.value = ""; // Reset input
            return;
        }

        // Validate MIME type
        if (!mimeTypes.includes(file.type)) {
            showFileModal(
                `Tipe file tidak diizinkan. Tipe yang diizinkan: ${mimeTypes.join(", ")}`
            );
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
            if (process.env.NODE_ENV !== "production") {
                console.error("Error getting file info:", error);
            }
            if (error instanceof ExpectedError) {
                showFileModal(`${error.name}: ${error.message}`);
            } else {
                showFileModal(
                    `Unexpected Error: ${error.message || "An unexpected error occurred."}`
                );
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
            <WarningModal
                isOpen={fileModalOpen}
                onClose={() => setFileModalOpen(false)}
                title={fileModalTitle}
                finalButtonText="OK"
            />
            <input
                ref={fileInputRef}
                type="file"
                name={name}
                onChange={handleFileSelect}
                accept={mimeTypes.join(",")}
                disabled={disabled}
                className="hidden"
            />
            <div
                onClick={() => !disabled && fileInputRef.current?.click()}
                className={`flex w-full flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-gray-300 bg-gray-50/50 p-6 transition-colors hover:bg-gray-50 sm:w-full ${
                    disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                }`}>
                {selectedFile || (isUploadedFile && fileMetadata) ? (
                    <svg
                        className="mb-3 h-10 w-10 text-[#438C95]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                ) : (
                    <svg
                        className="mb-3 h-10 w-10 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                    </svg>
                )}

                <div className="mb-2 flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-gray-700">
                        {selectedFile
                            ? "File Terpilih"
                            : isUploadedFile && fileMetadata
                              ? "File Terunggah"
                              : "Unggah dokumen anda disini"}
                    </p>
                    {(selectedFile || (isUploadedFile && fileMetadata)) && (
                        <div className="group relative flex items-center">
                            <div className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600 transition-colors hover:bg-gray-300">
                                i
                            </div>
                            <div className="absolute bottom-full left-1/2 mb-2 w-max -translate-x-1/2 scale-0 rounded-md bg-gray-800 px-3 py-2 text-xs font-medium text-white opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100">
                                Anda dapat mengubah gambar lagi selagi belum di Request Verify.
                                <div className="absolute top-full left-1/2 -ml-1 border-4 border-transparent border-t-gray-800"></div>
                            </div>
                        </div>
                    )}
                </div>

                <span
                    className={`text-center text-xs ${disabled ? "text-gray-400" : "text-gray-500"}`}>
                    {selectedFile
                        ? selectedFile.name
                        : isUploadedFile && fileMetadata
                          ? fileMetadata.fileName
                          : `(Klik untuk memilih file)`}
                </span>
            </div>
            {selectedFile && !isUploadedFile && (
                <div className="rounded-[24px] border border-gray-300 p-4">
                    <div className="text-sm font-medium">Selected File:</div>
                    <div className="text-sm text-gray-400">{selectedFile.name}</div>
                    <div className="text-sm text-gray-400">
                        Size: {(selectedFile.size / 1024).toFixed(2)} KB
                    </div>
                    {previewUrl && isImageMimeType(selectedFile.type) && (
                        <img src={previewUrl} alt="Preview" className="mt-2 max-h-48 rounded-md" />
                    )}
                </div>
            )}
            {isUploadedFile && fileMetadata && (
                <div className="w-full rounded-[24px] border border-gray-300 p-4 sm:w-full">
                    <div className="text-sm font-medium">Uploaded File:</div>
                    <div className="truncate text-sm text-gray-400">
                        Owner: {fileMetadata.userId}
                    </div>
                    <div className="text-sm text-gray-400">
                        Uploaded: {new Date(parseInt(fileMetadata.unixTime)).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-400">File: {fileMetadata.fileName}</div>
                    <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handlePreviewFile}
                        disabled={previewLoading}
                        className="mt-4 disabled:cursor-not-allowed disabled:bg-gray-400">
                        {previewLoading ? "Loading..." : "Preview File"}
                    </Button>
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
    const { user } = useUser_C(); // Get user context
    const [loading, setLoading] = useState(false);
    const [payModalTitle, setPayModalTitle] = useState<string[]>([]);
    const [payModalOpen, setPayModalOpen] = useState(false);
    const [payModalOnConfirm, setPayModalOnConfirm] = useState<(() => void) | undefined>(undefined);
    const [payModalFinalText, setPayModalFinalText] = useState("OK");
    const [payModalButtonText, setPayModalButtonText] = useState<string | undefined>(undefined);
    const showPayModal = (message: string) => {
        setPayModalTitle([message]);
        setPayModalOnConfirm(undefined);
        setPayModalFinalText("OK");
        setPayModalButtonText(undefined);
        setPayModalOpen(true);
    };

    const handleInitiateTransaction = () => {
        // Guard: Check if user is authenticated and email verified
        if (!user) {
            showPayModal("Anda harus login terlebih dahulu untuk melakukan pembayaran.");
            return;
        }
        if (!user.email_verified) {
            showPayModal(
                "Anda harus memverifikasi email terlebih dahulu sebelum melakukan pembayaran. Silakan cek inbox email Anda."
            );
            return;
        }
        if (!docId) {
            showPayModal("Data belum tersimpan. Silakan simpan data terlebih dahulu.");
            return;
        }

        setPayModalTitle([
            "Perhatian! Sebelum melanjutkan pembayaran, harap baca peringatan berikut.",
            "⚠️ JANGAN gunakan metode pembayaran Bank Permata (Virtual Account Permata). Pembayaran melalui Bank Permata tidak dapat diproses dan tidak akan terverifikasi.",
            "Pastikan Anda menggunakan metode pembayaran seperti QRIS. Setelah memahami peringatan ini, klik tombol di bawah untuk melanjutkan.",
        ]);
        setPayModalOnConfirm(() => () => handlePaymentAction(false));
        setPayModalFinalText("Saya Mengerti, Lanjutkan");
        setPayModalButtonText("Batalkan");
        setPayModalOpen(true);
    };

    const handlePaymentAction = async (checkOnly: boolean) => {
        // Double-check authentication before API call
        if (!user || !user.email_verified) {
            showPayModal(
                "Sesi Anda mungkin sudah expired atau email belum diverifikasi. Halaman akan refresh otomatis."
            );
            // Trigger refresh to sync user state
            setTimeout(() => window.location.reload(), 2000);
            return;
        }
        if (!docId) return;
        setLoading(true);
        try {
            const encodedInfo = await payToVerifiable_C(slug, docId, name, checkOnly);
            onChange(encodedInfo);
        } catch (error: any) {
            if (process.env.NODE_ENV !== "production") {
                console.error("Error processing payment action:", error);
            }
            if (error instanceof ExpectedError) {
                // Check if it's an authentication error
                if (error.name === "Unauthenticated" || error.name === "EmailNotVerified") {
                    showPayModal(
                        `${error.message}. Halaman akan refresh untuk memperbarui status login Anda.`
                    );
                    // Auto-refresh after showing error
                    setTimeout(() => window.location.reload(), 2000);
                } else {
                    showPayModal(`${error.name}: ${error.message}`);
                }
            } else {
                showPayModal(
                    `Unexpected Error: ${error.message || "An unexpected error occurred."}`
                );
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
                    onClick={() => handleInitiateTransaction()}
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
                <div className="space-y-4 rounded-[24px] border border-gray-200 p-4">
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
                                disabled={loading}
                                className={`w-full rounded-md bg-yellow-500 px-4 py-2 text-white hover:bg-yellow-600 focus:ring-2 focus:ring-yellow-500 focus:outline-none ${
                                    loading ? "cursor-not-allowed opacity-50" : ""
                                }`}>
                                {loading ? "Checking..." : "Check Status"}
                            </button>
                            {isExpired && (
                                <button
                                    type="button"
                                    onClick={() => handleInitiateTransaction()}
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

    return (
        <>
            <WarningModal
                isOpen={payModalOpen}
                onClose={() => setPayModalOpen(false)}
                onConfirm={payModalOnConfirm}
                title={payModalTitle}
                buttonText={payModalButtonText}
                finalButtonText={payModalFinalText}
            />
            {renderButtons()}
        </>
    );
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
        <InputField
            type="text"
            name={name}
            value={value ?? ""}
            onChange={handleChange}
            disabled={disabled}
            readOnly={readOnly}
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
    fileInfoResetSignal,
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
                fileInfoResetSignal={fileInfoResetSignal}
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
    onDocLoad,
    readOnlyProp,
    filterField,
    hideSave,
    hideRequestVerify,
    hideDeleteLeave,
    hideStatusBar,
    hideVerifiableCode,
    hideCreateJoin,
    hideDependencyStatus,
}: VerifiableFormProps) {
    const { user, isLoading } = useUser_C();
    const [fileInfoResetSignal, setFileInfoResetSignal] = useState(0);
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

    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string[];
        onConfirm?: () => void;
        buttonText?: string;
        finalButtonText?: string;
    }>({ isOpen: false, title: [] });

    const showModal = (
        title: string | string[],
        onConfirm?: () => void,
        options?: { buttonText?: string; finalButtonText?: string }
    ) => {
        setModalConfig({
            isOpen: true,
            title: Array.isArray(title) ? title : [title],
            onConfirm,
            buttonText: options?.buttonText,
            finalButtonText: options?.finalButtonText ?? "OK",
        });
    };

    const closeModal = () => setModalConfig((prev) => ({ ...prev, isOpen: false }));

    useEffect(() => {
        const handleRemoteRequestVerify = (e: any) => {
            const { slug: remoteSlug, email: remoteEmail } = e.detail;
            if (constraints?.depends_on === remoteSlug && remoteEmail) {
                setAccessorVerifiedLevels((prev) => ({
                    ...prev,
                    [remoteEmail]: 1,
                }));
            }
        };

        window.addEventListener("verifiable:requestVerify", handleRemoteRequestVerify);
        return () =>
            window.removeEventListener("verifiable:requestVerify", handleRemoteRequestVerify);
    }, [constraints?.depends_on]);

    const fetchOnlyAccessorLevels = async (currentDoc: SQLRow, dependencySlug: string) => {
        const accessorArr = [currentDoc.creator, ...(currentDoc.shared || [])];
        const levels: Record<string, number | null> = {};
        for (const accessor of accessorArr) {
            try {
                const level = await isAccessorVerified_C(dependencySlug, accessor);
                levels[accessor] = level;
            } catch (error) {
                if (process.env.NODE_ENV !== "production") {
                    console.error(`Error checking accessor ${accessor}:`, error);
                }
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
                    onDocLoad?.(null);
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
                onDocLoad?.(currentDoc);

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
                if (process.env.NODE_ENV !== "production") {
                    console.error("Error loading form data:", error);
                }
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
                    if (process.env.NODE_ENV !== "production") {
                        console.error(`Error uploading file ${name}:`, error);
                    }
                }
            }

            // Reload document to get updated values
            const docDataResult = await readDoc_C(slug, {});
            const updatedDoc = docDataResult[0];
            if (updatedDoc) {
                setDoc(updatedDoc);
                setFormData(updatedDoc);
                setOriginalFormData(updatedDoc);
                setFileInfoResetSignal((prev) => prev + 1);
                toast.success("Berhasil menyimpan data");
            }
        } catch (error: any) {
            if (process.env.NODE_ENV !== "production") {
                console.error("Error saving form:", error);
            }
            if (error instanceof ExpectedError) {
                showModal(`${error.name}: ${error.message}`);
            } else {
                showModal(`Unexpected Error: ${error.message || "An unexpected error occurred."}`);
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
                onDocLoad?.(newDoc);
                if (constraints?.depends_on) {
                    const levels = await fetchOnlyAccessorLevels(newDoc, constraints.depends_on);
                    setAccessorVerifiedLevels(levels);
                }
            }
        } catch (error: any) {
            if (process.env.NODE_ENV !== "production") {
                console.error("Error creating document:", error);
            }
            if (error instanceof ExpectedError) {
                showModal(`${error.name}: ${error.message}`);
            } else {
                showModal(`Unexpected Error: ${error.message || "An unexpected error occurred."}`);
            }
        } finally {
            setCreating(false);
        }
    };

    const handleRequestVerify = async () => {
        const targetId = doc?.id;
        if (!targetId) return;

        setRequestingVerify(true);
        try {
            await requestVerify_C(slug, targetId);
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
            showModal("Berhasil! Permintaan verifikasi berhasil diajukan.");

            // Signal other cards/forms
            window.dispatchEvent(
                new CustomEvent("verifiable:requestVerify", {
                    detail: { slug, id: targetId, email: user?.email },
                })
            );
        } catch (error: any) {
            if (process.env.NODE_ENV !== "production") {
                console.error("Error requesting verification:", error);
            }
            if (error instanceof ExpectedError) {
                showModal(`${error.name}: ${error.message}`);
            } else {
                showModal(`Unexpected Error: ${error.message || "An unexpected error occurred."}`);
            }
        } finally {
            setRequestingVerify(false);
        }
    };

    const executeDelete = async () => {
        if (!doc) return;
        setDeleting(true);
        try {
            await deleteDoc_C(slug, { id: doc.id });
            setDoc(null);
            setFormData({});
            setOriginalFormData({});
            setJoinCode("");
            onDocLoad?.(null);
        } catch (error: any) {
            if (process.env.NODE_ENV !== "production") {
                console.error("Error deleting document:", error);
            }
            if (error instanceof ExpectedError) {
                showModal(`${error.name}: ${error.message}`);
            } else {
                showModal(`Unexpected Error: ${error.message || "An unexpected error occurred."}`);
            }
        } finally {
            setDeleting(false);
        }
    };

    const handleDelete = () => {
        if (!doc) return;
        showModal(
            [
                "Apakah kamu ingin mendelete data ini?",
                "Semua file akan hilang dan bukti pembayaran akan hilang.",
                "Apakah kamu benar-benar yakin? Tindakan ini tidak dapat dibatalkan.",
            ],
            executeDelete,
            { buttonText: "Batalkan Proses", finalButtonText: "Ya, Hapus" }
        );
    };

    const executeLeave = async () => {
        if (!doc || !user || !user.email) return;
        setLeaving(true);
        try {
            await shareDoc_C(slug, doc.id, [], [user.email]);
            setDoc(null);
            setFormData({});
            setOriginalFormData({});
            setJoinCode("");
            onDocLoad?.(null);
        } catch (error: any) {
            if (process.env.NODE_ENV !== "production") {
                console.error("Error leaving document:", error);
            }
            if (error instanceof ExpectedError) {
                showModal(`${error.name}: ${error.message}`);
            } else {
                showModal(`Unexpected Error: ${error.message || "An unexpected error occurred."}`);
            }
        } finally {
            setLeaving(false);
        }
    };

    const handleLeave = () => {
        if (!doc || !user || !user.email) return;
        if (doc.verified >= 1) {
            showModal("Tidak dapat leave karena data sudah diverifikasi.");
            return;
        }
        showModal(`Apakah kamu yakin ingin meninggalkan ${slug}?`, executeLeave, {
            buttonText: "Batalkan Proses",
            finalButtonText: "Ya, Leave",
        });
    };

    const executeKick = async (accessorEmail: string) => {
        if (!doc) return;
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
            if (process.env.NODE_ENV !== "production") {
                console.error("Error kicking member:", error);
            }
            if (error instanceof ExpectedError) {
                showModal(`${error.name}: ${error.message}`);
            } else {
                showModal(`Unexpected Error: ${error.message || "An unexpected error occurred."}`);
            }
        } finally {
            setKickingMember(null);
        }
    };

    const handleKick = (accessorEmail: string) => {
        if (!doc) return;
        if (doc.verified >= 1) {
            showModal("Tidak dapat kick karena data sudah diverifikasi.");
            return;
        }
        showModal(
            `Apakah kamu yakin ingin kick ${accessorEmail}?`,
            () => executeKick(accessorEmail),
            { buttonText: "Batalkan Proses", finalButtonText: "Ya, Kick" }
        );
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
                onDocLoad?.(currentDoc);
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
            if (process.env.NODE_ENV !== "production") {
                console.error("Error joining:", e);
            }
            showModal("Error joining with code. Pastikan kode yang dimasukkan benar.");
        } finally {
            setJoining(false);
        }
    };

    const isFormDisabled = () => {
        if (readOnlyProp) return true;
        if (!user || !user.email_verified) return true;
        if (!doc) return true;
        if (doc.verified >= 1) return true;
        return false;
    };

    const isFormReadOnly = () => {
        if (readOnlyProp) return true;
        if (!doc) return false;
        return doc.verified === 2;
    };

    const canRequestVerify = (
        currentDoc: SQLRow | null,
        currentFormData: Record<string, any>,
        currentAccessorLevels: Record<string, number | null>
    ) => {
        if (!currentDoc) return false;
        if (currentDoc.verified >= 1) return false;

        // Check if there are unsaved changes (only if we're checking against the current state)
        if (currentDoc === doc && hasChanges()) return false;

        // Check all constraints are not null
        const allArr = [
            ...(constraints?.required_on_create || []),
            ...(constraints?.constraints || []),
        ];
        for (const field of allArr) {
            const val = currentFormData[field.name];
            if (val === null || val === undefined || val === "") {
                return false;
            }

            // For payment fields, check if it's pending
            if (field.type === "payment") {
                try {
                    const decoded = decodePaymentInfo_SC(val);
                    if (decoded.status === "pending") return false;
                } catch (e) {
                    return false;
                }
            }
        }

        // Check dependencies if exists
        if (constraints?.depends_on) {
            const accessorArr = [currentDoc.creator, ...(currentDoc.shared || [])];
            for (const accessor of accessorArr) {
                const level = currentAccessorLevels[accessor];
                if (level === null || level < 1) {
                    return false;
                }
            }
        }

        return true;
    };

    if (loading || isLoading) {
        return (
            <div className="animate-pulse space-y-6 py-4">
                <div className="h-12 w-full rounded-[24px] bg-slate-200" />
                <div className="space-y-2">
                    <div className="h-6 w-1/3 rounded bg-slate-200" />
                    <div className="h-4 w-1/2 rounded bg-slate-200" />
                    <div className="h-12 w-full rounded-md bg-slate-200" />
                </div>
                <div className="space-y-2">
                    <div className="h-6 w-1/4 rounded bg-slate-200" />
                    <div className="h-12 w-full rounded-md bg-slate-200" />
                </div>
                <div className="flex gap-4 pt-4">
                    <div className="h-10 w-24 rounded bg-slate-200" />
                    <div className="h-10 w-32 rounded bg-slate-200" />
                </div>
            </div>
        );
    }

    if (!constraints) {
        return <div>No constraints found for this slug.</div>;
    }

    const allArr = [...(constraints.required_on_create || []), ...(constraints.constraints || [])];
    const formDisabled = isFormDisabled();
    const formReadOnly = isFormReadOnly();

    return (
        <div className="space-y-6">
            <WarningModal
                isOpen={modalConfig.isOpen}
                onClose={closeModal}
                onConfirm={modalConfig.onConfirm}
                title={modalConfig.title}
                buttonText={modalConfig.buttonText}
                finalButtonText={modalConfig.finalButtonText}
            />
            {!hideStatusBar && doc && <StatusBar verifiedLevel={doc.verified ?? 0} />}

            {!hideVerifiableCode && doc && doc.verifiableCode && (
                <div className="w-full rounded-[24px] border border-gray-200 bg-gray-50 p-4 px-6 text-center">
                    <span className="font-semibold text-gray-700">
                        {slug.startsWith("tim_") ? "Kode Tim: " : "Verifiable Code: "}
                    </span>
                    <span className="ml-2 font-bold tracking-wider text-gray-800">
                        {doc.verifiableCode}
                    </span>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(doc.verifiableCode!);
                            toast.success("Berhasil Disalin! Kode tim telah disalin ke clipboard.");
                        }}
                        className="ml-3 inline-flex items-center justify-center rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800"
                        title="Copy Code">
                        <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                        </svg>
                    </button>
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

            {!hideDependencyStatus && constraints.depends_on && doc && (
                <div className="w-full rounded-[24px] border border-gray-200 bg-gray-50 p-6">
                    <div className="mb-2 font-semibold">Anggota Tim:</div>
                    <span className="text-xs text-wrap text-gray-400">
                        Status verifikasi formulir <strong>{constraints.depends_on}</strong> untuk
                        setiap anggota tim.
                    </span>
                    {[doc.creator, ...(doc.shared || [])].map((accessor) => {
                        const level = accessorVerifiedLevels[accessor];
                        const statusConfig = {
                            "-1": { text: "Rejected", color: "bg-red-500" },
                            "0": { text: "Not Yet Requested", color: "bg-blue-400" },
                            "1": { text: "Requested", color: "bg-yellow-500" },
                            "2": { text: "Accepted", color: "bg-green-500" },
                        };
                        const status =
                            typeof level === "number"
                                ? statusConfig[level.toString() as keyof typeof statusConfig] ||
                                  statusConfig["0"]
                                : { text: "Belum Diajukan", color: "bg-gray-400" };
                        const isCreator = accessor === doc.creator;
                        const isYou = user?.email === accessor;

                        return (
                            <div
                                key={accessor}
                                className="flex w-[44vw] flex-col gap-1 border-b border-gray-100 py-2 last:border-0 md:w-full md:flex-row md:items-center md:justify-between">
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <span className="truncate text-xs font-medium md:text-base">
                                        {accessor}
                                    </span>
                                    {(isCreator || isYou) && (
                                        <span className="shrink-0 text-xs text-gray-500">
                                            {isCreator ? "(Creator)" : "(You)"}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`rounded-full px-2 py-1 text-xs text-white ${status.color}`}>
                                        {status.text}
                                    </span>
                                    {/* Kick Member Button: Only if current user is creator and target is not creator */}
                                    {user?.email === doc.creator && !isCreator && (
                                        <Button
                                            type="button"
                                            variant="danger"
                                            className="ml-2 !px-2 !py-1 text-xs" // override size classes to fit nicely in the row
                                            onClick={() => handleKick(accessor)}
                                            title="Kick Member"
                                            disabled={
                                                kickingMember === accessor || doc.verified >= 1
                                            }>
                                            {kickingMember === accessor ? "..." : "Kick"}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <form className="space-y-6">
                {doc &&
                    allArr
                        .filter((field) => (filterField ? filterField(field.name) : true))
                        .map((field, index) => (
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
                                    fileInfoResetSignal={fileInfoResetSignal}
                                />
                            </div>
                        ))}

                <div className="flex w-full flex-wrap items-center justify-between gap-4">
                    {!doc ? (
                        !hideCreateJoin && slug.startsWith("tim_") ? (
                            <>
                                <div className="mb-2">
                                    <h3 className="text-xl font-bold text-blue-900">
                                        Belum tergabung
                                    </h3>
                                    <p className="text-sm text-gray-500">
                                        Silakan buat{" "}
                                        <span className="font-semibold text-blue-600">{slug}</span>{" "}
                                        baru atau bergabung menggunakan kode.
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-4">
                                    <Button
                                        type="button"
                                        variant="primary"
                                        size="sm"
                                        onClick={handleCreate}
                                        disabled={!user || !user.email_verified || creating}
                                        className="disabled:cursor-not-allowed disabled:opacity-50">
                                        {creating ? "Creating..." : `Create New`}
                                    </Button>

                                    <span className="text-sm font-bold text-gray-400">ATAU</span>

                                    <div className="flex items-center gap-2">
                                        <InputField
                                            type="text"
                                            name="joinCode"
                                            value={joinCode}
                                            onChange={handleJoinCodeChange}
                                            placeholder="KODE TIM (Ex: TM.1A2B)"
                                            className="w-full uppercase sm:w-48"
                                        />
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={handleJoin}
                                            disabled={
                                                !joinCode ||
                                                !user ||
                                                !user.email_verified ||
                                                !/^[A-Z0-9]+\.[A-Z0-9]+$/.test(joinCode) ||
                                                joining
                                            }
                                            className="disabled:cursor-not-allowed disabled:opacity-50">
                                            {joining ? "Joining..." : `Join`}
                                        </Button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex w-full flex-col items-start gap-4 py-2">
                                <div>
                                    <h3 className="mb-1 text-xl font-bold text-blue-900">
                                        {slug === "profile"
                                            ? "Data Profil Belum Dibuat"
                                            : "Data Belum Dibuat"}
                                    </h3>
                                    <p className="text-sm text-gray-500">
                                        Silakan buat data terlebih dahulu untuk melanjutkan
                                        pengisian.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    onClick={handleCreate}
                                    disabled={!user || !user.email_verified || creating}
                                    className="disabled:cursor-not-allowed disabled:opacity-50">
                                    {creating ? "Creating..." : `Buat Data`}
                                </Button>
                            </div>
                        )
                    ) : !readOnlyProp ? (
                        <>
                            <div className="xs:flex-row flex flex-col items-center items-start gap-2">
                                {!hideSave && (
                                    <Button
                                        type="button"
                                        variant="primary"
                                        size="sm"
                                        onClick={handleSave}
                                        disabled={!hasChanges() || saving || formDisabled}
                                        className="disabled:cursor-not-allowed disabled:opacity-50">
                                        {saving ? "Saving..." : "Save"}
                                    </Button>
                                )}
                                {!hideRequestVerify && (
                                    <div className="flex items-center gap-1.5">
                                        <Button
                                            type="button"
                                            variant="tetrary"
                                            size="sm"
                                            onClick={() => {
                                                showModal(
                                                    "Apakah Anda yakin ingin mengajukan verifikasi? Tindakan ini tidak dapat dibatalkan (irreversible) dan Anda tidak akan bisa mengubah data/file lagi setelah diverifikasi.",
                                                    handleRequestVerify,
                                                    {
                                                        buttonText: "Batalkan Proses",
                                                        finalButtonText: "Ya, Request Verify",
                                                    }
                                                );
                                            }}
                                            disabled={
                                                !canRequestVerify(
                                                    doc,
                                                    formData,
                                                    accessorVerifiedLevels
                                                ) || requestingVerify
                                            }
                                            className="disabled:cursor-not-allowed disabled:opacity-50">
                                            {requestingVerify ? "Requesting..." : "Request Verify"}
                                        </Button>
                                        <div className="group relative z-20 flex items-center">
                                            <div className="flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-300">
                                                i
                                            </div>
                                            <div className="absolute bottom-full left-1/2 mb-2 w-[200px] -translate-x-1/2 scale-0 rounded-md bg-gray-800 px-3 py-2 text-center text-xs font-medium text-white opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100">
                                                Kamu dapat me-request verify jika sudah melengkapi
                                                seluruh dokumen.
                                                <div className="absolute top-full left-1/2 -ml-1 border-4 border-transparent border-t-gray-800"></div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {!hideDeleteLeave &&
                                (user?.email === doc.creator ? (
                                    <Button
                                        type="button"
                                        variant="danger"
                                        size="sm"
                                        onClick={handleDelete}
                                        disabled={
                                            doc.verified >= 1 ||
                                            deleting ||
                                            requestingVerify ||
                                            formDisabled ||
                                            saving
                                        }
                                        className="disabled:cursor-not-allowed disabled:opacity-50">
                                        {deleting
                                            ? "Deleting..."
                                            : slug.startsWith("tim_")
                                              ? "Delete Tim"
                                              : `Delete ${slug}`}
                                    </Button>
                                ) : (
                                    <Button
                                        type="button"
                                        variant="danger"
                                        size="sm"
                                        onClick={handleLeave}
                                        disabled={leaving || doc.verified >= 1}
                                        className="disabled:cursor-not-allowed disabled:opacity-50">
                                        {leaving
                                            ? "Leaving..."
                                            : slug.startsWith("tim_")
                                              ? "Leave Tim"
                                              : `Leave ${slug}`}
                                    </Button>
                                ))}
                        </>
                    ) : null}
                </div>
            </form>
        </div>
    );
}
