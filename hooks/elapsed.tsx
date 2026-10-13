// The running turn's clock, ticking on the surface's frame clock so the pane need not redraw each second.
import type { ClientModule } from 'claude-code'

type Props = { since: number; now: number; color: string }
type Ref = { base: number; ticks: number; lastNow: number }
type State = { ref: Ref }

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

const Elapsed: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements
  const ref = surface.state?.ref ?? { base: 0, ticks: 0, lastNow: -1 }
  if (props.now !== ref.lastNow) {
    ref.lastNow = props.now
    ref.base = props.now - props.since
    ref.ticks = 0
  }
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(1000, () => {
      ref.ticks += 1
      surface.setState({ ref })
    })
  }
  return <Text color={props.color}>{fmt(ref.base + ref.ticks * 1000)}</Text>
}

export default Elapsed
