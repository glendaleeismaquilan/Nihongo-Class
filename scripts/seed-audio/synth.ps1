# Speaks text with the Windows (OneCore) voices that apps see. Used by build.mjs.
#   synth.ps1 -List            -> the installed voices as JSON
#   synth.ps1 -JobFile x.json  -> x.json is [{ out, voice, text, rate? }]; writes one WAV per job
param([string]$JobFile, [switch]$List)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

$voices = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
if ($List) {
  @($voices | ForEach-Object { [pscustomobject]@{ name = $_.DisplayName; language = $_.Language; gender = "$($_.Gender)" } }) | ConvertTo-Json -Compress
  exit 0
}

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } |
  Select-Object -First 1
function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $null = $task.Wait(-1)
  $task.Result
}

$jobs = Get-Content -Raw -Encoding UTF8 $JobFile | ConvertFrom-Json
foreach ($j in $jobs) {
  $voice = $voices | Where-Object { $_.DisplayName -eq $j.voice } | Select-Object -First 1
  if (-not $voice) { throw "Voice not installed: $($j.voice)" }
  $synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
  $synth.Voice = $voice
  if ($j.rate) { $synth.Options.SpeakingRate = [double]$j.rate }
  $stream = Await ($synth.SynthesizeTextToStreamAsync([string]$j.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $size = [uint32]$stream.Size
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $null = Await ($reader.LoadAsync($size)) ([uint32])
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  [IO.File]::WriteAllBytes([string]$j.out, $bytes)
  $reader.Dispose(); $stream.Dispose(); $synth.Dispose()
}
