import { createSignal } from '../../../util/signals';

export type NilakTab = 'home' | 'reels' | 'read' | 'chats' | 'profile' | 'create';

// Nilak opens on Home, like Nilak for Android
export const [getNilakTab, setNilakTab] = createSignal<NilakTab>('home');
