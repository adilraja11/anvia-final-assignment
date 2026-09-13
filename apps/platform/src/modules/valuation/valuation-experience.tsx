import { useEffect, useMemo, useState } from "react";

type Step = "upload" | "details" | "analysing" | "result";

const progressLabels = [
	"Mengidentifikasi produk",
	"Mencari produk pembanding",
	"Menghitung estimasi harga",
	"Menyiapkan penjelasan",
];

const evidence = [
	{ source: "Tokopedia", title: "Sony PlayStation 5 Slim Disc 1TB, lengkap dus", price: 8_250_000, condition: "Baik", city: "Jakarta Selatan" },
	{ source: "Facebook Marketplace", title: "PS5 Slim 1TB Disc Edition + controller", price: 8_000_000, condition: "Baik", city: "Bandung" },
	{ source: "Tokopedia", title: "PS5 Slim Disc 1TB garansi toko", price: 8_650_000, condition: "Seperti baru", city: "Surabaya" },
	{ source: "Facebook Marketplace", title: "PlayStation 5 Slim 1TB, unit normal", price: 8_400_000, condition: "Baik", city: "Jakarta Barat" },
];

const formatRupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

function Sparkle() { return <span className="sparkle" aria-hidden="true">✦</span>; }
function ProductMark() { return <div className="product-mark" aria-hidden="true">⌁</div>; }

export function ValuationExperience() {
	const [step, setStep] = useState<Step>("upload");
	const [fileName, setFileName] = useState("");
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const [analysisStep, setAnalysisStep] = useState(0);
	const [formError, setFormError] = useState("");
	const [details, setDetails] = useState({
		name: "Sony PlayStation 5 Slim Disc 1TB", condition: "Baik", askingPrice: "7800000",
		notes: "Lengkap dus dan satu controller. Ada lecet halus di sudut casing.", location: "Jakarta Selatan",
	});

	useEffect(() => {
		if (step !== "analysing") return;
		if (analysisStep === progressLabels.length - 1) {
			const done = window.setTimeout(() => setStep("result"), 900);
			return () => window.clearTimeout(done);
		}
		const timer = window.setTimeout(() => setAnalysisStep((current) => current + 1), 850);
		return () => window.clearTimeout(timer);
	}, [analysisStep, step]);

	const askingPrice = Number(details.askingPrice.replace(/\D/g, "")) || 0;
	const verdict = askingPrice < 8_000_000 ? "Harga bagus" : "Harga wajar";
	const previewLabel = useMemo(() => fileName || "Foto PlayStation 5 Slim", [fileName]);

	function selectImage(file?: File) {
		if (!file) return;
		if (!/image\/(jpeg|png|webp)/.test(file.type)) { setFormError("Gunakan foto JPG, PNG, atau WebP."); return; }
		if (file.size > 10 * 1024 * 1024) { setFormError("Ukuran foto maksimal 10 MB."); return; }
		setFormError(""); setFileName(file.name); setImagePreview(URL.createObjectURL(file)); setStep("details");
	}
	function startAnalysis() {
		if (!details.name.trim() || !details.condition || !askingPrice) { setFormError("Lengkapi nama barang, kondisi, dan harga penawaran terlebih dahulu."); return; }
		setFormError(""); setAnalysisStep(0); setStep("analysing");
	}
	function restart() { setStep("upload"); setFormError(""); }

	return <div className="valuation-app">
		<header className="site-header">
			<button className="brand" type="button" onClick={restart} aria-label="Mulai ulang"><ProductMark /><span>asli<span>segini?</span></span></button>
			<div className="header-actions"><span className="demo-label">DEMO MOCKUP</span><button className="header-cta" type="button" onClick={restart}><Sparkle /> Cek harga</button></div>
		</header>
		<main className="valuation-main">
			{step === "upload" ? <UploadScreen error={formError} onSelect={selectImage} /> : null}
			{step === "details" ? <DetailsScreen details={details} error={formError} imagePreview={imagePreview} previewLabel={previewLabel} onChange={(field, value) => setDetails((current) => ({ ...current, [field]: value }))} onSubmit={startAnalysis} /> : null}
			{step === "analysing" ? <AnalysisScreen activeStep={analysisStep} /> : null}
			{step === "result" ? <ResultScreen details={details} askingPrice={askingPrice} verdict={verdict} onRestart={restart} /> : null}
		</main>
		<footer className="site-footer"><span>Demo UI dengan data mockup</span><span>Estimasi hanya mencakup harga barang.</span></footer>
	</div>;
}

function UploadScreen({ error, onSelect }: { error: string; onSelect: (file?: File) => void }) {
	return <section className="flow-card upload-card">
		<div className="card-eyebrow"><span>●</span> Langkah 1 dari 3</div><p className="step-name">UPLOAD FOTO</p>
		<h1>Upload <em>foto barang</em> kamu</h1><p className="lede">Foto yang jelas paling cocok, biar AI bisa mengenali jenis, merek, dan modelnya dengan akurat.</p>
		<input id="product-photo" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onSelect(event.target.files?.[0])} />
		<label className="upload-dropzone" htmlFor="product-photo"><span className="upload-icon">⇧</span><strong>Tarik foto ke sini</strong><span>atau klik untuk pilih dari galeri kamu</span><small>JPG, PNG, WebP, maks. 10 MB</small></label>
		{error ? <p className="form-error">{error}</p> : null}<p className="privacy-note">♙ Foto kamu diproses hanya untuk analisis harga dan tidak disimpan dalam demo ini.</p>
	</section>;
}

function DetailsScreen({ details, error, imagePreview, previewLabel, onChange, onSubmit }: {
	details: { name: string; condition: string; askingPrice: string; notes: string; location: string }; error: string; imagePreview: string | null; previewLabel: string;
	onChange: (field: keyof typeof details, value: string) => void; onSubmit: () => void;
}) {
	return <section className="flow-card details-card">
		<div className="detected-heading"><Sparkle /><div><strong>Barang terdeteksi</strong><span>KONSOL GAME · SONY</span></div></div>
		<div className="detected-preview">{imagePreview ? <img src={imagePreview} alt={previewLabel} /> : <ProductMark />}<span>{previewLabel}</span></div>
		<p className="lede">AI mendeteksi merek dan kategori dari foto. Konfirmasi detail di bawah agar pembanding yang digunakan relevan.</p>
		<label>Nama dan spesifikasi barang<input value={details.name} onChange={(event) => onChange("name", event.target.value)} /></label><p className="field-hint">Pastikan model, edisi, kapasitas penyimpanan, dan isi bundle sudah benar.</p>
		<div className="two-fields"><label>Kondisi barang<select value={details.condition} onChange={(event) => onChange("condition", event.target.value)}><option>Baru</option><option>Seperti baru</option><option>Baik</option><option>Cukup</option><option>Rusak</option><option>Tidak diketahui</option></select></label><label>Harga penawaran<input inputMode="numeric" value={details.askingPrice} onChange={(event) => onChange("askingPrice", event.target.value.replace(/\D/g, ""))} placeholder="Contoh: 7800000" /></label></div>
		<label>Detail tambahan <span className="optional">(opsional)</span><textarea value={details.notes} onChange={(event) => onChange("notes", event.target.value)} placeholder="Mis. kelengkapan, garansi, perbaikan, atau cacat..." /></label><label>Lokasi kamu <span className="optional">(opsional)</span><input value={details.location} onChange={(event) => onChange("location", event.target.value)} placeholder="Mis. Jakarta Selatan, Bandung, Surabaya" /></label>
		{error ? <p className="form-error">{error}</p> : null}<button className="primary-button" type="button" onClick={onSubmit}><Sparkle /> Cek harga pasar</button><p className="mock-note">Mode demo: tombol ini memakai pembanding contoh, tanpa permintaan API.</p>
	</section>;
}

function AnalysisScreen({ activeStep }: { activeStep: number }) {
	return <section className="analysis-card" aria-live="polite"><div className="analysis-spinner"><Sparkle /></div><h1>{progressLabels[activeStep]}...</h1><div className="progress-list">{progressLabels.map((label, index) => <span key={label} data-active={index <= activeStep} data-current={index === activeStep}>{index < activeStep ? "✓" : index + 1}. {label}</span>)}</div><p>Menjalankan simulasi analisis untuk demo.</p></section>;
}

function ResultScreen({ details, askingPrice, verdict, onRestart }: { details: { name: string; condition: string; notes: string; location: string }; askingPrice: number; verdict: string; onRestart: () => void }) {
	const isGreat = verdict === "Harga bagus";
	return <section className="result-layout">
		<div className="result-card"><p className="category-label">KONSOL GAME</p><h1>{details.name}</h1><p className="condition-line"><span>●</span> Kondisi {details.condition} · {details.location || "Indonesia"}</p>
			<div className="verdict-card"><div className="verdict-top"><span className={isGreat ? "verdict-good" : "verdict-fair"}>{verdict}</span><span>Kepercayaan: <strong>Tinggi</strong></span></div><p>Rentang harga barang yang disarankan</p><strong className="price-range">{formatRupiah(8_000_000)} – {formatRupiah(9_000_000)}</strong><div className="market-meter"><i /><b style={{ left: `${Math.max(6, Math.min(94, ((askingPrice - 7_500_000) / 2_000_000) * 100))}%` }} /></div><div className="meter-labels"><span>{formatRupiah(7_500_000)}</span><span>Rentang pasar</span><span>{formatRupiah(9_500_000)}</span></div><div className="result-stats"><div><span>Harga penawaran</span><strong>{formatRupiah(askingPrice)}</strong></div><div><span>Target negosiasi</span><strong>{formatRupiah(Math.min(askingPrice, 8_000_000))}</strong></div></div></div>
			<div className="explanation"><h2>Ringkasan penilaian</h2><p>Harga penawaran berada {isGreat ? "di bawah" : "di dalam"} rentang pembanding yang diterima. Rentang ini dihitung dari 14 listing contoh dengan model dan kondisi yang sebanding.</p><div className="pros-cons"><div><h3>↗ Yang menguntungkan</h3><p>Harga penawaran kompetitif dan kelengkapan dus serta controller disebutkan.</p></div><div><h3>↘ Perlu dicek</h3><p>{details.notes || "Konfirmasi kondisi fisik, kelengkapan, dan garansi sebelum transaksi."}</p></div></div><p className="limitations">Kami tidak memverifikasi keaslian, kepemilikan, keamanan transaksi, atau kondisi fisik tersembunyi.</p></div>
		</div>
		<aside className="evidence-card" id="evidence"><div className="evidence-heading"><div><p className="category-label">BUKTI HARGA</p><h2>14 pembanding diterima</h2></div><span className="mock-badge">DATA MOCKUP</span></div><p className="evidence-meta">8 Tokopedia · 6 Facebook Marketplace<br />Contoh waktu pengambilan: 12 Sep 2026, 18.20 WIB</p><div className="source-coverage"><span>Tokopedia</span><b>8</b><span>Facebook Marketplace</span><b>6</b></div><div className="evidence-list">{evidence.map((item) => <article key={`${item.source}-${item.title}`}><div><span className="source-tag">{item.source}</span><h3>{item.title}</h3><p>{item.condition} · {item.city}</p></div><strong>{formatRupiah(item.price)}</strong></article>)}</div><p className="asking-prices">Harga marketplace yang ditampilkan adalah harga penawaran, bukan harga transaksi selesai.</p><button className="secondary-button" type="button" onClick={onRestart}>Cek barang lain</button></aside>
	</section>;
}
