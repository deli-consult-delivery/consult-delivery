import { AGENTS } from '../data.js';

export default function AgentAvatar({ id, size = 32 }) {
  const agent = AGENTS.find(a => a.id === id);
  if (!agent) return null;
  return (
    <div
      className={`agent-avatar ${agent.cls}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {agent.letter}
    </div>
  );
}
