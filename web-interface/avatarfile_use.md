How to call it from your own TTS flow:

After your TTS returns an audio URL:
window.playAvatarTTS(ttsAudioUrl)

If your TTS returns bytes:
const blob = new Blob([audioBytes], { type: "audio/mpeg" });
window.playAvatarTTS(blob)

If mouth movement does not react, your Rive file likely uses a different state machine or input name. Update STATE_MACHINE_NAME near the top, then inspect available inputs in DevTools with:
window.riveDebug = true
and add a console log on rive.stateMachineInputs for that state machine.