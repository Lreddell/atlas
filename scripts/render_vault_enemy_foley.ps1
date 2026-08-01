param(
    [string]$Ffmpeg = 'ffmpeg',
    [string]$Ffprobe = 'ffprobe'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $env:TEMP 'atlas-vault-foley'
$outputDir = Join-Path $root 'public/assets/rvx/sounds/resonant_vault'
New-Item -ItemType Directory -Force -Path $sourceDir, $outputDir | Out-Null

$sources = @{
    dull_thud = 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Dull_thud.ogg'
    metal_thump = 'https://upload.wikimedia.org/wikipedia/commons/8/8d/Metal_drop_thump.ogg'
    rattle = 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Babys_rattle.ogg'
    ratchet = 'https://upload.wikimedia.org/wikipedia/commons/d/da/Tools_Ratchet.ogg'
    thin_metal = 'https://upload.wikimedia.org/wikipedia/commons/7/74/Putting_down_thin_metal_object.ogg'
}
$sourceHashes = @{
    dull_thud = '5b91906d41bd57f1f6551e446d30fbff06ec59a39d22725140293ef4aec6cdb3'
    metal_thump = 'b8f5506893d2871c86f5c7e01305bff788dfe156a265e63bb9b00cbbd51647c5'
    rattle = 'a775b4784962e8350829592344a314b7e176a8cb65f3480953dcbdaf897caa7e'
    ratchet = '8db2e949d65af8e9a3818455a7eebce035be8458f08b92c8791bf9d6f9e40e9b'
    thin_metal = '619f4c2dab5a30dadc5c4a7b706e5be68c94d28abb9072531a8bd9562a0d8a16'
}

foreach ($entry in $sources.GetEnumerator()) {
    $target = Join-Path $sourceDir "$($entry.Key).ogg"
    if (-not (Test-Path $target) -or (Get-Item $target).Length -lt 1000) {
        & curl.exe -L --retry 3 --retry-delay 2 --fail --silent --show-error `
            -A 'AtlasGameAssetPipeline/1.0 (development)' $entry.Value -o $target
        if ($LASTEXITCODE -ne 0) { throw "Failed to download $($entry.Key)" }
    }
    $actualHash = (Get-FileHash -Algorithm SHA256 $target).Hash.ToLowerInvariant()
    if ($actualHash -ne $sourceHashes[$entry.Key]) {
        throw "Source checksum mismatch for $($entry.Key): $actualHash"
    }
}

function Render-Foley {
    param(
        [string]$Name,
        [string[]]$Inputs,
        [string]$Graph,
        [double]$Duration,
        [double]$FadeOut = 0.12
    )
    $arguments = @('-hide_banner', '-loglevel', 'error', '-y')
    foreach ($input in $Inputs) { $arguments += @('-i', (Join-Path $sourceDir "$input.ogg")) }
    $fadeStart = [Math]::Max(0.01, $Duration - $FadeOut).ToString('0.###', [Globalization.CultureInfo]::InvariantCulture)
    $durationText = $Duration.ToString('0.###', [Globalization.CultureInfo]::InvariantCulture)
    # Vorbis reconstruction can overshoot a sample limiter, so retain an
    # additional 1.8 dB of codec headroom after limiting.
    $master = ",aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${durationText},afade=t=in:st=0:d=0.006,afade=t=out:st=${fadeStart}:d=${FadeOut},loudnorm=I=-19:LRA=7:TP=-1.5,alimiter=limit=0.89:attack=1:release=80,volume=-1.8dB[out]"
    $arguments += @('-filter_complex', "$Graph$master", '-map', '[out]', '-c:a', 'libvorbis', '-q:a', '5', (Join-Path $outputDir "$Name.ogg"))
    & $Ffmpeg @arguments
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed while rendering $Name" }
}

# Every cue below is built only from recorded metal, ratchet, rattle, and impact
# foley. Filters shape and layer those recordings; there are no oscillators,
# generated tones, or borrowed enemy sounds from another Atlas encounter.
Render-Foley 'guard_step_1' @('dull_thud', 'metal_thump') `
    '[0:a]atrim=0:0.39,highpass=f=55,lowpass=f=5200,volume=0.82[a];[1:a]atrim=0:0.48,highpass=f=190,volume=0.16[b];[a][b]amix=inputs=2:duration=longest:dropout_transition=0' 0.52 0.11
Render-Foley 'guard_step_2' @('metal_thump', 'thin_metal') `
    '[0:a]atrim=0:0.56,asetrate=39000,aresample=48000,lowpass=f=4800,volume=0.72[a];[1:a]atrim=0.12:0.32,adelay=42|42,highpass=f=340,volume=0.2[b];[a][b]amix=inputs=2:duration=longest:dropout_transition=0' 0.68 0.15
Render-Foley 'guard_swing' @('rattle', 'ratchet') `
    '[0:a]atrim=0.32:0.93,areverse,highpass=f=420,lowpass=f=6800,volume=0.68[a];[1:a]atrim=0.16:0.61,highpass=f=900,volume=0.3[b];[a][b]amix=inputs=2:duration=longest:dropout_transition=0' 0.63 0.13
Render-Foley 'marksman_brace' @('ratchet', 'thin_metal') `
    '[0:a]atrim=1.28:1.67,asetpts=PTS-STARTPTS,highpass=f=260,volume=0.75[a];[1:a]atrim=0.13:0.31,asetpts=PTS-STARTPTS,adelay=65|65,highpass=f=480,volume=0.23[b];[a][b]amix=inputs=2:duration=longest:dropout_transition=0' 0.46 0.09
Render-Foley 'marksman_fire' @('ratchet', 'dull_thud', 'thin_metal') `
    '[0:a]atrim=2.29:2.68,asetpts=PTS-STARTPTS,highpass=f=520,volume=0.82[a];[1:a]atrim=0:0.34,highpass=f=90,volume=0.28[b];[2:a]atrim=0.13:0.31,asetpts=PTS-STARTPTS,adelay=18|18,highpass=f=700,volume=0.24[c];[a][b][c]amix=inputs=3:duration=longest:dropout_transition=0' 0.47 0.1
Render-Foley 'marksman_reload' @('ratchet') `
    '[0:a]atrim=6.97:8.36,asetpts=PTS-STARTPTS,highpass=f=210,lowpass=f=7200,volume=0.86' 1.42 0.17
Render-Foley 'hound_leap' @('rattle', 'ratchet') `
    '[0:a]atrim=2.265:2.48,asetpts=PTS-STARTPTS,asetrate=50000,aresample=48000,highpass=f=520,volume=0.62[a];[1:a]atrim=3.85:4.04,asetpts=PTS-STARTPTS,highpass=f=800,volume=0.42[b];[a][b]amix=inputs=2:duration=longest:dropout_transition=0' 0.31 0.08
Render-Foley 'hound_land' @('dull_thud', 'metal_thump') `
    '[0:a]atrim=0:0.39,lowpass=f=2600,volume=0.88[a];[1:a]atrim=0:0.58,asetrate=40000,aresample=48000,lowpass=f=4100,volume=0.45[b];[a][b]amix=inputs=2:duration=longest:dropout_transition=0' 0.67 0.17
Render-Foley 'tollkeeper_windup' @('ratchet', 'rattle') `
    '[0:a]atrim=6.97:8.36,asetpts=PTS-STARTPTS,lowpass=f=4200,volume=0.72[a];[1:a]atrim=0.32:0.93,asetpts=PTS-STARTPTS,adelay=620|620,highpass=f=350,volume=0.34[b];[a][b]amix=inputs=2:duration=longest:dropout_transition=0' 1.46 0.19
Render-Foley 'tollkeeper_impact' @('metal_thump', 'dull_thud', 'thin_metal') `
    '[0:a]atrim=0:0.9,asetrate=36000,aresample=48000,lowpass=f=5200,volume=0.88[a];[1:a]atrim=0:0.39,lowpass=f=1800,volume=0.68[b];[2:a]atrim=0.13:0.32,asetpts=PTS-STARTPTS,adelay=82|82,highpass=f=430,volume=0.26[c];[a][b][c]amix=inputs=3:duration=longest:dropout_transition=0' 1.08 0.24

foreach ($file in Get-ChildItem $outputDir -Filter '*.ogg' | Where-Object { $_.BaseName -in @(
    'guard_step_1', 'guard_step_2', 'guard_swing', 'marksman_brace', 'marksman_fire',
    'marksman_reload', 'hound_leap', 'hound_land', 'tollkeeper_windup', 'tollkeeper_impact'
) }) {
    $duration = & $Ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 $file.FullName
    if ($LASTEXITCODE -ne 0 -or [double]$duration -le 0) { throw "Invalid output: $($file.Name)" }
    $previousErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $volumeReport = (& $Ffmpeg -hide_banner -i $file.FullName -af volumedetect -f null NUL 2>&1) | Out-String
    $volumeExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorPreference
    if ($volumeExitCode -ne 0) { throw "Peak analysis failed for $($file.Name)" }
    $peakMatch = [regex]::Match($volumeReport, 'max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB')
    if (-not $peakMatch.Success -or [double]$peakMatch.Groups[1].Value -ge -1) {
        throw "Unsafe or unreadable peak for $($file.Name): $($peakMatch.Groups[1].Value) dBFS"
    }
}
