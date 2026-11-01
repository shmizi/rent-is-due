import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { RoomConnection, type RoomState } from './connection.ts';

export const RoomContext = createContext<RoomConnection | null>(null);

export function useRoomConnection(code: string): RoomConnection {
  const [connection] = useState(() => new RoomConnection(code));

  useEffect(() => {
    connection.start();
    return () => connection.stop();
  }, [connection]);

  return connection;
}

export function useConnection(): RoomConnection {
  const connection = useContext(RoomContext);
  if (!connection) throw new Error('useConnection needs a RoomContext');
  return connection;
}

export function useRoom(): RoomState {
  const connection = useConnection();
  return useSyncExternalStore(connection.subscribe, connection.getState);
}

export function useNow(intervalMs = 500): number {
  const connection = useConnection();
  const [now, setNow] = useState(() => connection.serverNow());

  useEffect(() => {
    const timer = setInterval(() => setNow(connection.serverNow()), intervalMs);
    return () => clearInterval(timer);
  }, [connection, intervalMs]);

  return now;
}
