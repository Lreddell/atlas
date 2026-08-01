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
    bell_vibrant = 'https://upload.wikimedia.org/wikipedia/commons/4/42/Gong_or_bell_vibrant_%28short%29.ogg'
}
$sourceHashes = @{
    dull_thud = '5b91906d41bd57f1f6551e446d30fbff06ec59a39d22725140293ef4aec6cdb3'
    metal_thump = 'b8f5506893d2871c86f5c7e01305bff788dfe156a265e63bb9b00cbbd51647c5'
    rattle = 'a775b4784962e8350829592344a314b7e176a8cb65f3480953dcbdaf897caa7e'
    ratchet = '8db2e949d65af8e9a3818455a7eebce035be8458f08b92c8791bf9d6f9e40e9b'
    thin_metal = '619f4c2dab5a30dadc5c4a7b706e5be68c94d28abb9072531a8bd9562a0d8a16'
    bell_vibrant = 'f57283d08a0ecb052425af1ac1457f827fa27f423d49158963b3370c89fc942d'
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
        [double]$FadeOut = 0.18
    )
    $arguments = @('-hide_banner', '-loglevel', 'error', '-y')
    foreach ($input in $Inputs) { $arguments += @('-i', (Join-Path $sourceDir "$input.ogg")) }
    $fadeStart = [Math]::Max(0.01, $Duration - $FadeOut).ToString('0.###', [Globalization.CultureInfo]::InvariantCulture)
    $durationText = $Duration.ToString('0.###', [Globalization.CultureInfo]::InvariantCulture)
    $master = ",aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${durationText},afade=t=in:st=0:d=0.006,afade=t=out:st=${fadeStart}:d=${FadeOut},loudnorm=I=-19:LRA=8:TP=-1.5,alimiter=limit=0.89:attack=1:release=100,volume=-1.8dB[out]"
    $arguments += @('-filter_complex', "$Graph$master", '-map', '[out]', '-c:a', 'libvorbis', '-q:a', '5', (Join-Path $outputDir "$Name.ogg"))
    & $Ffmpeg @arguments
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed while rendering $Name" }
}

# Bell Titan cues are edits and layers of recorded bell, chain-like ratchet,
# rattle, metal, and stone-impact takes. Long bell decays are retained instead
# of being stopped at the moment the animation or attack finishes.
Render-Foley 'titan_awaken' @('bell_vibrant', 'ratchet', 'metal_thump') `
    '[0:a]atrim=0:5.6,lowpass=f=7200,volume=0.72[a];[1:a]atrim=6.97:9.4,asetpts=PTS-STARTPTS,highpass=f=180,volume=0.3[b];[2:a]atrim=0:1.7,asetpts=PTS-STARTPTS,adelay=620|620,lowpass=f=3900,volume=0.32[c];[a][b][c]amix=inputs=3:duration=longest:dropout_transition=0' 5.6 0.42
Render-Foley 'titan_step_1' @('dull_thud', 'metal_thump') `
    '[0:a]atrim=0:0.39,lowpass=f=1900,volume=0.95[a];[1:a]atrim=0:1.25,asetrate=36000,aresample=48000,lowpass=f=3600,volume=0.65[b];[a][b]amix=inputs=2:duration=longest:dropout_transition=0' 1.58 0.28
Render-Foley 'titan_step_2' @('metal_thump', 'dull_thud', 'thin_metal') `
    '[0:a]atrim=0:1.2,asetrate=33000,aresample=48000,lowpass=f=3400,volume=0.72[a];[1:a]atrim=0:0.39,adelay=45|45,lowpass=f=1600,volume=0.76[b];[2:a]atrim=0.12:0.65,adelay=110|110,highpass=f=330,volume=0.18[c];[a][b][c]amix=inputs=3:duration=longest:dropout_transition=0' 1.68 0.3
Render-Foley 'titan_chain_1' @('ratchet', 'rattle') `
    '[0:a]atrim=6.97:8.55,asetpts=PTS-STARTPTS,highpass=f=220,lowpass=f=6600,volume=0.78[a];[1:a]atrim=0.32:1.24,highpass=f=540,volume=0.28[b];[a][b]amix=inputs=2:duration=longest:dropout_transition=0' 1.58 0.2
Render-Foley 'titan_chain_2' @('ratchet', 'thin_metal') `
    '[0:a]atrim=10.1:11.9,asetpts=PTS-STARTPTS,asetrate=43000,aresample=48000,highpass=f=180,volume=0.76[a];[1:a]atrim=0:0.9,adelay=310|310,highpass=f=420,volume=0.24[b];[a][b]amix=inputs=2:duration=longest:dropout_transition=0' 2.04 0.26
Render-Foley 'titan_sweep' @('rattle', 'ratchet', 'thin_metal') `
    '[0:a]atrim=0.45:2.0,areverse,highpass=f=230,lowpass=f=6100,volume=0.68[a];[1:a]atrim=3.85:4.52,asetpts=PTS-STARTPTS,adelay=630|630,highpass=f=570,volume=0.4[b];[2:a]atrim=0:0.86,asetpts=PTS-STARTPTS,adelay=880|880,highpass=f=310,volume=0.23[c];[a][b][c]amix=inputs=3:duration=longest:dropout_transition=0' 1.82 0.23
Render-Foley 'titan_slam' @('metal_thump', 'dull_thud', 'bell_vibrant') `
    '[0:a]atrim=0:1.8,asetrate=35000,aresample=48000,lowpass=f=4300,volume=0.86[a];[1:a]atrim=0:0.39,lowpass=f=1500,volume=0.9[b];[2:a]atrim=0:3.7,highpass=f=105,lowpass=f=3700,volume=0.26[c];[a][b][c]amix=inputs=3:duration=longest:dropout_transition=0' 3.7 0.38
Render-Foley 'titan_toll' @('bell_vibrant', 'metal_thump') `
    '[0:a]atrim=0:5.6,lowpass=f=8600,volume=0.95[a];[1:a]atrim=0:1.2,lowpass=f=2700,volume=0.34[b];[a][b]amix=inputs=2:duration=longest:dropout_transition=0' 5.6 0.44
Render-Foley 'titan_core_open' @('bell_vibrant', 'ratchet') `
    '[0:a]atrim=0.2:3.45,asetpts=PTS-STARTPTS,highpass=f=170,lowpass=f=5600,volume=0.48[a];[1:a]atrim=6.97:8.55,asetpts=PTS-STARTPTS,highpass=f=280,volume=0.36[b];[a][b]amix=inputs=2:duration=longest:dropout_transition=0' 3.25 0.34
Render-Foley 'titan_shell_break' @('metal_thump', 'thin_metal', 'dull_thud', 'ratchet') `
    '[0:a]atrim=0:1.8,asetrate=37000,aresample=48000,lowpass=f=5200,volume=0.82[a];[1:a]atrim=0:1.02,adelay=110|110,highpass=f=250,volume=0.46[b];[2:a]atrim=0:0.39,adelay=240|240,lowpass=f=1800,volume=0.65[c];[3:a]atrim=10.1:11.9,asetpts=PTS-STARTPTS,adelay=330|330,highpass=f=400,volume=0.32[d];[a][b][c][d]amix=inputs=4:duration=longest:dropout_transition=0' 2.62 0.34
Render-Foley 'titan_hurt_1' @('ratchet', 'thin_metal') `
    '[0:a]atrim=12.2:13.55,asetpts=PTS-STARTPTS,asetrate=39000,aresample=48000,lowpass=f=4700,volume=0.72[a];[1:a]atrim=0:1.02,adelay=180|180,highpass=f=220,volume=0.3[b];[a][b]amix=inputs=2:duration=longest:dropout_transition=0' 1.68 0.24
Render-Foley 'titan_hurt_2' @('ratchet', 'rattle') `
    '[0:a]atrim=14.6:16.05,asetpts=PTS-STARTPTS,asetrate=36000,aresample=48000,lowpass=f=4200,volume=0.74[a];[1:a]atrim=1.5:2.45,adelay=220|220,highpass=f=310,volume=0.3[b];[a][b]amix=inputs=2:duration=longest:dropout_transition=0' 1.94 0.28
Render-Foley 'titan_death' @('bell_vibrant', 'metal_thump', 'dull_thud', 'ratchet') `
    '[0:a]atrim=0:5.6,asetrate=43000,aresample=48000,lowpass=f=6500,volume=0.78[a];[1:a]atrim=0:1.8,adelay=180|180,asetrate=34000,aresample=48000,lowpass=f=3900,volume=0.7[b];[2:a]atrim=0:0.39,adelay=900|900,lowpass=f=1600,volume=0.72[c];[3:a]atrim=10.1:12.2,asetpts=PTS-STARTPTS,adelay=1050|1050,highpass=f=260,volume=0.3[d];[a][b][c][d]amix=inputs=4:duration=longest:dropout_transition=0' 6.25 0.5

$names = @(
    'titan_awaken', 'titan_step_1', 'titan_step_2', 'titan_chain_1', 'titan_chain_2',
    'titan_sweep', 'titan_slam', 'titan_toll', 'titan_core_open', 'titan_shell_break',
    'titan_hurt_1', 'titan_hurt_2', 'titan_death'
)
foreach ($name in $names) {
    $file = Join-Path $outputDir "$name.ogg"
    $duration = & $Ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 $file
    if ($LASTEXITCODE -ne 0 -or [double]$duration -le 0) { throw "Invalid output: $name.ogg" }
    $previousErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $volumeReport = (& $Ffmpeg -hide_banner -i $file -af volumedetect -f null NUL 2>&1) | Out-String
    $volumeExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorPreference
    if ($volumeExitCode -ne 0) { throw "Peak analysis failed for $name.ogg" }
    $peakMatch = [regex]::Match($volumeReport, 'max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB')
    if (-not $peakMatch.Success -or [double]$peakMatch.Groups[1].Value -ge -1) {
        throw "Unsafe or unreadable peak for $name.ogg: $($peakMatch.Groups[1].Value) dBFS"
    }
}
