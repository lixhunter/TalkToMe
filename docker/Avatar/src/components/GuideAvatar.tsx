import { AvatarView } from '../avatar/AvatarView'
import type { AvatarState } from '../avatarStates'

type GuideAvatarProps = {
  state: AvatarState
  isTalking?: boolean
}

export function GuideAvatar({ state, isTalking }: GuideAvatarProps) {
  return <AvatarView isTalking={isTalking ?? state === 'speaking'} />
}
