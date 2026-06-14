import asyncio
import io
import logging
from typing import Dict

import numpy as np

logger = logging.getLogger(__name__)


async def analyze_audio(audio_bytes: bytes) -> Dict:
    """Run FFT/STFT frequency analysis in a thread pool (librosa is sync)."""
    return await asyncio.to_thread(_analyze_sync, audio_bytes)


def _analyze_sync(audio_bytes: bytes) -> Dict:
    import librosa  # lazy import — heavy dependency

    # sr=22050 e duration=60 evitam OOM no container Railway (limita RAM a ~5 MB de numpy)
    y, sr = librosa.load(io.BytesIO(audio_bytes), sr=22050, mono=True, duration=60)

    # ── STFT ────────────────────────────────────────────────────────────
    n_fft = 2048
    D = librosa.stft(y, n_fft=n_fft)
    S_power = np.abs(D) ** 2
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

    def band_db(f_low: float, f_high: float) -> float:
        mask = (freqs >= f_low) & (freqs < f_high)
        if not mask.any():
            return -80.0
        power = float(S_power[mask, :].mean())
        return float(librosa.power_to_db(np.array([power]))[0])

    bass_db  = band_db(20,    250)    # Graves / Sub-graves
    mids_db  = band_db(250,  4_000)   # Médios / Presença
    highs_db = band_db(4_000, 20_000) # Agudos / Brilho

    # ── Loudness ─────────────────────────────────────────────────────────
    rms = float(librosa.feature.rms(y=y).mean())
    # Simplified ITU-R BS.1770 LUFS approximation
    lufs = float(-0.691 + 10 * np.log10(rms ** 2 + 1e-10))

    # ── BPM ──────────────────────────────────────────────────────────────
    try:
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo) if np.isscalar(tempo) else float(tempo[0])
    except Exception:
        bpm = 0.0

    # ── Peak dB ──────────────────────────────────────────────────────────
    peak_db = float(20 * np.log10(np.abs(y).max() + 1e-10))

    return {
        "bass_db":     round(bass_db,  1),
        "mids_db":     round(mids_db,  1),
        "highs_db":    round(highs_db, 1),
        "lufs":        round(lufs,     1),
        "rms":         round(rms,      6),
        "bpm":         round(bpm,      1),
        "peak_db":     round(peak_db,  1),
        "duration_s":  round(len(y) / sr, 2),
        "sample_rate": int(sr),
    }


def build_frequency_report(a: Dict) -> str:
    """Format analysis dict into the structured text block sent to Gemini."""
    def _bar(db: float, ref: float = -20.0) -> str:
        filled = max(0, min(20, int((db - ref) / 2) + 10))
        return "█" * filled + "░" * (20 - filled)

    return (
        "[RELATÓRIO TÉCNICO DE FREQUÊNCIAS]\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        "📊 ANÁLISE ESPECTRAL (STFT — FFT 2048):\n"
        f"  Graves  / Sub-graves (20 Hz – 250 Hz) : {a['bass_db']:+6.1f} dB  {_bar(a['bass_db'])}\n"
        f"  Médios  / Presença  (250 Hz – 4 kHz)  : {a['mids_db']:+6.1f} dB  {_bar(a['mids_db'])}\n"
        f"  Agudos  / Brilho     (4 kHz – 20 kHz) : {a['highs_db']:+6.1f} dB  {_bar(a['highs_db'])}\n"
        "\n"
        "📈 LOUDNESS & DINÂMICA:\n"
        f"  LUFS (aprox. ITU-R BS.1770) : {a['lufs']:+.1f} LUFS\n"
        f"  Peak dB                     : {a['peak_db']:+.1f} dBFS\n"
        f"  RMS médio                   : {a['rms']:.6f}\n"
        "\n"
        "🥁 RITMO:\n"
        f"  BPM estimado : {a['bpm']:.1f} BPM\n"
        "\n"
        f"⏱ Duração: {a['duration_s']:.2f} s  |  Sample Rate: {a['sample_rate']} Hz\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    )
