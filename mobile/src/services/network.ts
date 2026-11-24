// network.ts
//
// This file IS the "Internet Available?" / "Internet Restored?" decision
// diamonds from your diagram — every branch in those diamonds is a call
// into this module, nowhere else. Centralizing it means syncService.ts
// doesn't need to know HOW connectivity is detected, just whether it is.

import NetInfo from '@react-native-community/netinfo';

export async function isConnected(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected !== false;
}

// Fires `onReconnect` exactly when the device transitions from offline -> online.
// This is what drives the "Internet Restored? -> Yes -> upload queue" loop
// in the diagram, without polling.
export function subscribeToReconnect(onReconnect: () => void): () => void {

    let wasConnected : boolean | null = null;
    return NetInfo.addEventListener((state) => {
      const nowConnected = state.isConnected !== false;
      if (wasConnected === false && nowConnected) onReconnect();
    
      wasConnected = nowConnected;
  });

}
