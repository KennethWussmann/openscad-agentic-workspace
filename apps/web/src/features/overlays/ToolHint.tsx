import { useStore } from '../../store/store.ts'

export const ToolHint = () => {
  const tool = useStore((s) => s.tool)
  const pending = useStore((s) => s.pending)
  const embed = useStore((s) => s.embed)
  const hint =
    tool === 'measure'
      ? pending
        ? 'pick the second point'
        : 'pick the first point, vertices snap'
      : tool === 'annotate' && !embed
        ? 'click a face, edge or corner to pin a note'
        : null
  return hint && <div className="tool-hint mono">{hint}</div>
}
