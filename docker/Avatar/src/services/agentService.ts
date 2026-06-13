type AskResponse = {
  answer?: string
}

export async function askAgent(question: string, fallbackAnswer: string) {
  try {
    const response = await fetch('/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question }),
    })

    if (!response.ok) {
      throw new Error(`Agent request failed with ${response.status}`)
    }

    const data = (await response.json()) as AskResponse
    return data.answer?.trim() || fallbackAnswer
  } catch {
    return fallbackAnswer
  }
}
