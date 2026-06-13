export type VoiceOutputResponse = {
  output: Record<string, unknown>
  text: string
}

export async function fetchVoiceOutput() {
  try {
    const response = await fetch('/voice/output')
    if (!response.ok) {
      throw new Error(`Voice output request failed with ${response.status}`)
    }

    const data = (await response.json()) as Partial<VoiceOutputResponse>
    if (typeof data.text !== 'string') {
      return null
    }

    return {
      output: (data.output ?? {}) as Record<string, unknown>,
      text: data.text,
    }
  } catch {
    return null
  }
}

export async function requestVoiceOutputAudio() {
  try {
    const response = await fetch('/voice/speak-output', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    if (!response.ok) {
      throw new Error(`Voice audio request failed with ${response.status}`)
    }

    return await response.blob()
  } catch {
    return null
  }
}
