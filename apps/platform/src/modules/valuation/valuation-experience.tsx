import { type ReactNode, useEffect, useMemo, useState } from "react";

type Step = "upload" | "details" | "analysing" | "result";
type Details = {
	name: string;
	condition: string;
	askingPrice: string;
	notes: string;
	location: string;
};

const progressLabels = [
	"Mengidentifikasi produk",
	"Mencari produk pembanding",
	"Menghitung estimasi harga",
	"Menyiapkan penjelasan",
];
const evidence = [
	{
		source: "Tokopedia",
		title: "Sony PlayStation 5 Slim Disc 1TB, lengkap dus",
		price: 8_250_000,
		condition: "Baik",
		city: "Jakarta Selatan",
	},
	{
		source: "Facebook Marketplace",
		title: "PS5 Slim 1TB Disc Edition + controller",
		price: 8_000_000,
		condition: "Baik",
		city: "Bandung",
	},
	{
		source: "Tokopedia",
		title: "PS5 Slim Disc 1TB garansi toko",
		price: 8_650_000,
		condition: "Seperti baru",
		city: "Surabaya",
	},
	{
		source: "Facebook Marketplace",
		title: "PlayStation 5 Slim 1TB, unit normal",
		price: 8_400_000,
		condition: "Baik",
		city: "Jakarta Barat",
	},
];

const formatRupiah = (value: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(value);

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

function AppHeader({ onRestart }: { onRestart: () => void }) {
	return (
		<header className="border-b-2 border-base-content bg-base-100">
			<div className="navbar mx-auto min-h-16 max-w-7xl px-4 sm:min-h-20 sm:px-6">
				<button
					className="btn btn-ghost h-auto min-h-0 rounded-none px-0 font-display text-xl tracking-[-0.04em] uppercase sm:text-2xl"
					type="button"
					onClick={onRestart}
					aria-label="Mulai ulang"
				>
					<ProductMark />
					<span>
						asli<span className="text-primary">segini?</span>
					</span>
				</button>
				<div className="ml-auto flex h-full items-stretch">
					<span className="hidden items-center border-x border-base-content px-5 text-[0.62rem] font-bold tracking-[0.08em] sm:flex">
						DEMO MOCKUP
					</span>
					<button
						className="btn btn-primary h-auto min-h-0 rounded-none px-4 text-xs uppercase sm:px-6"
						type="button"
						onClick={onRestart}
					>
						<Sparkle />
						Cek harga
					</button>
				</div>
			</div>
		</header>
	);
}

export function ValuationExperience() {
	const [step, setStep] = useState<Step>("upload");
	const [fileName, setFileName] = useState("");
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const [analysisStep, setAnalysisStep] = useState(0);
	const [formError, setFormError] = useState("");
	const [details, setDetails] = useState<Details>({
		name: "Sony PlayStation 5 Slim Disc 1TB",
		condition: "Baik",
		askingPrice: "7800000",
		notes: "Lengkap dus dan satu controller. Ada lecet halus di sudut casing.",
		location: "Jakarta Selatan",
	});

	useEffect(() => {
		if (step !== "analysing") return;
		const delay = analysisStep === progressLabels.length - 1 ? 900 : 850;
		const timer = window.setTimeout(
			() =>
				analysisStep === progressLabels.length - 1
					? setStep("result")
					: setAnalysisStep((current) => current + 1),
			delay,
		);
		return () => window.clearTimeout(timer);
	}, [analysisStep, step]);

	const askingPrice = Number(details.askingPrice.replace(/\D/g, "")) || 0;
	const verdict = askingPrice < 8_000_000 ? "Harga bagus" : "Harga wajar";
	const previewLabel = useMemo(
		() => fileName || "Foto PlayStation 5 Slim",
		[fileName],
	);

	function selectImage(file?: File) {
		if (!file) return;
		if (!/image\/(jpeg|png|webp)/.test(file.type))
			return setFormError("Gunakan foto JPG, PNG, atau WebP.");
		if (file.size > 10 * 1024 * 1024)
			return setFormError("Ukuran foto maksimal 10 MB.");
		setFormError("");
		setFileName(file.name);
		setImagePreview(URL.createObjectURL(file));
		setStep("details");
	}

	function startAnalysis() {
		if (!details.name.trim() || !details.condition || !askingPrice)
			return setFormError(
				"Lengkapi nama barang, kondisi, dan harga penawaran terlebih dahulu.",
			);
		setFormError("");
		setAnalysisStep(0);
		setStep("analysing");
	}

	function restart() {
		setStep("upload");
		setFormError("");
	}

	return (
		<div
			className="flex min-h-screen flex-col bg-base-100 text-base-content"
			data-theme="asli"
		>
			<AppHeader onRestart={restart} />
			<main className="mx-auto flex w-full max-w-7xl flex-1 items-start justify-center px-4 py-12 sm:px-6 sm:py-20">
				{step === "upload" ? (
					<UploadScreen error={formError} onSelect={selectImage} />
				) : null}
				{step === "details" ? (
					<DetailsScreen
						details={details}
						error={formError}
						imagePreview={imagePreview}
						previewLabel={previewLabel}
						onChange={(field, value) =>
							setDetails((current) => ({ ...current, [field]: value }))
						}
						onSubmit={startAnalysis}
					/>
				) : null}
				{step === "analysing" ? (
					<AnalysisScreen activeStep={analysisStep} />
				) : null}
				{step === "result" ? (
					<ResultScreen
						details={details}
						askingPrice={askingPrice}
						verdict={verdict}
						onRestart={restart}
					/>
				) : null}
			</main>
			<footer className="flex flex-col gap-1 border-t-2 border-base-content px-4 py-4 text-[0.6rem] font-medium uppercase tracking-[0.04em] sm:flex-row sm:justify-between sm:px-6">
				<span>Demo UI dengan data mockup</span>
				<span>Estimasi hanya mencakup harga barang.</span>
			</footer>
		</div>
	);
}

function UploadScreen({
	error,
	onSelect,
}: {
	error: string;
	onSelect: (file?: File) => void;
}) {
	return (
		<section className="card relative w-full max-w-2xl border-2 border-base-content bg-base-100 shadow-none">
			<SectionStamp>UNIT / MARKET-01</SectionStamp>
			<div className="card-body gap-0 p-5 sm:p-10">
				<div className="flex items-start justify-between gap-4">
					<span className="badge badge-primary rounded-none px-2 py-3 text-[0.62rem] font-bold uppercase tracking-[0.07em]">
						Langkah 1 dari 3
					</span>
					<span className="pt-1 text-[0.58rem] font-bold tracking-[0.11em]">
						UPLOAD FOTO
					</span>
				</div>
				<h1 className="mt-10 max-w-xl font-display text-4xl leading-[0.9] tracking-[-0.04em] uppercase sm:text-6xl">
					Upload <span className="text-primary">foto barang</span> kamu
				</h1>
				<p className="mt-4 max-w-prose text-xs leading-6 text-base-content/80">
					Foto yang jelas paling cocok, biar AI bisa mengenali jenis, merek, dan
					modelnya dengan akurat.
				</p>
				<input
					id="product-photo"
					className="sr-only"
					type="file"
					accept="image/jpeg,image/png,image/webp"
					onChange={(event) => onSelect(event.target.files?.[0])}
				/>
				<label
					className="mt-6 flex min-h-56 cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed border-base-content bg-base-200 px-4 text-center transition-colors hover:bg-primary hover:text-primary-content"
					htmlFor="product-photo"
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
					<span className="text-xs">
						atau klik untuk pilih dari galeri kamu
					</span>
					<small className="mt-1 text-[0.62rem]">
						JPG, PNG, WebP, maks. 10 MB
					</small>
				</label>
				<FormError message={error} />
				<p className="mt-4 text-center text-[0.62rem] leading-5 text-base-content/70">
					Foto kamu diproses hanya untuk analisis harga dan tidak disimpan dalam
					demo ini.
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
	previewLabel,
	onChange,
	onSubmit,
}: {
	details: Details;
	error: string;
	imagePreview: string | null;
	previewLabel: string;
	onChange: (field: keyof Details, value: string) => void;
	onSubmit: () => void;
}) {
	return (
		<section className="card relative w-full max-w-2xl border-2 border-base-content bg-base-100 shadow-none">
			<SectionStamp>UNIT / VERIFY-02</SectionStamp>
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
							Barang terdeteksi
						</strong>
						<span className="mt-1 block text-[0.58rem] font-bold tracking-[0.13em] text-primary">
							KONSOL GAME · SONY
						</span>
					</div>
				</div>
				<div className="mt-5 flex items-center gap-3 border-b border-base-content pb-4 text-xs">
					<div className="avatar">
						<div className="size-12 rounded-none border border-base-content">
							{imagePreview ? (
								<img src={imagePreview} alt={previewLabel} />
							) : (
								<ProductMark />
							)}
						</div>
					</div>
					<span>{previewLabel}</span>
				</div>
				<p className="mt-5 max-w-prose text-xs leading-6 text-base-content/80">
					AI mendeteksi merek dan kategori dari foto. Konfirmasi detail di bawah
					agar pembanding yang digunakan relevan.
				</p>
				<Field id="item-name" label="Nama dan spesifikasi barang">
					<input
						id="item-name"
						className="input mt-2 w-full rounded-none border-base-content bg-base-100 text-sm focus:border-primary"
						value={details.name}
						onChange={(event) => onChange("name", event.target.value)}
					/>
				</Field>
				<p className="mt-2 text-[0.62rem] leading-5 text-base-content/70">
					Pastikan model, edisi, kapasitas penyimpanan, dan isi bundle sudah
					benar.
				</p>
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
					<Field id="item-condition" label="Kondisi barang">
						<select
							id="item-condition"
							className="select mt-2 w-full rounded-none border-base-content bg-base-100 text-sm focus:border-primary"
							value={details.condition}
							onChange={(event) => onChange("condition", event.target.value)}
						>
							<option>Baru</option>
							<option>Seperti baru</option>
							<option>Baik</option>
							<option>Cukup</option>
							<option>Rusak</option>
							<option>Tidak diketahui</option>
						</select>
					</Field>
					<Field id="asking-price" label="Harga penawaran">
						<input
							id="asking-price"
							className="input mt-2 w-full rounded-none border-base-content bg-base-100 text-sm focus:border-primary"
							inputMode="numeric"
							value={details.askingPrice}
							onChange={(event) =>
								onChange("askingPrice", event.target.value.replace(/\D/g, ""))
							}
							placeholder="Contoh: 7800000"
						/>
					</Field>
				</div>
				<Field id="item-notes" label="Detail tambahan" optional>
					<textarea
						id="item-notes"
						className="textarea mt-2 min-h-24 w-full rounded-none border-base-content bg-base-100 text-sm focus:border-primary"
						value={details.notes}
						onChange={(event) => onChange("notes", event.target.value)}
						placeholder="Mis. kelengkapan, garansi, perbaikan, atau cacat..."
					/>
				</Field>
				<Field id="item-location" label="Lokasi kamu" optional>
					<input
						id="item-location"
						className="input mt-2 w-full rounded-none border-base-content bg-base-100 text-sm focus:border-primary"
						value={details.location}
						onChange={(event) => onChange("location", event.target.value)}
						placeholder="Mis. Jakarta Selatan, Bandung, Surabaya"
					/>
				</Field>
				<FormError message={error} />
				<button
					className="btn btn-primary mt-6 min-h-13 w-full rounded-none uppercase"
					type="submit"
				>
					<Sparkle />
					Cek harga pasar
				</button>
				<p className="mt-4 text-center text-[0.62rem] leading-5 text-base-content/70">
					Mode demo: tombol ini memakai pembanding contoh, tanpa permintaan API.
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

function AnalysisScreen({ activeStep }: { activeStep: number }) {
	return (
		<section
			className="card w-full max-w-xl border-2 border-base-content bg-base-100 text-center shadow-none"
			aria-live="polite"
		>
			<div className="card-body p-6 sm:p-12">
				<span
					className="loading loading-spinner mx-auto size-16 text-primary"
					role="status"
					aria-label="Analisis sedang berjalan"
				/>
				<h1 className="mt-2 font-display text-3xl leading-[0.95] tracking-[-0.04em] uppercase sm:text-4xl">
					{progressLabels[activeStep]}...
				</h1>
				<ol className="mt-5 border border-base-content text-left">
					{progressLabels.map((label, index) => (
						<li
							className={`flex items-center gap-3 border-b border-base-content px-4 py-3 text-xs last:border-b-0 ${index === activeStep ? "bg-primary font-bold text-primary-content" : index < activeStep ? "bg-base-100 font-bold" : "text-base-content/60"}`}
							key={label}
						>
							<span className="grid size-5 shrink-0 place-items-center border border-current text-[0.62rem]">
								{index < activeStep ? "✓" : index + 1}
							</span>
							{label}
						</li>
					))}
				</ol>
				<p className="mt-2 text-xs text-base-content/70">
					Menjalankan simulasi analisis untuk demo.
				</p>
			</div>
		</section>
	);
}

function ResultScreen({
	details,
	askingPrice,
	verdict,
	onRestart,
}: {
	details: Details;
	askingPrice: number;
	verdict: string;
	onRestart: () => void;
}) {
	const isGreat = verdict === "Harga bagus";
	const markerPosition = `${Math.max(6, Math.min(94, ((askingPrice - 7_500_000) / 2_000_000) * 100))}%`;
	return (
		<section className="grid w-full max-w-7xl gap-4 lg:grid-cols-[1.32fr_0.68fr]">
			<article className="card relative border-2 border-base-content bg-base-100 shadow-none">
				<SectionStamp>OUTPUT / ESTIMATE-03</SectionStamp>
				<div className="card-body p-5 sm:p-10">
					<p className="text-[0.62rem] font-bold tracking-[0.13em] text-primary">
						KONSOL GAME
					</p>
					<h1 className="mt-2 font-display text-4xl leading-[0.9] tracking-[-0.04em] uppercase sm:text-6xl">
						{details.name}
					</h1>
					<p className="mt-3 text-xs text-base-content/75">
						<span className="text-primary">●</span> Kondisi {details.condition}{" "}
						· {details.location || "Indonesia"}
					</p>
					<div className="mt-7 border-2 border-base-content bg-base-200 p-5 sm:p-7">
						<div className="flex flex-col gap-3 text-xs sm:flex-row sm:items-center sm:justify-between">
							<span
								className={`badge rounded-none border-0 px-3 py-3 text-[0.62rem] font-bold uppercase ${isGreat ? "badge-primary" : "badge-neutral"}`}
							>
								{verdict}
							</span>
							<span>
								Kepercayaan: <strong>Tinggi</strong>
							</span>
						</div>
						<p className="mt-7 text-[0.62rem] uppercase text-base-content/75">
							Rentang harga barang yang disarankan
						</p>
						<strong className="mt-2 block font-display text-2xl leading-none tracking-[-0.04em] sm:text-4xl">
							{formatRupiah(8_000_000)} – {formatRupiah(9_000_000)}
						</strong>
						<div className="relative mt-8 h-3 border-2 border-base-content bg-base-100">
							<span className="block h-full w-1/2 bg-primary" />
							<span
								className="absolute top-1/2 h-5 w-0.5 -translate-y-1/2 bg-base-content"
								style={{ left: "25%" }}
							/>
							<span
								className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 border-[3px] border-base-content bg-base-100"
								style={{ left: markerPosition }}
							/>
						</div>
						<div className="mt-2 flex justify-between text-[0.58rem] text-base-content/75">
							<span>{formatRupiah(7_500_000)}</span>
							<span className="font-bold uppercase text-primary">
								Rentang pasar
							</span>
							<span>{formatRupiah(9_500_000)}</span>
						</div>
						<div className="mt-6 grid grid-cols-2 gap-px border border-base-content bg-base-content">
							<ResultStat
								label="Harga penawaran"
								value={formatRupiah(askingPrice)}
							/>
							<ResultStat
								label="Target negosiasi"
								value={formatRupiah(Math.min(askingPrice, 8_000_000))}
							/>
						</div>
					</div>
					<div className="mt-9">
						<h2 className="font-display text-xl leading-none tracking-[-0.03em] uppercase">
							Ringkasan penilaian
						</h2>
						<p className="mt-4 max-w-prose text-xs leading-6">
							Harga penawaran berada {isGreat ? "di bawah" : "di dalam"} rentang
							pembanding yang diterima. Rentang ini dihitung dari 14 listing
							contoh dengan model dan kondisi yang sebanding.
						</p>
						<div className="mt-5 grid gap-px border border-base-content bg-base-content sm:grid-cols-2">
							<Insight title="Yang menguntungkan" tone="text-primary">
								Harga penawaran kompetitif dan kelengkapan dus serta controller
								disebutkan.
							</Insight>
							<Insight title="Perlu dicek">
								{details.notes ||
									"Konfirmasi kondisi fisik, kelengkapan, dan garansi sebelum transaksi."}
							</Insight>
						</div>
						<div className="alert mt-5 rounded-none border border-base-content bg-base-200 py-3 text-xs leading-5">
							<span>
								Kami tidak memverifikasi keaslian, kepemilikan, keamanan
								transaksi, atau kondisi fisik tersembunyi.
							</span>
						</div>
					</div>
				</div>
			</article>
			<EvidenceCard onRestart={onRestart} />
		</section>
	);
}

function ResultStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="bg-base-100 p-3">
			<span className="block text-[0.58rem] uppercase text-base-content/70">
				{label}
			</span>
			<strong className="mt-1 block text-xs">{value}</strong>
		</div>
	);
}

function Insight({
	title,
	tone = "",
	children,
}: {
	title: string;
	tone?: string;
	children: ReactNode;
}) {
	return (
		<div className="bg-base-100 p-4">
			<h3 className={`text-[0.62rem] font-bold uppercase ${tone}`}>{title}</h3>
			<p className="mt-2 text-xs leading-5 text-base-content/80">{children}</p>
		</div>
	);
}

function EvidenceCard({ onRestart }: { onRestart: () => void }) {
	return (
		<aside className="card relative border-2 border-base-content bg-base-100 shadow-none">
			<SectionStamp>INPUT / COMP-14</SectionStamp>
			<div className="card-body p-5 sm:p-8">
				<div className="flex items-start justify-between gap-3">
					<div>
						<p className="text-[0.62rem] font-bold tracking-[0.13em] text-primary">
							BUKTI HARGA
						</p>
						<h2 className="mt-2 font-display text-xl leading-none tracking-[-0.03em] uppercase">
							14 pembanding diterima
						</h2>
					</div>
					<span className="badge badge-primary rounded-none px-2 py-3 text-[0.55rem] font-bold">
						DATA MOCKUP
					</span>
				</div>
				<p className="mt-4 text-xs leading-5 text-base-content/75">
					8 Tokopedia · 6 Facebook Marketplace
					<br />
					Contoh waktu pengambilan: 12 Sep 2026, 18.20 WIB
				</p>
				<div className="mt-5 grid grid-cols-[1fr_auto_1fr_auto] gap-2 border border-base-content bg-base-200 p-3 text-[0.62rem]">
					<span>Tokopedia</span>
					<strong className="text-primary">8</strong>
					<span>Facebook Marketplace</span>
					<strong className="text-primary">6</strong>
				</div>
				<div className="mt-5 divide-y divide-base-content border border-base-content">
					{evidence.map((item) => (
						<article
							className="flex items-start justify-between gap-3 p-3"
							key={`${item.source}-${item.title}`}
						>
							<div>
								<span className="text-[0.57rem] font-bold tracking-[0.08em] text-primary">
									{item.source}
								</span>
								<h3 className="mt-1 text-[0.68rem] font-bold leading-5 uppercase">
									{item.title}
								</h3>
								<p className="mt-1 text-[0.62rem] text-base-content/70">
									{item.condition} · {item.city}
								</p>
							</div>
							<strong className="shrink-0 text-xs">
								{formatRupiah(item.price)}
							</strong>
						</article>
					))}
				</div>
				<p className="mt-4 text-xs leading-5 text-base-content/75">
					Harga marketplace yang ditampilkan adalah harga penawaran, bukan harga
					transaksi selesai.
				</p>
				<button
					className="btn btn-outline mt-5 w-full rounded-none uppercase"
					type="button"
					onClick={onRestart}
				>
					Cek barang lain
				</button>
			</div>
		</aside>
	);
}
