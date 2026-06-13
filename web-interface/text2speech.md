Voice list endpoint works:
http://localhost:8881/v1/audio/voices
response: {"voices":["martin"]}
Speech generation works and produced:
test-martin.wav
Use this in PowerShell to pass text and get audio:

Create audio file from text
$body = @{ model = "kokoro"; input = "Hallo, das ist ein Test."; voice = "martin"; speed = 1.0; lang = "de" } | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:8881/v1/audio/speech" -Method Post -ContentType "application/json" -Body $body -OutFile ".\myvoice.wav"

Check voices
curl.exe http://localhost:8881/v1/audio/voices

Important note for your avatar webpage:

Your UI file avatar.js is browser-side only.
Direct browser calls to localhost:8881 will likely fail due to CORS (the API currently does not return CORS headers for preflight OPTIONS).
So for web integration, use one of these:
Generate WAV on server/PowerShell, then play/import file.
Add a tiny local backend proxy endpoint that calls localhost:8881 and returns audio to the browser from same origin.
If you want, I can now edit avatar.js and add a Text to Speech button plus a small local proxy server file so your avatar can speak from typed text in one click.

GPT-5.3-Codex • 10.9 credits