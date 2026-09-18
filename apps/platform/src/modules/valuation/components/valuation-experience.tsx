import { Link, useNavigate } from "@tanstack/react-router";
import {
	type DragEvent,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useImageIdentification } from "../hooks/use-image-identification";
import { useValuation } from "../hooks/use-valuation";
import {
	defaultValuationDetails,
	useValuationSession,
} from "../hooks/use-valuation-session";
import {
	createMockValuationResult,
	getValuationRuntime,
	ValuationGatewayError,
} from "../hooks/valuation-gateway";
import {
	type MockValuationResult,
	type PlatformValuationResult,
	type ProductCondition,
	productConditions,
	type ValuationDetails,
	type ValuationInput,
} from "../type";
import { formatRupiah } from "./tools/format-rupiah";

type CreateStep =
	| "upload"
	| "identifying"
	| "details"
	| "analysing"
	| "image-outcome";

type ImageOutcome = {
	title: string;
	explanation: string;
	actionLabel: string;
};

const valuationRuntime = getValuationRuntime();
const progressLabels = [
	"Mengidentifikasi produk",
	"Mencari produk pembanding",
	"Menghitung estimasi harga",
	"Menyiapkan penjelasan",
];

const confidenceLabel = { HIGH: "Tinggi", MEDIUM: "Menengah" } as const;
const coverageLabel = { LOCAL: "Lokal", NATIONAL: "Nasional" } as const;

function Sparkle() {
	return (
		<svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
			<path
				d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z"
				fill="currentColor"
			/>
			<path
				d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"
				fill="currentColor"
			/>
		</svg>
	);
}

function ProductMark() {
	return (
		<span
			aria-hidden="true"
			className="grid size-10 shrink-0 place-items-center border-2 border-base-content bg-primary text-primary-content"
		>
			<svg
				aria-hidden="true"
				className="size-6"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					d="M6 7c0 5 3 8 6 8s6-3 6-8M6 17c0-5 3-8 6-8s6 3 6 8"
					stroke="currentColor"
					strokeWidth="2.5"
				/>
			</svg>
		</span>
	);
}

function SectionStamp({ children }: { children: string }) {
	return (
		<span className="absolute -top-3 left-0 bg-neutral px-2 py-1 text-[0.58rem] font-bold tracking-[0.08em] text-neutral-content">
			{children}
		</span>
	);
}

function runtimeLabel() {
	if (valuationRuntime.kind === "local-api") return "API LOKAL";
	if (valuationRuntime.kind === "unavailable") return "INTEGRASI NONAKTIF";
	return "DEMO MOCKUP";
}

function ValuationLayout({ children }: { children: ReactNode }) {
	const footerMode =
		valuationRuntime.kind === "local-api"
			? "Integrasi API lokal untuk pengembangan"
			: valuationRuntime.kind === "mock"
				? "Demo UI dengan data mockup"
				: "Integrasi valuasi tidak tersedia";
	return (
		<div
			className="flex min-h-[100dvh] flex-col bg-base-100 text-base-content"
			data-theme="asli"
		>
			<header className="border-b-2 border-base-content bg-base-100">
				<div className="navbar mx-auto min-h-16 max-w-7xl px-4 sm:min-h-20 sm:px-6">
					<Link
						className="btn btn-ghost h-auto min-h-0 rounded-none px-0 font-display text-xl tracking-[-0.04em] uppercase sm:text-2xl"
						to="/"
						aria-label="Beranda AsliSegini?"
					>
						<ProductMark />
						<span>
							asli<span className="text-primary">segini?</span>
						</span>
					</Link>
					<div className="ml-auto flex h-full items-stretch">
						<span className="hidden items-center border-x border-base-content px-5 text-[0.62rem] font-bold tracking-[0.08em] sm:flex">
							{runtimeLabel()}
						</span>
						<Link
							className="btn btn-primary h-auto min-h-0 rounded-none px-4 text-xs uppercase sm:px-6"
							to="/create"
						>
							<Sparkle />
							Cek harga
						</Link>
					</div>
				</div>
			</header>
			<main className="mx-auto flex w-full max-w-7xl flex-1 items-start justify-center px-4 py-12 sm:px-6 sm:py-20">
				{children}
			</main>
			<footer className="flex flex-col gap-1 border-t-2 border-base-content px-4 py-4 text-[0.6rem] font-medium uppercase tracking-[0.04em] sm:flex-row sm:justify-between sm:px-6">
				<span>{footerMode}</span>
				<span>Estimasi hanya mencakup harga barang.</span>
			</footer>
		</div>
	);
}

export function ValuationHomePage() {
	const { setOutcome, setResultDetails } = useValuationSession();
	const modeCopy =
		valuationRuntime.kind === "local-api"
			? "Mode pengembangan lokal mengirim foto dan detail yang kamu konfirmasi ke API lokal."
			: valuationRuntime.kind === "mock"
				? "Mode mock memakai data contoh dan tidak mengirim permintaan ke layanan mana pun."
				: valuationRuntime.reason;
	return (
		<ValuationLayout>
			<section className="w-full max-w-4xl border-2 border-base-content bg-base-100 p-6 sm:p-12">
				<span className="badge badge-primary rounded-none px-2 py-3 text-[0.62rem] font-bold uppercase tracking-[0.07em]">
					Penilaian barang bekas
				</span>
				<h1 className="mt-10 max-w-3xl font-display text-5xl leading-[0.9] tracking-[-0.04em] uppercase sm:text-7xl">
					Tahu harga barang sebelum{" "}
					<span className="text-primary">pasang iklan.</span>
				</h1>
				<p className="mt-6 max-w-2xl text-sm leading-7 text-base-content/80">
					Unggah foto, konfirmasi identitas dan kondisi barang, lalu tinjau
					saran harga listing yang dipisahkan dari rentang pasar Blibli.{" "}
					{modeCopy}
				</p>
				<div className="mt-10 flex flex-col gap-3 sm:flex-row">
					<Link
						className="btn btn-primary min-h-13 rounded-none uppercase"
						to="/create"
					>
						<Sparkle /> Mulai cek harga
					</Link>
					<Link
						className="btn btn-outline min-h-13 rounded-none uppercase"
						to="/result"
						onClick={() => {
							setResultDetails(defaultValuationDetails);
							setOutcome({
								source: "mock",
								result: createMockValuationResult(),
							});
						}}
					>
						Lihat contoh hasil
					</Link>
				</div>
			</section>
		</ValuationLayout>
	);
}

export function CreateValuationPage() {
	const navigate = useNavigate();
	const session = useValuationSession();
	const localGateway =
		valuationRuntime.kind === "local-api" ? valuationRuntime.gateway : null;
	const identifyImage = useImageIdentification(localGateway);
	const requestValuation = useValuation(localGateway);
	const [step, setStep] = useState<CreateStep>(() =>
		session.correction || session.resumeAtDetails ? "details" : "upload",
	);
	const [fileName, setFileName] = useState("");
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const [analysisStep, setAnalysisStep] = useState(0);
	const [formError, setFormError] = useState(
		session.correction?.explanation ?? "",
	);
	const [missingFields, setMissingFields] = useState(
		session.correction?.missingFields ?? [],
	);
	const [details, setDetails] = useState(session.resultDetails);
	const [imageOutcome, setImageOutcome] = useState<ImageOutcome | null>(null);
	const controllerRef = useRef<AbortController | null>(null);

	useEffect(() => {
		if (session.resumeAtDetails) session.setResumeAtDetails(false);
	}, [session]);

	useEffect(() => {
		if (step !== "analysing" || valuationRuntime.kind !== "mock") return;
		const delay = analysisStep === progressLabels.length - 1 ? 700 : 650;
		const timer = window.setTimeout(() => {
			if (analysisStep < progressLabels.length - 1) {
				setAnalysisStep((current) => current + 1);
				return;
			}
			session.setResultDetails(details);
			session.setOutcome({
				source: "mock",
				result: createMockValuationResult(),
			});
			navigate({ to: "/result" });
		}, delay);
		return () => window.clearTimeout(timer);
	}, [analysisStep, details, navigate, session, step]);

	useEffect(() => () => controllerRef.current?.abort(), []);
	useEffect(
		() => () => {
			if (imagePreview) URL.revokeObjectURL(imagePreview);
		},
		[imagePreview],
	);

	const previewLabel = useMemo(
		() => fileName || "Foto barang yang dipilih",
		[fileName],
	);

	async function selectImage(file?: File) {
		if (!file) return;
		if (!/image\/(jpeg|png|webp)/.test(file.type)) {
			setFormError("Gunakan foto JPG, PNG, atau WebP.");
			return;
		}
		if (file.size > 10 * 1024 * 1024) {
			setFormError("Ukuran foto maksimal 10 MB.");
			return;
		}
		if (valuationRuntime.kind === "unavailable") {
			setFormError(valuationRuntime.reason);
			return;
		}
		controllerRef.current?.abort();
		session.setCorrection(null);
		setMissingFields([]);
		setFormError("");
		setFileName(file.name);
		setImagePreview(URL.createObjectURL(file));

		if (valuationRuntime.kind === "mock") {
			setDetails(defaultValuationDetails);
			setStep("details");
			return;
		}

		const controller = new AbortController();
		controllerRef.current = controller;
		setStep("identifying");
		try {
			const result = await identifyImage(file, controller.signal);
			if (result.status === "SUPPORTED") {
				setDetails({
					productName: result.productName,
					productCondition: "Baik",
					productDescription: "",
					location: "",
				});
				setStep("details");
				return;
			}
			setImageOutcome(
				result.status === "UNSUPPORTED_CATEGORY"
					? {
							title: "Kategori produk belum didukung",
							explanation:
								"Gunakan foto komputer, handphone, tablet, konsol game, atau kamera bekas.",
							actionLabel: "Pilih foto lain",
						}
					: {
							title: "Foto belum cukup jelas",
							explanation:
								"Pilih foto lain yang memperlihatkan produk dan ciri modelnya dengan lebih jelas.",
							actionLabel: "Pilih foto lain",
						},
			);
			setStep("image-outcome");
		} catch (error) {
			if (
				error instanceof ValuationGatewayError &&
				error.code === "REQUEST_CANCELLED"
			) {
				setStep("upload");
				return;
			}
			if (
				error instanceof ValuationGatewayError &&
				[
					"INVALID_REQUEST",
					"IMAGE_TOO_LARGE",
					"UNSUPPORTED_IMAGE_TYPE",
					"INVALID_IMAGE",
				].includes(error.code)
			) {
				setFormError(error.message);
				setStep("upload");
				return;
			}
			setImageOutcome({
				title: "Layanan identifikasi bermasalah",
				explanation:
					error instanceof Error
						? error.message
						: "Foto belum dapat dianalisis. Silakan coba lagi.",
				actionLabel: "Coba lagi",
			});
			setStep("image-outcome");
		} finally {
			if (controllerRef.current === controller) controllerRef.current = null;
		}
	}

	async function startAnalysis() {
		const description = details.productDescription.trim();
		const error = !details.productName.trim()
			? "Lengkapi nama dan spesifikasi barang."
			: details.productName.trim().length > 160
				? "Nama dan spesifikasi barang maksimal 160 karakter."
				: description.length > 2_000
					? "Detail tambahan maksimal 2.000 karakter."
					: null;
		if (error) {
			setFormError(error);
			return;
		}
		if (valuationRuntime.kind === "unavailable") {
			setFormError(valuationRuntime.reason);
			return;
		}
		session.setCorrection(null);
		setMissingFields([]);
		setFormError("");
		session.setResultDetails(details);
		setAnalysisStep(0);
		setStep("analysing");
		if (valuationRuntime.kind === "mock") return;

		const controller = new AbortController();
		controllerRef.current?.abort();
		controllerRef.current = controller;
		const input: ValuationInput = {
			productName: details.productName.trim(),
			productCondition: details.productCondition,
			...(description ? { productDescription: description } : {}),
		};
		try {
			const result = await requestValuation(input, controller.signal);
			if (result.status === "MORE_INFORMATION_REQUIRED") {
				const correction = {
					explanation: result.explanation,
					missingFields: result.missingFields,
				};
				session.setCorrection(correction);
				setMissingFields(result.missingFields);
				setFormError(result.explanation);
				setStep("details");
				return;
			}
			session.setOutcome({ source: "local-api", result });
			navigate({ to: "/result" });
		} catch (requestError) {
			if (
				requestError instanceof ValuationGatewayError &&
				requestError.code === "REQUEST_CANCELLED"
			) {
				setFormError(
					"Permintaan dibatalkan. Detail yang kamu isi tetap tersimpan.",
				);
				setStep("details");
				return;
			}
			if (
				requestError instanceof ValuationGatewayError &&
				requestError.code === "INVALID_REQUEST"
			) {
				setFormError(requestError.message);
				setStep("details");
				return;
			}
			session.setOutcome({
				source: "local-api",
				result: {
					status: "SERVICE_FAILURE",
					explanation:
						requestError instanceof Error
							? requestError.message
							: "Layanan valuasi sedang bermasalah. Silakan coba lagi.",
				},
			});
			navigate({ to: "/result" });
		} finally {
			if (controllerRef.current === controller) controllerRef.current = null;
		}
	}

	function cancelRequest() {
		controllerRef.current?.abort();
		controllerRef.current = null;
		setFormError(
			"Permintaan dibatalkan. Detail yang kamu isi tetap tersimpan.",
		);
		setStep(step === "identifying" ? "upload" : "details");
	}

	function returnToUpload() {
		controllerRef.current?.abort();
		setImageOutcome(null);
		setFormError("");
		setStep("upload");
	}

	return (
		<ValuationLayout>
			{step === "upload" ? (
				<UploadScreen error={formError} onSelect={selectImage} />
			) : null}
			{step === "identifying" ? (
				<LocalActivityScreen
					title="Mengidentifikasi produk"
					description="API lokal sedang memeriksa foto. Status rinci belum tersedia dari layanan ini."
					onCancel={cancelRequest}
				/>
			) : null}
			{step === "details" ? (
				<DetailsScreen
					details={details}
					error={formError}
					imagePreview={imagePreview}
					missingFields={missingFields}
					previewLabel={previewLabel}
					runtimeKind={valuationRuntime.kind}
					onBack={returnToUpload}
					onChange={(field, value) => {
						setFormError("");
						setDetails((current) => ({ ...current, [field]: value }));
					}}
					onSubmit={startAnalysis}
				/>
			) : null}
			{step === "analysing" ? (
				valuationRuntime.kind === "mock" ? (
					<MockAnalysisScreen activeStep={analysisStep} />
				) : (
					<LocalActivityScreen
						title="Analisis harga sedang berjalan"
						description="API lokal sedang mencari pembanding dan menghitung hasil. Tahap rinci belum dilaporkan oleh layanan ini."
						onCancel={cancelRequest}
					/>
				)
			) : null}
			{step === "image-outcome" && imageOutcome ? (
				<SimpleOutcomeScreen {...imageOutcome} onAction={returnToUpload} />
			) : null}
		</ValuationLayout>
	);
}

export function ValuationResultPage() {
	const navigate = useNavigate();
	const session = useValuationSession();
	function startNew() {
		session.setCorrection(null);
		session.setResumeAtDetails(false);
		session.setResultDetails(defaultValuationDetails);
		navigate({ to: "/create" });
	}
	function editAndRetry(correction?: {
		explanation: string;
		missingFields: string[];
	}) {
		session.setCorrection(correction ?? null);
		session.setResumeAtDetails(true);
		navigate({ to: "/create" });
	}
	return (
		<ValuationLayout>
			{session.outcome.source === "mock" ? (
				<MockResultScreen
					details={session.resultDetails}
					result={session.outcome.result}
					onRestart={startNew}
				/>
			) : session.outcome.result.status === "VALUATED" ? (
				<LocalResultScreen
					details={session.resultDetails}
					result={session.outcome.result}
					onRestart={startNew}
				/>
			) : (
				<ValuationOutcomeScreen
					result={session.outcome.result}
					onEdit={editAndRetry}
					onRestart={startNew}
				/>
			)}
		</ValuationLayout>
	);
}

function UploadScreen({
	error,
	onSelect,
}: {
	error: string;
	onSelect: (file?: File) => void;
}) {
	function handleDrop(event: DragEvent<HTMLLabelElement>) {
		event.preventDefault();
		onSelect(event.dataTransfer.files[0]);
	}
	return (
		<section className="card relative w-full max-w-2xl border-2 border-base-content bg-base-100 shadow-none">
			<SectionStamp>FOTO PRODUK</SectionStamp>
			<div className="card-body gap-0 p-5 sm:p-10">
				<div className="flex items-start justify-between gap-4">
					<span className="badge badge-primary rounded-none px-2 py-3 text-[0.62rem] font-bold uppercase tracking-[0.07em]">
						Langkah 1 dari 3
					</span>
					<span className="pt-1 text-[0.58rem] font-bold tracking-[0.11em]">
						SATU FOTO
					</span>
				</div>
				<h1 className="mt-10 max-w-xl font-display text-4xl leading-[0.9] tracking-[-0.04em] uppercase sm:text-6xl">
					Unggah <span className="text-primary">foto barang</span>
				</h1>
				<p className="mt-4 max-w-prose text-xs leading-6 text-base-content/80">
					Gunakan foto jelas yang memperlihatkan produk dan ciri modelnya.
					Server tetap menjadi pemeriksa akhir untuk format, ukuran, dan
					validitas gambar.
				</p>
				<input
					id="product-photo"
					className="sr-only"
					type="file"
					accept="image/jpeg,image/png,image/webp"
					onChange={(event) => {
						const file = event.currentTarget.files?.[0];
						event.currentTarget.value = "";
						onSelect(file);
					}}
				/>
				<label
					className="mt-6 flex min-h-56 cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed border-base-content bg-base-200 px-4 text-center transition-colors hover:bg-primary hover:text-primary-content"
					htmlFor="product-photo"
					onDragOver={(event) => event.preventDefault()}
					onDrop={handleDrop}
				>
					<span className="grid size-12 place-items-center border-2 border-current">
						<svg
							aria-hidden="true"
							className="size-7"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								d="M12 16V3m0 0L7 8m5-5 5 5M5 14v5h14v-5"
								stroke="currentColor"
								strokeWidth="2"
							/>
						</svg>
					</span>
					<strong className="mt-2 text-sm uppercase">Tarik foto ke sini</strong>
					<span className="text-xs">atau pilih dari perangkat kamu</span>
					<small className="mt-1 text-[0.62rem]">
						JPG, PNG, WebP, maksimal 10 MB
					</small>
				</label>
				<FormError message={error} />
				<p className="mt-4 text-center text-[0.62rem] leading-5 text-base-content/70">
					{valuationRuntime.kind === "local-api"
						? "Foto dikirim ke API lokal untuk validasi, sanitasi dalam memori, dan identifikasi."
						: valuationRuntime.kind === "mock"
							? "Mode mock tidak mengunggah atau menyimpan foto yang dipilih."
							: valuationRuntime.reason}
				</p>
			</div>
		</section>
	);
}

function FormError({ message }: { message: string }) {
	return message ? (
		<div
			className="alert alert-error mt-4 rounded-none border border-base-content py-2 text-xs font-bold"
			role="alert"
		>
			<span>{message}</span>
		</div>
	) : null;
}

function DetailsScreen({
	details,
	error,
	imagePreview,
	missingFields,
	previewLabel,
	runtimeKind,
	onBack,
	onChange,
	onSubmit,
}: {
	details: ValuationDetails;
	error: string;
	imagePreview: string | null;
	missingFields: string[];
	previewLabel: string;
	runtimeKind: "mock" | "local-api" | "unavailable";
	onBack: () => void;
	onChange: <Field extends keyof ValuationDetails>(
		field: Field,
		value: ValuationDetails[Field],
	) => void;
	onSubmit: () => void;
}) {
	const productNameRef = useRef<HTMLInputElement>(null);
	const conditionRef = useRef<HTMLSelectElement>(null);
	useEffect(() => {
		if (missingFields.length === 0) return;
		const firstMissing = missingFields[0]?.toLocaleLowerCase("id-ID") ?? "";
		if (firstMissing.includes("kondisi")) conditionRef.current?.focus();
		else productNameRef.current?.focus();
	}, [missingFields]);
	return (
		<section className="card relative w-full max-w-2xl border-2 border-base-content bg-base-100 shadow-none">
			<SectionStamp>KONFIRMASI DETAIL</SectionStamp>
			<form
				className="card-body gap-0 p-5 sm:p-10"
				onSubmit={(event) => {
					event.preventDefault();
					onSubmit();
				}}
			>
				<div className="flex items-center gap-3 bg-neutral p-3 text-neutral-content">
					<span className="grid size-8 place-items-center bg-primary">
						<Sparkle />
					</span>
					<div>
						<strong className="block text-xs uppercase">
							Usulan identitas
						</strong>
						<span className="mt-1 block text-[0.58rem] font-bold tracking-[0.13em] text-primary">
							KONFIRMASI SEBELUM ANALISIS
						</span>
					</div>
				</div>
				<div className="mt-5 flex items-center gap-3 border-b border-base-content pb-4 text-xs">
					<div className="size-12 shrink-0 overflow-hidden border border-base-content">
						{imagePreview ? (
							<img
								className="size-full object-cover"
								src={imagePreview}
								alt="Pratinjau foto barang"
							/>
						) : (
							<ProductMark />
						)}
					</div>
					<span className="min-w-0 break-all">{previewLabel}</span>
				</div>
				<p className="mt-5 max-w-prose text-xs leading-6 text-base-content/80">
					Pastikan merek, model, edisi, kapasitas, dan isi bundle sudah tepat.
					AI hanya mengusulkan identitas. Kamu tetap perlu mengonfirmasinya.
				</p>
				<Field id="item-name" label="Nama dan spesifikasi barang">
					<input
						ref={productNameRef}
						id="item-name"
						className="input mt-2 w-full rounded-none border-base-content bg-base-100 text-base focus:border-primary"
						value={details.productName}
						maxLength={160}
						required
						aria-describedby="item-name-help"
						onChange={(event) => onChange("productName", event.target.value)}
					/>
				</Field>
				<p
					id="item-name-help"
					className="mt-2 text-[0.62rem] leading-5 text-base-content/70"
				>
					Maksimal 160 karakter. Sertakan semua varian yang memengaruhi harga.
				</p>
				<Field id="item-condition" label="Kondisi barang">
					<select
						ref={conditionRef}
						id="item-condition"
						className="select mt-2 w-full rounded-none border-base-content bg-base-100 text-base focus:border-primary"
						value={details.productCondition}
						required
						onChange={(event) =>
							onChange(
								"productCondition",
								event.target.value as ProductCondition,
							)
						}
					>
						{productConditions.map((condition) => (
							<option key={condition}>{condition}</option>
						))}
					</select>
				</Field>
				<Field id="item-description" label="Detail tambahan" optional>
					<textarea
						id="item-description"
						className="textarea mt-2 min-h-28 w-full rounded-none border-base-content bg-base-100 text-base focus:border-primary"
						value={details.productDescription}
						maxLength={2_000}
						aria-describedby="item-description-help"
						onChange={(event) =>
							onChange("productDescription", event.target.value)
						}
						placeholder="Kelengkapan, garansi, perbaikan, atau cacat"
					/>
				</Field>
				<p
					id="item-description-help"
					className="mt-2 text-[0.62rem] leading-5 text-base-content/70"
				>
					Maksimal 2.000 karakter. Teks ini tidak menggantikan identitas atau
					kondisi yang dikonfirmasi.
				</p>
				<Field id="item-location" label="Lokasi listing" optional>
					<input
						id="item-location"
						className="input mt-2 w-full rounded-none border-base-content bg-base-100 text-base focus:border-primary"
						value={details.location}
						onChange={(event) => onChange("location", event.target.value)}
						placeholder="Jakarta Selatan, Bandung, Surabaya"
						aria-describedby="item-location-help"
					/>
				</Field>
				<p
					id="item-location-help"
					className="mt-2 border border-base-content bg-base-200 p-3 text-[0.62rem] leading-5"
				>
					Kolom lokasi masih berupa UI tertunda. Nilainya tidak dikirim ke API
					lokal dan tidak memengaruhi hasil.
				</p>
				{missingFields.length > 0 ? (
					<div className="mt-4 border border-base-content bg-base-200 p-4 text-xs">
						<strong className="uppercase">
							Informasi yang perlu dilengkapi
						</strong>
						<ul className="mt-2 list-disc space-y-1 pl-5">
							{missingFields.map((field) => (
								<li key={field}>{field}</li>
							))}
						</ul>
					</div>
				) : null}
				<FormError message={error} />
				<div className="mt-6 grid gap-3 sm:grid-cols-[auto_1fr]">
					<button
						className="btn btn-outline min-h-13 rounded-none uppercase"
						type="button"
						onClick={onBack}
					>
						Ganti foto
					</button>
					<button
						className="btn btn-primary min-h-13 rounded-none uppercase"
						type="submit"
					>
						<Sparkle /> Cek harga pasar
					</button>
				</div>
				<p className="mt-4 text-center text-[0.62rem] leading-5 text-base-content/70">
					{runtimeKind === "local-api"
						? "Permintaan hanya berisi nama, kondisi, dan detail tambahan."
						: "Mode mock memakai pembanding contoh tanpa permintaan API."}
				</p>
			</form>
		</section>
	);
}

function Field({
	id,
	label,
	optional = false,
	children,
}: {
	id: string;
	label: string;
	optional?: boolean;
	children: ReactNode;
}) {
	return (
		<div className="mt-4 block text-xs font-bold uppercase">
			<label htmlFor={id}>
				{label}
				{optional ? (
					<span className="font-normal text-base-content/65"> (opsional)</span>
				) : null}
			</label>
			{children}
		</div>
	);
}

function LocalActivityScreen({
	title,
	description,
	onCancel,
}: {
	title: string;
	description: string;
	onCancel: () => void;
}) {
	return (
		<section
			className="card w-full max-w-xl border-2 border-base-content bg-base-100 shadow-none"
			aria-live="polite"
			aria-busy="true"
		>
			<div className="card-body p-6 sm:p-12">
				<div className="loading-skeleton h-5 w-28 bg-base-300" />
				<div className="loading-skeleton mt-4 h-10 w-full bg-base-300" />
				<div className="loading-skeleton mt-3 h-10 w-4/5 bg-base-300" />
				<h1 className="mt-8 font-display text-3xl leading-[0.95] tracking-[-0.04em] uppercase sm:text-4xl">
					{title}
				</h1>
				<p className="mt-4 text-xs leading-6 text-base-content/75">
					{description}
				</p>
				<button
					className="btn btn-outline mt-7 rounded-none uppercase"
					type="button"
					onClick={onCancel}
				>
					Batalkan
				</button>
			</div>
		</section>
	);
}

function MockAnalysisScreen({ activeStep }: { activeStep: number }) {
	return (
		<section
			className="card w-full max-w-xl border-2 border-base-content bg-base-100 text-center shadow-none"
			aria-live="polite"
		>
			<div className="card-body p-6 sm:p-12">
				<span className="badge badge-primary mx-auto rounded-none px-3 py-3 text-[0.62rem] font-bold">
					SIMULASI MOCK
				</span>
				<h1 className="mt-5 font-display text-3xl leading-[0.95] tracking-[-0.04em] uppercase sm:text-4xl">
					{progressLabels[activeStep]}
				</h1>
				<ol className="mt-5 border border-base-content text-left">
					{progressLabels.map((label, index) => (
						<li
							className={`flex items-center gap-3 border-b border-base-content px-4 py-3 text-xs last:border-b-0 ${index === activeStep ? "bg-primary font-bold text-primary-content" : index < activeStep ? "bg-base-100 font-bold" : "text-base-content/60"}`}
							key={label}
						>
							<span className="grid min-w-16 place-items-center border border-current px-1 py-0.5 text-[0.58rem] uppercase">
								{index < activeStep ? "Selesai" : index + 1}
							</span>
							{label}
						</li>
					))}
				</ol>
				<p className="mt-4 text-xs text-base-content/70">
					Tahap ini disimulasikan untuk demo. Tidak ada status server langsung.
				</p>
			</div>
		</section>
	);
}

function SimpleOutcomeScreen({
	title,
	explanation,
	actionLabel,
	onAction,
}: ImageOutcome & { onAction: () => void }) {
	return (
		<section className="card relative w-full max-w-xl border-2 border-base-content bg-base-100 shadow-none">
			<SectionStamp>HASIL PEMERIKSAAN</SectionStamp>
			<div className="card-body p-6 sm:p-10">
				<h1 className="font-display text-3xl leading-[0.95] tracking-[-0.04em] uppercase sm:text-5xl">
					{title}
				</h1>
				<p className="mt-5 text-sm leading-7 text-base-content/80">
					{explanation}
				</p>
				<button
					className="btn btn-primary mt-8 rounded-none uppercase"
					type="button"
					onClick={onAction}
				>
					{actionLabel}
				</button>
			</div>
		</section>
	);
}

function MockResultScreen({
	details,
	result,
	onRestart,
}: {
	details: ValuationDetails;
	result: MockValuationResult;
	onRestart: () => void;
}) {
	return (
		<section className="grid w-full max-w-7xl gap-4 lg:grid-cols-[1.32fr_0.68fr]">
			<article className="card relative border-2 border-base-content bg-base-100 shadow-none">
				<SectionStamp>CONTOH HASIL</SectionStamp>
				<div className="card-body p-5 sm:p-10">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<span className="badge badge-primary rounded-none px-3 py-3 text-[0.62rem] font-bold">
							DATA MOCKUP
						</span>
						<span className="text-xs font-bold uppercase">Bukan hasil API</span>
					</div>
					<ResultHeading details={details} coverage="Nasional" />
					<PricePanel result={result} />
					<ExplanationSection result={result} />
					<RequiredDisclosures />
				</div>
			</article>
			<MockEvidenceCard result={result} onRestart={onRestart} />
		</section>
	);
}

function LocalResultScreen({
	details,
	result,
	onRestart,
}: {
	details: ValuationDetails;
	result: Extract<PlatformValuationResult, { status: "VALUATED" }>;
	onRestart: () => void;
}) {
	return (
		<section className="grid w-full max-w-7xl gap-4 lg:grid-cols-[1.32fr_0.68fr]">
			<article className="card relative border-2 border-base-content bg-base-100 shadow-none">
				<SectionStamp>HASIL API LOKAL</SectionStamp>
				<div className="card-body p-5 sm:p-10">
					<ResultHeading
						details={details}
						coverage={coverageLabel[result.evidenceCoverage]}
					/>
					<PricePanel result={result} />
					<ExplanationSection result={result} />
					<RequiredDisclosures />
				</div>
			</article>
			<LocalEvidenceCard result={result} onRestart={onRestart} />
		</section>
	);
}

function ResultHeading({
	details,
	coverage,
}: {
	details: ValuationDetails;
	coverage: string;
}) {
	return (
		<>
			<h1 className="mt-5 [overflow-wrap:anywhere] font-display text-4xl leading-[0.9] tracking-[-0.04em] uppercase sm:text-6xl">
				{details.productName}
			</h1>
			<p className="mt-3 text-xs text-base-content/75">
				Kondisi {details.productCondition} / cakupan evidence {coverage}
			</p>
		</>
	);
}

function PricePanel({
	result,
}: {
	result: {
		suggestedListingPriceIdr: number;
		observedMarketRangeIdr: { minimum: number; maximum: number };
		confidence: "HIGH" | "MEDIUM";
		confidenceReason: string;
	};
}) {
	return (
		<div className="mt-7 border-2 border-base-content bg-base-200 p-5 sm:p-7">
			<p className="text-[0.62rem] uppercase text-base-content/75">
				Saran harga listing berbasis median
			</p>
			<strong className="mt-2 block font-display text-3xl leading-none tracking-[-0.04em] text-primary sm:text-5xl">
				{formatRupiah(result.suggestedListingPriceIdr)}
			</strong>
			<div className="mt-6 grid gap-px border border-base-content bg-base-content sm:grid-cols-2">
				<ResultStat
					label="Rentang harga pasar saat ini di Blibli"
					value={`${formatRupiah(result.observedMarketRangeIdr.minimum)} - ${formatRupiah(result.observedMarketRangeIdr.maximum)}`}
				/>
				<ResultStat
					label="Kepercayaan"
					value={confidenceLabel[result.confidence]}
				/>
			</div>
			<p className="mt-4 text-xs leading-6">{result.confidenceReason}</p>
		</div>
	);
}

function ExplanationSection({
	result,
}: {
	result: Pick<MockValuationResult, "explanation" | "pros" | "cons">;
}) {
	return (
		<div className="mt-9">
			<h2 className="font-display text-xl leading-none tracking-[-0.03em] uppercase">
				Ringkasan penilaian
			</h2>
			<p className="mt-4 max-w-prose text-xs leading-6">{result.explanation}</p>
			<div className="mt-5 grid gap-px border border-base-content bg-base-content sm:grid-cols-2">
				<Insight
					title="Yang mendukung"
					items={result.pros}
					tone="text-primary"
				/>
				<Insight title="Perlu diperhatikan" items={result.cons} />
			</div>
		</div>
	);
}

function RequiredDisclosures() {
	return (
		<div className="mt-5 border border-base-content bg-base-200 p-4 text-xs leading-6">
			<strong className="block uppercase">Batas estimasi</strong>
			<p className="mt-2">Estimasi hanya mencakup harga barang.</p>
			<p className="mt-2">
				Harga Blibli adalah harga penawaran yang diiklankan, bukan harga resmi,
				harga awal historis, atau harga transaksi selesai.
			</p>
			<p className="mt-2">
				Kami tidak memverifikasi keaslian, kepemilikan, keamanan transaksi, atau
				kondisi fisik tersembunyi.
			</p>
		</div>
	);
}

function ResultStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 bg-base-100 p-3">
			<span className="block text-[0.58rem] uppercase leading-5 text-base-content/70">
				{label}
			</span>
			<strong className="mt-1 block [overflow-wrap:anywhere] text-xs tabular-nums">
				{value}
			</strong>
		</div>
	);
}

function Insight({
	title,
	items,
	tone = "",
}: {
	title: string;
	items: string[];
	tone?: string;
}) {
	return (
		<div className="min-w-0 bg-base-100 p-4">
			<h3 className={`text-[0.62rem] font-bold uppercase ${tone}`}>{title}</h3>
			{items.length > 0 ? (
				<ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-5 text-base-content/80">
					{items.map((item) => (
						<li className="[overflow-wrap:anywhere]" key={item}>
							{item}
						</li>
					))}
				</ul>
			) : (
				<p className="mt-2 text-xs leading-5 text-base-content/70">
					Tidak ada catatan tambahan.
				</p>
			)}
		</div>
	);
}

function EvidenceStats({
	accepted,
	coverage,
	outliers,
}: {
	accepted: number;
	coverage: string;
	outliers: number;
}) {
	return (
		<div className="mt-5 grid grid-cols-3 gap-px border border-base-content bg-base-content text-center text-[0.62rem]">
			<ResultStat label="Cakupan" value={coverage} />
			<ResultStat label="Diterima" value={String(accepted)} />
			<ResultStat label="Outlier" value={String(outliers)} />
		</div>
	);
}

function MockEvidenceCard({
	result,
	onRestart,
}: {
	result: MockValuationResult;
	onRestart: () => void;
}) {
	return (
		<aside className="card relative border-2 border-base-content bg-base-100 shadow-none">
			<SectionStamp>BUKTI CONTOH</SectionStamp>
			<div className="card-body p-5 sm:p-8">
				<span className="badge badge-primary w-fit rounded-none px-2 py-3 text-[0.55rem] font-bold">
					DATA MOCKUP
				</span>
				<h2 className="mt-4 font-display text-xl leading-none tracking-[-0.03em] uppercase">
					{result.acceptedComparableCount} pembanding contoh diterima
				</h2>
				<p className="mt-4 text-xs leading-5 text-base-content/75">
					{result.retrievedAtLabel}
				</p>
				<EvidenceStats
					accepted={result.acceptedComparableCount}
					coverage="Nasional"
					outliers={result.outlierCount}
				/>
				<div className="mt-5 divide-y divide-base-content border border-base-content">
					{result.evidence.map((item) => (
						<article className="p-3" key={item.id}>
							<span className="text-[0.57rem] font-bold tracking-[0.08em] text-primary">
								BLIBLI CONTOH
							</span>
							<h3 className="mt-1 [overflow-wrap:anywhere] text-[0.68rem] font-bold leading-5 uppercase">
								{item.title}
							</h3>
							<div className="mt-2 flex flex-wrap items-end justify-between gap-2">
								<p className="text-[0.62rem] text-base-content/70">
									{item.condition} / {item.city}
								</p>
								<strong className="text-xs tabular-nums">
									{formatRupiah(item.price)}
								</strong>
							</div>
						</article>
					))}
				</div>
				<p className="mt-4 text-xs leading-5 text-base-content/75">
					Listing ini hanya contoh tampilan. Tidak ada tautan atau metadata live
					yang diklaim berasal dari API.
				</p>
				<RestartButton onRestart={onRestart} />
			</div>
		</aside>
	);
}

function LocalEvidenceCard({
	result,
	onRestart,
}: {
	result: Extract<PlatformValuationResult, { status: "VALUATED" }>;
	onRestart: () => void;
}) {
	return (
		<aside className="card relative border-2 border-base-content bg-base-100 shadow-none">
			<SectionStamp>RINGKASAN EVIDENCE</SectionStamp>
			<div className="card-body p-5 sm:p-8">
				<h2 className="font-display text-xl leading-none tracking-[-0.03em] uppercase">
					{result.acceptedComparableCount} pembanding diterima
				</h2>
				<EvidenceStats
					accepted={result.acceptedComparableCount}
					coverage={coverageLabel[result.evidenceCoverage]}
					outliers={result.outlierCount}
				/>
				<h3 className="mt-6 text-[0.62rem] font-bold uppercase">ID evidence</h3>
				{result.evidenceIds.length > 0 ? (
					<ul className="mt-3 space-y-2">
						{result.evidenceIds.map((id) => (
							<li
								className="[overflow-wrap:anywhere] border border-base-content bg-base-200 p-3 text-[0.68rem]"
								key={id}
							>
								{id}
							</li>
						))}
					</ul>
				) : (
					<p className="mt-3 text-xs leading-5 text-base-content/70">
						API tidak mengembalikan ID evidence untuk hasil ini.
					</p>
				)}
				<p className="mt-4 border border-base-content bg-base-200 p-3 text-xs leading-5">
					API lokal hanya menyediakan ID evidence dan ringkasan. Judul listing,
					harga individual, kota, waktu pengambilan, serta tautan live tidak
					tersedia dan tidak ditambahkan dari data mock.
				</p>
				<RestartButton onRestart={onRestart} />
			</div>
		</aside>
	);
}

function RestartButton({ onRestart }: { onRestart: () => void }) {
	return (
		<button
			className="btn btn-outline mt-5 w-full rounded-none uppercase"
			type="button"
			onClick={onRestart}
		>
			Cek barang lain
		</button>
	);
}

function ValuationOutcomeScreen({
	result,
	onEdit,
	onRestart,
}: {
	result: Exclude<PlatformValuationResult, { status: "VALUATED" }>;
	onEdit: (correction?: {
		explanation: string;
		missingFields: string[];
	}) => void;
	onRestart: () => void;
}) {
	const content = {
		UNSUPPORTED_CATEGORY: {
			title: "Kategori produk belum didukung",
			action: "Pilih barang lain",
		},
		MORE_INFORMATION_REQUIRED: {
			title: "Informasi produk perlu dilengkapi",
			action: "Lengkapi detail",
		},
		INSUFFICIENT_EVIDENCE: {
			title: "Bukti harga belum cukup",
			action: "Periksa detail",
		},
		SERVICE_FAILURE: {
			title: "Layanan sedang bermasalah",
			action: "Coba lagi",
		},
		RATE_LIMITED: {
			title: "Batas penggunaan tercapai",
			action: "Kembali ke awal",
		},
	} as const;
	const selected = content[result.status];
	const shouldEdit =
		result.status === "MORE_INFORMATION_REQUIRED" ||
		result.status === "INSUFFICIENT_EVIDENCE" ||
		result.status === "SERVICE_FAILURE";
	return (
		<section className="card relative w-full max-w-2xl border-2 border-base-content bg-base-100 shadow-none">
			<SectionStamp>HASIL VALUASI</SectionStamp>
			<div className="card-body p-6 sm:p-10">
				<h1 className="font-display text-3xl leading-[0.95] tracking-[-0.04em] uppercase sm:text-5xl">
					{selected.title}
				</h1>
				<p className="mt-5 text-sm leading-7 text-base-content/80">
					{result.explanation}
				</p>
				{result.status === "MORE_INFORMATION_REQUIRED" ? (
					<div className="mt-5 border border-base-content bg-base-200 p-4 text-xs">
						<strong className="uppercase">
							Informasi yang perlu dilengkapi
						</strong>
						<ul className="mt-2 list-disc space-y-1 pl-5">
							{result.missingFields.map((field) => (
								<li key={field}>{field}</li>
							))}
						</ul>
					</div>
				) : null}
				{result.status === "INSUFFICIENT_EVIDENCE" ? (
					<EvidenceStats
						accepted={result.acceptedComparableCount}
						coverage={coverageLabel[result.evidenceCoverage]}
						outliers={result.outlierCount}
					/>
				) : null}
				<div className="mt-8 flex flex-col gap-3 sm:flex-row">
					<button
						className="btn btn-primary rounded-none uppercase"
						type="button"
						onClick={() => {
							if (result.status === "MORE_INFORMATION_REQUIRED") {
								onEdit({
									explanation: result.explanation,
									missingFields: result.missingFields,
								});
							} else if (shouldEdit) onEdit();
							else onRestart();
						}}
					>
						{selected.action}
					</button>
					{shouldEdit ? (
						<button
							className="btn btn-outline rounded-none uppercase"
							type="button"
							onClick={onRestart}
						>
							Pilih barang lain
						</button>
					) : null}
				</div>
			</div>
		</section>
	);
}
