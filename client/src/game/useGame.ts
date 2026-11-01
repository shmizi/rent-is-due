import { useMemo } from 'react';
import type { GameView } from '../../../shared/src/view.ts';
import { withAliases } from '../lib/aliases.ts';
import { playerById } from '../lib/game.ts';
import { useConnection, useRoom } from '../net/useRoom.ts';

export function useGame() {
  const connection = useConnection();
  const state = useRoom();
  const game = useMemo(() => (state.game ? withAliases(state.game) : state.game) as GameView, [state.game]);
  const room = state.room!;
  const you = state.you!;
  const me = you.role === 'player' ? playerById(game, you.id) : undefined;
  const isHost = room.members.some((m) => m.id === you.id && m.host);
  const active = me?.status === 'active';

  return { connection, state, game, room, you, me, isHost, active };
}
