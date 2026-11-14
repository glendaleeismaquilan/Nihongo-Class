# Prints the sounds the Japanese voice engine produces for each line of a text file, in time
# order, so the reading of every kanji word can be checked. Used by build.mjs; makes no audio.
# Haruka Desktop runs on the same engine and language data (MSTTSLocJaJP.dat) as the voices
# that make the clips, so these are the readings the clips have.
param([string]$TextFile)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$texts = Get-Content -Encoding UTF8 $TextFile | Where-Object { $_.Trim() }
foreach ($t in $texts) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SelectVoice('Microsoft Haruka Desktop')
  $s.SetOutputToNull()
  $ph = New-Object System.Collections.ArrayList
  $null = Register-ObjectEvent -InputObject $s -EventName PhonemeReached -Action { $null = $Event.MessageData.Add([pscustomobject]@{ at = $EventArgs.AudioPosition.Ticks; p = $EventArgs.Phoneme }) } -MessageData $ph
  $s.Speak($t)
  Start-Sleep -Milliseconds 300
  Get-EventSubscriber | Unregister-Event
  $s.Dispose()
  # Drop pause (_), accent (') and devoicing (+) marks; sounds that start together may print swapped (ュジ for ジュ).
  $seq = ($ph | Sort-Object at | ForEach-Object { $_.p }) | Where-Object { $_ -notin @('_', "'", '+') }
  "{0}`t{1}" -f $t, ($seq -join '')
}
