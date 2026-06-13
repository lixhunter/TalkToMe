type AvatarViewProps = {
  isTalking: boolean
}

const idleAvatar = '/avatar/idle.png'
const talkingAvatar = '/avatar/talking-loop.gif'

export function AvatarView({ isTalking }: AvatarViewProps) {
  return (
    <div className="guide-avatar" data-state={isTalking ? 'talking' : 'idle'}>
      <img
        src={isTalking ? talkingAvatar : idleAvatar}
        alt="Pixel-Cartoon Portrait des KI-Avatar Vereinsguides"
        className="guide-avatar-image"
        draggable="false"
      />
    </div>
  )
}
