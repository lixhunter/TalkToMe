export type AvatarState = 'idle' | 'thinking' | 'speaking' | 'happy' | 'unsure' | 'hairTouch'

export const avatarStateLabels: Record<AvatarState, string> = {
  idle: 'Bereit',
  thinking: 'Denkt nach',
  speaking: 'Spricht',
  happy: 'Danke',
  unsure: 'Hinweis',
  hairTouch: 'Geste',
}

export const avatarStateCopy: Record<AvatarState, string> = {
  idle: 'Waehle eine Frage aus.',
  thinking: 'Ich sortiere die Antwort.',
  speaking: 'Ich antworte.',
  happy: 'Gern geschehen.',
  unsure: 'Sprachsteuerung kommt im naechsten Prototyp.',
  hairTouch: 'Kurze Geste.',
}
