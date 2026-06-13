import type { AvatarState } from '../avatarStates'

export const fallbackFrame = '/avatar/guide-idle-1.png'

export type AvatarAnimation =
  | {
      kind: 'loop'
      frames: string[]
      intervalMs: number
    }
  | {
      kind: 'hold'
      frames: string[]
    }
  | {
      kind: 'sequence'
      frames: string[]
      intervalMs: number
    }

export const avatarAnimations = {
  idle: {
    kind: 'loop',
    frames: ['/avatar/guide-idle-1.png', '/avatar/guide-idle-2.png'],
    intervalMs: 1450,
  },
  speaking: {
    kind: 'loop',
    frames: [
      '/avatar/guide-speaking-1.png',
      '/avatar/guide-speaking-2.png',
      '/avatar/guide-speaking-3.png',
      '/avatar/guide-speaking-4.png',
      '/avatar/guide-speaking-5.png',
      '/avatar/guide-speaking-6.png',
      '/avatar/guide-speaking-7.png',
      '/avatar/guide-speaking-8.png',
    ],
    intervalMs: 125,
  },
  thinking: {
    kind: 'loop',
    frames: ['/avatar/guide-thinking-1.png', '/avatar/guide-thinking-2.png'],
    intervalMs: 760,
  },
  happy: {
    kind: 'hold',
    frames: ['/avatar/guide-happy-1.png'],
  },
  unsure: {
    kind: 'hold',
    frames: ['/avatar/guide-unsure-1.png'],
  },
  hairTouch: {
    kind: 'sequence',
    frames: [
      '/avatar/guide-hair-1.png',
      '/avatar/guide-hair-2.png',
      '/avatar/guide-hair-3.png',
    ],
    intervalMs: 230,
  },
} satisfies Record<AvatarState, AvatarAnimation>

export const blinkFrames = [
  '/avatar/guide-blink-1.png',
  '/avatar/guide-blink-2.png',
  '/avatar/guide-blink-1.png',
]

export const frameFallbacks: Record<string, string[]> = {
  '/avatar/guide-thinking-1.png': ['/avatar/guide-thinking.png'],
  '/avatar/guide-thinking-2.png': ['/avatar/guide-thinking.png'],
  '/avatar/guide-happy-1.png': ['/avatar/guide-happy.png'],
  '/avatar/guide-unsure-1.png': ['/avatar/guide-unsure.png'],
  '/avatar/guide-hair-1.png': ['/avatar/guide-idle-2.png'],
  '/avatar/guide-hair-2.png': ['/avatar/guide-idle-2.png'],
  '/avatar/guide-hair-3.png': ['/avatar/guide-idle-1.png'],
}
